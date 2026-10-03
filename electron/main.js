import electron from 'electron'
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Tray, Menu, session, protocol, net, clipboard, globalShortcut, screen } = electron
import path from 'path'
import https from 'https'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import NetworkManager from './network.js'
import downloader from './downloader.js'
import slidemaker from './slidemaker.js'
import { startLocalServer, updateProgress, progressCache } from './server.js'
import { initRecorder, checkOrphanedRecordings } from './recorder.js'
import { startRegionSelection } from './regionSelector.js'
import { startYtDlpAutoUpdate, stopYtDlpAutoUpdate } from './ytdlp.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (process.env.VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(app.getPath('appData'), 'grabcut-dev'))
}

let mainWindow
let networkManager
let tray = null
let isQuitting = false
let borderWindow = null
let controlWindow = null

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
  let iconFile = path.join(__dirname, '../public/icon.ico')
  if (!fs.existsSync(iconFile)) {
    iconFile = path.join(__dirname, '../dist/icon.ico')
  }
  if (!fs.existsSync(iconFile)) {
    iconFile = path.join(__dirname, '../public/icon.png')
  }
  const appIcon = nativeImage.createFromPath(iconFile)

  const windowOptions = {
    width: 950,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: appIcon,
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

  mainWindow = new BrowserWindow(windowOptions)

  let splashWindow = null
  const isHidden = process.argv.includes('--hidden')

  if (!isHidden) {
    splashWindow = new BrowserWindow({
      width: 560,
      height: 315,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      icon: appIcon,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    if (process.env.VITE_DEV_SERVER_URL) {
      splashWindow.loadURL(process.env.VITE_DEV_SERVER_URL + 'splash.html')
    } else {
      splashWindow.loadFile(path.join(__dirname, '../dist/splash.html'))
    }
  }
  // Spoof Origin/Referer for YouTube embed requests to bypass "playback on other websites disabled" (Error 152-4)
  // This makes YouTube's server think the embed is loaded from youtube.com itself.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.googlevideo.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      // Only modify headers for webview requests (not our main app)
      if (details.resourceType === 'subFrame' || details.webContentsId !== mainWindow?.webContents?.id) {
        details.requestHeaders['Origin'] = 'https://www.youtube.com'
        details.requestHeaders['Referer'] = 'https://www.youtube.com/'
      }
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  // Also handle response headers to allow embedding
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://*.youtube.com/*'] },
    (details, callback) => {
      const headers = details.responseHeaders
      // Remove X-Frame-Options to allow embedding
      delete headers['X-Frame-Options']
      delete headers['x-frame-options']
      // Relax Content-Security-Policy frame-ancestors
      if (headers['Content-Security-Policy']) {
        headers['Content-Security-Policy'] = headers['Content-Security-Policy'].map(
          v => v.replace(/frame-ancestors[^;]*/gi, 'frame-ancestors *')
        )
      }
      if (headers['content-security-policy']) {
        headers['content-security-policy'] = headers['content-security-policy'].map(
          v => v.replace(/frame-ancestors[^;]*/gi, 'frame-ancestors *')
        )
      }
      callback({ responseHeaders: headers })
    }
  )

  // Video preview is handled entirely by the local proxy in server.js
  // because Chromium's <video> tag bypasses webRequest interceptors in this configuration.

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Register standard Edit shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A) globally
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ])
  Menu.setApplicationMenu(appMenu)

  // Show native context menu on right-click for any text input
  mainWindow.webContents.on('context-menu', (e, params) => {
    if (params.isEditable) {
      const editContextMenu = Menu.buildFromTemplate([
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' }
      ])
      editContextMenu.popup({ window: mainWindow })
    }
  })

  // Handle close to hide in tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  // Create Tray
  tray = new Tray(appIcon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show GrabCut', click: () => mainWindow.show() },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true
        app.quit()
      } 
    }
  ])
  tray.setToolTip('GrabCut')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    mainWindow.show()
  })

  // Tray recording listeners
  ipcMain.on('recording-started', () => {
    tray.setToolTip('GrabCut - RECORDING')
    // We could change tray.setImage here if we had a rec icon
    const recMenu = Menu.buildFromTemplate([
      { label: 'Show GrabCut', click: () => mainWindow.show() },
      { label: 'Stop Recording', click: () => mainWindow.webContents.send('toggle-recording') },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
    ])
    tray.setContextMenu(recMenu)
  })

  ipcMain.on('recording-stopped', () => {
    tray.setToolTip('GrabCut')
    tray.setContextMenu(contextMenu)
  })

  // Start hidden if started at login
  if (!isHidden) {
    let mainReady = false
    let splashClosed = false

    const tryShowMain = () => {
      if (mainReady && splashClosed) {
        mainWindow.show()
      }
    }

    if (splashWindow) {
      splashWindow.on('closed', () => {
        splashClosed = true
        tryShowMain()
      })
    } else {
      splashClosed = true
    }

    mainWindow.once('ready-to-show', () => {
      mainReady = true
      tryShowMain()
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
  const handleDeepLink = (urlStr) => {
    // deep links not used
  }

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    const url = commandLine.find(arg => arg.startsWith('grabcut://'))
    if (url) handleDeepLink(url)
    
    // Check if a file was passed (context menu)
    const possibleFile = commandLine.find(arg => fs.existsSync(arg) && fs.statSync(arg).isFile() && !arg.includes('electron.exe') && !arg.includes('GrabCut.exe'))
    if (possibleFile && mainWindow) {
      mainWindow.webContents.send('context-menu-file', possibleFile)
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    handleDeepLink(url)
  })
  
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('grabcut', process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient('grabcut')
  }

  app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.grabcut.app')
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

    // Process argv if started with a file
    setTimeout(() => {
      if (mainWindow && process.argv.length >= 2) {
        const possibleFile = process.argv.find((arg, index) => index > 0 && fs.existsSync(arg) && fs.statSync(arg).isFile() && !arg.includes('electron.exe') && !arg.includes('GrabCut.exe'))
        if (possibleFile) {
          mainWindow.webContents.send('context-menu-file', possibleFile)
        }
      }
    }, 1500) // Wait for React to load

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
  
  // Keep yt-dlp current: writable userData copy, verified staged updates,
  // re-checked periodically while the app lives in the tray. See ytdlp.js.
  startYtDlpAutoUpdate();
  app.on('will-quit', stopYtDlpAutoUpdate);
  
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize()
  })
  
  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  })
  
  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close()
  })

  ipcMain.handle('get-recording-history', async () => {
    try {
      const settings = loadSettings()
      const dir = settings.savePath || app.getPath('downloads')
      
      if (!fs.existsSync(dir)) return []
      
      const files = fs.readdirSync(dir)
      const mp4s = files.filter(f => f.startsWith('GrabCut_') && f.endsWith('.mp4'))
      
      return mp4s.map(f => {
        const fullPath = path.join(dir, f)
        const stats = fs.statSync(fullPath)
        return {
          id: f,
          fileName: f,
          filePath: fullPath,
          fileSize: stats.size,
          timestamp: stats.mtimeMs
        }
      }).sort((a, b) => b.timestamp - a.timestamp)
    } catch (e) {
      console.error(e)
      return []
    }
  })
  
  ipcMain.on('open-path', (event, filePath) => {
    const { shell } = require('electron')
    shell.showItemInFolder(filePath)
  })

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
  
  // Register Region Capture handler
  ipcMain.handle('start-region-selection', async () => {
    return await startRegionSelection()
  })

  ipcMain.on('show-recording-border', (event, bounds) => {
    if (borderWindow) {
      borderWindow.close()
      borderWindow = null
    }
    if (!bounds) return;
    
    borderWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    borderWindow.setIgnoreMouseEvents(true, { forward: true });
    borderWindow.setAlwaysOnTop(true, 'screen-saver');
    borderWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    borderWindow.setContentProtection(true);
    borderWindow.loadFile(path.join(__dirname, 'border.html'));

    // Create the floating control window below the region
    if (controlWindow) {
      controlWindow.close();
      controlWindow = null;
    }

    const activeDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    
    // Default position: 10px below the region
    let controlY = bounds.y + bounds.height + 10;
    
    // If placing it below pushes it off the bottom of the screen, place it 70px ABOVE the bottom edge (inside the region)
    if (controlY + 60 > activeDisplay.bounds.y + activeDisplay.bounds.height) {
      controlY = bounds.y + bounds.height - 70;
    }

    controlWindow = new BrowserWindow({
      x: bounds.x + bounds.width - 240, // bottom right alignment (width 220px + 20px padding)
      y: controlY,
      width: 240,
      height: 60,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    controlWindow.setAlwaysOnTop(true, 'screen-saver');
    controlWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    controlWindow.setContentProtection(true);
    controlWindow.loadFile(path.join(__dirname, 'controls.html'));
  });

  ipcMain.on('hide-recording-border', () => {
    if (borderWindow && !borderWindow.isDestroyed()) {
      borderWindow.close();
    }
    borderWindow = null;
    
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.close();
    }
    controlWindow = null;
  });

  ipcMain.on('floating-pause', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('floating-pause');
    }
  });

  ipcMain.on('floating-stop', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('floating-stop');
    }
  });

  ipcMain.on('update-recording-timer', (event, timeStr) => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('recording-timer-update', timeStr);
    }
  });

  ipcMain.on('update-overlay-countdown', (event, tick) => {
    if (borderWindow && !borderWindow.isDestroyed()) {
      borderWindow.webContents.send('update-overlay-countdown', tick);
    }
  });
  
  // Initialize Screen Recorder
  initRecorder(mainWindow)
  checkOrphanedRecordings(mainWindow)

  // Setup Global Hotkey
  const setupHotkey = () => {
    const currentSettings = loadSettings()
    globalShortcut.unregister('Alt+Shift+R')
    if (currentSettings.enableGlobalHotkey !== false) { // Default true
      globalShortcut.register('Alt+Shift+R', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('toggle-recording')
        }
      })
    }
  }
  setupHotkey()

  // Re-setup hotkey if settings change
  ipcMain.handle('save-settings', (event, settings) => {
    saveSettings(settings)
    setupHotkey()
    return true
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

ipcMain.handle('read-clipboard', () => clipboard.readText())


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
ipcMain.handle('pick-files', async (event, options) => {
  const isImagesDefault = options && options.type === 'images';
  const filters = isImagesDefault
    ? [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'All Files', extensions: ['*'] },
        { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv'] },
        { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'txt'] },
      ]
    : [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'txt'] },
      ];

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select files to send',
    properties: ['openFile', 'multiSelections'],
    filters: filters
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
// save-settings handler was moved to app.whenReady to access setupHotkey

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
ipcMain.handle('install-context-menu', () => {
  if (process.platform === 'win32') {
    const exePath = process.execPath
    let iconPath = exePath
    let commandStr = `"${exePath}" "%1"`
    
    if (!app.isPackaged) {
      iconPath = path.join(app.getAppPath(), 'public', 'icon.ico')
      commandStr = `"${exePath}" "${app.getAppPath()}" "%1"`
    }

    execFile('reg.exe', ['add', 'HKCU\\Software\\Classes\\*\\shell\\GrabCut', '/ve', '/t', 'REG_SZ', '/d', 'Share via GrabCut', '/f'], (err) => {
      if (err) console.error('Failed to add context menu key:', err)
      execFile('reg.exe', ['add', 'HKCU\\Software\\Classes\\*\\shell\\GrabCut', '/v', 'Icon', '/t', 'REG_SZ', '/d', `"${iconPath}"`, '/f'], (err2) => {
        if (err2) console.error('Failed to add context menu icon:', err2)
        execFile('reg.exe', ['add', 'HKCU\\Software\\Classes\\*\\shell\\GrabCut\\command', '/ve', '/t', 'REG_SZ', '/d', commandStr, '/f'], (err3) => {
          if (err3) console.error('Failed to add context menu command:', err3)
        })
      })
    })
  }
  return true
})

ipcMain.handle('remove-context-menu', () => {
  if (process.platform === 'win32') {
    execFile('reg.exe', ['delete', 'HKCU\\Software\\Classes\\*\\shell\\GrabCut', '/f'], (err) => {
      if (err) console.error('Failed to remove context menu key:', err)
    })
  }
  return true
})

// Open file / folder
ipcMain.handle('open-file', (event, filePath) => shell.openPath(filePath))
ipcMain.handle('open-folder', (event, filePath) => shell.showItemInFolder(filePath))
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return { success: true }
    }
  } catch (err) {
    console.error('Failed to delete file:', err)
    return { success: false, error: err.message }
  }
  return { success: false, error: 'File not found' }
})
ipcMain.handle('show-confirm-dialog', async (event, message, detail) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Cancel', 'Yes, Delete'],
    defaultId: 0,
    title: 'Confirm Delete',
    message: message,
    detail: detail
  })
  return result.response === 1
})
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

ipcMain.handle('start-live-clip', async (event, { url, durationSec, totalDurationSec, title, id }) => {
  const settings = loadSettings()
  downloader.startLiveClip(url, durationSec, totalDurationSec, title, id, settings.savePath || app.getPath('downloads'),
    (progress) => {
      updateProgress(id, { ...progress, status: 'downloading' })
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-progress', progress)
    },
    (result) => {
      updateProgress(id, { ...result, status: 'complete', percent: 100, speed: 'Done' })
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-complete', result)
    },
    (error) => {
      updateProgress(id, { error: error.toString(), status: 'error' })
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-error', error)
    }
  )
  return true
})


ipcMain.handle('save-download-history', (event, history) => {
  fs.writeFileSync(dlHistoryPath, JSON.stringify(history, null, 2))
  return true
})

// Slideshow
ipcMain.handle('create-slideshow', async (event, images, duration, transition) => {
  const settings = loadSettings()
  const outputDir = settings.savePath || app.getPath('downloads')
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  slidemaker.createSlideshow(
    images,
    duration,
    outputDir,
    transition,
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
