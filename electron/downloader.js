import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import * as licensing from './licensing.js';
import { extractStreams } from './extractor.js';
import { ParallelDownloader } from './parallel_downloader.js';
import { processLiveClip } from './live_chunk_downloader.js';

const activeDownloads = new Map();

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  let sec = 0;
  if (parts.length === 3) {
    sec = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  } else if (parts.length === 2) {
    sec = Number(parts[0]) * 60 + Number(parts[1]);
  } else {
    sec = Number(timeStr) || 0;
  }
  return sec;
}

function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
}

const MB = 1024 * 1024;

function parseSeconds(timestamp) {
  if (typeof timestamp === 'number') return timestamp;
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function resolveRoute(meta, startTime, endTime, downloadDir) {
  // --- Gate 0: Pro Trimmer Limits ---
  const proToken = licensing.getProToken();
  if (!proToken && (startTime || endTime)) {
    console.log('[Downloader] Cryptographic binding failed. Forcing Network-Cut trimmer');
    return 'network-cut';
  }

  // --- Gate 1: No trim requested, always parallel ---
  if (!startTime && !endTime) return 'parallel';

  // --- Gate 2: Cache check ---
  const safeTitle = meta.title.replace(/[\\/:*?"<>|]/g, '');
  const cachedPath = path.join(downloadDir, `${safeTitle}.mp4`);
  if (fs.existsSync(cachedPath)) return 'local-trim';

  // --- Gate 3: Size unknown, fall back to network cut (safe default) ---
  const totalSize = meta.videoFilesize ?? meta.filesize ?? null;
  if (!totalSize) return 'network-cut';

  // --- Gate 4: Math ---
  const totalDuration = meta.duration; // seconds, from yt-dlp
  const start = startTime ? parseSeconds(startTime) : 0;
  const end = endTime ? parseSeconds(endTime) : totalDuration;
  const clipRatio = (end - start) / totalDuration;

  const isSmallFile = totalSize < 50 * MB;

  // Very small files are always faster to parallel download, no race needed
  if (isSmallFile) return 'parallel-then-trim';

  // Everything else gets dynamically probed via the 2-second race
  return 'race';
}

async function downloadVideo(url, id, quality, startTime, endTime, savePath, onProgress, onComplete, onError) {
  // Enforce Free Tier Quality Limits
  const proToken = licensing.getProToken();
  if (!proToken && quality === '4K') {
    console.log('[Downloader] Cryptographic binding failed. Downgrading 4K to 1080p');
    quality = '1080p';
  }

  const downloadDir = ensureDir(savePath);
  url = url.trim();
  const tempDir = app.getPath('temp');
  
  const abortController = new AbortController();
  activeDownloads.set(id, { abortController, process: null });

  try {
    onProgress({ id, title: 'Extracting streams...', percent: 0, speed: '-', totalSize: '-', eta: '-' });
    
    const meta = await extractStreams(url, quality);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    let finalTitle = `${meta.title.replace(/[\\/:*?"<>|]/g, '')} ${dateStr}`;
    if (startTime || endTime) {
      finalTitle += ' CLIP';
    }
    
    if (abortController.signal.aborted) throw new Error('Cancelled');

    // === INTELLIGENT HYBRID ROUTER ===
    const route = resolveRoute(meta, startTime, endTime, downloadDir);
    onProgress({ id, title: `Route: ${route}`, percent: 0, speed: '-', totalSize: '-', eta: '-' });

    const isAudioOnly = meta.streams.every(s => s.type === 'audio');
    const ext = isAudioOnly ? 'm4a' : 'mp4';

    let finalOutputPath = path.join(downloadDir, `${finalTitle}.${ext}`);

    if (meta.extractor === 'TikTok') {
      onProgress({ id, title: `Bypassing CDN WAF via yt-dlp...`, percent: 0, speed: '-', totalSize: '-', eta: '-' });
      const rawPath = await doYtdlpDownload(meta.originalUrl, tempDir, finalTitle, id, onProgress, abortController, ext);
      
      if (startTime || endTime) {
        finalOutputPath = await doLocalTrim(rawPath, startTime, endTime, downloadDir, finalTitle, id, onProgress, ext);
      } else {
        moveFile(rawPath, finalOutputPath);
      }
    } else if (route === 'local-trim') {
      const cachedPath = path.join(downloadDir, `${finalTitle}.${ext}`);
      try {
        finalOutputPath = await doLocalTrim(cachedPath, startTime, endTime, downloadDir, finalTitle, id, onProgress, ext);
      } catch (e) {
        onProgress({ id, title: `Cache corrupt, falling back...`, percent: 0, speed: '-', totalSize: '-', eta: '-' });
        try { fs.unlinkSync(cachedPath); } catch (_) {}
        const rawPath = await doParallelDownload(
          meta, tempDir, downloadDir, finalTitle, id, onProgress, abortController, ext
        );
        finalOutputPath = await doLocalTrim(rawPath, startTime, endTime, downloadDir, finalTitle, id, onProgress, ext);
      }

    } else if (route === 'parallel-then-trim') {
      const rawPath = await doParallelDownload(
        meta, tempDir, downloadDir, finalTitle, id, onProgress, abortController, ext
      );
      finalOutputPath = await doLocalTrim(rawPath, startTime, endTime, downloadDir, finalTitle, id, onProgress, ext);

    } else if (route === 'network-cut') {
      await doNetworkCut(
        meta, startTime, endTime, tempDir, downloadDir, finalTitle, id, onProgress, abortController, ext
      );

    } else if (route === 'race') {
      const raceAbortController = new AbortController();
      
      // Wire up the abort controller to the parent
      const abortListener = () => raceAbortController.abort();
      abortController.signal.addEventListener('abort', abortListener);

      let liveSpeed = 0;
      let liveDownloaded = 0;

      const progressInterceptor = (progressObj) => {
        liveSpeed = progressObj.rawSpeed || 0;
        liveDownloaded = progressObj.rawDownloaded || 0;
        onProgress(progressObj);
      };

      onProgress({ id, title: `Probing speed (TCP Ramp-up)...`, percent: 0, speed: '-', totalSize: '-', eta: '-' });

      const parallelPromise = doParallelDownload(
        meta, tempDir, downloadDir, finalTitle, id, progressInterceptor, raceAbortController
      );

      // TCP slow-start aware probe logic
      await new Promise(resolve => setTimeout(resolve, 1000));
      const bytesAtOneSecond = liveDownloaded;

      await new Promise(resolve => setTimeout(resolve, 1000));
      const stableSpeed = liveDownloaded - bytesAtOneSecond; // bytes in second #2 only
      
      // Zero-speed fallback guard
      if (!stableSpeed || stableSpeed < 1024) {
        onProgress({ id, title: `Probe inconclusive, continuing parallel...`, percent: 0, speed: '-', totalSize: '-', eta: '-' });
        const rawPath = await parallelPromise;
        finalOutputPath = await doLocalTrim(rawPath, startTime, endTime, downloadDir, finalTitle, id, onProgress, ext);
      } else {
        const totalSize = meta.videoFilesize || meta.filesize || 0;
        const totalDuration = meta.duration || 1;
        const startSec = startTime ? parseSeconds(startTime) : 0;
        const endSec = endTime ? parseSeconds(endTime) : totalDuration;
        const clipRatio = (endSec - startSec) / totalDuration;
        
        const eta_parallel = totalSize / stableSpeed;
        
        // FFmpeg network cut speed is server-throttled by YouTube's CDN (~300-500 KB/s),
        // not user bandwidth. We approximate it as parallelSpeed / 4 since our parallel
        // downloader typically achieves ~4x the throttled single-connection speed.
        // This constant holds across most connection types for YouTube specifically.
        const eta_network_cut = (totalSize * clipRatio) / (stableSpeed / 4);

        const PARALLEL_PREFERENCE_MARGIN = 0.80; // parallel wins if within 20%
        
        if (eta_parallel <= eta_network_cut * (1 / PARALLEL_PREFERENCE_MARGIN)) {
          onProgress({ id, title: `Parallel won the race, continuing...`, percent: 0, speed: '-', totalSize: '-', eta: '-' });
          const rawPath = await parallelPromise;
          finalOutputPath = await doLocalTrim(rawPath, startTime, endTime, downloadDir, finalTitle, id, onProgress, ext);
        } else {
          onProgress({ id, title: `Network-cut is faster! Switching...`, percent: 0, speed: '-', totalSize: '-', eta: '-' });
          raceAbortController.abort();
          try { await parallelPromise; } catch(e) {} // swallow abort error
          
          await doNetworkCut(
            meta, startTime, endTime, tempDir, downloadDir, finalTitle, id, onProgress, abortController, ext
          );
        }
      }
      abortController.signal.removeEventListener('abort', abortListener);

    } else {
      // route === 'parallel' (no trim)
      finalOutputPath = await doParallelDownload(
        meta, tempDir, downloadDir, finalTitle, id, onProgress, abortController, ext
      );
    }
    // =================================
    
    let finalSizeMB = 'Unknown';
    try {
      const stat = fs.statSync(finalOutputPath);
      finalSizeMB = (stat.size / 1024 / 1024).toFixed(2) + ' MB';
    } catch(e) {}

    let actualDuration = 0;
    if (meta.duration) {
      const startSec = startTime ? parseSeconds(startTime) : 0;
      const endSec = endTime ? parseSeconds(endTime) : meta.duration;
      actualDuration = Math.max(0, endSec - startSec);
    }
    
    onComplete({ id, title: finalTitle, success: true, path: finalOutputPath, finalSize: finalSizeMB, duration: actualDuration });

  } catch (error) {
    if (error.message === 'Cancelled' || abortController.signal.aborted) {
      onError({ id, error: 'Download Cancelled' });
    } else {
      console.error('Download error:', error);
      onError({ id, error: error.message || 'Download failed' });
    }
  } finally {
    activeDownloads.delete(id);
  }
}

async function doYtdlpDownload(url, tempDir, finalTitle, id, onProgress, abortController, ext = 'mp4') {
  return new Promise((resolve, reject) => {
    const rawDest = path.join(tempDir, `${finalTitle}_raw_[DL-${id}].${ext}`);
    const ytDlpPath = app.isPackaged
      ? path.join(process.resourcesPath, 'bin', 'yt-dlp.exe')
      : path.join(app.getAppPath(), 'bin', 'yt-dlp.exe');
    
    const args = [
      url,
      '--newline',
      '--impersonate', 'chrome',
      '-f', ext === 'mp4' ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best' : 'bestaudio[ext=m4a]/bestaudio/best',
      '-o', rawDest,
      '--no-playlist'
    ];

    const subprocess = spawn(ytDlpPath, args, {
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        subprocess.kill('SIGTERM');
      });
    }

    subprocess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.includes('[download]') && line.includes('%')) {
          const percentMatch = line.match(/([\d.]+)%/);
          const speedMatch = line.match(/at\s+([~\d.\w]+)\/s/);
          const etaMatch = line.match(/ETA\s+([\d:]+)/);
          const sizeMatch = line.match(/of\s+~?\s*([\d.\w]+)/);

          if (percentMatch) {
            onProgress({
              id,
              percent: parseFloat(percentMatch[1]),
              speed: speedMatch ? `yt-dlp - ${speedMatch[1]}/s` : '-',
              eta: etaMatch ? `${etaMatch[1]} left` : '-',
              totalSize: sizeMatch ? sizeMatch[1] : '-'
            });
          }
        }
      }
    });

    let stderr = '';
    subprocess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    subprocess.on('close', (code) => {
      if (abortController?.signal.aborted) {
        reject(new Error('Cancelled'));
      } else if (code === 0 && fs.existsSync(rawDest)) {
        resolve(rawDest);
      } else {
        reject(new Error(stderr || 'yt-dlp raw download failed'));
      }
    });
  });
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec) return '0 B/s';
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

async function doParallelDownload(meta, tempDir, downloadDir, finalTitle, id, onProgress, abortController, ext = 'mp4') {
  const proToken = licensing.getProToken();
  const numConnections = proToken ? 8 : 2;
  const downloader = new ParallelDownloader({ connections: numConnections });
  
  const videoStream = meta.streams.find(s => s.type === 'video' || s.type === 'combined') || meta.streams[0];
  const audioStream = meta.streams.find(s => s.type === 'audio');

  let downloadedV = 0, totalV = 0;
  let downloadedA = 0, totalA = 0;
  let currentSpeedV = 0, currentSpeedA = 0;
  let segmentsV = [], segmentsA = [];

  const reportProgress = () => {
    const d = downloadedV + downloadedA;
    const t = totalV + totalA;
    const speed = currentSpeedV + currentSpeedA;
    
    let totalSegmentsCount = 0;
    let combinedSegments = [];
    
    if (Array.isArray(segmentsV)) {
      totalSegmentsCount += segmentsV.length;
      combinedSegments = combinedSegments.concat(segmentsV.map(s => ({ ...s, uid: `v${s.id}`, speedStr: formatSpeed(s.speed) })));
    } else {
      totalSegmentsCount += 1;
    }
    
    if (Array.isArray(segmentsA)) {
      totalSegmentsCount += segmentsA.length;
      combinedSegments = combinedSegments.concat(segmentsA.map(s => ({ ...s, uid: `a${s.id}`, speedStr: formatSpeed(s.speed) })));
    } else {
      if (audioStream) totalSegmentsCount += 1;
    }
    
    let percent = t > 0 ? (d / t) * 100 : 0;
    if (percent > 100) percent = 100;
    
    onProgress({ 
      id, title: finalTitle, percent: Number(percent.toFixed(1)), 
      speed: `IDM [${totalSegmentsCount} Segs] - ${formatSpeed(speed)}`,
      rawSpeed: speed,
      rawDownloaded: d,
      totalSize: t > 0 ? `${(t/1024/1024).toFixed(2)} MB` : 'Unknown', 
      eta: speed > 0 ? `${Math.ceil((t - d) / speed)}s left` : '-',
      segments: combinedSegments
    });
  };

  const tasks = [];
  let videoTemp = '', audioTemp = '';
  
  if (videoStream) {
    videoTemp = path.join(tempDir, `${finalTitle}_v_[DL-${id}].${videoStream.ext}`);
    const vTask = downloader.download(
      videoStream.url, videoTemp, videoStream.http_headers || {},
      (dl, tot, spd, segs) => { downloadedV = dl; totalV = tot; currentSpeedV = spd; segmentsV = segs; reportProgress(); },
      abortController.signal
    );
    tasks.push(vTask);
  }

  if (audioStream) {
    audioTemp = path.join(tempDir, `${finalTitle}_a_[DL-${id}].${audioStream.ext}`);
    const aTask = downloader.download(
      audioStream.url, audioTemp, audioStream.http_headers || {},
      (dl, tot, spd, segs) => { downloadedA = dl; totalA = tot; currentSpeedA = spd; segmentsA = segs; reportProgress(); },
      abortController.signal
    );
    tasks.push(aTask);
  }

  try {
    await Promise.all(tasks);
  } catch (err) {
    // If aborted mid-race or errored, clean up partial files
    if (videoTemp) try { fs.unlinkSync(videoTemp); } catch(e){}
    if (audioTemp) try { fs.unlinkSync(audioTemp); } catch(e){}
    throw err;
  }

  const finalDest = path.join(downloadDir, `${finalTitle}.${ext}`);
  
  if (videoStream && audioStream && videoStream.type !== 'combined') {
    onProgress({ id, title: finalTitle, percent: 100, speed: 'Muxing...', totalSize: '-', eta: '-' });
    await muxWithFFmpeg(videoTemp, audioTemp, finalDest, abortController, id);
    try { fs.unlinkSync(videoTemp); fs.unlinkSync(audioTemp); } catch(e){}
  } else if (videoStream) {
    moveFile(videoTemp, finalDest);
  } else if (audioStream) {
    moveFile(audioTemp, finalDest);
  }
  
  return finalDest;
}

async function doNetworkCut(meta, startTime, endTime, tempDir, downloadDir, finalTitle, id, onProgress, abortController, ext = 'mp4') {
  const targetStream = meta.streams.find(s => s.type === 'combined') || meta.streams.find(s => s.type === 'video') || meta.streams[0];
  const audioStream = meta.streams.find(s => s.type === 'audio');
  
  const endSec = endTime ? timeToSeconds(endTime) : 999999;
  const startSec = startTime ? timeToSeconds(startTime) : 0;
  const expectedDurationSec = Math.max(0, endSec - startSec);
  
  const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'bin', 'ffmpeg.exe');

  const finalDest = path.join(downloadDir, `${finalTitle}.${ext}`);
  
  const args = [];
  
  const addStream = (stream) => {
    if (startTime) args.push('-ss', startTime);
    if (stream.http_headers) {
      let headerStr = '';
      for (const [k, v] of Object.entries(stream.http_headers)) {
        headerStr += `${k}: ${v}\r\n`;
      }
      if (headerStr) args.push('-headers', headerStr);
    }
    args.push('-i', stream.url);
  };

  addStream(targetStream);
  if (audioStream && targetStream.type !== 'combined') {
    addStream(audioStream);
  }
  
  if (endTime && expectedDurationSec > 0 && expectedDurationSec < 999999) {
    args.push('-t', expectedDurationSec.toString());
  }
  args.push('-c', 'copy', '-y', finalDest);

  return new Promise((resolve, reject) => {
    const subprocess = spawn(ffmpegPath, args, { windowsHide: true });
    const currentTask = activeDownloads.get(id);
    if (currentTask) currentTask.process = subprocess;

    subprocess.stderr.on('data', (data) => {
      const text = data.toString();
      const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch && expectedDurationSec > 0 && expectedDurationSec < 999999) {
        const currentSec = timeToSeconds(timeMatch[1]);
        let percent = (currentSec / expectedDurationSec) * 100;
        if (percent > 100) percent = 100;
        onProgress({ id, title: finalTitle, percent: Number(percent.toFixed(1)), speed: 'Network Cutting...', totalSize: '-', eta: '-' });
      }
    });

    subprocess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg cut failed with code ${code}`));
    });
    
    subprocess.on('error', reject);
    abortController.signal.addEventListener('abort', () => {
      subprocess.kill('SIGKILL');
      reject(new Error('Cancelled'));
    });
  });
}

async function doLocalTrim(sourcePath, startTime, endTime, downloadDir, title, id, onProgress, ext = 'mp4') {
  onProgress({ id, title: 'Trimming locally...', percent: 95, speed: '-', totalSize: '-', eta: '-' });

  const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'bin', 'ffmpeg.exe');

  const outputPath = path.join(downloadDir, `${title}_trim_${Date.now()}.${ext}`);
  const args = ['-y'];

  const endSec = endTime ? timeToSeconds(endTime) : 999999;
  const startSec = startTime ? timeToSeconds(startTime) : 0;
  const expectedDurationSec = Math.max(0, endSec - startSec);

  if (startTime) args.push('-ss', startTime);
  args.push('-i', sourcePath);
  if (endTime && expectedDurationSec > 0 && expectedDurationSec < 999999) {
    args.push('-t', expectedDurationSec.toString());
  }

  // Stream copy: fast, no re-encode
  args.push('-c', 'copy', outputPath);

  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Attempt to track current task so cancel works (if abortController passed, could use it here)
    const currentTask = activeDownloads.get(id);
    if (currentTask) currentTask.process = proc;

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg local trim failed (${code}): ${stderr}`));
    });
    proc.on('error', reject);
  });

  onProgress({ id, title: 'Trim complete', percent: 100, speed: '-', totalSize: '-', eta: '-' });
  return outputPath;
}

function muxWithFFmpeg(videoTemp, audioTemp, finalDest, abortController, id) {
  const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'bin', 'ffmpeg.exe');

  const args = [
    '-i', videoTemp,
    '-i', audioTemp,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-y',
    finalDest
  ];

  return new Promise((resolve, reject) => {
    const subprocess = spawn(ffmpegPath, args, { windowsHide: true });
    const currentTask = activeDownloads.get(id);
    if (currentTask) currentTask.process = subprocess;
    
    subprocess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Muxing failed with code ${code}`));
    });
    
    subprocess.on('error', reject);
    abortController.signal.addEventListener('abort', () => {
      subprocess.kill('SIGKILL');
      reject(new Error('Cancelled'));
    });
  });
}

function cancelDownload(id) {
  if (activeDownloads.has(id)) {
    const task = activeDownloads.get(id);
    if (task) {
      if (task.abortController) task.abortController.abort();
      if (task.process) {
        try { task.process.kill('SIGKILL'); } catch (e) {}
      }
      activeDownloads.delete(id);
      
      // Cleanup temp files for this ID
      try {
        const tempDir = app.getPath('temp');
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          for (const file of files) {
            if (file.includes(`[DL-${id}]`)) {
              try { fs.unlinkSync(path.join(tempDir, file)); } catch (err) {}
            }
          }
        }
      } catch (err) {}
    }
  }
}

function resetEngine() {
  for (const [id, task] of activeDownloads.entries()) {
    if (task.abortController) task.abortController.abort();
    if (task.process) {
      try { task.process.kill('SIGKILL'); } catch (e) {}
    }
  }
  activeDownloads.clear();

  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/F', '/IM', 'yt-dlp.exe', '/T'], { windowsHide: true }); } catch (e) {}
    try { spawn('taskkill', ['/F', '/IM', 'ffmpeg.exe', '/T'], { windowsHide: true }); } catch (e) {}
  } else {
    try { spawn('pkill', ['-9', 'yt-dlp']); } catch (e) {}
    try { spawn('pkill', ['-9', 'ffmpeg']); } catch (e) {}
  }

  try {
    const tempDir = app.getPath('temp');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        if (file.includes('[DL-')) {
          try { fs.unlinkSync(path.join(tempDir, file)); } catch (err) {}
        }
      }
    }
  } catch (err) {}
  
  return true;
}

function getFfmpegPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'bin', 'ffmpeg.exe');
}

function formatDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

function startLiveClip(url, durationSec, totalDurationSec, title, id, savePath, onProgress, onComplete, onError) {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '');
  const outPath = path.join(savePath, `${safeTitle}_CLIP_${formatDate()}_${durationSec}s.mkv`);
  
  onProgress({ id, title: 'Preparing IDM Live Clip...', percent: 0, speed: '-', totalSize: '-', eta: '-' });

  const ytDlpPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'yt-dlp.exe')
    : path.join(app.getAppPath(), 'bin', 'yt-dlp.exe');
    
  const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'bin', 'ffmpeg.exe');

  const abortController = new AbortController();
  activeDownloads.set(id, { abortController });

  processLiveClip(url, durationSec, ytDlpPath, ffmpegPath, outPath, (percent, msg) => {
    onProgress({ id, title: msg, percent: percent, speed: '-', totalSize: '-', eta: '-' });
  }).then((finalPath) => {
    activeDownloads.delete(id);
    let finalSizeMB = 'Unknown';
    try {
      const stat = fs.statSync(finalPath);
      finalSizeMB = (stat.size / 1024 / 1024).toFixed(2) + ' MB';
    } catch(e) {}
    onComplete({ id, path: finalPath, title: path.basename(finalPath), finalSize: finalSizeMB, duration: durationSec });
  }).catch((err) => {
    activeDownloads.delete(id);
    onError(err);
  });
}

import { extractStreams as fetchVideoInfo } from './extractor.js';

export default {
  downloadVideo,
  cancelDownload,
  resetEngine,
  fetchVideoInfo,
  startLiveClip
};
