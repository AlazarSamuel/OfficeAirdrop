import React, { useState, useEffect } from 'react'
import { Folder, Trash2, Globe, ExternalLink, Check, Copy, FolderOpen, Sparkles } from 'lucide-react'

export default function SettingsView({ onSettingsChanged, triggerToast }) {
  const [displayName, setDisplayName] = useState('My PC')
  const [savePath, setSavePath] = useState('')
  const [autoAccept, setAutoAccept] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [startWithWindows, setStartWithWindows] = useState(false)
  const [enableGlobalHotkey, setEnableGlobalHotkey] = useState(true)
  
  const [originalSettings, setOriginalSettings] = useState(null)
  
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showExtensionGuide, setShowExtensionGuide] = useState(false)
  const [copyText, setCopyText] = useState('Copy')



  const loadSettings = () => {
    if (window.electronAPI) {
      Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getStartup ? window.electronAPI.getStartup() : Promise.resolve(false)
      ]).then(([settings, startup]) => {
        const loaded = {
          displayName: settings.displayName || 'My PC',
          savePath: settings.savePath || '',
          autoAccept: settings.autoAccept || false,
          notifications: settings.notifications !== false,
          startWithWindows: startup,
          enableGlobalHotkey: settings.enableGlobalHotkey !== false
        }
        setDisplayName(loaded.displayName)
        setSavePath(loaded.savePath)
        setAutoAccept(loaded.autoAccept)
        setNotifications(loaded.notifications)
        setStartWithWindows(loaded.startWithWindows)
        setEnableGlobalHotkey(loaded.enableGlobalHotkey)
        setOriginalSettings(loaded)
      })
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const handleSelectFolder = async () => {
    if (window.electronAPI && window.electronAPI.pickFolder) {
      const folder = await window.electronAPI.pickFolder()
      if (folder) {
        setSavePath(folder)
        updateSetting('savePath', folder)
      }
    } else {
      triggerToast('File picker opened… (Browser demo)')
    }
  }

  const handleClearHistory = () => {
    if (window.electronAPI && window.electronAPI.clearHistory) {
      window.electronAPI.clearHistory()
      setShowClearConfirm(false)
      triggerToast('Transfer history cleared.')
    }
  }



  const updateSetting = (key, value) => {
    const newSettings = {
      displayName,
      savePath,
      autoAccept,
      notifications,
      startWithWindows,
      enableGlobalHotkey,
      [key]: value
    }
    
    if (key === 'displayName') setDisplayName(value)
    if (key === 'savePath') setSavePath(value)
    if (key === 'autoAccept') setAutoAccept(value)
    if (key === 'notifications') setNotifications(value)
    if (key === 'startWithWindows') setStartWithWindows(value)
    if (key === 'enableGlobalHotkey') setEnableGlobalHotkey(value)

    if (window.electronAPI) {
      window.electronAPI.saveSettings(newSettings)
      if (key === 'startWithWindows' && window.electronAPI.setStartup) {
        window.electronAPI.setStartup(value)
      }
    }
    if (onSettingsChanged) {
      onSettingsChanged(newSettings)
    }
    setOriginalSettings(newSettings)
  }

  return (
    <section className="content-area" style={{ height: '100%', overflowY: 'auto', padding: '32px 48px' }}>
      <div className="page-header w-full mb-6" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
        <h1 className="page-title" style={{ justifyContent: 'flex-start' }}>Settings</h1>
        <p className="subtitle">Manage preferences, transfer destinations, integrations, and privacy</p>
      </div>

      <div className="settings-stack">
        {/* 1. Browser Extension */}
        <div className="settings-card">
          <div className="card-header-row">
            <span className="section-tag">
              <svg style={{ width: '13px', height: '13px', color: 'currentColor' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="4"></circle>
                <line x1="21.17" y1="8" x2="12" y2="8"></line>
                <line x1="3.95" y1="6.06" x2="8.54" y2="14"></line>
                <line x1="10.88" y1="21.94" x2="15.46" y2="14"></line>
              </svg>
              Chrome & Edge Extension
            </span>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <h4>Install Browser Extension</h4>
              <p>Send video and slide links directly to GrabCut with a single click</p>
            </div>
            <button className="btn btn-secondary" onClick={() => setShowExtensionGuide(true)}>
              <ExternalLink style={{ width: '14px', height: '14px' }} />
              How to Install
            </button>
          </div>
        </div>



        {/* 3. Network Identity */}
        <div className="settings-card">
          <div className="card-header-row">
            <span className="section-tag">
              <Globe style={{ width: '13px', height: '13px' }} />
              Network & Local Identity
            </span>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <h4>Display Name</h4>
              <p>How this device appears to others on the local network</p>
            </div>
            <div className="input-group">
              <input 
                type="text" 
                className="text-input" 
                value={displayName} 
                onChange={(e) => updateSetting('displayName', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 4. Incoming Files & Automation */}
        <div className="settings-card">
          <div className="card-header-row">
            <span className="section-tag">
              <Folder style={{ width: '13px', height: '13px' }} />
              Incoming Files & Transfers
            </span>
          </div>

          {/* Save Destination */}
          <div className="setting-row">
            <div className="setting-info">
              <h4>Save files to</h4>
              <p>Received transfers are automatically placed into this local folder</p>
            </div>
            <div className="input-group">
              <input type="text" className="text-input path-input" value={savePath} readOnly />
              <button className="btn btn-secondary" title="Browse Folder" onClick={handleSelectFolder}>
                <FolderOpen style={{ width: '14px', height: '14px' }} />
                Change
              </button>
            </div>
          </div>

          {/* Auto Accept Toggle */}
          <div className="setting-row divider">
            <div className="setting-info">
              <h4>Auto-accept all incoming files</h4>
              <p>Save incoming transfers automatically without showing a confirmation prompt</p>
            </div>
            <div className="switch-control">
              <span className={`switch-state-label ${autoAccept ? 'active' : ''}`}>{autoAccept ? 'On' : 'Off'}</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={autoAccept} 
                  onChange={(e) => updateSetting('autoAccept', e.target.checked)} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {/* Notifications Toggle */}
          <div className="setting-row divider">
            <div className="setting-info">
              <h4>Show transfer notifications</h4>
              <p>Get an alert when a file finishes transferring</p>
            </div>
            <div className="switch-control">
              <span className={`switch-state-label ${notifications ? 'active' : ''}`}>{notifications ? 'On' : 'Off'}</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={notifications} 
                  onChange={(e) => updateSetting('notifications', e.target.checked)} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {/* Start with OS Toggle */}
          <div className="setting-row divider">
            <div className="setting-info">
              <h4>Start with Windows</h4>
              <p>Run GrabCut silently in the background when your computer turns on</p>
            </div>
            <div className="switch-control">
              <span className={`switch-state-label ${startWithWindows ? 'active' : ''}`}>{startWithWindows ? 'On' : 'Off'}</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={startWithWindows} 
                  onChange={(e) => updateSetting('startWithWindows', e.target.checked)} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
          
          {/* Global Hotkey Toggle */}
          <div className="setting-row divider">
            <div className="setting-info">
              <h4>Enable Global Recording Hotkey</h4>
              <p>Use Alt+Shift+R to start/stop screen recordings from any app</p>
            </div>
            <div className="switch-control">
              <span className={`switch-state-label ${enableGlobalHotkey ? 'active' : ''}`}>{enableGlobalHotkey ? 'On' : 'Off'}</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={enableGlobalHotkey} 
                  onChange={(e) => updateSetting('enableGlobalHotkey', e.target.checked)} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        </div>

        {/* 5. Data & Privacy */}
        <div className="settings-card">
          <div className="card-header-row">
            <span className="section-tag" style={{ color: '#f87171' }}>
              <Trash2 style={{ width: '13px', height: '13px', color: '#f87171' }} />
              Data & Privacy
            </span>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <h4>Clear Transfer History</h4>
              <p>Permanently remove all local transfer logs and cache from this machine</p>
            </div>
            <div className="setting-control">
              {showClearConfirm ? (
                <div className="flex gap-2">
                  <button className="btn btn-secondary" onClick={() => setShowClearConfirm(false)}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleClearHistory}>Confirm Clear</button>
                </div>
              ) : (
                <button className="btn btn-danger" onClick={() => setShowClearConfirm(true)}>
                  <Trash2 style={{ width: '14px', height: '14px' }} />
                  Clear History
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showExtensionGuide && (
        <div className="modal-backdrop-fixed" onClick={() => setShowExtensionGuide(false)}>
          <div className="ext-ambient-glow"></div>
          
          <div className="ext-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ext-modal-accent-bar"></div>

            <div className="ext-modal-header">
              <div className="ext-icon-badge">
                <Globe size={22} />
              </div>
              <div className="ext-header-text">
                <h2>Manual Installation</h2>
                <p>To enable direct transfers, install the companion extension using Chrome's Developer Mode.</p>
              </div>
            </div>

            <div className="ext-steps-container">
              <div className="ext-step-row">
                <div className="ext-step-number">1</div>
                <div className="ext-step-content">
                  <span>Open your browser's extensions page:</span>
                  <div className="ext-url-copy-box">
                    <span className="ext-url-text">chrome://extensions</span>
                    <button className="ext-copy-btn" onClick={handleCopy}>
                      <Copy size={12} />
                      <span>{copyText}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="ext-step-row">
                <div className="ext-step-number">2</div>
                <div className="ext-step-content">
                  Toggle <strong>Developer mode</strong> ON in the top-right corner.
                </div>
              </div>

              <div className="ext-step-row">
                <div className="ext-step-number">3</div>
                <div className="ext-step-content">
                  Click <strong>Load unpacked</strong> and choose the extension folder below.
                </div>
              </div>
            </div>

            <div className="ext-modal-footer">
              <button className="ext-btn ext-btn-secondary" onClick={() => setShowExtensionGuide(false)}>Close</button>
              <button 
                className="ext-btn ext-btn-primary" 
                onClick={() => {
                  if (window.electronAPI && window.electronAPI.openExtensionFolder) {
                    window.electronAPI.openExtensionFolder()
                  }
                }}
              >
                <FolderOpen size={16} /> Open Extension Folder
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  )
}
