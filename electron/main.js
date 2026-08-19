import electron from 'electron'
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Tray, Menu, session, protocol, net } = electron
import path from 'path'
import https from 'https'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import NetworkManager from './network.js'
import downloader from './downloader.js'
import slidemaker from './slidemaker.js'
import { startLocalServer, updateProgress, progressCache } from './server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (process.env.VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(app.getPath('appData'), 'office-share-dev'))
}

let mainWindow
let networkManager
let tray = null
let isQuitting = false

global.proxyHeadersCache = new Map();

// We no longer manually spoof the User-Agent, because spoofing it causes YouTube's WAF 
// to detect a TLS fingerprint mismatch. We let Electron use its authentic Chromium UA.

// ── Settings ──────────────────────────────────────────────

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  const defaults = {
    savePath: app.getPath('downloads'),
    displayName: os.hostname(),
    autoAccept: false,
    notifications: true,
    initializedStartup: false,
  }
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    return { ...defaults, ...data }
  } catch {
    return defaults
  }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  if (networkManager) networkManager.updateSettings(settings)
}

// ── History ───────────────────────────────────────────────

const historyPath = path.join(app.getPath('userData'), 'history.json')

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
  } catch {
    return []
  }
}

function addHistoryEntry(entry) {
  const history = loadHistory()
  history.unshift(entry)
  if (history.length > 100) history.length = 100
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history-updated', history)
  }
}

// ── Aliases ───────────────────────────────────────────────

const aliasesPath = path.join(app.getPath('userData'), 'aliases.json')

function loadAliases() {
  try {
    return JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'))
  } catch {
    return {}
  }
}

function saveAlias(peerId, name) {
  const aliases = loadAliases()
  if (name && name.trim().length > 0) {
    aliases[peerId] = name.trim()
  } else {
    delete aliases[peerId]
  }
  fs.writeFileSync(aliasesPath, JSON.stringify(aliases, null, 2))
  if (networkManager) {
    networkManager.updateAliases(aliases)
    networkManager.notifyFrontend() // force refresh
  }
}

// ── Hidden Peers ──────────────────────────────────────────

const hiddenPeersPath = path.join(app.getPath('userData'), 'hidden_peers.json')

function loadHiddenPeers() {
  try {
    return JSON.parse(fs.readFileSync(hiddenPeersPath, 'utf-8'))
  } catch {
    return []
  }
}

function hidePeer(peerId) {
  const hidden = new Set(loadHiddenPeers())
  hidden.add(peerId)
  const hiddenArray = Array.from(hidden)
  fs.writeFileSync(hiddenPeersPath, JSON.stringify(hiddenArray, null, 2))
  return hiddenArray
}

// ── Window ────────────────────────────────────────────────

function createWindow() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  const iconPath = path.join(__dirname, '../dist/icon.png')

  const windowOptions = {
    width: 950,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#f1f5f9',
      height: 35
    },
    backgroundColor: '#1c1c1c',
  }

  // In production on Windows, relying on the executable's baked-in .ico is the most reliable way 
  // to ensure the taskbar icon is rendered correctly.
  if (isDev || process.platform !== 'win32') {
    windowOptions.icon = iconPath
  }

  mainWindow = new BrowserWindow(windowOptions)

  // Video preview is handled entirely by the local proxy in server.js
  // because Chromium's <video> tag bypasses webRequest interceptors in this configuration.

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Handle close to hide in tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  // Create Tray
  tray = new Tray(nativeImage.createFromPath(iconPath))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Office AirDrop', click: () => mainWindow.show() },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true
        app.quit()
      } 
    }
  ])
  tray.setToolTip('Office AirDrop')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    mainWindow.show()
  })

  // Start hidden if started at login
  const isHidden = process.argv.includes('--hidden')
  if (!isHidden) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.show()
    })
  }

  // Initialize network
  const settings = loadSettings()
  const aliases = loadAliases()
  networkManager = new NetworkManager(mainWindow)
  networkManager.updateSettings(settings)
  networkManager.updateAliases(aliases)
  networkManager.onHistoryEntry = addHistoryEntry
  networkManager.start()
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
  
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('officeairdrop', process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient('officeairdrop')
  }

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.officeshare.app')
    }

    // Initialize start with Windows on very first launch
    const settings = loadSettings()
    if (!settings.initializedStartup) {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })
      settings.initializedStartup = true
      saveSettings(settings)
    }

    // Check for local version upgrade
    const currentVersion = app.getVersion()
    let wasUpdated = false
    let oldVersion = settings.lastVersion
    
    if (settings.lastVersion && settings.lastVersion !== currentVersion) {
      // App was just upgraded via a new .exe!
      wasUpdated = true
      // Forcefully clean zombies from the old installation
      downloader.resetEngine()
    }

    // Update the saved version
    if (settings.lastVersion !== currentVersion) {
      settings.lastVersion = currentVersion
      saveSettings(settings)
    }

    app.on('web-contents-created', (_, contents) => {
      if (contents.getType() === 'webview') {
        contents.session.setPermissionRequestHandler((_, permission, callback) => {
          const allowed = ['media', 'autoplay'];
          callback(allowed.includes(permission));
        });
        
        contents.session.webRequest.onBeforeSendHeaders(
          { urls: ['<all_urls>'] },
          (details, callback) => {
            // Spoof Origin and Referer for YouTube embeds if needed
            if (details.url.includes('youtube.com') || details.url.includes('googlevideo.com')) {
              details.requestHeaders['Origin'] = 'https://www.youtube.com';
              details.requestHeaders['Referer'] = 'https://www.youtube.com/';
            }
            
            // Inject yt-dlp specific bypass headers (Cookies, etc) for CDN streams
            if (global.proxyHeadersCache) {
              const urlNoQuery = details.url.split('?')[0];
              for (const [key, headers] of global.proxyHeadersCache.entries()) {
                if (key.includes(urlNoQuery) || details.url.includes(key.split('?')[0])) {
                  for (const [hKey, hVal] of Object.entries(headers)) {
                    const k = hKey.toLowerCase();
                    // Don't overwrite Chromium's native media player networking
                    if (!['host', 'range', 'accept', 'accept-encoding', 'connection', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-site', 'sec-fetch-user'].includes(k)) {
                      details.requestHeaders[hKey] = hVal;
                      console.log(`[Proxy] Injected ${hKey}: ${hVal} for ${urlNoQuery}`);
                    }
                  }
                  break;
                }
              }
            }
            callback({ requestHeaders: details.requestHeaders });
          }
        );
      }
    });

  createWindow()
  
  // Start Extension Server
  startLocalServer({
    onUrlReceived: (url, autoDownload, quality) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!autoDownload) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }
        mainWindow.webContents.send('external-url-received', { url, autoDownload, quality })
      }
    },
    onFetchInfo: async (url) => {
      return await downloader.fetchVideoInfo(url)
    },
    onOpenFolder: (id) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('navigate-to', 'downloader')
      }
    },
    onCancelDownload: (id) => {
      downloader.cancelDownload(id)
      updateProgress(id, null) // Completely remove it from the extension UI
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-error', { id, error: 'Cancelled' })
      }
    }
  })
  
  // Notify frontend if updated
  if (wasUpdated) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.webContents.send('app-updated', { oldVersion, newVersion: currentVersion })
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC Handlers ──────────────────────────────────────────

// File sending
ipcMain.on('send-files', (event, peerId, filePaths) => {
  console.log(`Sending files to ${peerId}:`, filePaths)
  networkManager.sendFiles(peerId, filePaths)
})

ipcMain.handle('stage-file-for-phone', (event, filePath) => {
  try {
    networkManager.stageFileForPhone(filePath)
    return { success: true }
  } catch (err) {
    console.error('Error staging file for phone:', err)
    return { success: false, error: err.message }
  }
})

// File picker
ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select files to send',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'txt'] },
    ]
  })
  if (result.canceled) return null
  return result.filePaths
})

// Folder picker (for settings)
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select save folder',
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Accept/Decline transfer
ipcMain.on('transfer-response', (event, requestId, accepted) => {
  networkManager.respondToRequest(requestId, accepted)
})

// Cancel transfer
ipcMain.on('cancel-transfer', () => {
  networkManager.cancelTransfer()
})

ipcMain.on('pause-transfer', () => {
  networkManager.pauseTransfer()
})

ipcMain.on('resume-transfer', () => {
  networkManager.resumeTransfer()
})

// Hostname
ipcMain.handle('get-hostname', () => os.hostname())

// Settings
ipcMain.handle('get-settings', () => loadSettings())
ipcMain.handle('save-settings', (event, settings) => {
  saveSettings(settings)
  return true
})

// Startup Settings
ipcMain.handle('get-startup', () => {
  const loginItemSettings = app.getLoginItemSettings()
  return loginItemSettings.openAtLogin
})
ipcMain.handle('set-startup', (event, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: enable, // macOS
    args: enable ? ['--hidden'] : [] // Windows/Linux
  })
  return true
})

// History
ipcMain.handle('get-history', () => loadHistory())
ipcMain.handle('delete-history', (event, id) => {
  const history = loadHistory().filter(entry => entry.id !== id)
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history-updated', history)
  }
  return true
})
ipcMain.handle('clear-history', () => {
  fs.writeFileSync(historyPath, JSON.stringify([], null, 2))
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history-updated', [])
  }
  return true
})

// Open file / folder
ipcMain.handle('open-file', (event, filePath) => shell.openPath(filePath))
ipcMain.handle('open-folder', (event, filePath) => shell.showItemInFolder(filePath))
ipcMain.handle('open-external', (event, url) => shell.openExternal(url))
ipcMain.handle('open-extension-folder', () => {
  let extensionPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'extension')
    : path.join(app.getAppPath(), 'extension')
  if (!fs.existsSync(extensionPath)) extensionPath = path.join(process.cwd(), 'extension')
  if (!fs.existsSync(extensionPath)) extensionPath = path.join(__dirname, '..', 'extension')
  
  if (fs.existsSync(extensionPath)) {
    shell.openPath(extensionPath)
  }
})

// Aliases
ipcMain.handle('get-aliases', () => loadAliases())
ipcMain.handle('save-alias', (event, peerId, name) => {
  saveAlias(peerId, name)
  return true
})

// Hidden Peers
ipcMain.handle('get-hidden-peers', () => loadHiddenPeers())
ipcMain.handle('hide-peer', (event, peerId) => hidePeer(peerId))

// Manual network rescan
ipcMain.handle('scan-peers', () => {
  if (networkManager) networkManager.start()
})

// Get current peers
ipcMain.handle('get-peers', () => {
  if (networkManager) return networkManager.getPeers()
  return []
})

// Get PC connection details for mobile
ipcMain.handle('get-local-ip', () => {
  if (networkManager) return networkManager.getLocalIp()
  return '127.0.0.1'
})
ipcMain.handle('get-port', () => {
  if (networkManager) return networkManager.port
  return 0
})

// Downloader
ipcMain.handle('download-video', (event, url, id, quality, startTime, endTime) => {
  const settings = loadSettings()
  downloader.downloadVideo(
    url, 
    id,
    quality,
    startTime,
    endTime,
    settings.savePath || app.getPath('downloads'),
    (progress) => {
      updateProgress(id, { ...progress, status: 'downloading' })
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-progress', progress)
      }
    },
    (result) => {
      updateProgress(id, { ...result, status: 'complete', percent: 100, speed: 'Done' })
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-complete', result)
      }
    },
    (error) => {
      updateProgress(id, { error: error.toString(), status: 'error' })
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-error', error)
      }
    }
  )
  return true
})

ipcMain.on('cancel-download', (event, id) => {
  updateProgress(id, null)
  downloader.cancelDownload(id)
})

// Download History (persisted)
const dlHistoryPath = path.join(app.getPath('userData'), 'download_history.json')

ipcMain.handle('get-download-history', () => {
  try {
    return JSON.parse(fs.readFileSync(dlHistoryPath, 'utf-8'))
  } catch {
    return []
  }
})

ipcMain.handle('reset-engine', () => {
  return downloader.resetEngine()
})

ipcMain.handle('fetch-video-info', async (event, url) => {
  const info = await downloader.fetchVideoInfo(url)
  return info
})

ipcMain.handle('save-download-history', (event, history) => {
  fs.writeFileSync(dlHistoryPath, JSON.stringify(history, null, 2))
  return true
})

// Slideshow
ipcMain.handle('create-slideshow', (event, images, duration) => {
  const settings = loadSettings()
  slidemaker.createSlideshow(
    images,
    duration,
    settings.savePath || app.getPath('downloads'),
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('slideshow-progress', progress)
      }
    },
    (result) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('slideshow-complete', result)
      }
    },
    (error) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('slideshow-error', error)
      }
    }
  )
  return true
})

}
