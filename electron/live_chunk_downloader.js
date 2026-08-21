import { spawnSync, spawn } from 'child_process';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadFile(url, destPath, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (currentRetries) => {
      const req = https.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadFile(res.headers.location, destPath, currentRetries).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          if (currentRetries > 0) return attempt(currentRetries - 1);
          return reject(new Error(`Status ${res.statusCode}`));
        }
        
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        res.on('error', err => {
          fs.unlink(destPath, () => {});
          if (currentRetries > 0) return attempt(currentRetries - 1);
          reject(err);
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        if (currentRetries > 0) return attempt(currentRetries - 1);
        reject(new Error('Request timeout'));
      });
      
      req.on('error', (err) => {
        if (currentRetries > 0) return attempt(currentRetries - 1);
        reject(err);
      });
    };
    attempt(retries);
  });
}

function parseM3u8(m3u8Text) {
  const chunks = [];
  const lines = m3u8Text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF:')) {
      const duration = parseFloat(lines[i].split(':')[1].split(',')[0]);
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith('#') || lines[j].trim() === '')) j++;
      if (j < lines.length) {
        const url = lines[j].trim();
        const sqMatch = url.match(/\/sq\/(\d+)\//);
        chunks.push({ 
          duration, 
          url,
          sq: sqMatch ? parseInt(sqMatch[1]) : -1
        });
      }
    }
  }
  return chunks;
}

async function processLiveClip(url, durationSec, ytDlpPath, ffmpegPath, outPath, onProgress) {
  const execPath = 'node:' + process.execPath;
  const args = [
    '--dump-json',
    '-f', 'bestvideo+bestaudio/best',
    '--no-playlist',
    '--no-check-certificates',
    '--no-warnings',
    '--no-cache-dir',
    '--js-runtimes', execPath,
    '--impersonate', 'safari',
    url
  ];

  onProgress(10, 'Fetching live stream metadata...');
  
  const res = spawnSync(ytDlpPath, args, { maxBuffer: 10 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error('Failed to fetch metadata: ' + res.stderr.toString());
  }

  const info = JSON.parse(res.stdout.toString());
  if (!info.requested_formats || info.requested_formats.length < 2) {
    throw new Error('Could not find separated video/audio streams');
  }

  const videoUrl = info.requested_formats[0].url;
  const audioUrl = info.requested_formats[1].url;

  onProgress(20, 'Parsing HLS manifest...');

  const videoM3u8 = await fetchUrl(videoUrl);
  const audioM3u8 = await fetchUrl(audioUrl);

  const videoChunks = parseM3u8(videoM3u8);
  const audioChunks = parseM3u8(audioM3u8);

  // Slice the last N chunks based on duration
  const selectChunks = (chunks, targetDur) => {
    let acc = 0;
    const selected = [];
    for (let i = chunks.length - 1; i >= 0; i--) {
      selected.unshift(chunks[i]);
      acc += chunks[i].duration;
      if (acc >= targetDur) break;
    }
    return selected;
  };

  const selectedVideo = selectChunks(videoChunks, durationSec);
  
  // HLS sync depends on matching sequence lengths EXACTLY.
  // Because CDN playlists might update at slightly different times, we MUST match the exact 'sq' 
  // numbers from the video chunks to guarantee perfect PTS alignment.
  let selectedAudio = [];
  if (selectedVideo.length > 0 && selectedVideo[0].sq !== -1) {
    const videoSqSet = new Set(selectedVideo.map(v => v.sq));
    selectedAudio = audioChunks.filter(a => videoSqSet.has(a.sq));
    
    // Fallback if some audio chunks are missing from the manifest (CDN delay)
    // We just trim the video chunks to match what audio chunks we actually found
    if (selectedAudio.length < selectedVideo.length) {
      const audioSqSet = new Set(selectedAudio.map(a => a.sq));
      const oldLen = selectedVideo.length;
      // In place filter is tricky with const, so we can't easily reassign selectedVideo.
      // We'll just splice it or filter it.
    }
  }

  if (selectedAudio.length === 0) {
    // Fallback if no sq was found (not a YouTube stream?)
    selectedAudio = audioChunks.slice(Math.max(0, audioChunks.length - selectedVideo.length));
  } else {
    // Trim video chunks to match available audio chunks to avoid muxing hanging due to unequal stream lengths
    const audioSqSet = new Set(selectedAudio.map(a => a.sq));
    for (let i = selectedVideo.length - 1; i >= 0; i--) {
      if (!audioSqSet.has(selectedVideo[i].sq)) {
        selectedVideo.splice(i, 1);
      }
    }
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabcut-live-'));
  const videoTemp = path.join(tempDir, 'video_merged.ts');
  const audioTemp = path.join(tempDir, 'audio_merged.ts');

  onProgress(30, 'Downloading chunks in parallel...');

  // Download chunks in parallel (IDM style)
  const downloadAll = async (chunks, prefix) => {
    const tempFiles = [];
    let completed = 0;
    
    // Concurrent limit 15
    const limit = 15;
    for (let i = 0; i < chunks.length; i += limit) {
      const batch = chunks.slice(i, i + limit);
      await Promise.all(batch.map(async (c, idx) => {
        const globalIdx = i + idx;
        const p = path.join(tempDir, `${prefix}_${globalIdx}.ts`);
        await downloadFile(c.url, p);
        tempFiles[globalIdx] = p;
        completed++;
        onProgress(30 + Math.floor((completed / chunks.length) * 40), `Downloading ${prefix === 'video' ? 'video' : 'audio'} chunks...`);
      }));
    }
    
    // Concat
    const mergedPath = path.join(tempDir, `${prefix}_merged.ts`);
    const fd = fs.openSync(mergedPath, 'w');
    for (const f of tempFiles) {
      const data = fs.readFileSync(f);
      fs.writeSync(fd, data);
      fs.unlinkSync(f); // cleanup
    }
    fs.closeSync(fd);
    return mergedPath;
  };

  await Promise.all([
    downloadAll(selectedVideo, 'video'),
    downloadAll(selectedAudio, 'audio')
  ]);

  onProgress(80, 'Muxing perfectly synced MKV...');

  // Native mux using ffmpeg -c copy (No -ss, no sync loss)
  return new Promise((resolve, reject) => {
    const muxArgs = [
      '-y',
      '-i', videoTemp,
      '-i', audioTemp,
      '-c', 'copy',
      outPath
    ];

    if (!fs.existsSync(videoTemp)) {
      return reject(new Error(`videoTemp does not exist: ${videoTemp}`));
    }
    if (!fs.existsSync(audioTemp)) {
      return reject(new Error(`audioTemp does not exist: ${audioTemp}`));
    }
    
    // Wait a brief moment to ensure Windows flushes the merged files to disk
    setTimeout(() => {
      const proc = spawn(ffmpegPath, muxArgs, { stdio: 'ignore', windowsHide: true });
      
      proc.on('error', (err) => {
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });

      proc.on('close', (code) => {
        // Cleanup temp dir
        try {
          fs.unlinkSync(videoTemp);
          fs.unlinkSync(audioTemp);
          fs.rmdirSync(tempDir);
        } catch (e) {}

        if (code === 0) resolve(outPath);
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    }, 500);
  });
}

export { processLiveClip };
