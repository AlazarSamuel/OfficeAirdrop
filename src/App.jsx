import React, { useState, useEffect, useRef } from 'react'
import { Share, Settings, Minus, Square, X, CheckCircle2, Download, ArrowUp, Pause, Play, Video, FileText, Clock, Film, FileArchive, Music, Image as ImageIcon } from 'lucide-react'
import ShareView from './views/ShareView'
import SettingsView from './views/SettingsView'
import DownloaderView from './views/DownloaderView'
import SlideMakerView from './views/SlideMakerView'
import RecorderView from './views/RecorderView'

function App() {
  const [activeTab, setActiveTab] = useState('share')
  const [contextMenuFile, setContextMenuFile] = useState(null)
  const [myHostname, setMyHostname] = useState('My PC')
  const [queue, setQueue] = useState([])
  const [incomingTransfer, setIncomingTransfer] = useState(null)
  const [activeTransfer, setActiveTransfer] = useState(null)
  const [countdown, setCountdown] = useState(30)

  const [unreadCount, setUnreadCount] = useState(0)
  const isPro = true;

  const indicatorRef = useRef(null)

  useEffect(() => {
    // Re-position the gliding nav indicator
    const activeItem = document.querySelector('.nav-item.active')
    if (activeItem && indicatorRef.current) {
      indicatorRef.current.style.transform = `translateY(${activeItem.offsetTop - 20}px)`
    }
  }, [activeTab])

  const formatBytes = (bytes) => {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
    if (i < 0) return '0 B'
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatETA = (seconds, isPaused) => {
    if (isPaused) return 'Paused'
    if (!seconds || isNaN(seconds) || seconds === Infinity || seconds <= 0) return '...'
    if (seconds < 60) return `${Math.floor(seconds)}s`
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      return `${h}h ${m}m`
    }
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}m ${s}s`
  }

  const renderFileIcon = (fileName, size = 20) => {
    if (!fileName) return <FileText size={size} />
    const ext = fileName.split('.').pop().toLowerCase()
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'].includes(ext)) return <Video size={size} />
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return <ImageIcon size={size} />
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso'].includes(ext)) return <FileArchive size={size} />
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return <Music size={size} />
    return <FileText size={size} />
  }

  useEffect(() => {
    let unsubs = []
    if (window.electronAPI) {
      if (window.electronAPI.installContextMenu) {
        window.electronAPI.installContextMenu()
      }
      
      if (window.electronAPI.getSettings) {
        window.electronAPI.getSettings().then(settings => {
          setMyHostname(settings.displayName)
        })
      }
      if (window.electronAPI.onTransferRequest) {
        unsubs.push(window.electronAPI.onTransferRequest((request) => {
          setIncomingTransfer(request)
        }))
      }
      if (window.electronAPI.onTransferComplete) {
        unsubs.push(window.electronAPI.onTransferComplete((entry) => {
          setIncomingTransfer(null)
          setActiveTransfer(null)
          triggerToast('Transfer complete!')
          
          if (entry && entry.direction === 'received') {
            setUnreadCount(c => c + 1)
          }
        }))
      }
      
      if (window.electronAPI.onTransferWaiting) {
        unsubs.push(window.electronAPI.onTransferWaiting((data) => {
          setActiveTransfer({
            status: 'waiting',
            fileName: data.fileName || 'file',
            to: data.peerName || 'Peer',
            fileCount: data.fileCount || 1,
            bytesTotal: data.bytesTotal || 0,
            progress: 0
          })
        }))
      }

      if (window.electronAPI.onTransferProgress) {
        unsubs.push(window.electronAPI.onTransferProgress((data) => {
          setActiveTransfer(prev => ({
            ...(prev || {}),
            status: 'uploading',
            fileName: data.fileName || prev?.fileName || 'file',
            to: data.peerName || prev?.to || 'Peer',
            speed: data.speed !== undefined ? data.speed : (prev?.speed || 0),
            eta: data.eta !== undefined ? data.eta : (prev?.eta || 0),
            bytesTransferred: data.bytesTransferred !== undefined ? data.bytesTransferred : (prev?.bytesTransferred || 0),
            bytesTotal: data.bytesTotal !== undefined ? data.bytesTotal : (prev?.bytesTotal || 0),
            progress: data.progress !== undefined ? data.progress : (prev?.progress || 0),
            direction: data.direction || prev?.direction || 'sending',
            fileIndex: data.fileIndex || prev?.fileIndex || 1,
            fileCount: data.fileCount || prev?.fileCount || 1,
            isPaused: data.isPaused !== undefined ? data.isPaused : (prev?.isPaused || false)
          }))
        }))
      }

      if (window.electronAPI.onTransferError) {
        unsubs.push(window.electronAPI.onTransferError((err) => {
          if (err && err.message && err.message.toLowerCase().includes('cancel')) {
            setActiveTransfer(prev => prev ? { ...prev, status: 'cancelled' } : null)
            setTimeout(() => setActiveTransfer(null), 3000)
          } else {
            setActiveTransfer(null)
            triggerToast(`Transfer failed: ${err?.message || 'Unknown error'}`)
          }
        }))
      }

      if (window.electronAPI.onTransferPaused) {
        unsubs.push(window.electronAPI.onTransferPaused((data) => {
          setActiveTransfer(prev => prev ? { ...prev, isPaused: data.isPaused } : null)
        }))
      }

      if (window.electronAPI.onTransferDeclined) {
        unsubs.push(window.electronAPI.onTransferDeclined(() => {
          setActiveTransfer(prev => prev ? { ...prev, status: 'cancelled' } : null)
          setTimeout(() => setActiveTransfer(null), 3000)
          triggerToast('Transfer declined by recipient')
        }))
      }

      if (window.electronAPI.onAppUpdated) {
        unsubs.push(window.electronAPI.onAppUpdated((data) => {
          setTimeout(() => {
            triggerToast(`Successfully updated to v${data.newVersion}!`)
          }, 1500)
        }))
      }
      if (window.electronAPI.onNavigateTo) {
        unsubs.push(window.electronAPI.onNavigateTo((tab) => {
          setActiveTab(tab)
        }))
      }
      


      if (window.electronAPI.onContextMenuFile) {
        unsubs.push(window.electronAPI.onContextMenuFile((filePath) => {
          setContextMenuFile(filePath)
          setActiveTab('share')
        }))
      }
    }
    return () => unsubs.forEach(unsub => unsub())
  }, [activeTab])

  useEffect(() => {
    let timer;
    if (incomingTransfer) {
      setCountdown(30)
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            if (window.electronAPI && window.electronAPI.respondTransfer) {
              window.electronAPI.respondTransfer(incomingTransfer.requestId, false)
            }
            setIncomingTransfer(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [incomingTransfer])

  const triggerToast = (msg) => {
    setQueue(q => [...q, msg])
  }

  useEffect(() => {
    if (queue.length === 0) return
    const timer = setTimeout(() => setQueue(q => q.slice(1)), 2400)
    return () => clearTimeout(timer)
  }, [queue])

  const handleTransferResponse = (accepted) => {
    if (incomingTransfer && window.electronAPI && window.electronAPI.respondTransfer) {
      window.electronAPI.respondTransfer(incomingTransfer.requestId, accepted)
    }
    setIncomingTransfer(null)
  }

  return (
    <main className="app-window relative overflow-hidden">
      <div className="ambient-glow"></div>
      
      {/* Window Bar */}
      <header className="title-bar app-region-drag">
        <div className="app-branding pl-2">
          <img src="./icon.png" alt="Logo" className="w-[18px] h-[18px] rounded-[4px] object-contain shrink-0" />
          <span>GrabCut</span>
          <span className="trial-badge">PRO</span>
        </div>
        <div className="window-controls app-region-no-drag flex gap-[14px]">
          <Minus size={14} className="cursor-pointer hover:text-white" onClick={() => window.electronAPI && window.electronAPI.minimizeWindow && window.electronAPI.minimizeWindow()} />
          <Square size={14} className="cursor-pointer hover:text-white" onClick={() => window.electronAPI && window.electronAPI.maximizeWindow && window.electronAPI.maximizeWindow()} />
          <X size={14} className="cursor-pointer hover:text-red-500" onClick={() => window.electronAPI && window.electronAPI.closeWindow && window.electronAPI.closeWindow()} />
        </div>
      </header>

      {/* Global Floating Transfer Notifications / Modals */}
      <div 
        className="absolute top-[60px] left-[calc(50%+100px)] -translate-x-1/2 w-full max-w-[500px] z-50 pointer-events-none flex flex-col gap-3 px-4 transition-all duration-300"
      >
        {/* Incoming Transfer Modal */}
        {incomingTransfer && (
          <div className="pointer-events-auto transition-all duration-300">
            <div className="mock2-ambient-glow"></div>
            <div className="mock2-incoming-card">
              
              <div className="mock2-card-header">
                <span className="mock2-badge-incoming">
                  <span className="mock2-pulse-ring"></span> Incoming Transfer
                </span>
                <div className="mock2-timer-pill">
                  <Clock size={13} />
                  <span>Auto-declines in <strong style={{ color: '#cbd5e1' }}>{countdown}s</strong></span>
                </div>
              </div>

              {/* File Info Box */}
              <div className="mock2-transfer-info-box">
                <div className="mock2-file-icon">
                  {renderFileIcon(incomingTransfer.fileName, 22)}
                </div>
                <div className="mock2-file-meta">
                  <span className="mock2-sender-title">
                    From <strong style={{ color: '#f1f5f9' }}>{incomingTransfer.peerName || 'Someone'}</strong>
                  </span>
                  <span className="mock2-file-name" title={incomingTransfer.fileName}>
                    {incomingTransfer.fileName || 'a file'}
                  </span>
                  <div className="mock2-file-specs">
                    <span>File</span>
                    {incomingTransfer.fileSize && (
                      <>
                        <span className="mock2-dot-divider"></span>
                        <span>{formatBytes(incomingTransfer.fileSize)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeout Progress Track */}
              <div className="mock2-countdown-bar">
                <div 
                  className="mock2-countdown-fill"
                  style={{ width: `${(countdown / 30) * 100}%` }}
                ></div>
              </div>

              {/* Action Buttons */}
              <div className="mock2-button-group">
                <button 
                  onClick={() => handleTransferResponse(false)}
                  className="mock2-btn mock2-btn-decline"
                >
                  <X size={16} />
                  Decline
                </button>
                <button 
                  onClick={() => handleTransferResponse(true)}
                  className="mock2-btn mock2-btn-accept"
                >
                  <Download size={16} />
                  Accept File
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Transfer Card */}
        {activeTransfer && (
          <div className="pointer-events-auto transition-all duration-300">
            <div className="mock-transfer-card">
              
              <div className="mock-transfer-header">
                <div className="mock-file-icon-box">
                  {activeTransfer.status === 'waiting' ? (
                    <ArrowUp size={20} className="animate-pulse" />
                  ) : (
                    renderFileIcon(activeTransfer.fileName, 20)
                  )}
                </div>
                
                <div className="mock-file-details">
                  <div className="mock-file-name-row">
                    <span className="mock-file-name" title={activeTransfer.fileName}>
                      {activeTransfer.fileCount > 1 
                        ? `(${activeTransfer.fileIndex || 1}/${activeTransfer.fileCount}) ${activeTransfer.fileName}`
                        : activeTransfer.fileName}
                    </span>
                    {activeTransfer.fileCount > 1 && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0 whitespace-nowrap">
                        {activeTransfer.fileCount} files
                      </span>
                    )}
                    {activeTransfer.isPaused && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 uppercase tracking-wide">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="mock-target-device">
                    {activeTransfer.status === 'cancelled' ? (
                      <strong style={{ color: '#ef4444', fontWeight: 600 }}>Transfer Cancelled</strong>
                    ) : activeTransfer.status === 'waiting' ? (
                      <span className="text-indigo-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                        Waiting for <strong>{activeTransfer.to}</strong> to accept...
                      </span>
                    ) : (
                      <>
                        <span>{activeTransfer.direction === 'receiving' ? 'Receiving from' : 'Sending to'}</span>
                        <strong style={{ color: '#cbd5e1', fontWeight: 500 }}>{activeTransfer.to}</strong>
                      </>
                    )}
                  </div>
                </div>

                <div className="mock-actions-group">
                  {(activeTransfer.status === 'uploading' || activeTransfer.status === 'cancelled') && (
                    <button 
                      className="mock-action-btn" 
                      title={activeTransfer.isPaused ? "Resume" : "Pause"}
                      onClick={() => {
                        if (activeTransfer.status === 'cancelled') return;
                        if (activeTransfer.isPaused) {
                          window.electronAPI.resumeTransfer()
                        } else {
                          window.electronAPI.pauseTransfer()
                        }
                      }}
                      disabled={activeTransfer.status === 'cancelled'}
                      style={{ opacity: activeTransfer.status === 'cancelled' ? 0.5 : 1 }}
                    >
                      {activeTransfer.isPaused ? <Play size={15} /> : <Pause size={15} />}
                    </button>
                  )}
                  <button 
                    onClick={() => window.electronAPI.cancelTransfer()} 
                    className="mock-action-btn cancel" 
                    title="Cancel"
                    disabled={activeTransfer.status === 'cancelled'}
                    style={{ opacity: activeTransfer.status === 'cancelled' ? 0.5 : 1 }}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {(activeTransfer.status === 'uploading' || activeTransfer.status === 'cancelled') && (
                <>
                  {/* Progress Track */}
                  <div className="mock-progress-bar-track">
                    <div 
                      className="mock-progress-bar-fill" 
                      style={{ 
                        width: `${activeTransfer.progress}%`,
                        background: activeTransfer.status === 'cancelled' 
                          ? '#ef4444' 
                          : activeTransfer.isPaused 
                            ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)' 
                            : undefined,
                        boxShadow: activeTransfer.status === 'cancelled' 
                          ? '0 0 12px rgba(239, 68, 68, 0.6)' 
                          : activeTransfer.isPaused 
                            ? '0 0 12px rgba(245, 158, 11, 0.4)' 
                            : undefined
                      }}
                    ></div>
                  </div>

                  {/* Transfer Stats Row */}
                  <div className="mock-transfer-meta">
                    <div className="mock-metrics">
                      <span><strong style={{ color: '#f1f5f9', fontWeight: 600 }}>{formatBytes(activeTransfer.bytesTransferred)}</strong> / {formatBytes(activeTransfer.bytesTotal)}</span>
                      <span>•</span>
                      <span>{activeTransfer.isPaused ? '0 B/s' : `${formatBytes(activeTransfer.speed)}/s`}</span>
                      <span>•</span>
                      <span>ETA: {formatETA(activeTransfer.eta, activeTransfer.isPaused)}</span>
                    </div>
                    <span className="mock-percentage">{activeTransfer.progress}%</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="app-body">
        {/* Sidebar */}
        <nav className="sidebar" aria-label="Main navigation">
          <div className="nav-indicator" ref={indicatorRef}></div>
          <button 
            className={`nav-item ${activeTab === 'share' ? 'active' : ''} relative`} 
            onClick={() => setActiveTab('share')}
          >
            <Share size={18} /> <span>Share</span>
            {unreadCount > 0 && activeTab !== 'share' && (
              <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[18px]">
                {unreadCount}
              </span>
            )}
          </button>
          <button 
            className={`nav-item ${activeTab === 'downloader' ? 'active' : ''}`} 
            onClick={() => setActiveTab('downloader')}
          >
            <Download size={18} /> <span>Downloader</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'slidemaker' ? 'active' : ''}`} 
            onClick={() => setActiveTab('slidemaker')}
          >
            <Film size={18} /> <span>Slide Maker</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'recorder' ? 'active' : ''}`} 
            onClick={() => setActiveTab('recorder')}
          >
            <Video size={18} /> <span>Recorder</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} 
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} /> <span>Settings</span>
          </button>
        </nav>

        {/* Content */}
        <section className="content-area app-region-no-drag relative">
          <div className="content-inner">
            <div style={{ display: activeTab === 'share' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
              <ShareView 
                myHostname={myHostname} 
                triggerToast={triggerToast} 
                contextMenuFile={contextMenuFile} 
                onClearContextMenu={() => setContextMenuFile(null)}
                unreadCount={unreadCount}
                onClearUnread={() => setUnreadCount(0)}
              />
            </div>
            <div style={{ display: activeTab === 'downloader' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
              <DownloaderView 
                triggerToast={triggerToast} 
                isPro={isPro} 
              />
            </div>
            <div style={{ display: activeTab === 'slidemaker' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
              <SlideMakerView 
                triggerToast={triggerToast} 
                isPro={isPro} 
              />
            </div>
            <div style={{ display: activeTab === 'recorder' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
              <RecorderView isPro={isPro} triggerToast={triggerToast} />
            </div>
            <div style={{ display: activeTab === 'settings' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
              <SettingsView 
                onSettingsChanged={(s) => setMyHostname(s.displayName)} 
                triggerToast={triggerToast} 
              />
            </div>
          </div>
          

          
          {/* Toast */}
          <div className={`toast ${queue.length > 0 ? 'show' : ''}`} role="status" aria-live="polite">
            <CheckCircle2 size={16} color="#6ee7b7" />
            <span id="toast-msg">{queue[0] || ''}</span>
          </div>

        </section>
      </div>
    </main>
  )
}

export default App
