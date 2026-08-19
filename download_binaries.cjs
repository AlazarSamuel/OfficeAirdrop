const https = require('https');
const fs = require('fs');
const path = require('path');
function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => { file.close(resolve); });
    }).on('error', (err) => { fs.unlink(dest, () => reject(err)); });
  });
}
download('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', path.join(__dirname, 'bin', 'yt-dlp.exe'))
  .then(() => {
    console.log('yt-dlp.exe downloaded!');
    return download('https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/win32-x64', path.join(__dirname, 'bin', 'ffmpeg.exe'));
  })
  .then(() => console.log('ffmpeg.exe downloaded!'))
  .catch(console.error);
