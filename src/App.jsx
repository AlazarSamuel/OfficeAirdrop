import React, { useState, useEffect } from 'react'
import { Share, History, Settings, Smartphone, Minus, Square, X, CheckCircle2, Download, ArrowUp, Pause, Play, Video, FileText, Clock, Film } from 'lucide-react'
import ShareView from './views/ShareView'
import HistoryView from './views/HistoryView'
import SettingsView from './views/SettingsView'
import DownloaderView from './views/DownloaderView'
import SlideMakerView from './views/SlideMakerView'
import { Image as ImageIcon } from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState('share')
  const [myHostname, setMyHostname] = useState('My PC')
  const [queue, setQueue] = useState([])
  const [incomingTransfer, setIncomingTransfer] = useState(null)
  const [activeTransfer, setActiveTransfer] = useState(null)
  const [countdown, setCountdown] = useState(30)

  const [unreadCount, setUnreadCount] = useState(0)

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatETA = (seconds) => {
    if (!seconds) return '...'
    if (seconds < 60) return `${Math.floor(seconds)}s`
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}m ${s}s`
  }

  useEffect(() => {
    let unsubs = []
    if (window.electronAPI) {
      window.electronAPI.getSettings().then(settings => {
        setMyHostname(settings.displayName)
      })
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
          
          if (entry && entry.direction === 'received' && activeTab !== 'history') {
            setUnreadCount(c => c + 1)
          }
        }))
      }
      
      if (window.electronAPI.onTransferWaiting) {
        unsubs.push(window.electronAPI.onTransferWaiting((data) => {
          setActiveTransfer({
            status: 'waiting',
            fileName: data.fileName || 'file',
            to: data.peerName || 'Peer'
          })
        }))
      }

      if (window.electronAPI.onTransferProgress) {
        unsubs.push(window.electronAPI.onTransferProgress((data) => {
          setActiveTransfer({
            status: 'uploading',
            fileName: data.fileName || 'file',
            to: data.peerName || 'Peer',
            speed: data.speed || 0,
            eta: data.eta || 0,
            bytesTransferred: data.bytesTransferred || 0,
            bytesTotal: data.bytesTotal || 0,
            progress: data.progress || 0,
            direction: data.direction || 'sending'
          })
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
    <div className="app-shell relative overflow-hidden">
      {/* Title bar */}
      <div className="title-bar">
        <div className="flex items-center gap-[8px] flex-1 app-region-drag pl-2">
          <img src="/icon.png" alt="Logo" className="w-[18px] h-[18px] opacity-90" />
          <span className="title-bar-label font-medium" style={{ paddingLeft: 0, flex: 'none' }}>Office AirDrop</span>
        </div>
      </div>

      {/* Global Live transfer progress */}
      {activeTransfer && (
        <div className="absolute top-[60px] left-[calc(50%+110px)] -translate-x-1/2 w-full max-w-[520px] z-50 pointer-events-auto transition-all duration-300">
          <div className="mock-transfer-card">
            
            <div className="mock-transfer-header">
              <div className="mock-file-icon-box">
                {activeTransfer.status === 'waiting' ? (
                  <ArrowUp size={20} className="animate-pulse" />
                ) : (
                  <Video size={20} />
                )}
              </div>
              
              <div className="mock-file-details">
                <div className="mock-file-name-row">
                  <span className="mock-file-name" title={activeTransfer.fileName}>
                    {activeTransfer.fileName}
                  </span>
                </div>
                <div className="mock-target-device">
                  {activeTransfer.status === 'cancelled' ? (
                    <strong style={{ color: '#ef4444', fontWeight: 600 }}>Transfer Cancelled</strong>
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
                      background: activeTransfer.status === 'cancelled' ? '#ef4444' : undefined,
                      boxShadow: activeTransfer.status === 'cancelled' ? '0 0 12px rgba(239, 68, 68, 0.6)' : undefined
                    }}
                  ></div>
                </div>

                {/* Transfer Stats Row */}
                <div className="mock-transfer-meta">
                  <div className="mock-metrics">
                    <span><strong style={{ color: '#f1f5f9', fontWeight: 600 }}>{formatBytes(activeTransfer.bytesTransferred)}</strong> / {formatBytes(activeTransfer.bytesTotal)}</span>
                    <span>•</span>
                    <span>{formatBytes(activeTransfer.speed)}/s</span>
                    <span>•</span>
                    <span>ETA: {formatETA(activeTransfer.eta)}</span>
                  </div>
                  <span className="mock-percentage">{activeTransfer.progress}%</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Incoming Transfer Modal */}
      <div 
        className={`absolute top-[60px] left-[calc(50%+110px)] -translate-x-1/2 w-full max-w-[460px] z-50 pointer-events-auto transition-all duration-300 transform ${incomingTransfer ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'}`}
      >
        {incomingTransfer && (
          <>
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
                  <Film size={22} />
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
                        <span>{incomingTransfer.fileSize}</span>
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
          </>
        )}
      </div>

      <div className="app-body">
        {/* Sidebar */}
        <nav className="sidebar" aria-label="Main navigation">
          <button 
            className={`nav-item ${activeTab === 'share' ? 'active' : ''}`} 
            onClick={() => setActiveTab('share')}
          >
            <Share size={18} /> Share
          </button>
          <button 
            className={`nav-item ${activeTab === 'history' ? 'active' : ''} relative`} 
            onClick={() => {
              setActiveTab('history')
              setUnreadCount(0)
            }}
          >
            <History size={18} /> History
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[18px]">
                {unreadCount}
              </span>
            )}
          </button>
          <button 
            className={`nav-item ${activeTab === 'downloader' ? 'active' : ''}`} 
            onClick={() => setActiveTab('downloader')}
          >
            <Download size={18} /> Downloader
          </button>
          <button 
            className={`nav-item ${activeTab === 'slidemaker' ? 'active' : ''}`} 
            onClick={() => setActiveTab('slidemaker')}
          >
            <ImageIcon size={18} /> Slide Maker
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} 
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} /> Settings
          </button>
        </nav>

        {/* Content */}
        <main className="content app-region-no-drag relative">
          <div className="content-inner">
            <div style={{ display: activeTab === 'share' ? 'block' : 'none', height: '100%' }}>
              <ShareView myHostname={myHostname} triggerToast={triggerToast} />
            </div>
            <div style={{ display: activeTab === 'history' ? 'block' : 'none', height: '100%' }}>
              <HistoryView triggerToast={triggerToast} />
            </div>
            <div style={{ display: activeTab === 'downloader' ? 'block' : 'none', height: '100%' }}>
              <DownloaderView triggerToast={triggerToast} />
            </div>
            <div style={{ display: activeTab === 'slidemaker' ? 'block' : 'none', height: '100%' }}>
              <SlideMakerView triggerToast={triggerToast} />
            </div>
            <div style={{ display: activeTab === 'settings' ? 'block' : 'none', height: '100%' }}>
              <SettingsView onSettingsChanged={(s) => setMyHostname(s.displayName)} triggerToast={triggerToast} />
            </div>
          </div>
          
          {/* Toast */}
          <div className={`toast ${queue.length > 0 ? 'show' : ''}`} role="status" aria-live="polite">
            <CheckCircle2 size={16} color="#6ee7b7" />
            <span id="toast-msg">{queue[0] || ''}</span>
          </div>

        </main>
      </div>
    </div>
  )
}

export default App
