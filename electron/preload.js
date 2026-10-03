const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', Object.freeze({
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),

  // Peers
  onDiscoveredPeers: (callback) => {
    const handler = (e, peers) => callback(peers)
    ipcRenderer.on('discovered-peers', handler)
    return () => ipcRenderer.removeListener('discovered-peers', handler)
  },
  scanPeers: () => ipcRenderer.invoke('scan-peers'),
  getPeers: () => ipcRenderer.invoke('get-peers'),
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  getPort: () => ipcRenderer.invoke('get-port'),

  // Context Menu
  installContextMenu: () => ipcRenderer.invoke('install-context-menu'),
  removeContextMenu: () => ipcRenderer.invoke('remove-context-menu'),
  onContextMenuFile: (callback) => {
    const handler = (e, filePath) => callback(filePath)
    ipcRenderer.on('context-menu-file', handler)
    return () => ipcRenderer.removeListener('context-menu-file', handler)
  },

  // File operations
  sendFiles: (peerId, files) => ipcRenderer.send('send-files', peerId, files),
  stageFileForPhone: (filePath) => ipcRenderer.invoke('stage-file-for-phone', filePath),
  pickFiles: (options) => ipcRenderer.invoke('pick-files', options),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openExtensionFolder: () => ipcRenderer.invoke('open-extension-folder'),

  // Transfer events
  cancelTransfer: () => ipcRenderer.send('cancel-transfer'),
  pauseTransfer: () => ipcRenderer.send('pause-transfer'),
  resumeTransfer: () => ipcRenderer.send('resume-transfer'),
  onTransferWaiting: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-waiting', handler)
    return () => ipcRenderer.removeListener('transfer-waiting', handler)
  },
  onTransferRequest: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-request', handler)
    return () => ipcRenderer.removeListener('transfer-request', handler)
  },
  respondTransfer: (requestId, accepted) => ipcRenderer.send('transfer-response', requestId, accepted),
  onTransferProgress: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-progress', handler)
    return () => ipcRenderer.removeListener('transfer-progress', handler)
  },
  onTransferComplete: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-complete', handler)
    return () => ipcRenderer.removeListener('transfer-complete', handler)
  },
  onTransferAccepted: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-accepted', handler)
    return () => ipcRenderer.removeListener('transfer-accepted', handler)
  },
  onTransferDeclined: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-declined', handler)
    return () => ipcRenderer.removeListener('transfer-declined', handler)
  },
  onDownloadError: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('download-error', handler)
    return () => ipcRenderer.removeListener('download-error', handler)
  },
  onNavigateTo: (callback) => {
    const handler = (event, tab) => callback(tab)
    ipcRenderer.on('navigate-to', handler)
    return () => ipcRenderer.removeListener('navigate-to', handler)
  },
  
  onExternalUrl: (callback) => {
    const handler = (event, url) => callback(url)
    ipcRenderer.on('external-url-received', handler)
    return () => ipcRenderer.removeListener('external-url-received', handler)
  },

  onTransferError: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-error', handler)
    return () => ipcRenderer.removeListener('transfer-error', handler)
  },

  // Downloader
  downloadVideo: (url, id, quality, startTime, endTime) => ipcRenderer.invoke('download-video', url, id, quality, startTime, endTime),
  cancelDownload: (id) => ipcRenderer.send('cancel-download', id),
  resetEngine: () => ipcRenderer.invoke('reset-engine'),
  getDownloadHistory: () => ipcRenderer.invoke('get-download-history'),
  saveDownloadHistory: (history) => ipcRenderer.invoke('save-download-history', history),
  fetchVideoInfo: (url) => ipcRenderer.invoke('fetch-video-info', url),
  startLiveClip: (url, durationSec, totalDurationSec, title, id) => ipcRenderer.invoke('start-live-clip', { url, durationSec, totalDurationSec, title, id }),
  onDownloadProgress: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },
  onDownloadComplete: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('download-complete', handler)
    return () => ipcRenderer.removeListener('download-complete', handler)
  },

  onAppUpdated: (callback) => {
    ipcRenderer.on('app-updated', (event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('app-updated')
  },

  // Slideshow
  createSlideshow: (images, duration, transition) => ipcRenderer.invoke('create-slideshow', images, duration, transition),
  onSlideshowProgress: (callback) => {
    ipcRenderer.on('slideshow-progress', (event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('slideshow-progress')
  },
  onSlideshowComplete: (callback) => {
    ipcRenderer.on('slideshow-complete', (event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('slideshow-complete')
  },
  onSlideshowError: (callback) => {
    ipcRenderer.on('slideshow-error', (event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('slideshow-error')
  },

  // Screen Recorder
  getCaptureSources: () => ipcRenderer.invoke('get-capture-sources'),
  checkDiskSpace: () => ipcRenderer.invoke('check-disk-space'),
  startRecordingStream: (uuid) => ipcRenderer.invoke('start-recording-stream', uuid),
  saveRecordingChunk: (uuid, buffer) => ipcRenderer.invoke('save-recording-chunk', uuid, buffer),
  finishRecordingStream: (uuid) => ipcRenderer.invoke('finish-recording-stream', uuid),
  cancelRecordingStream: (uuid) => ipcRenderer.invoke('cancel-recording-stream', uuid),
  encodeRecording: (opts) => ipcRenderer.invoke('encode-recording', opts),
  cancelEncode: () => ipcRenderer.invoke('cancel-encode'),
  deleteOrphanedRecording: (path) => ipcRenderer.invoke('delete-orphaned-recording', path),
  startRegionSelection: () => ipcRenderer.invoke('start-region-selection'),
  showRecordingBorder: (bounds) => ipcRenderer.send('show-recording-border', bounds),
  hideRecordingBorder: () => ipcRenderer.send('hide-recording-border'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  getRecordingHistory: () => ipcRenderer.invoke('get-recording-history'),
  openPath: (p) => ipcRenderer.send('open-path', p),
  updateRecordingTimer: (timeStr) => ipcRenderer.send('update-recording-timer', timeStr),
  sendCountdownTick: (tick) => ipcRenderer.send('update-overlay-countdown', tick),
  onEncodeProgress: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('encode-progress', handler)
    return () => ipcRenderer.removeListener('encode-progress', handler)
  },
  onFloatingPause: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('floating-pause', handler)
    return () => ipcRenderer.removeListener('floating-pause', handler)
  },
  onFloatingStop: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('floating-stop', handler)
    return () => ipcRenderer.removeListener('floating-stop', handler)
  },
  onToggleRecording: (callback) => {
    const handler = (e) => callback()
    ipcRenderer.on('toggle-recording', handler)
    return () => ipcRenderer.removeListener('toggle-recording', handler)
  },
  onOrphanedRecordingsFound: (callback) => {
    const handler = (e, files) => callback(files)
    ipcRenderer.on('orphaned-recordings-found', handler)
    return () => ipcRenderer.removeListener('orphaned-recordings-found', handler)
  },
  notifyRecordingStarted: () => ipcRenderer.send('recording-started'),
  notifyRecordingStopped: () => ipcRenderer.send('recording-stopped'),

  onTransferAutoDeclined: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-auto-declined', handler)
    return () => ipcRenderer.removeListener('transfer-auto-declined', handler)
  },
  onTransferPaused: (callback) => {
    const handler = (e, data) => callback(data)
    ipcRenderer.on('transfer-paused', handler)
    return () => ipcRenderer.removeListener('transfer-paused', handler)
  },

  // Settings & Aliases
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getStartup: () => ipcRenderer.invoke('get-startup'),
  setStartup: (enable) => ipcRenderer.invoke('set-startup', enable),
  getAliases: () => ipcRenderer.invoke('get-aliases'),
  saveAlias: (peerId, name) => ipcRenderer.invoke('save-alias', peerId, name),
  getHiddenPeers: () => ipcRenderer.invoke('get-hidden-peers'),
  hidePeer: (peerId) => ipcRenderer.invoke('hide-peer', peerId),
  getHostname: () => ipcRenderer.invoke('get-hostname'),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  onHistoryUpdated: (callback) => {
    const handler = (e, history) => callback(history)
    ipcRenderer.on('history-updated', handler)
    return () => ipcRenderer.removeListener('history-updated', handler)
  },
  deleteHistory: (id) => ipcRenderer.invoke('delete-history', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // File system
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  openFolder: (filePath) => ipcRenderer.invoke('open-folder', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  showConfirmDialog: (message, detail) => ipcRenderer.invoke('show-confirm-dialog', message, detail),
}))
