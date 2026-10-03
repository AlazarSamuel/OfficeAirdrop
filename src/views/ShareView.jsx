import React, { useState, useEffect } from 'react'
import { Send, MonitorOff, RefreshCw, ArrowUp, ArrowRight, UploadCloud, Edit2, Smartphone, Wifi, QrCode, Monitor, X, FileText, ArrowRightLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import TransfersView from './TransfersView'

export default function ShareView({ _myHostname, triggerToast, contextMenuFile, onClearContextMenu, unreadCount = 0, onClearUnread }) {
  const [peers, setPeers] = useState([])
  const [history, setHistory] = useState([])
  const [dragOverId, setDragOverId] = useState(null)
  const [editingPeerId, setEditingPeerId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [activeSegment, setActiveSegment] = useState('computers')
  const [localIp, setLocalIp] = useState('')
  const [port, setPort] = useState(0)
  const [hiddenPeers, setHiddenPeers] = useState([])
  const [isScanning, setIsScanning] = useState(false)

  useEffect(() => {
    let unsubs = []
    
    if (window.electronAPI) {
      if (window.electronAPI.onDiscoveredPeers) {
        unsubs.push(window.electronAPI.onDiscoveredPeers((newPeers) => setPeers(newPeers)))
      }
      if (window.electronAPI.getPeers) {
        window.electronAPI.getPeers().then(setPeers)
      }
      if (window.electronAPI.getLocalIp) {
        window.electronAPI.getLocalIp().then(setLocalIp).catch(() => {})
      }
      if (window.electronAPI.getPort) {
        window.electronAPI.getPort().then(setPort).catch(() => {})
      }

      // History for recent computers and statuses
      if (window.electronAPI.getHistory) {
        window.electronAPI.getHistory().then(setHistory)
      }
      if (window.electronAPI.onHistoryUpdated) {
        unsubs.push(window.electronAPI.onHistoryUpdated(setHistory))
      }
      if (window.electronAPI.getHiddenPeers) {
        window.electronAPI.getHiddenPeers().then(setHiddenPeers)
      }

    } else {
      // Mock peers for browser preview
      setPeers([
        { id: '1', hostname: 'Nathan', ip: '192.168.1.100', os: 'Editor-PC' },
        { id: '2', hostname: "Liya's Laptop", ip: '192.168.1.101', os: 'Design-PC' }
      ])
      setLocalIp('192.168.1.100')
      setPort(50326)
    }
    
    return () => unsubs.forEach(unsub => unsub())
  }, [])

  useEffect(() => {
    if (contextMenuFile && window.electronAPI && window.electronAPI.stageFileForPhone) {
      // File picked from Windows context menu
    }
  }, [contextMenuFile])

  const handleSend = async (peer) => {
    if (contextMenuFile) {
      if (window.electronAPI && window.electronAPI.sendFiles) {
        triggerToast(`Sending to ${peer.displayName || peer.hostname}…`)
        window.electronAPI.sendFiles(peer.id, [contextMenuFile])
        if (onClearContextMenu) onClearContextMenu()
      }
      return
    }

    if (window.electronAPI && window.electronAPI.pickFiles) {
      const files = await window.electronAPI.pickFiles()
      if (files && files.length > 0) {
        triggerToast(`Sending to ${peer.displayName || peer.hostname}…`)
        window.electronAPI.sendFiles(peer.id, files)
      }
    } else {
      triggerToast(`Picker opened for ${peer.displayName || peer.hostname}… (Demo)`)
    }
  }

  const handleDragOver = (e, peerId) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragOverId !== peerId) setDragOverId(peerId)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverId(null)
  }

  const handleDrop = (e, peer) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverId(null)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filePaths = Array.from(e.dataTransfer.files).map(f => f.path).filter(Boolean)
      if (filePaths.length > 0 && window.electronAPI && window.electronAPI.sendFiles) {
        triggerToast(`Sending to ${peer.displayName || peer.hostname}…`)
        window.electronAPI.sendFiles(peer.id, filePaths)
      }
    }
  }

  const handleScan = () => {
    setIsScanning(true)
    triggerToast('Scanning network…')
    if (window.electronAPI && window.electronAPI.scanPeers) {
      window.electronAPI.scanPeers()
    }
    setTimeout(() => setIsScanning(false), 2000)
  }

  const handleSendToPhone = async () => {
    if (contextMenuFile) {
      if (window.electronAPI && window.electronAPI.stageFileForPhone) {
        try {
          await window.electronAPI.stageFileForPhone(contextMenuFile)
          triggerToast('File ready! Tap Download on your phone.')
          if (onClearContextMenu) onClearContextMenu()
        } catch {
          triggerToast('Failed to stage file for phone.')
        }
      }
      return
    }

    if (window.electronAPI && window.electronAPI.pickFiles) {
      const filePaths = await window.electronAPI.pickFiles()
      if (filePaths && filePaths.length > 0) {
        if (window.electronAPI.stageFileForPhone) {
          try {
            await window.electronAPI.stageFileForPhone(filePaths[0])
            triggerToast('File ready! Tap Download on your phone.')
          } catch {
            triggerToast('Failed to stage file for phone.')
          }
        }
      }
    }
  }

  const startEditing = (peer, e) => {
    e.stopPropagation()
    setEditingPeerId(peer.id)
    setEditValue(peer.displayName || peer.hostname || peer.name || '')
  }

  const saveAlias = async (peerId) => {
    if (window.electronAPI && window.electronAPI.saveAlias) {
      await window.electronAPI.saveAlias(peerId, editValue)
    }
    setEditingPeerId(null)
  }

  const handleKeyDown = (e, peerId) => {
    if (e.key === 'Enter') saveAlias(peerId)
    if (e.key === 'Escape') setEditingPeerId(null)
  }

  const getInitials = (name) => {
    if (!name) return 'PC'
    return name.substring(0, 2).toUpperCase()
  }

  // Derive recent peers and statuses from history
  const activePeerNames = new Set()
  peers.forEach(p => {
    if (p.name) activePeerNames.add(p.name)
    if (p.displayName) activePeerNames.add(p.displayName)
  })
  
  const peerStatuses = {}
  const offlinePeersMap = {}

  for (const item of history) {
    if (!item.peerName) continue;
    if (hiddenPeers.includes(item.peerName)) continue;
    
    if (!peerStatuses[item.peerName]) {
      let statusMsg = ''
      if (item.direction === 'sent') {
        if (item.status === 'completed') statusMsg = 'Sent successfully'
        else if (item.status === 'declined') statusMsg = 'Declined'
        else statusMsg = 'Transfer failed'
      } else {
        statusMsg = 'Received file'
      }
      
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      peerStatuses[item.peerName] = `${statusMsg} (${timeStr})`
    }

    if (!activePeerNames.has(item.peerName) && !offlinePeersMap[item.peerName]) {
      offlinePeersMap[item.peerName] = {
        id: item.peerName,
        displayName: item.peerName,
        name: item.peerName,
        os: 'Offline',
        isOffline: true
      }
    }
  }

  const recentPeers = Object.values(offlinePeersMap).slice(0, 4)

  const handleHidePeer = (e, peerName) => {
    e.stopPropagation()
    if (window.electronAPI && window.electronAPI.hidePeer) {
      window.electronAPI.hidePeer(peerName).then(setHiddenPeers)
    }
  }

  const qrUrl = `http://${localIp}:${port}`

  return (
    <section id="screen-share" aria-labelledby="share-title" className="content-area">
      <div className="page-container">
        
        {/* Page Header */}
        <div className="page-header w-full mb-6" style={{ alignItems: 'center', textAlign: 'center', flexDirection: 'column' }}>
          <h1 className="page-title" style={{ justifyContent: 'center' }}>
            <img src="./icon.png" alt="Logo" className="w-[22px] h-[22px] rounded-[5px] object-contain shrink-0" />
            GrabCut 
            <span className="slogan-tag">• GRAB IT. CUT IT. SEND IT.</span>
          </h1>
          <div className="h-[22px] overflow-hidden flex items-center justify-center mt-1">
            <AnimatePresence mode="wait">
              <motion.p 
                key={activeSegment}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="subtitle"
              >
                {activeSegment === 'computers' 
                  ? 'Discovered computers and workstations on your local network' 
                  : activeSegment === 'phone' 
                    ? 'Send files from your iPhone or Android'
                    : 'All sent and received files on this machine'}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {contextMenuFile && (
          <div className="bg-[#4f46e5]/20 border border-[#4f46e5]/50 rounded-[12px] p-3 mb-6 flex items-center justify-between" style={{ backdropFilter: 'blur(10px)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#4f46e5]/20 flex items-center justify-center">
                <FileText className="text-[#818cf8]" size={20} />
              </div>
              <div>
                <div className="text-white font-medium text-[14px]">Ready to Share</div>
                <div className="text-white/60 text-[12px] truncate max-w-[300px]" title={contextMenuFile}>
                  {contextMenuFile.split('\\').pop().split('/').pop()}
                </div>
              </div>
            </div>
            <button 
              onClick={onClearContextMenu} 
              className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
              title="Cancel Selection"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="segmented-control relative mb-6" style={{ alignSelf: 'center' }}>
          <button 
            className={`seg-btn relative ${activeSegment === 'computers' ? 'active' : ''}`}
            onClick={() => setActiveSegment('computers')}
          >
            {activeSegment === 'computers' && (
              <motion.div
                layoutId="activeSegmentIndicator"
                className="absolute inset-0 rounded-[8px]"
                style={{
                  background: '#252945',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 32
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <Monitor size={15} /> Nearby Computers
            </span>
          </button>
          <button 
            className={`seg-btn relative ${activeSegment === 'phone' ? 'active' : ''}`}
            onClick={() => setActiveSegment('phone')}
          >
            {activeSegment === 'phone' && (
              <motion.div
                layoutId="activeSegmentIndicator"
                className="absolute inset-0 rounded-[8px]"
                style={{
                  background: '#252945',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 32
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <Smartphone size={15} /> Connect Phone
            </span>
          </button>
          <button 
            className={`seg-btn relative ${activeSegment === 'transfers' ? 'active' : ''}`}
            onClick={() => {
              setActiveSegment('transfers')
              if (onClearUnread) onClearUnread()
            }}
          >
            {activeSegment === 'transfers' && (
              <motion.div
                layoutId="activeSegmentIndicator"
                className="absolute inset-0 rounded-[8px]"
                style={{
                  background: '#252945',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 32
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <ArrowRightLeft size={15} /> Transfers
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[17px] text-center leading-none">
                  {unreadCount}
                </span>
              )}
            </span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeSegment === 'computers' ? (
            <motion.div 
              key="computers"
              initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full flex flex-col gap-6"
            >
              {peers.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="section-label">On this network ({peers.length})</h2>
                    <button 
                      onClick={handleScan}
                      className="btn-scan"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} /> Refresh
                    </button>
                  </div>
                  
                  <div className="peers-grid">
                    {peers.map((peer, i) => (
                      <div 
                        className={`peer-card-large ${dragOverId === peer.id ? 'drag-active' : ''}`}
                        key={peer.id}
                        onDragOver={(e) => handleDragOver(e, peer.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, peer)}
                      >
                        <div className="peer-card-header">
                          <div 
                            className="peer-avatar-large" 
                            style={i % 2 !== 0 ? { background: 'rgba(52,211,153,0.15)', color: '#6ee7b7' } : {}}
                          >
                            {getInitials(peer.displayName || peer.hostname || peer.name)}
                            <span className="peer-status-large"></span>
                          </div>
                          <div className="peer-info flex-1 relative group">
                            {editingPeerId === peer.id ? (
                              <div className="flex items-center">
                                <input 
                                  type="text" 
                                  autoFocus
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => handleKeyDown(e, peer.id)}
                                  onBlur={() => saveAlias(peer.id)}
                                  className="bg-white/10 text-[15px] font-medium text-white px-2 py-1 rounded outline-none border border-indigo-500/50 w-full"
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="text-[15px] font-medium text-white truncate max-w-[140px]" title={peer.displayName || peer.hostname || peer.name}>
                                  {peer.displayName || peer.hostname || peer.name || 'Unknown PC'}
                                </div>
                                <button 
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white p-[2px] bg-white/5 hover:bg-white/10 rounded"
                                  onClick={(e) => startEditing(peer, e)}
                                  title="Rename PC"
                                >
                                  <Edit2 size={13} />
                                </button>
                              </div>
                            )}
                            <div className="text-[13px] text-white/40 mt-[2px]">{peer.os || 'Windows PC'} · Available</div>
                            {(peerStatuses[peer.displayName] || peerStatuses[peer.name]) && (
                              <div className="text-[11px] font-medium text-emerald-400 mt-1 truncate">{peerStatuses[peer.displayName] || peerStatuses[peer.name]}</div>
                            )}
                          </div>
                        </div>

                        <div className="card-drop-zone">
                          <div className="drop-icon-wrap">
                            <UploadCloud size={18} />
                          </div>
                          <div>
                            <div className="drop-title">Drop files here</div>
                          </div>
                        </div>

                        <div className="card-actions">
                          <button className="btn-browse" onClick={() => handleSend(peer)}>
                            <Send size={15} /> Browse files
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Radar Empty State Stage */
                <div className="scanner-stage">
                  <div className="radar-pulse-wrap">
                    <div className="radar-circle"></div>
                    <div className="radar-circle"></div>
                    <div className="radar-core">
                      <MonitorOff size={26} />
                    </div>
                  </div>

                  <div className="scanner-text">
                    <h3>Looking for computers...</h3>
                    <p>Make sure GrabCut is running on another PC connected to the same Wi-Fi or office network.</p>
                  </div>

                  <button className="btn-scan" onClick={handleScan}>
                    <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
                    <span>Scan network again</span>
                  </button>
                </div>
              )}

              {/* Recent Computers Section */}
              {recentPeers.length > 0 && (
                <div className="recent-section mt-2">
                  <span className="section-label">Recent Computers (Offline)</span>
                  <div className="device-grid">
                    {recentPeers.map((peer) => (
                      <div className="device-card relative group" key={peer.id}>
                        <button 
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-white/5 hover:bg-white/20 text-white/40 hover:text-white transition-colors opacity-0 group-hover:opacity-100 z-10"
                          onClick={(e) => handleHidePeer(e, peer.displayName || peer.name)}
                          title="Remove from recent"
                        >
                          <X size={14} />
                        </button>
                        <div className="device-avatar">
                          {getInitials(peer.displayName || peer.name)}
                        </div>
                        <div className="device-details flex-1 min-w-0">
                          <h4 className="truncate">{peer.displayName || peer.name}</h4>
                          <div className="device-status">
                            <span className="status-dot-offline"></span>
                            <span className="truncate">Offline {peerStatuses[peer.displayName] || peerStatuses[peer.name] ? `• ${peerStatuses[peer.displayName] || peerStatuses[peer.name]}` : ''}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : activeSegment === 'phone' ? (
            /* Connect Phone View */
            <motion.div 
              key="phone"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="w-full flex flex-col items-center gap-6 pb-8"
              style={{ paddingTop: '20px' }}
            >
              {/* Main QR Card */}
              <div className="bg-[#1a1b2f]/70 backdrop-blur-md border border-white/10 rounded-[24px] p-8 w-[380px] flex flex-col items-center text-center shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)]">
                <div style={{ marginTop: '8px', marginBottom: '28px' }}>
                  <h3 className="text-[19px] font-semibold text-white mb-2">Scan to Connect</h3>
                  <p className="text-[14px] text-[#94a3b8] leading-snug px-4">Point your phone camera to start transferring</p>
                </div>

                <div 
                  className="bg-white rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.3)] flex-shrink-0"
                  style={{ padding: '16px', marginBottom: '16px' }}
                >
                  {localIp && port ? (
                    <QRCodeSVG 
                      value={qrUrl} 
                      size={180} 
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="Q"
                      includeMargin={false}
                      style={{ display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: 180, height: 180 }} className="bg-gray-100 flex items-center justify-center">
                      <QrCode size={44} className="text-gray-300 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>

              {/* Wi-Fi Pill */}
              <div 
                className="w-[380px] flex items-center gap-4 bg-[#1a1b2f]/70 backdrop-blur-md border border-white/10 rounded-[16px] px-5 py-3.5 text-left shadow-[0_8px_16px_-4px_rgba(0,0,0,0.4)]"
              >
                <div className="w-10 h-10 bg-indigo-500/10 rounded-full text-indigo-400 flex items-center justify-center shrink-0">
                  <Wifi size={20} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13.5px] font-semibold text-white mb-0.5">Wi-Fi Connection Required</span>
                  <span className="text-[12px] text-slate-400 truncate">Both devices must share the same network</span>
                </div>
              </div>

              {/* Send File to Phone Button */}
              <button
                onClick={handleSendToPhone}
                className="w-[380px] group flex items-center justify-between bg-indigo-600 hover:bg-indigo-500 text-white border border-white/10 rounded-[16px] px-5 py-3.5 shadow-[0_8px_16px_-4px_rgba(99,102,241,0.4)] transition-all active:scale-95 cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-black/20 rounded-full text-white flex items-center justify-center shrink-0">
                    <ArrowUp size={20} />
                  </div>
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-[13.5px] font-semibold text-white mb-0.5">Send file to phone</span>
                    <span className="text-[12px] text-white/70 truncate">Tap here to choose a file</span>
                  </div>
                </div>
                <ArrowRight size={20} className="text-white/50 group-hover:text-white transition-colors" />
              </button>
            </motion.div>
          ) : (
            /* Transfers View */
            <motion.div 
              key="transfers"
              initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full flex flex-col items-center"
            >
              <TransfersView triggerToast={triggerToast} embedded={true} />
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  )
}
