const path = require('path');
const os = require('os');

async function runTest() {
  const { processLiveClip } = await import('./electron/live_chunk_downloader.js');
  
  const ytDlpPath = path.resolve('./bin/yt-dlp.exe');
  const ffmpegPath = path.resolve('./bin/ffmpeg.exe');
  const outPath = path.resolve('./test_output.mkv');
  const url = 'https://www.youtube.com/watch?v=oM-4JU897AI';

  console.log('Starting test...');
  try {
    await processLiveClip(url, 30, ytDlpPath, ffmpegPath, outPath, (percent, msg) => {
      console.log(`[PROGRESS ${percent}%] ${msg}`);
    });
    console.log('Finished successfully: ', outPath);
  } catch (err) {
    console.error('FAILED:', err);
  }
}

runTest();
