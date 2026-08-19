import fs from 'fs';
import https from 'https';
import http from 'http';

export class ParallelDownloader {
  constructor(options = {}) {
    this.connections = options.connections || 8;
  }

  /**
   * Downloads a file using parallel range requests.
   * @param {string} url - Direct stream URL
   * @param {string} savePath - Path to save the file
   * @param {Object} headers - HTTP headers (e.g. User-Agent) required by CDN
   * @param {Function} onProgress - Callback(downloadedBytes, totalBytes)
   * @param {AbortSignal} abortSignal - Optional signal to cancel download
   */
  async download(url, savePath, headers = {}, onProgress = null, abortSignal = null) {
    const metadata = await this._getMetadata(url, headers, abortSignal);
    
    if (fs.existsSync(savePath)) {
      fs.unlinkSync(savePath);
    }

    if (!metadata.acceptsRanges || !metadata.contentLength) {
      return this._downloadSingleStream(url, savePath, headers, metadata.contentLength, onProgress, abortSignal);
    }

    const totalBytes = metadata.contentLength;
    const fd = fs.openSync(savePath, 'w');
    fs.ftruncateSync(fd, totalBytes);

    const chunkSize = Math.ceil(totalBytes / this.connections);
    const chunks = [];
    const chunksData = [];

    for (let i = 0; i < this.connections; i++) {
      const start = i * chunkSize;
      const end = (i === this.connections - 1) ? totalBytes - 1 : (start + chunkSize - 1);
      if (start < totalBytes) {
        chunks.push({ start, end });
        chunksData.push({
          id: i,
          total: end - start + 1,
          downloaded: 0,
          lastDownloaded: 0,
          speed: 0
        });
      }
    }

    let downloadedBytes = 0;
    let lastDownloadedBytes = 0;
    let lastTime = Date.now();
    let currentSpeed = 0;
    
    const downloadPromises = chunks.map((chunk, i) => 
      this._downloadChunk(url, fd, chunk.start, chunk.end, headers, abortSignal, (bytesLoaded) => {
        downloadedBytes += bytesLoaded;
        const now = Date.now();
        const timeDiff = now - lastTime;
        
        const chunkData = chunksData[i];
        chunkData.downloaded += bytesLoaded;

        if (timeDiff >= 1000) {
          currentSpeed = ((downloadedBytes - lastDownloadedBytes) / timeDiff) * 1000;
          lastDownloadedBytes = downloadedBytes;
          
          chunksData.forEach(c => {
            c.speed = ((c.downloaded - c.lastDownloaded) / timeDiff) * 1000;
            c.lastDownloaded = c.downloaded;
          });
          
          lastTime = now;
        }
        if (onProgress) {
          onProgress(downloadedBytes, totalBytes, currentSpeed, chunksData);
        }
      })
    );

    try {
      await Promise.all(downloadPromises);
    } catch (err) {
      fs.closeSync(fd);
      throw err;
    }

    fs.closeSync(fd);
    return savePath;
  }

  _getMetadata(urlStr, userHeaders, abortSignal) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlStr);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const reqHeaders = { ...userHeaders };
      // Some servers require a Range header to return 206 Partial Content instead of 200
      reqHeaders['Range'] = 'bytes=0-0';

      const options = {
        method: 'GET',
        headers: reqHeaders,
        signal: abortSignal
      };

      const req = protocol.request(parsedUrl, options, (res) => {
        // We only care about headers, immediately destroy the stream
        res.destroy();

        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          // Handle redirect
          if (res.headers.location) {
            resolve(this._getMetadata(res.headers.location, userHeaders, abortSignal));
            return;
          }
        }

        const contentLength = res.headers['content-range'] 
          ? parseInt(res.headers['content-range'].split('/')[1], 10) 
          : parseInt(res.headers['content-length'], 10);
          
        const acceptsRanges = res.statusCode === 206 || res.headers['accept-ranges'] === 'bytes';

        resolve({
          contentLength: isNaN(contentLength) ? null : contentLength,
          acceptsRanges
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  _downloadChunk(urlStr, fd, start, end, userHeaders, abortSignal, onChunkProgress) {
    return new Promise((resolve, reject) => {
      const doRequest = (currentUrl) => {
        const parsedUrl = new URL(currentUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const reqHeaders = { ...userHeaders };
        reqHeaders['Range'] = `bytes=${start}-${end}`;

        const options = {
          method: 'GET',
          headers: reqHeaders,
          signal: abortSignal
        };

        const req = protocol.request(parsedUrl, options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            if (res.headers.location) {
              doRequest(res.headers.location);
              return;
            }
          }

          if (res.statusCode !== 206 && res.statusCode !== 200) {
            reject(new Error(`Unexpected status code ${res.statusCode} for chunk ${start}-${end}`));
            return;
          }

          let currentOffset = start;

          res.on('data', (chunk) => {
            if (abortSignal && abortSignal.aborted) {
              res.destroy();
              return;
            }
            fs.writeSync(fd, chunk, 0, chunk.length, currentOffset);
            currentOffset += chunk.length;
            onChunkProgress(chunk.length);
          });

          res.on('end', () => {
            resolve();
          });

          res.on('error', reject);
        });

        req.on('error', reject);
        req.end();
      };

      doRequest(urlStr);
    });
  }

  _downloadSingleStream(urlStr, savePath, userHeaders, totalSize, onProgress, abortSignal) {
    return new Promise((resolve, reject) => {
      const doRequest = (currentUrl) => {
        const parsedUrl = new URL(currentUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const options = {
          method: 'GET',
          headers: userHeaders,
          signal: abortSignal
        };

        const req = protocol.request(parsedUrl, options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            if (res.headers.location) {
              doRequest(res.headers.location);
              return;
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Unexpected status code ${res.statusCode}`));
            return;
          }

          const fileStream = fs.createWriteStream(savePath);
          let downloaded = 0;
          let lastDownloadedBytes = 0;
          let lastTime = Date.now();
          let currentSpeed = 0;

          res.on('data', (chunk) => {
            downloaded += chunk.length;
            const now = Date.now();
            const timeDiff = now - lastTime;
            if (timeDiff >= 1000) {
              currentSpeed = ((downloaded - lastDownloadedBytes) / timeDiff) * 1000;
              lastDownloadedBytes = downloaded;
              lastTime = now;
            }
            if (onProgress) {
              onProgress(downloaded, totalSize || downloaded, currentSpeed, 1);
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve(savePath);
          });

          res.on('error', (err) => {
            fs.unlink(savePath, () => {});
            reject(err);
          });
        });

        req.on('error', reject);
        req.end();
      };
      
      doRequest(urlStr);
    });
  }
}
