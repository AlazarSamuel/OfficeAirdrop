const { spawnSync } = require('child_process');
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseM3u8(m3u8Text) {
  const chunks = [];
  const lines = m3u8Text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF:')) {
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith('#') || lines[j].trim() === '')) j++;
      if (j < lines.length) {
        const url = lines[j].trim();
        const sqMatch = url.match(/\/sq\/(\d+)\//);
        chunks.push({
          url,
          sq: sqMatch ? parseInt(sqMatch[1]) : -1
        });
      }
    }
  }
  return chunks;
}

async function run() {
  const ytDlpPath = require('path').resolve('./bin/yt-dlp.exe');
  const url = 'https://www.youtube.com/watch?v=oM-4JU897AI';

  const res = spawnSync(ytDlpPath, [
    '--dump-json', '-f', 'bestvideo+bestaudio/best', '--no-playlist', url
  ], { maxBuffer: 10 * 1024 * 1024 });

  const info = JSON.parse(res.stdout.toString());
  const vUrl = info.requested_formats[0].url;
  const aUrl = info.requested_formats[1].url;

  const vM3u8 = await fetchUrl(vUrl);
  const aM3u8 = await fetchUrl(aUrl);

  const vChunks = parseM3u8(vM3u8);
  const aChunks = parseM3u8(aM3u8);

  console.log(`Video chunks: ${vChunks.length}, Audio chunks: ${aChunks.length}`);
  console.log('Video last 5 sq:', vChunks.slice(-5).map(c => c.sq));
  console.log('Audio last 5 sq:', aChunks.slice(-5).map(c => c.sq));
}

run();
