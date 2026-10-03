import { ipcMain, desktopCapturer, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let encoderConfig = null;
const appDataPath = app.getPath('userData');
const activeStreams = new Map();
let ffmpegProcess = null;

// Ensure temp dir exists
const tempDir = path.join(appDataPath, 'temp_recordings');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Get bin path for ffmpeg
const isDev = !app.isPackaged;
const basePath = isDev ? path.join(__dirname, '..') : process.resourcesPath;
const binPath = path.join(basePath, 'bin');
const ffmpegExe = path.join(binPath, 'ffmpeg.exe');

async function testEncoder(encoderName) {
  return new Promise((resolve) => {
    exec(`"${ffmpegExe}" -hide_banner -f lavfi -i color=size=64x64:duration=0.1 -r 30 -c:v ${encoderName} -f null -`, (error) => {
      resolve(!error);
    });
  });
}

async function detectGpuEncoder() {
  if (encoderConfig) return encoderConfig;

  try {
    const configPath = path.join(appDataPath, 'encoder_config.json');
    if (fs.existsSync(configPath)) {
      try {
        encoderConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (encoderConfig && encoderConfig.videoEncoder) return encoderConfig;
      } catch (e) {}
    }

    let bestEncoder = 'libx264';
    if (await testEncoder('h264_nvenc')) {
      bestEncoder = 'h264_nvenc';
    } else if (await testEncoder('h264_qsv')) {
      bestEncoder = 'h264_qsv';
    } else if (await testEncoder('h264_amf')) {
      bestEncoder = 'h264_amf';
    }

    encoderConfig = { videoEncoder: bestEncoder };
    try {
      fs.writeFileSync(configPath, JSON.stringify(encoderConfig));
    } catch (e) {}
    return encoderConfig;
  } catch (err) {
    console.error('Error detecting encoder:', err);
    return { videoEncoder: 'libx264' };
  }
}

function buildFfmpegArgs(inputPath, outputPath, encoder, crop, hasAudio) {
  let args = [
    '-y',
    '-i', inputPath
  ];

  if (encoder === 'h264_nvenc') {
    args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '18');
  } else if (encoder === 'h264_amf') {
    args.push('-c:v', 'h264_amf', '-quality', 'balanced');
  } else if (encoder === 'h264_qsv') {
    args.push('-c:v', 'h264_qsv', '-preset', 'medium', '-r', '30');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
  }

  if (hasAudio !== false) {
    args.push(
      '-c:a', 'aac', 
      '-b:a', '192k',
      '-af', 'aresample=async=1'
    );
  }

  args.push(
    '-fps_mode', 'cfr',
    '-movflags', '+faststart'
  );

  if (crop && crop.width && crop.height) {
    const cw = Math.max(2, Math.floor(crop.width / 2) * 2);
    const ch = Math.max(2, Math.floor(crop.height / 2) * 2);
    const cx = Math.max(0, Math.floor(crop.x / 2) * 2);
    const cy = Math.max(0, Math.floor(crop.y / 2) * 2);
    args.push('-vf', `crop=${cw}:${ch}:${cx}:${cy}`);
  }

  args.push(outputPath);
  return args;
}

function executeFfmpeg(args, mainWindow) {
  return new Promise((resolve) => {
    ffmpegProcess = spawn(ffmpegExe, args);
    let durationStr = '00:00:01.00';
    let stderrLog = '';

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderrLog += output;
      if (stderrLog.length > 4000) {
        stderrLog = stderrLog.substring(stderrLog.length - 4000);
      }

      const durationMatch = output.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (durationMatch) {
        durationStr = durationMatch[1];
      }

      const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch && mainWindow && !mainWindow.isDestroyed()) {
        const currentTimeStr = timeMatch[1];
        const currentSec = parseTime(currentTimeStr);
        const totalSec = Math.max(0.1, parseTime(durationStr));
        const percent = Math.min(100, Math.round((currentSec / totalSec) * 100));
        mainWindow.webContents.send('encode-progress', { percent });
      }
    });

    ffmpegProcess.on('close', (code) => {
      ffmpegProcess = null;
      if (code === 0) {
        resolve({ success: true });
      } else {
        const lines = stderrLog.trim().split('\n').filter(l => l.trim().length > 0);
        let errorReason = lines[lines.length - 1] || `Exit code ${code}`;
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (!line.includes('Conversion failed!') && !line.includes('Qavg:') && line.length > 0) {
            errorReason = line;
            break;
          }
        }
        resolve({ success: false, code, error: errorReason });
      }
    });

    ffmpegProcess.on('error', (err) => {
      ffmpegProcess = null;
      resolve({ success: false, error: err.message });
    });
  });
}

function checkOrphanedRecordings(mainWindow) {
  try {
    const files = fs.readdirSync(tempDir);
    const webmFiles = files.filter(f => f.endsWith('.webm'));
    if (webmFiles.length > 0) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('orphaned-recordings-found', webmFiles.map(f => path.join(tempDir, f)));
        }
      }, 3000);
    }
  } catch (err) {
    console.error('Error checking orphaned recordings:', err);
  }
}

function initRecorder(mainWindow) {
  detectGpuEncoder();

  ipcMain.handle('get-capture-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      thumbnail: source.thumbnail.toDataURL()
    }));
  });

  ipcMain.handle('check-disk-space', async () => {
    try {
      if (fs.promises.statfs) {
        const stats = await fs.promises.statfs(tempDir);
        const freeSpace = stats.bfree * stats.bsize;
        return freeSpace > 2 * 1024 * 1024 * 1024;
      }
      return true;
    } catch (e) {
      console.error('Disk space check failed:', e);
      return true;
    }
  });

  ipcMain.handle('start-recording-stream', async (event, uuid) => {
    const tempFilePath = path.join(tempDir, `temp_recording_${uuid}.webm`);
    const stream = fs.createWriteStream(tempFilePath, { flags: 'a' });
    activeStreams.set(uuid, { stream, path: tempFilePath, bytesWritten: 0 });
    return tempFilePath;
  });

  ipcMain.handle('save-recording-chunk', async (event, uuid, buffer) => {
    const session = activeStreams.get(uuid);
    if (!session) return { success: false, error: 'Session not found' };
    
    try {
      session.stream.write(Buffer.from(buffer));
      session.bytesWritten += buffer.length;
      return { success: true, bytesWritten: session.bytesWritten };
    } catch (e) {
      console.error('Chunk write error:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('finish-recording-stream', async (event, uuid) => {
    const session = activeStreams.get(uuid);
    if (!session) return { success: false, error: 'Session not found' };
    
    return new Promise((resolve) => {
      session.stream.end(() => {
        const finalPath = session.path;
        activeStreams.delete(uuid);
        resolve({ success: true, path: finalPath });
      });
    });
  });
  
  ipcMain.handle('cancel-recording-stream', async (event, uuid) => {
    const session = activeStreams.get(uuid);
    if (!session) return { success: true };
    
    session.stream.end();
    activeStreams.delete(uuid);
    try {
      if (fs.existsSync(session.path)) {
        fs.unlinkSync(session.path);
      }
    } catch (e) {
      console.error('Error deleting temp recording:', e);
    }
    return { success: true };
  });

  ipcMain.handle('encode-recording', async (event, { inputPath, outputPath, crop, hasAudio }) => {
    if (ffmpegProcess) {
      return { success: false, error: 'An encode is already in progress.' };
    }

    const config = await detectGpuEncoder();
    let encoder = config.videoEncoder;
    
    let args = buildFfmpegArgs(inputPath, outputPath, encoder, crop, hasAudio);
    let result = await executeFfmpeg(args, mainWindow);

    // If hardware encoder failed, automatically fallback to robust libx264 software encoder!
    if (!result.success && encoder !== 'libx264') {
      console.warn(`[Recorder] Hardware encoder (${encoder}) failed. Falling back to libx264...`);
      encoder = 'libx264';
      encoderConfig = { videoEncoder: 'libx264' };
      try {
        fs.writeFileSync(path.join(appDataPath, 'encoder_config.json'), JSON.stringify(encoderConfig));
      } catch (e) {}

      args = buildFfmpegArgs(inputPath, outputPath, encoder, crop, hasAudio);
      result = await executeFfmpeg(args, mainWindow);
    }

    if (result.success) {
      try {
        if (fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
        }
      } catch (e) {}
      return { success: true, outputPath };
    } else {
      return { success: false, error: result.error || `FFmpeg failed with code ${result.code}` };
    }
  });

  ipcMain.handle('cancel-encode', async () => {
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGKILL');
      ffmpegProcess = null;
      return true;
    }
    return false;
  });
  
  ipcMain.handle('delete-orphaned-recording', async (event, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch(e) {
      return false;
    }
  });
}

function parseTime(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  return (parseFloat(parts[0]) * 3600) + (parseFloat(parts[1]) * 60) + parseFloat(parts[2]);
}

export { initRecorder, checkOrphanedRecordings };
