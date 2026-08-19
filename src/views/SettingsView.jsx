import React, { useState, useEffect } from 'react'
import { Folder, Trash2, Globe, ExternalLink, Check, Copy, FolderOpen } from 'lucide-react'

export default function SettingsView({ onSettingsChanged, triggerToast }) {
  const [displayName, setDisplayName] = useState('My PC')
  const [savePath, setSavePath] = useState('')
  const [autoAccept, setAutoAccept] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [startWithWindows, setStartWithWindows] = useState(false)
  
  const [originalSettings, setOriginalSettings] = useState(null)
  
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showExtensionGuide, setShowExtensionGuide] = useState(false)
  const [copyText, setCopyText] = useState('Copy')

  const handleCopy = () => {
    navigator.clipboard.writeText('chrome://extensions')
    setCopyText('Copied!')
    setTimeout(() => setCopyText('Copy'), 2000)
  }

  const hasChanges = originalSettings !== null && JSON.stringify({ displayName, savePath, autoAccept, notifications, startWithWindows }) !== JSON.stringify(originalSettings)

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
          startWithWindows: startup
        }
        setDisplayName(loaded.displayName)
        setSavePath(loaded.savePath)
        setAutoAccept(loaded.autoAccept)
        setNotifications(loaded.notifications)
        setStartWithWindows(loaded.startWithWindows)
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
      if (folder) setSavePath(folder)
    } else {
      triggerToast('File picker opened… (Browser demo)')
    }
  }

  const handleSave = () => {
    const newSettings = { displayName, savePath, autoAccept, notifications, startWithWindows }
    if (window.electronAPI) {
      window.electronAPI.saveSettings(newSettings)
      if (window.electronAPI.setStartup) {
        window.electronAPI.setStartup(startWithWindows)
      }
    }
    if (onSettingsChanged) {
      onSettingsChanged(newSettings)
    }
    setOriginalSettings(newSettings)
    triggerToast('Settings saved.')
  }

  const handleDiscard = () => {
    loadSettings()
    triggerToast('Changes discarded.')
  }

  const handleClearHistory = () => {
    if (window.electronAPI && window.electronAPI.clearHistory) {
      window.electronAPI.clearHistory()
      setShowClearConfirm(false)
      triggerToast('Transfer history cleared.')
    }
  }

  // Toggle helper for accessibility
  const handleToggle = (e, setter, value) => {
    if (e.type === 'click' || (e.type === 'keydown' && (e.key === ' ' || e.key === 'Enter'))) {
      e.preventDefault()
      setter(!value)
    }
  }

  return (
    <section id="screen-settings" aria-labelledby="settings-title" className="pb-10 pt-4">
      
      <div 
        className="unsaved-bar-container"
        style={{
          height: hasChanges ? '60px' : '0px',
          opacity: hasChanges ? 1 : 0,
          marginBottom: hasChanges ? '24px' : '0px',
          borderWidth: hasChanges ? '1px' : '0px'
        }}
      >
        <div className="unsaved-bar-inner">
          <div className="unsaved-text">Careful — you have unsaved changes!</div>
          <div className="unsaved-actions">
            <button className="btn-cancel" onClick={handleDiscard}>Discard</button>
            <button className="btn-save" onClick={handleSave}>
              <Check size={14} /> Save changes
            </button>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Manage your Office AirDrop preferences.</p>
      </div>

      <div className="settings-group mb-6 border-indigo-500/20 bg-indigo-500/5">
        <div className="settings-group-header text-indigo-400 border-indigo-500/20 flex items-center gap-2">
          <Globe size={16} /> Chrome Extension
        </div>
        <div className="setting-row" style={{ borderBottom: 'none' }}>
          <div className="setting-text">
            <div className="setting-label text-indigo-100">Install Browser Extension</div>
            <div className="setting-desc text-indigo-200/70">Send video links instantly to Office AirDrop with a single click.</div>
          </div>
          <div className="setting-control">
            <button 
              className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/20"
              onClick={() => setShowExtensionGuide(true)}
            >
              How to Install <ExternalLink size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">Identity</div>
        <div className="setting-row">
          <div className="setting-text">
            <div className="setting-label">Display name</div>
            <div className="setting-desc">How you appear to others on the network. Use something your colleagues will recognize.</div>
          </div>
          <div className="setting-control">
            <input 
              className="text-input" 
              type="text" 
              value={displayName} 
              onChange={e => setDisplayName(e.target.value)}
              aria-label="Display name" 
            />
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">Incoming files</div>
        <div className="setting-row">
          <div className="setting-text">
            <div className="setting-label">Save files to</div>
            <div className="setting-desc">Incoming files are saved here automatically. You can open them from the History tab.</div>
          </div>
          <div className="setting-control">
            <input 
              className="path-input" 
              type="text" 
              value={savePath} 
              readOnly 
              aria-label="Save path" 
            />
            <button 
              className="btn-ghost" 
              style={{ padding: '8px 10px' }} 
              onClick={handleSelectFolder}
            >
              <Folder size={14} />
            </button>
          </div>
        </div>
        
        <div className="setting-row">
          <div className="setting-text">
            <div className="setting-label">Auto-accept all incoming files</div>
            <div className="setting-desc">Incoming files are saved automatically without a confirmation prompt.</div>
          </div>
          <div className="setting-control">
            <label className="toggle-wrap" aria-label="Toggle auto-accept">
              <div 
                className={`toggle ${autoAccept ? 'on' : ''}`} 
                role="switch" 
                aria-checked={autoAccept}
                tabIndex="0"
                onClick={(e) => handleToggle(e, setAutoAccept, autoAccept)}
                onKeyDown={(e) => handleToggle(e, setAutoAccept, autoAccept)}
              ></div>
              <span className="toggle-label">{autoAccept ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-text">
            <div className="setting-label">Show transfer notification</div>
            <div className="setting-desc">Get a Windows notification when a file finishes transferring.</div>
          </div>
          <div className="setting-control">
            <label className="toggle-wrap" aria-label="Toggle notifications">
              <div 
                className={`toggle ${notifications ? 'on' : ''}`} 
                role="switch" 
                aria-checked={notifications}
                tabIndex="0"
                onClick={(e) => handleToggle(e, setNotifications, notifications)}
                onKeyDown={(e) => handleToggle(e, setNotifications, notifications)}
              ></div>
              <span className="toggle-label">{notifications ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-text">
            <div className="setting-label">Start with Windows</div>
            <div className="setting-desc">Run Office AirDrop silently in the background when you turn on your PC.</div>
          </div>
          <div className="setting-control">
            <label className="toggle-wrap" aria-label="Toggle startup">
              <div 
                className={`toggle ${startWithWindows ? 'on' : ''}`} 
                role="switch" 
                aria-checked={startWithWindows}
                tabIndex="0"
                onClick={(e) => handleToggle(e, setStartWithWindows, startWithWindows)}
                onKeyDown={(e) => handleToggle(e, setStartWithWindows, startWithWindows)}
              ></div>
              <span className="toggle-label">{startWithWindows ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="settings-group mt-6">
        <div className="settings-group-header text-red-400 border-red-500/20">Data & Privacy</div>
        <div className="setting-row">
          <div className="setting-text">
            <div className="setting-label text-red-300">Clear transfer history</div>
            <div className="setting-desc">Permanently remove all records of sent and received files from this machine.</div>
          </div>
          <div className="setting-control">
            {showClearConfirm ? (
              <div className="flex gap-2">
                <button 
                  className="px-3 py-1.5 rounded-md text-[12px] bg-white/5 hover:bg-white/10 text-white/70 transition-colors"
                  onClick={() => setShowClearConfirm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="px-3 py-1.5 rounded-md text-[12px] bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                  onClick={handleClearHistory}
                >
                  Confirm Clear
                </button>
              </div>
            ) : (
              <button 
                className="px-3 py-1.5 rounded-md text-[12px] border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash2 size={14} /> Clear History
              </button>
            )}
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
