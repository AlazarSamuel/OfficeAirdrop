import { spawn } from 'child_process';
import path from 'path';
import { app } from 'electron';

/**
 * Extracts raw CDN stream URLs using yt-dlp.
 * @param {string} url - The video URL.
 * @param {string} quality - The user selected quality (e.g., '1080', 'best', 'audio').
 * @returns {Promise<Object>} An object containing the stream URLs and metadata.
 */
export async function extractStreams(url, quality, retries = 1) {
  try {
    return await doExtract(url, quality);
  } catch (error) {
    if (retries > 0 && url.includes('tiktok.com')) {
      console.log(`[TikTok] Extraction failed, retrying... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 1500)); // wait 1.5s before retry
      return extractStreams(url, quality, retries - 1);
    }
    throw error;
  }
}

function doExtract(url, quality) {
  return new Promise((resolve, reject) => {
    url = url.trim();
    const ytDlpPath = app.isPackaged
      ? path.join(process.resourcesPath, 'bin', 'yt-dlp.exe')
      : path.join(app.getAppPath(), 'bin', 'yt-dlp.exe');
      
    const jsRuntimeArgs = ['--js-runtimes', `node:${process.execPath}`];

    let formatString = 'bestvideo[ext=mp4][vcodec^=avc][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    
    if (quality === '720p') {
      formatString = 'bestvideo[ext=mp4][vcodec^=avc][height<=720]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    } else if (quality === 'audio') {
      formatString = 'bestaudio[ext=m4a]/bestaudio/best';
    }

    const argsArray = [
      url,
      '--dump-json',
      '-f', formatString,
      '--no-playlist',
      '--no-check-certificates',
      '--no-warnings',
      '--no-cache-dir',
      ...jsRuntimeArgs
    ];

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      argsArray.push('--extractor-args', 'youtube:player-client=web,default');
    } else if (url.includes('tiktok.com')) {
      // Force mobile Safari impersonation instead of chrome to avoid desktop WAFs, 
      // and explicitly use the mobile API hostname
      argsArray.push('--impersonate', 'safari');
      argsArray.push('--extractor-args', 'tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com');
    }

    const subprocess = spawn(ytDlpPath, argsArray, {
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    let stdout = '';
    let stderr = '';

    subprocess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    subprocess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    subprocess.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const info = JSON.parse(stdout);
          const result = {
            id: info.id || '',
            title: info.title || 'Unknown Title',
            thumbnail: info.thumbnail || '',
            duration: info.duration || 0,
            uploader: info.uploader || info.channel || 'Unknown Channel',
            extractor: info.extractor_key || 'Unknown Source',
            filesize: info.filesize || info.filesize_approx || 0,
            originalUrl: info.original_url || info.webpage_url || url,
            streams: [],
            formats: info.formats || [],
            http_headers: info.http_headers || {}
          };

          if (info.url) {
            result.streams.push({
              url: info.url,
              ext: info.ext || 'mp4',
              type: info.vcodec !== 'none' && info.acodec !== 'none' ? 'combined' : 
                    (info.vcodec !== 'none' ? 'video' : 'audio'),
              http_headers: info.http_headers
            });
          }
          
          if (info.requested_formats) {
            result.streams = info.requested_formats.map(f => ({
              url: f.url,
              ext: f.ext,
              type: f.vcodec !== 'none' ? 'video' : 'audio',
              http_headers: f.http_headers || info.http_headers || {}
            }));
          }

          let previewUrl = '';
          if (info.formats) {
            const combinedFormats = info.formats.filter(f => 
              f.vcodec !== 'none' && 
              f.acodec !== 'none' && 
              f.ext === 'mp4'
            );
            if (combinedFormats.length > 0) {
              const suitable = combinedFormats.filter(f => (f.height || 0) <= 720);
              const bestPreview = suitable.length > 0 ? suitable[suitable.length - 1] : combinedFormats[combinedFormats.length - 1];
              previewUrl = bestPreview.url;
            } else if (info.url && info.vcodec !== 'none' && info.acodec !== 'none') {
              previewUrl = info.url; // Fallback if single URL is combined (like TikTok)
            }
          }
          result.previewUrl = previewUrl;

          let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
          if (info.formats && info.formats.length > 0) {
            const firstFormat = info.formats[0];
            if (firstFormat.http_headers && firstFormat.http_headers['User-Agent']) {
              userAgent = firstFormat.http_headers['User-Agent'];
            }
          } else if (info.http_headers && info.http_headers['User-Agent']) {
            userAgent = info.http_headers['User-Agent'];
          }
          result.userAgent = userAgent;

          if (result.streams.length === 0) {
            reject(new Error('No suitable download streams found.'));
          } else {
            if (result.previewUrl && result.http_headers && global.proxyHeadersCache) {
              global.proxyHeadersCache.set(result.previewUrl, result.http_headers);
            }
            resolve(result);
          }
        } catch (e) {
          reject(new Error('Failed to parse video info extraction: ' + e.message));
        }
      } else {
        const stderrLines = stderr.split('\n');
        const ytError = stderrLines.find(line => line.includes('ERROR:')) || 'Extraction failed';
        reject(new Error(ytError));
      }
    });
  });
}
