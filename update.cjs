const fs = require('fs');

const css = `
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
    .mock-file-name { font-size: 0.92rem; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mock-target-device { font-size: 0.75rem; color: #94a3b8; display: flex; align-items: center; gap: 4px; margin-top: 2px; }
    .mock-actions-group { display: flex; align-items: center; gap: 6px; }
    .mock-action-btn { width: 32px; height: 32px; border-radius: 8px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; }
    .mock-action-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
    .mock-action-btn.cancel:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
    .mock-progress-bar-track { width: 100%; height: 6px; background: rgba(255, 255, 255, 0.06); border-radius: 999px; overflow: hidden; position: relative; }
    .mock-progress-bar-fill { height: 100%; background: var(--accent-gradient); border-radius: 999px; box-shadow: 0 0 12px rgba(99, 102, 241, 0.6); transition: width 0.3s ease; }
    .mock-transfer-meta { display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: #94a3b8; }
    .mock-metrics { display: flex; gap: 12px; }
    .mock-metrics span { display: inline-flex; align-items: center; gap: 4px; }
    .mock-percentage { font-weight: 600; color: #f1f5f9; }

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
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Send to PC</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>${css}</style>
</head>
<body>
  
  <div style="margin-bottom: 2rem; text-align: center;">
    <h1 style="font-size: 1.5rem; margin: 0; font-weight: 700; color: white;">Office AirDrop</h1>
    <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: rgba(255,255,255,0.5);">Connected to \${this.displayName}</p>
  </div>

  <!-- Initial State -->
  <div id="initial-state">
    <input type="file" multiple id="fileInput" class="hidden">
    <button class="initial-btn" id="btnSelect">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
      Select Files to Send
    </button>
  </div>

  <!-- Transfer Card UI -->
  <div id="transfer-card" class="mock-transfer-card hidden">
    <div class="mock-transfer-header">
      <div class="mock-file-icon-box">
        <svg id="icon-video" class="hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
        <svg id="icon-file" class="hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <svg id="icon-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
      </div>
      
      <div class="mock-file-details">
        <div class="mock-file-name-row">
          <span class="mock-file-name" id="ui-filename">Connecting...</span>
        </div>
        <div class="mock-target-device" id="ui-status">
          <span id="ui-direction-text">Sending to</span>
          <strong style="color: #cbd5e1; font-weight: 500;">\${this.displayName}</strong>
        </div>
      </div>

      <div class="mock-actions-group">
        <button id="btnCancel" class="mock-action-btn cancel" title="Cancel">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
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
    let downloadToken = null;

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
      
      els.filename.innerText = data.fileName;
      els.direction.innerText = 'Receiving from';
      els.iconArrow.classList.add('hidden');
      els.iconFile.classList.remove('hidden');
      
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

        els.status.innerHTML = '<span id="ui-direction-text">Sending to</span> <strong style="color: #cbd5e1; font-weight: 500;">\${this.displayName}</strong>';
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
                  
                  if (now - lastTime > 500) {
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
</html>\`;
`;

fs.writeFileSync('C:/Users/Editor 2/Documents/Office Share/update.js', `
const fs = require('fs');
const path = 'C:/Users/Editor 2/Documents/Office Share/electron/network.js';
let content = fs.readFileSync(path, 'utf8');

const newScript = \`${html.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`')}\`;

content = content.replace(/getMobileHtml\\(\\)\\s*{[\\s\\S]*?\\n  }\\n\\n  \\/\\/ ── File Receiving/, \`getMobileHtml() {\\n    return \\\`\${newScript}\\\`;\\n  }\\n\\n  // ── File Receiving\`);

// Also add this.io.emit('transfer-cancelled') to cancelTransfer()
content = content.replace(/this.sendIPC\\('transfer-error', { message: 'Transfer cancelled' }\\);/, \`this.sendIPC('transfer-error', { message: 'Transfer cancelled' });\\n    if (this.io) this.io.emit('transfer-cancelled');\`);

fs.writeFileSync(path, content);
`);
