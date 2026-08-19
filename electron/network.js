import dgram from 'dgram'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { io as Client } from 'socket.io-client'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { IncomingForm } from 'formidable'
import http from 'http'
import { app as electronApp, Notification, shell } from 'electron'

class NetworkManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow
    this.peers = new Map()
    this.pendingRequests = new Map()
    this.validTokens = new Set()
    this.aliases = {}
    this.port = 0
    this.savePath = electronApp.getPath('downloads')
    this.displayName = os.hostname()
    this.onHistoryEntry = null // Set by main.js
    this.stagedFile = null // Holds file staged for phone download

    // Express Setup
    this.app = express()
    this.app.use(express.json())

    // HTTP & Socket.io Setup
    this.httpServer = createServer(this.app)
    this.io = new Server(this.httpServer, {
      cors: { origin: '*' }
    })

    // UDP Setup for Discovery
    this.udpClient = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.hostname = os.hostname()

    this.setupRoutes()
    this.setupSockets()
  }

  updateSettings(settings) {
    if (settings.savePath !== undefined) this.savePath = settings.savePath
    if (settings.displayName !== undefined) this.displayName = settings.displayName
    if (settings.autoAccept !== undefined) this.autoAccept = settings.autoAccept
    if (settings.notifications !== undefined) this.notifications = settings.notifications
  }

  updateAliases(aliases) {
    this.aliases = aliases || {}
  }

  sendIPC(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  start() {
    if (this.isRunning) {
      this.peers.clear()
      this.notifyFrontend()
      return
    }
    this.isRunning = true
    
    this.udpClient.bind(56912, () => {
      this.udpClient.setBroadcast(true)

      this.httpServer.listen(0, '0.0.0.0', () => {
        this.port = this.httpServer.address().port
        console.log(`Server running on port ${this.port}`)

        this.discoverPeersUDP()
        this.publishServiceUDP()
      })
    })
  }

  publishServiceUDP() {
    setInterval(() => {
      const msg = JSON.stringify({
        type: 'office-drop',
        name: this.displayName + ' - Office Share',
        host: this.hostname,
        port: this.port,
        os: os.platform(),
        nameTxt: this.displayName
      })
      this.udpClient.send(msg, 56912, '255.255.255.255')
    }, 2000)
  }

  discoverPeersUDP() {
    this.udpClient.on('message', (msg, rinfo) => {
      try {
        const service = JSON.parse(msg.toString())
        if (service.type !== 'office-drop') return
        if (service.host === this.hostname) return

        const peerId = service.host
        const ip = rinfo.address

        if (!this.peers.has(peerId) || this.peers.get(peerId).port !== service.port) {
          this.peers.set(peerId, {
            id: peerId,
            name: service.nameTxt || service.name,
            ip: ip,
            port: service.port,
            os: service.os,
            lastSeen: Date.now()
          })
          this.notifyFrontend()
        } else {
          this.peers.get(peerId).lastSeen = Date.now()
        }
      } catch (e) {
        console.error('UDP parse error:', e.message)
      }
    })

    // Remove stale peers
    setInterval(() => {
      const now = Date.now()
      let changed = false
      for (const [id, peer] of this.peers.entries()) {
        if (now - peer.lastSeen > 6000) {
          this.peers.delete(id)
          changed = true
        }
      }
      if (changed) this.notifyFrontend()
    }, 3000)
  }

  notifyFrontend() {
    const peersArray = Array.from(this.peers.values()).map(p => ({
      ...p,
      displayName: this.aliases[p.id] || p.name
    }))
    this.sendIPC('discovered-peers', peersArray)
  }

  getPeers() {
    return Array.from(this.peers.values()).map(p => ({
      ...p,
      displayName: this.aliases[p.id] || p.name
    }))
  }

  getLocalIp() {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        const { address, family, internal } = iface
        if (family === 'IPv4' && !internal) return address
      }
    }
    return '127.0.0.1'
  }

  getMobileHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Send to PC</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    :root {
      --bg: #0b0c16;
      --card-bg: rgba(22, 23, 42, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #6366f1;
      --accent-gradient: linear-gradient(90deg, #6366f1 0%, #a855f7 100%);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }
    body { 
      background-color: var(--bg); 
      background-image: 
        radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.08), transparent 25%),
        radial-gradient(circle at 85% 30%, rgba(168, 85, 247, 0.08), transparent 25%);
      color: var(--text-main); 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      margin: 0;
    }
    
    .mock-transfer-card {
      width: 100%;
      max-width: 520px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 16px 20px;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.04);
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: all 0.3s ease;
    }

    .mock-transfer-header { display: flex; align-items: center; gap: 14px; }
    .mock-file-icon-box {
      width: 42px; height: 42px; border-radius: 12px;
      background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3);
      color: #818cf8; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .mock-file-details { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
    .mock-file-name-row { display: flex; align-items: center; gap: 8px; }
    .mock-file-name { font-size: 0.92rem; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;}
    .mock-target-device { font-size: 0.75rem; color: #94a3b8; display: flex; align-items: center; gap: 4px; margin-top: 2px; }
    .mock-actions-group { display: flex; align-items: center; gap: 6px; }
    .mock-action-btn { width: 32px; height: 32px; border-radius: 8px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; padding: 0; }
    .mock-action-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
    .mock-action-btn.cancel:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
    .mock-progress-bar-track { width: 100%; height: 6px; background: rgba(255, 255, 255, 0.06); border-radius: 999px; overflow: hidden; position: relative; }
    .mock-progress-bar-fill { height: 100%; background: var(--accent-gradient); border-radius: 999px; box-shadow: 0 0 12px rgba(99, 102, 241, 0.6); transition: width 0.3s ease; }
    .mock-transfer-meta { display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: #94a3b8; margin-top: 4px; }
    .mock-metrics { display: flex; gap: 12px; }
    .mock-metrics span { display: inline-flex; align-items: center; gap: 4px; }
    .mock-percentage { font-weight: 600; color: #f1f5f9; }
    .dot-sep { color: #475569; }

    .initial-btn {
      background: var(--accent-gradient);
      border: none;
      border-radius: 12px;
      padding: 16px 32px;
      color: white;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 12px 24px rgba(99, 102, 241, 0.3);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .initial-btn:active { transform: scale(0.95); }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  
  <div style="margin-bottom: 2rem; text-align: center;">
    <h1 style="font-size: 1.5rem; margin: 0; font-weight: 700; color: white;">Office AirDrop</h1>
    <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: rgba(255,255,255,0.5);">Connected to \${this.displayName}</p>
  </div>

  <div id="initial-state">
    <input type="file" multiple id="fileInput" class="hidden">
    <button class="initial-btn" id="btnSelect">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
      Select Files to Send
    </button>
  </div>

  <div id="transfer-card" class="mock-transfer-card hidden">
    <div class="mock-transfer-header">
      <div class="mock-file-icon-box">
        <svg id="icon-video" class="hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="22" height="14" rx="2" ry="2"></rect></svg>
        <svg id="icon-file" class="hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <svg id="icon-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
      </div>
      
      <div class="mock-file-details">
        <div class="mock-file-name-row">
          <span class="mock-file-name" id="ui-filename">Connecting...</span>
        </div>
        <div class="mock-target-device" id="ui-status">
          <span id="ui-direction-text">Sending to</span>
          <strong style="color: #cbd5e1; font-weight: 500; margin-left: 4px;">\${this.displayName}</strong>
        </div>
      </div>

      <div class="mock-actions-group">
        <button id="btnCancel" class="mock-action-btn cancel" title="Cancel">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>

    <div id="progress-area" class="hidden">
      <div class="mock-progress-bar-track">
        <div id="ui-progress-fill" class="mock-progress-bar-fill" style="width: 0%;"></div>
      </div>

      <div class="mock-transfer-meta">
        <div class="mock-metrics">
          <span><strong id="ui-transferred" style="color: #f1f5f9; font-weight: 600;">0 B</strong> / <span id="ui-total">0 B</span></span>
          <span class="dot-sep">•</span>
          <span id="ui-speed">0 B/s</span>
          <span class="dot-sep">•</span>
          <span id="ui-eta">ETA: --</span>
        </div>
        <span class="mock-percentage" id="ui-percentage">0%</span>
      </div>
    </div>
    
    <div id="download-actions" class="hidden" style="margin-top: 8px;">
        <a id="btnDownload" href="#" class="initial-btn" style="width: 100%; justify-content: center; padding: 12px; font-size: 0.9rem;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Save to Device
        </a>
    </div>
  </div>

  <script>
    const socket = io();
    let myName = localStorage.getItem('office_sender_name');
    if (!myName) {
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/.test(ua)) myName = 'iPhone';
      else if (/Android/.test(ua)) myName = 'Android';
      else if (/Macintosh/.test(ua)) myName = 'Mac';
      else if (/Windows/.test(ua)) myName = 'Windows PC';
      else myName = 'Mobile Device';
      localStorage.setItem('office_sender_name', myName);
    }

    const els = {
      initial: document.getElementById('initial-state'),
      card: document.getElementById('transfer-card'),
      fileInput: document.getElementById('fileInput'),
      btnSelect: document.getElementById('btnSelect'),
      btnCancel: document.getElementById('btnCancel'),
      btnDownload: document.getElementById('btnDownload'),
      progressArea: document.getElementById('progress-area'),
      downloadActions: document.getElementById('download-actions'),
      filename: document.getElementById('ui-filename'),
      status: document.getElementById('ui-status'),
      direction: document.getElementById('ui-direction-text'),
      progressFill: document.getElementById('ui-progress-fill'),
      transferred: document.getElementById('ui-transferred'),
      total: document.getElementById('ui-total'),
      speed: document.getElementById('ui-speed'),
      eta: document.getElementById('ui-eta'),
      percentage: document.getElementById('ui-percentage'),
      iconVideo: document.getElementById('icon-video'),
      iconFile: document.getElementById('icon-file'),
      iconArrow: document.getElementById('icon-arrow')
    };

    let currentXhr = null;
    let isCancelled = false;

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    function formatETA(secs) {
      if (!secs || !isFinite(secs)) return '--';
      if (secs < 60) return secs + 's';
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return m + 'm ' + s + 's';
    }

    function resetUI() {
      els.initial.classList.remove('hidden');
      els.card.classList.add('hidden');
      els.progressArea.classList.add('hidden');
      els.downloadActions.classList.add('hidden');
      els.fileInput.value = '';
      els.progressFill.style.width = '0%';
      els.progressFill.style.background = '';
      els.progressFill.style.boxShadow = '';
      els.btnCancel.style.opacity = '1';
      els.btnCancel.disabled = false;
      els.btnCancel.classList.remove('hidden');
    }

    function setCancelledState(reason) {
      isCancelled = true;
      if (currentXhr) currentXhr.abort();
      els.status.innerHTML = '<strong style="color: #ef4444; font-weight: 600;">' + reason + '</strong>';
      els.progressFill.style.background = '#ef4444';
      els.progressFill.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.6)';
      els.btnCancel.style.opacity = '0.5';
      els.btnCancel.disabled = true;
      setTimeout(resetUI, 3000);
    }

    els.btnSelect.onclick = () => els.fileInput.click();
    els.btnCancel.onclick = () => {
      setCancelledState('Transfer Cancelled');
      socket.emit('cancel-transfer'); // Tell server
    };

    socket.on('transfer-cancelled', () => {
      if (!els.card.classList.contains('hidden')) {
        setCancelledState('Cancelled by PC');
      }
    });

    socket.on('file-staged', (data) => {
      els.initial.classList.add('hidden');
      els.card.classList.remove('hidden');
      els.progressArea.classList.add('hidden');
      els.downloadActions.classList.remove('hidden');
      els.btnCancel.classList.add('hidden'); 
      
      els.filename.innerText = data.fileName;
      els.direction.innerText = 'Receiving from';
      els.iconArrow.classList.add('hidden');
      els.iconFile.classList.remove('hidden');
      els.status.innerHTML = '<strong style="color: #cbd5e1; font-weight: 500;">Ready to save</strong>';
      
      els.btnDownload.href = '/download-staged/' + data.token;
    });

    els.fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      isCancelled = false;
      const totalSize = files.reduce((acc, file) => acc + file.size, 0);
      const displayFileName = files.length === 1 ? files[0].name : (files.length + ' files');

      els.initial.classList.add('hidden');
      els.card.classList.remove('hidden');
      els.downloadActions.classList.add('hidden');
      els.progressArea.classList.add('hidden');
      els.iconArrow.classList.remove('hidden');
      els.iconFile.classList.add('hidden');
      els.iconVideo.classList.add('hidden');
      els.btnCancel.classList.remove('hidden');
      
      els.filename.innerText = displayFileName;
      els.status.innerHTML = '<strong style="color: #cbd5e1; font-weight: 500;">Waiting for PC...</strong>';

      let wakeLock = null;
      try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}

      socket.emit('request-transfer', { senderName: myName, fileName: displayFileName, fileSize: totalSize }, async (res) => {
        if (!res.accepted || !res.token) {
          setCancelledState('Declined by PC');
          return;
        }

        els.progressArea.classList.remove('hidden');
        els.iconArrow.classList.add('hidden');
        if (files[0].type.startsWith('video/')) els.iconVideo.classList.remove('hidden');
        else els.iconFile.classList.remove('hidden');

        els.status.innerHTML = '<span id="ui-direction-text">Sending to</span> <strong style="color: #cbd5e1; font-weight: 500; margin-left: 4px;">\${this.displayName}</strong>';
        els.total.innerText = formatBytes(totalSize);
        els.transferred.innerText = '0 B';

        let hasError = false;
        let lastTime = Date.now();
        let lastBytes = 0;

        for (let i = 0; i < files.length; i++) {
          if (isCancelled) { hasError = true; break; }
          const file = files[i];
          if (files.length > 1) els.filename.innerText = file.name + ' (' + (i+1) + '/' + files.length + ')';

          try {
            await new Promise((resolve, reject) => {
              const formData = new FormData();
              formData.append('file', file);
              const xhr = new XMLHttpRequest();
              currentXhr = xhr;
              xhr.open('POST', '/upload', true);
              xhr.setRequestHeader('X-Sender-Name', encodeURIComponent(myName));
              xhr.setRequestHeader('X-Transfer-Token', res.token);

              xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable && !isCancelled) {
                  const now = Date.now();
                  const percent = Math.round((ev.loaded / ev.total) * 100);
                  els.percentage.innerText = percent + '%';
                  els.progressFill.style.width = percent + '%';
                  els.transferred.innerText = formatBytes(ev.loaded);
                  
                  if (now - lastTime > 500 || percent === 100) {
                    const timeDiff = (now - lastTime) / 1000;
                    const bytesDiff = ev.loaded - lastBytes;
                    const speed = Math.max(0, bytesDiff / timeDiff);
                    els.speed.innerText = formatBytes(speed) + '/s';
                    const remain = ev.total - ev.loaded;
                    els.eta.innerText = 'ETA: ' + formatETA(speed > 0 ? remain/speed : 0);
                    lastTime = now;
                    lastBytes = ev.loaded;
                  }
                }
              };

              xhr.onload = () => { if (xhr.status === 200) resolve(); else reject(); };
              xhr.onerror = () => reject();
              xhr.onabort = () => reject();
              xhr.send(formData);
            });
          } catch (err) {
            hasError = true;
            break;
          }
        }

        if (wakeLock) wakeLock.release().catch(()=>{});
        if (hasError && !isCancelled) setCancelledState('Upload Failed');
        else if (!isCancelled) {
          els.status.innerHTML = '<strong style="color: #34d399; font-weight: 600;">Sent Successfully!</strong>';
          els.progressFill.style.background = '#34d399';
          els.btnCancel.classList.add('hidden');
          setTimeout(resetUI, 3000);
        }
      });
    };
  </script>
</body>
</html>
`;
  }

  // ── File Receiving ──────────────────────────────────────

  setupRoutes() {
    this.app.get('/', (req, res) => {
      res.send(this.getMobileHtml())
    })

    this.app.get('/download-staged/:token', (req, res) => {
      if (!this.stagedFile || this.stagedFile.token !== req.params.token) {
        return res.status(404).send('File not found or link expired')
      }
      const { filePath, fileName, fileSize } = this.stagedFile
      
      res.download(filePath, fileName, (err) => {
        if (!err) {
          console.log(`Successfully sent ${fileName} to phone`)
          if (this.onHistoryEntry) {
            this.onHistoryEntry({
              id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
              direction: 'sent',
              fileName,
              fileSize,
              peerName: 'Mobile Device',
              status: 'completed',
              timestamp: Date.now()
            })
          }
        }
        // Keep it staged until a timeout, or clear immediately?
        // Mobile browsers might use multiple connections, so we keep it open for a short time
      })
    })

    this.app.post('/upload', (req, res) => {
      const token = req.headers['x-transfer-token']
      if (!token || !this.validTokens.has(token)) {
        return res.status(403).send('Unauthorized transfer')
      }

      this.activeIncomingReq = req;
      
      const form = new IncomingForm({
        uploadDir: this.savePath,
        keepExtensions: true,
        maxFileSize: 50 * 1024 * 1024 * 1024, // 50GB
      })

      const senderName = req.headers['x-sender-name'] ? decodeURIComponent(req.headers['x-sender-name']) : 'Mobile Device';
      
      let currentFilepath = null;
      let currentFileName = 'a file';
      form.on('fileBegin', (name, file) => {
        currentFilepath = file.filepath;
        currentFileName = file.originalFilename || 'a file';
      });

      let lastProgress = 0
      let lastTime = Date.now()
      let lastBytes = 0
      
      form.on('progress', (bytesReceived, bytesExpected) => {
        const progress = bytesExpected === 0 ? 100 : Math.round((bytesReceived / bytesExpected) * 100)
        const now = Date.now()
        
        if (progress > lastProgress || (now - lastTime >= 500)) {
          const timeDiff = (now - lastTime) / 1000
          const bytesDiff = bytesReceived - lastBytes
          const speed = timeDiff > 0 ? Math.max(0, bytesDiff / timeDiff) : 0
          const bytesRemaining = bytesExpected - bytesReceived
          const eta = speed > 0 ? Math.ceil(bytesRemaining / speed) : 0
          
          lastProgress = progress
          lastTime = now
          lastBytes = bytesReceived
          
          this.sendIPC('transfer-progress', {
            direction: 'receiving',
            fileName: currentFileName,
            peerName: senderName,
            progress,
            bytesTransferred: bytesReceived,
            bytesTotal: bytesExpected,
            speed,
            eta
          })
        }
      })

      req.on('aborted', () => {
        console.log('Upload aborted by client.');
        this.sendIPC('transfer-error', { message: 'Transfer cancelled by sender' });
        this.activeIncomingReq = null;
        if (currentFilepath && fs.existsSync(currentFilepath)) {
          fs.unlink(currentFilepath, (err) => {
            if (err) console.error('Failed to clean up aborted file:', err);
          });
        }
      });

      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Error parsing upload:', err)
          this.sendIPC('transfer-error', { message: 'Upload failed' })
          return res.status(500).send('Upload failed')
        }

        const file = files.file[0]
        // Prevent path traversal by strictly extracting the basename
        const originalName = path.basename(file.originalFilename || 'unknown_file')
        let newPath = path.join(this.savePath, originalName)

        // Handle duplicate filenames
        if (fs.existsSync(newPath)) {
          const ext = path.extname(originalName)
          const base = path.basename(originalName, ext)
          let counter = 1
          while (fs.existsSync(newPath)) {
            newPath = path.join(this.savePath, `${base} (${counter})${ext}`)
            counter++
          }
        }

        fs.rename(file.filepath, newPath, (renameErr) => {
          if (renameErr) console.error('Error renaming:', renameErr)
          const savedName = path.basename(newPath)
          console.log('File received:', newPath)

          const senderName = req.headers['x-sender-name'] ? decodeURIComponent(req.headers['x-sender-name']) : 'Unknown Peer'
          const entry = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
            direction: 'received',
            fileName: savedName,
            filePath: newPath,
            fileSize: file.size,
            peerName: senderName,
            timestamp: Date.now()
          }
          this.sendIPC('transfer-complete', entry)
          if (this.onHistoryEntry) this.onHistoryEntry(entry)
          
          if (this.notifications && Notification.isSupported()) {
            const notif = new Notification({
              title: 'File received',
              body: `${savedName} from ${senderName}`,
              timeoutType: 'never'
            })
            notif.on('click', () => shell.showItemInFolder(newPath))
            notif.show()
          }
          
          res.send('Success')
        })
      })
    })
  }

  // ── Accept / Decline via IPC ────────────────────────────

  setupSockets() {
    this.io.on('connection', (socket) => {
      console.log('A peer connected via socket')

      socket.on('request-transfer', (data, callback) => {
        let finalSenderName = (data.senderName || '').trim()
        if (!finalSenderName) {
          const ua = socket.request.headers['user-agent'] || ''
          if (/iPhone|iPad|iPod/.test(ua)) finalSenderName = 'iPhone'
          else if (/Android/.test(ua)) finalSenderName = 'Android Phone'
          else if (/Macintosh/.test(ua)) finalSenderName = 'Mac'
          else if (/Windows/.test(ua)) finalSenderName = 'Windows PC'
          else finalSenderName = 'Phone'
        }

        const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 5)
        this.pendingRequests.set(requestId, {
          callback,
          fileName: data.fileName,
          senderName: finalSenderName
        })

        if (this.autoAccept) {
          this.respondToRequest(requestId, true)
          return
        }

        if (this.notifications && Notification.isSupported()) {
          const notif = new Notification({
            title: 'Incoming Transfer Request',
            body: `${finalSenderName} wants to send you a file.`,
            timeoutType: 'never'
          })
          notif.on('click', () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.show()
              this.mainWindow.focus()
            }
          })
          notif.show()
        }

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.flashFrame(true)
        }

        this.sendIPC('transfer-request', {
          requestId,
          senderName: finalSenderName,
          fileName: data.fileName,
          fileSize: data.fileSize
        })

        // Auto-decline after 30 seconds if no response
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.respondToRequest(requestId, false)
            this.sendIPC('transfer-auto-declined', { requestId })
          }
        }, 30000)
      })
    })
  }

  respondToRequest(requestId, accepted) {
    const requestData = this.pendingRequests.get(requestId)
    if (requestData) {
      const { callback, fileName, senderName } = requestData;
      let token = null
      if (accepted) {
        token = Date.now().toString() + Math.random().toString(36).substr(2, 5)
        this.validTokens.add(token)
        // Clean up token after 1 hour max
        setTimeout(() => this.validTokens.delete(token), 3600000)
        
        // Immediately show the waiting state so the UI doesn't look dead before first bytes arrive
        this.sendIPC('transfer-waiting', {
          fileName: fileName || 'Incoming File...',
          peerName: senderName || 'Mobile Device',
          direction: 'receiving'
        })
      }
      callback({ accepted, token })
      this.pendingRequests.delete(requestId)
    }
  }

  // Stage file for mobile
  stageFileForPhone(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist")
    }
    const fileName = path.basename(filePath)
    const fileSize = fs.statSync(filePath).size
    const token = 'tok_' + Date.now() + Math.random().toString(36).substring(2, 8)

    this.stagedFile = { filePath, fileName, fileSize, token }
    
    // Automatically clear staged file after 5 minutes to free memory/state
    setTimeout(() => {
      if (this.stagedFile && this.stagedFile.token === token) {
        this.stagedFile = null
      }
    }, 5 * 60 * 1000)

    // Notify connected phones
    if (this.io) {
      this.io.emit('file-staged', { fileName, fileSize, token })
    }
  }

  // 📦 File Sending 📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦────────────────────────────────────────

  async sendFiles(peerId, filePaths) {
    if (!filePaths || filePaths.length === 0) return
    const peer = this.peers.get(peerId)
    if (!peer) return console.error('Peer not found')

    let totalSize = 0
    for (const fp of filePaths) {
      totalSize += fs.statSync(fp).size
    }

    const displayFileName = filePaths.length > 1 ? `${filePaths.length} files` : path.basename(filePaths[0])
    const peerNameOverride = this.aliases[peer.id] || peer.name
    
    // Immediately tell the UI we are waiting/connecting so it doesn't look frozen
    this.sendIPC('transfer-waiting', { fileName: displayFileName, peerName: peerNameOverride })

    const socket = Client(`http://${peer.ip}:${peer.port}`, {
      reconnection: false,
      timeout: 10000
    })

    socket.on('connect', () => {
      socket.emit('request-transfer', {
        senderName: this.displayName,
        fileName: displayFileName,
        fileSize: totalSize
      }, async (response) => {
        if (response.accepted && response.token) {
          console.log('Peer accepted. Uploading...')
          this.sendIPC('transfer-accepted', { fileName: displayFileName, peerName: peerNameOverride })
          
          // Upload sequentially to avoid creating multiple temp files concurrently and crashing the endpoint
          for (const fp of filePaths) {
            try {
              await this.uploadSingleFilePromise(peer.ip, peer.port, fp, peerNameOverride, response.token)
            } catch (err) {
              console.error(`Failed to upload ${fp}:`, err)
              this.sendIPC('transfer-error', { message: `Failed to send ${path.basename(fp)}` })
            }
          }
        } else {
          console.log('Peer declined.')
          this.sendIPC('transfer-declined', { fileName: displayFileName, peerName: peerNameOverride })
          const entry = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
            direction: 'sent',
            fileName: displayFileName,
            fileSize: totalSize,
            peerName: peerNameOverride,
            status: 'declined',
            timestamp: Date.now()
          }
          if (this.onHistoryEntry) this.onHistoryEntry(entry)
        }
        socket.disconnect()
      })
    })

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message)
      this.sendIPC('transfer-error', { message: `Could not connect to ${peerNameOverride}` })
      socket.disconnect()
    })
  }

  cancelTransfer() {
    this.isCancelled = true;
    if (this.activeRequest) {
      this.activeRequest.destroy(new Error('Transfer cancelled'));
      this.activeRequest = null;
    }
    if (this.activeIncomingReq) {
      this.activeIncomingReq.destroy(new Error('Transfer cancelled'));
      this.activeIncomingReq = null;
    }
    if (this.activeFileStream) {
      this.activeFileStream.destroy();
      this.activeFileStream = null;
    }
    this.sendIPC('transfer-error', { message: 'Transfer cancelled' });
    if (this.io) {
      this.io.emit('transfer-cancelled');
    }
  }

  pauseTransfer() {
    this.isPaused = true;
    if (this.activeFileStream) this.activeFileStream.pause();
    if (this.activeIncomingReq) this.activeIncomingReq.pause();
    this.sendIPC('transfer-paused', { isPaused: true });
  }

  resumeTransfer() {
    this.isPaused = false;
    if (this.activeFileStream) this.activeFileStream.resume();
    if (this.activeIncomingReq) this.activeIncomingReq.resume();
    this.sendIPC('transfer-paused', { isPaused: false });
  }

  uploadSingleFilePromise(ip, port, filePath, peerName, token) {
    return new Promise((resolve, reject) => {
      this.isCancelled = false;
      const fileName = path.basename(filePath)
      const fileSize = fs.statSync(filePath).size

      const boundary = '----OfficeAirDropBoundary' + Math.random().toString(16)

      const options = {
        hostname: ip,
        port: port,
        path: '/upload',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'X-Sender-Name': encodeURIComponent(this.displayName),
          'X-Transfer-Token': token
        }
      }

      const req = http.request(options, (res) => {
        let body = ''
        res.on('data', (d) => { body += d.toString() })
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Upload failed with status ${res.statusCode}: ${body}`))
          }
          console.log('Upload complete:', body)
          const entry = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
            direction: 'sent',
            fileName,
            fileSize,
            peerName,
            filePath,
            status: 'completed',
            timestamp: Date.now()
          }
          this.sendIPC('transfer-complete', entry)
          if (this.onHistoryEntry) this.onHistoryEntry(entry)
          resolve()
        })
      })

      req.on('error', (e) => {
        if (this.isCancelled) {
          reject(new Error('Cancelled'));
          this.sendIPC('transfer-error', { message: 'Transfer cancelled' });
        } else {
          reject(e);
        }
      });
      
      this.activeRequest = req;

      // Write multipart form headers
      req.write(`--${boundary}\r\n`)
      req.write(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`)
      req.write(`Content-Type: application/octet-stream\r\n\r\n`)

      const fileStream = fs.createReadStream(filePath)
      this.activeFileStream = fileStream;
      
      let uploaded = 0
      let lastProgress = 0
      let lastTime = Date.now()
      let lastBytes = 0

      fileStream.on('data', (chunk) => {
        uploaded += chunk.length
        const progress = fileSize === 0 ? 100 : Math.round((uploaded / fileSize) * 100)
        const now = Date.now()
        
        if (progress > lastProgress || (now - lastTime >= 500)) {
          const timeDiff = (now - lastTime) / 1000
          const bytesDiff = uploaded - lastBytes
          const speed = timeDiff > 0 ? Math.max(0, bytesDiff / timeDiff) : 0
          const bytesRemaining = fileSize - uploaded
          const eta = speed > 0 ? Math.ceil(bytesRemaining / speed) : 0
          
          lastProgress = progress
          lastTime = now
          lastBytes = uploaded
          
          this.sendIPC('transfer-progress', {
            direction: 'sending',
            fileName,
            peerName,
            progress,
            bytesTransferred: uploaded,
            bytesTotal: fileSize,
            speed,
            eta
          })
        }
      })

      fileStream.pipe(req, { end: false })
      fileStream.on('end', () => {
        this.activeFileStream = null;
        req.end(`\r\n--${boundary}--\r\n`)
      });
      
      fileStream.on('error', (err) => {
        this.activeFileStream = null;
        req.destroy(err)
      })
    })
  }
}

export default NetworkManager
