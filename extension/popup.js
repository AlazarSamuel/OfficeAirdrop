const SERVER_URL = "http://localhost:49152/download";
const FETCH_URL = "http://localhost:49152/fetch-info";
const FOLDER_URL = "http://localhost:49152/open-folder";
const CANCEL_URL = "http://localhost:49152/cancel";

let currentTabUrl = "";

// Initialize Extension Popup
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    document.getElementById('status').textContent = 'Cannot fetch from this page.';
    return;
  }
  currentTabUrl = tab.url;
  
  document.getElementById('loader').style.display = 'flex';
  
  let attempts = 0;
  const maxAttempts = 10; // 10 seconds max wait
  
  const tryFetch = async () => {
    try {
      const res = await fetch(FETCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentTabUrl })
      });
      
      if (res.ok) {
        const data = await res.json();
        
        document.getElementById('loader').style.display = 'none';
        document.getElementById('wake-loader').style.display = 'none';
        document.getElementById('previewCard').style.display = 'block';
        document.getElementById('previewThumb').src = data.thumbnail || '';
        document.getElementById('previewTitle').textContent = data.title || 'Unknown Title';
        
        const hours = Math.floor((data.duration || 0) / 3600);
        const mins = Math.floor(((data.duration || 0) % 3600) / 60);
        const secs = (data.duration || 0) % 60;
        document.getElementById('previewDuration').textContent = `Duration: ${hours ? hours + 'h ' : ''}${mins}m ${secs}s`;
        
        const optionsContainer = document.getElementById('customOptions');
        const displaySpan = document.querySelector('#customSelectDisplay span');
        optionsContainer.innerHTML = '';
        
        let selectedValue = 'best';
        
        const addOption = (val, text, isSelected = false) => {
          const div = document.createElement('div');
          div.className = 'custom-option' + (isSelected ? ' selected' : '');
          div.textContent = text;
          div.addEventListener('click', () => {
            selectedValue = val;
            displaySpan.textContent = text;
            document.querySelectorAll('.custom-option').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            optionsContainer.classList.remove('open');
          });
          optionsContainer.appendChild(div);
        };
        
        addOption('best', 'Best Quality', true);
        
        if (data.formats && data.formats.length > 0) {
          const videos = data.formats.filter(f => f.vcodec !== 'none' && f.height);
          const heights = [...new Set(videos.map(v => v.height))].sort((a,b)=>b-a);
          
          heights.forEach(h => {
            addOption(`bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`, `${h}p Resolution`);
          });
        }
        addOption('audio', 'Audio Only');
        
        document.getElementById('customSelectDisplay').addEventListener('click', () => {
          optionsContainer.classList.toggle('open');
        });
        
        document.addEventListener('click', (e) => {
          if (!document.getElementById('qualitySelectWrapper').contains(e.target)) {
            optionsContainer.classList.remove('open');
          }
        });
        
        document.getElementById('main-content').style.display = 'block';
        return true;
      }
    } catch (e) {
      return false;
    }
  };
  
  let success = await tryFetch();
  
  if (!success) {
    // App is offline. Wake it up!
    document.getElementById('loader').style.display = 'none';
    document.getElementById('wake-loader').style.display = 'flex';
    
    // Fire the custom URI to wake the app
    const iframe = document.createElement('iframe');
    iframe.src = 'officeairdrop://wake';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    // Retry loop
    const retryInterval = setInterval(async () => {
      attempts++;
      success = await tryFetch();
      if (success || attempts >= maxAttempts) {
        clearInterval(retryInterval);
        if (!success) {
          document.getElementById('wake-loader').style.display = 'none';
          document.getElementById('status').textContent = 'Error: App failed to wake up.';
          document.getElementById('status').className = 'status error';
        }
      }
    }, 1000);
  }
}
init();

document.getElementById('sendBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Sending...';
  statusEl.className = 'status';
  
  const displaySpan = document.querySelector('#customSelectDisplay span');
  const quality = document.querySelector('.custom-option.selected') 
    ? (document.querySelector('.custom-option.selected').textContent === 'Audio Only' ? 'audio' : 'best') 
    : 'best'; // Wait, let's just get the actual value we mapped.
  
  // We need to retrieve the val. We didn't store it in DOM. 
  // Let's store it on the wrapper.
  const selectedDiv = document.querySelector('.custom-option.selected');
  let finalQuality = 'best';
  if (selectedDiv) {
    if (selectedDiv.textContent === 'Best Quality') finalQuality = 'best';
    else if (selectedDiv.textContent === 'Audio Only') finalQuality = 'audio';
    else {
      const match = selectedDiv.textContent.match(/(\d+)p/);
      if (match) finalQuality = `bestvideo[height<=${match[1]}]+bestaudio/best[height<=${match[1]}]`;
    }
  }

  try {
    const response = await fetch(SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: currentTabUrl, autoDownload: true, quality: finalQuality })
    });

    if (response.ok) {
      statusEl.textContent = 'Sent successfully!';
      statusEl.className = 'status success';
      setTimeout(() => window.close(), 1500);
    } else {
      statusEl.textContent = 'Error: App rejected the link.';
      statusEl.className = 'status error';
    }
  } catch (error) {
    statusEl.textContent = 'Error: Is the desktop app running?';
    statusEl.className = 'status error';
  }
});

// Telemetry Polling Engine
async function fetchProgress() {
  try {
    const res = await fetch("http://localhost:49152/progress");
    if (!res.ok) return;
    const data = await res.json();
    
    const dashboard = document.getElementById('dashboard');
    const dlList = document.getElementById('dlList');
    
    // Check if the current tab URL is already in progress/complete
    const isAlreadyDownloading = data.downloads.some(d => d.url === currentTabUrl);
    if (isAlreadyDownloading) {
      document.getElementById('main-content').style.display = 'none';
      document.getElementById('loader').style.display = 'none';
    }
    
    // Filter out errors, keep downloading and complete
    const activeDownloads = data.downloads.filter(d => d.status === 'downloading' || d.status === 'complete');
    
    if (activeDownloads.length > 0) {
      dashboard.style.display = 'flex';
      
      dlList.innerHTML = activeDownloads.map(d => `
        <div class="dl-item">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div class="dl-title" title="${d.title}">${d.title || 'Fetching details...'}</div>
            <button class="btn-cancel" data-id="${d.id}" title="Cancel Download">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="dl-stats">
            <span style="color: #818cf8;">${d.percent ? d.percent.toFixed(1) : '0.0'}%</span>
            <span>${d.speed || '--'}</span>
          </div>
          ${d.status === 'complete' 
            ? `<button class="btn-folder" data-id="${d.id}">Open in App</button>`
            : `<div class="dl-bar-bg"><div class="dl-bar-fill" style="width: ${Math.min(100, Math.max(0, d.percent || 0))}%"></div></div>`
          }
        </div>
      `).join('');
    } else {
      dashboard.style.display = 'none';
      dlList.innerHTML = '';
    }
  } catch (e) {
    // Desktop app not reachable
  }
}

// Use event delegation for dynamic buttons
document.getElementById('dlList').addEventListener('click', async (e) => {
  const btnFolder = e.target.closest('.btn-folder');
  const btnCancel = e.target.closest('.btn-cancel');

  if (btnFolder) {
    const id = btnFolder.getAttribute('data-id');
    if (id) {
      try {
        await fetch(FOLDER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
      } catch (err) {}
    }
  } else if (btnCancel) {
    const id = btnCancel.getAttribute('data-id');
    if (id) {
      try {
        await fetch(CANCEL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
      } catch (err) {}
    }
  }
});

// Start polling every 500ms while popup is open
fetchProgress();
setInterval(fetchProgress, 500);
