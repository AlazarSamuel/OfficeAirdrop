import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * yt-dlp binary management + safe self-updating.
 *
 * Why this exists:
 *  - The bundled binary lives in a read-only location in production
 *    (AppX → WindowsApps, NSIS → Program Files), so `yt-dlp -U` can never
 *    replace it there. We keep a writable working copy in userData/bin.
 *  - Updates run on a *staging copy*, are verified (`--version` must run),
 *    and are swapped in with two renames. A running exe can be renamed on
 *    Windows, so in-flight downloads are never interrupted, and while the
 *    swap happens `getYtDlpPath()` falls back to the bundled binary.
 */

const EXE_NAME = 'yt-dlp.exe';
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;   // successful check is valid for 12h
const RETRY_AFTER_FAIL_MS = 60 * 60 * 1000;      // after a failed attempt, wait 1h
const ON_ERROR_MIN_GAP_MS = 30 * 60 * 1000;      // extraction-failure trigger: max once / 30min
const TICK_MS = 30 * 60 * 1000;                  // how often the background timer re-evaluates
const STARTUP_DELAY_MS = 15 * 1000;              // don't compete with app startup / first paste
const VERSION_TIMEOUT_MS = 30 * 1000;
const UPDATE_TIMEOUT_MS = 30 * 60 * 1000;         // ~18 MB from GitHub; slow office links measured >10min
const LEFTOVER_MAX_AGE_MS = 60 * 60 * 1000;      // must exceed the longest possible update
const MAX_LOG_BYTES = 256 * 1024;
const VERSION_RE = /^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/;
const LEFTOVER_RE = /^yt-dlp\.(old|staging|seed)-.+\.exe(\.(old|new|part))?$/i;

let updateInProgress = false;
let tickTimer = null;
let startupTimer = null;
const activeChildren = new Set(); // killed on quit so no orphaned updater keeps running

// ── Paths ─────────────────────────────────────────────────

export function getBundledYtDlpPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', EXE_NAME)
    : path.join(app.getAppPath(), 'bin', EXE_NAME);
}

function userBinDir() {
  return path.join(app.getPath('userData'), 'bin');
}

function userExePath() {
  return path.join(userBinDir(), EXE_NAME);
}

function statePath() {
  return path.join(userBinDir(), 'yt-dlp-update.json');
}

function logPath() {
  return path.join(userBinDir(), 'yt-dlp-update.log');
}

/**
 * Path every caller should spawn. Prefers the writable (updated) copy and
 * falls back to the bundled one if the copy is missing/empty (first run,
 * mid-swap, or quarantined by antivirus).
 */
export function getYtDlpPath() {
  try {
    if (fs.statSync(userExePath()).size > 0) return userExePath();
  } catch { /* fall through */ }
  return getBundledYtDlpPath();
}

// ── Helpers ───────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(`[yt-dlp-updater] ${msg}`);
  try {
    const p = logPath();
    if (fs.existsSync(p) && fs.statSync(p).size > MAX_LOG_BYTES) {
      const tail = fs.readFileSync(p, 'utf8').slice(-MAX_LOG_BYTES / 2);
      fs.writeFileSync(p, tail);
    }
    fs.appendFileSync(p, line + '\n');
  } catch { /* logging must never throw */ }
}

function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
  } catch (e) {
    log(`Could not write state: ${e.message}`);
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** execFile wrapper that never rejects and never leaves an unhandled 'error'. */
function run(file, args, timeout) {
  return new Promise((resolve) => {
    try {
      const child = execFile(file, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          activeChildren.delete(child);
          resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
      activeChildren.add(child);
    } catch (error) {
      resolve({ error, stdout: '', stderr: '' });
    }
  });
}

async function getVersion(file) {
  if (!fs.existsSync(file)) return null;
  const { error, stdout } = await run(file, ['--version'], VERSION_TIMEOUT_MS);
  if (error) return null;
  const v = stdout.trim().split(/\r?\n/).pop()?.trim() || '';
  return VERSION_RE.test(v) ? v : null;
}

/** yt-dlp versions are dates: 2026.08.19 or 2026.08.19.123456 (nightly). */
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map(num);
  const pb = String(b || '').split('.').map(num);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function cleanupLeftovers() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(userBinDir())) {
      if (!LEFTOVER_RE.test(f)) continue;
      const full = path.join(userBinDir(), f);
      try {
        if (now - fs.statSync(full).mtimeMs < LEFTOVER_MAX_AGE_MS) continue;
        fs.unlinkSync(full); // fails harmlessly if a process still runs from it
      } catch { /* still in use */ }
    }
  } catch { /* dir missing */ }
}

/**
 * Atomically put a verified binary (same directory) in place of the working copy.
 * The running exe is renamed aside (allowed on Windows), never deleted in place.
 */
function swapIn(verifiedFile) {
  const target = userExePath();
  const aside = path.join(userBinDir(), `yt-dlp.old-${process.pid}-${Date.now()}.exe`);
  const hadTarget = fs.existsSync(target);
  if (hadTarget) fs.renameSync(target, aside);
  try {
    fs.renameSync(verifiedFile, target);
  } catch (e) {
    if (hadTarget) { try { fs.renameSync(aside, target); } catch { /* fallback path covers it */ } }
    throw e;
  }
  if (hadTarget) { try { fs.unlinkSync(aside); } catch { /* in use; cleaned later */ } }
}

/** Copy bundled → working copy (via temp file so a half-copied exe is never used). */
function seedFromBundled(reason) {
  const bundled = getBundledYtDlpPath();
  if (!fs.existsSync(bundled)) {
    log(`Cannot seed (${reason}): bundled binary missing at ${bundled}`);
    return false;
  }
  const tmp = path.join(userBinDir(), `yt-dlp.seed-${process.pid}-${Date.now()}.exe`);
  try {
    fs.copyFileSync(bundled, tmp);
    swapIn(tmp);
    log(`Seeded working copy from bundled binary (${reason})`);
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    log(`Seeding failed (${reason}): ${e.message}`);
    return false;
  }
}

/**
 * Make sure the working copy exists and is not older than the bundled binary
 * (e.g. the app itself was upgraded and ships a newer yt-dlp).
 */
async function prepareWorkingCopy(state) {
  fs.mkdirSync(userBinDir(), { recursive: true });
  cleanupLeftovers();

  if (!fs.existsSync(userExePath())) {
    seedFromBundled('working copy missing');
    state.version = null;
    return;
  }

  const bundled = getBundledYtDlpPath();
  if (!fs.existsSync(bundled)) return;

  let bundledKey = '';
  try {
    const st = fs.statSync(bundled);
    bundledKey = `${st.size}-${Math.round(st.mtimeMs)}`;
  } catch { return; }

  // Only re-probe the bundled version when the bundled file actually changed.
  if (state.bundledKey !== bundledKey || !state.bundledVersion) {
    state.bundledVersion = await getVersion(bundled);
    state.bundledKey = state.bundledVersion ? bundledKey : null;
  }
  if (state.bundledVersion && state.version &&
      compareVersions(state.bundledVersion, state.version) > 0) {
    if (seedFromBundled(`bundled ${state.bundledVersion} newer than ${state.version}`)) {
      state.version = state.bundledVersion;
    }
  }
}

// ── Update ────────────────────────────────────────────────

/**
 * @param {'startup'|'interval'|'extraction-failed'|'manual'} reason
 */
export async function checkForYtDlpUpdate(reason = 'manual') {
  if (updateInProgress) return { skipped: 'in-progress' };
  try { fs.mkdirSync(userBinDir(), { recursive: true }); } catch { /* surfaced by later writes */ }

  const state = readState();
  const now = Date.now();
  const sinceSuccess = now - num(state.lastSuccess);
  const sinceAttempt = now - num(state.lastAttempt);

  let skipped = null;
  if (reason === 'extraction-failed') {
    if (sinceAttempt < ON_ERROR_MIN_GAP_MS) skipped = 'throttled';
  } else if (reason !== 'manual') {
    if (sinceSuccess < CHECK_INTERVAL_MS) skipped = 'fresh';
    else if (sinceAttempt < RETRY_AFTER_FAIL_MS) skipped = 'backoff';
  }

  if (skipped) {
    // Even without a network check, startup must seed a missing copy or adopt a
    // newer bundled binary (app upgrade) — that needs no network.
    if (reason === 'startup') {
      updateInProgress = true;
      try { await prepareWorkingCopy(state); } catch (e) { log(`Prepare error: ${e.message}`); }
      finally { writeState(state); updateInProgress = false; }
    }
    return { skipped };
  }

  updateInProgress = true;
  state.lastAttempt = now;
  writeState(state);

  const staging = path.join(userBinDir(), `yt-dlp.staging-${process.pid}-${now}.exe`);
  try {
    await prepareWorkingCopy(state);

    if (!fs.existsSync(userExePath())) {
      log('No working copy available; skipping update');
      return { ok: false };
    }

    fs.copyFileSync(userExePath(), staging);
    const before = await getVersion(staging);
    if (!before) {
      // Working copy is corrupt / blocked. Restore from bundled and stop here.
      log('Working copy failed to run; restoring from bundled binary');
      seedFromBundled('working copy broken');
      state.version = null;
      return { ok: false };
    }
    state.version = before;

    log(`Checking for update (reason: ${reason}, current ${before})`);
    const res = await run(staging, ['-U'], UPDATE_TIMEOUT_MS);
    const output = `${res.stdout}\n${res.stderr}`.trim().split(/\r?\n/).filter(Boolean).slice(-6).join(' | ');

    const after = await getVersion(staging);
    if (after && compareVersions(after, before) > 0) {
      swapIn(staging);
      state.version = after;
      state.lastSuccess = Date.now();
      log(`Updated ${before} → ${after}`);
      return { ok: true, updated: true, version: after };
    }

    if (res.error) {
      const why = res.error.killed ? `timed out after ${UPDATE_TIMEOUT_MS / 1000}s` : (res.error.code ?? res.error.message);
      log(`Update failed (${why}): ${output || 'no output'}`);
      return { ok: false };
    }
    if (!after) {
      log(`Updated binary failed verification (antivirus?); keeping ${before}. Output: ${output}`);
      return { ok: false };
    }

    state.lastSuccess = Date.now();
    log(`Up to date (${before})`);
    return { ok: true, updated: false, version: before };
  } catch (e) {
    log(`Update error: ${e.message}`);
    return { ok: false };
  } finally {
    try { fs.unlinkSync(staging); } catch { /* swapped in or never created */ }
    writeState(state);
    updateInProgress = false;
  }
}

/** Fire-and-forget hook for callers that just saw yt-dlp fail on a site. */
export function notifyYtDlpFailure() {
  checkForYtDlpUpdate('extraction-failed').catch(() => {});
}

export function startYtDlpAutoUpdate() {
  if (process.platform !== 'win32') return; // only the Windows exe is shipped
  if (startupTimer || tickTimer) return;

  startupTimer = setTimeout(() => {
    startupTimer = null;
    checkForYtDlpUpdate('startup').catch(() => {});
  }, STARTUP_DELAY_MS);

  tickTimer = setInterval(() => {
    checkForYtDlpUpdate('interval').catch(() => {});
  }, TICK_MS);
}

export function stopYtDlpAutoUpdate() {
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  for (const child of activeChildren) {
    try { child.kill(); } catch { /* already gone */ }
  }
  activeChildren.clear();
}
