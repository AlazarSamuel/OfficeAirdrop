import React, { useState, useEffect } from 'react'
import { Send, MonitorOff, Link as LinkIcon, RefreshCw, ArrowUp, ArrowRight, UploadCloud, Edit2, Smartphone, Wifi, QrCode, Monitor, X } from 'lucide-react'
import { motion } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'

export default function ShareView({ myHostname, triggerToast }) {
  const [peers, setPeers] = useState([])
  const [history, setHistory] = useState([])
  const [stagedFile, setStagedFile] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [editingPeerId, setEditingPeerId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [activeSegment, setActiveSegment] = useState('computers')
  const [localIp, setLocalIp] = useState('')
  const [port, setPort] = useState(0)
  const [hiddenPeers, setHiddenPeers] = useState([])

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

  const handleSend = async (peer) => {
    if (window.electronAPI && window.electronAPI.pickFiles) {
      const files = await window.electronAPI.pickFiles()
      if (files && files.length > 0) {
        triggerToast(`Sending to ${peer.hostname}…`)
        window.electronAPI.sendFiles(peer.id, files)
      }
    } else {
      triggerToast(`Picker opened for ${peer.hostname}… (Demo)`)
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
      // Electron adds `.path` to File objects
      const filePaths = Array.from(e.dataTransfer.files).map(f => f.path).filter(Boolean)
      if (filePaths.length > 0 && window.electronAPI && window.electronAPI.sendFiles) {
        triggerToast(`Sending to ${peer.displayName || peer.hostname}…`)
        window.electronAPI.sendFiles(peer.id, filePaths)
      }
    }
  }

  const handleScan = () => {
    triggerToast('Scanning network…')
    if (window.electronAPI && window.electronAPI.scanPeers) {
      window.electronAPI.scanPeers()
    }
  }

  const handleSendToPhone = async () => {
    if (window.electronAPI && window.electronAPI.pickFiles) {
      const filePaths = await window.electronAPI.pickFiles()
      if (filePaths && filePaths.length > 0) {
        if (window.electronAPI.stageFileForPhone) {
          try {
            await window.electronAPI.stageFileForPhone(filePaths[0])
            triggerToast('File ready! Tap Download on your phone.')
          } catch (err) {
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
    <section id="screen-share" aria-labelledby="share-title" className="h-full flex flex-col relative overflow-y-auto pr-2 pb-4">
      
      {/* Header and Title */}
      <div className="shrink-0 mb-6">
        <h1 className="page-title" id="share-title">
          Office AirDrop <span className="online-dot" title="Online"></span>
        </h1>
        <p className="page-sub">
          {activeSegment === 'computers' ? 'Discovered computers on your network' : 'Send files from your iPhone or Android'}
        </p>
      </div>
      
      {/* Centered Switcher */}
      <div className="shrink-0 mb-8 flex justify-center">
        <div className="flex gap-4 w-full max-w-[480px]">
          <button 
            onClick={() => setActiveSegment('computers')}
            className={`nav-item ${activeSegment === 'computers' ? 'active' : ''}`}
            style={{ justifyContent: 'center' }}
          >
            <Monitor size={18} /> Nearby Computers
          </button>
          
          <button 
            onClick={() => setActiveSegment('phone')}
            className={`nav-item ${activeSegment === 'phone' ? 'active' : ''}`}
            style={{ justifyContent: 'center' }}
          >
            <Smartphone size={18} /> Connect Phone
          </button>
        </div>
      </div>

      {activeSegment === 'computers' ? (
        <div className="w-full flex flex-col mb-auto animate-in fade-in duration-300" style={{ paddingTop: '30px' }}>
          {peers.length > 0 ? (
            <>
          <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
            <h2 className="peers-header" style={{ padding: 0, border: 'none', margin: 0 }}>On this network</h2>
            <button 
              onClick={handleScan}
              className="text-[13px] font-medium text-white/50 hover:text-white/90 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-[12px] flex items-center gap-2 transition-colors"
            >
              <RefreshCw size={13} /> Refresh
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
        <div className="flex-1 flex flex-col items-center justify-center -mt-10 text-center">
          <div className="w-[72px] h-[72px] rounded-[20px] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
            <MonitorOff size={32} className="text-indigo-400" />
          </div>
          <h2 className="text-[18px] font-medium text-white mb-3">Looking for computers...</h2>
          <p className="text-[14px] text-white/40 max-w-[340px] leading-relaxed">
            Make sure Office AirDrop is running on another PC on the same Wi-Fi or office network.
          </p>
          <button className="btn-ghost" onClick={handleScan} style={{ padding: '10px 24px', fontSize: '14px', marginTop: '28px' }}>
            <RefreshCw size={15} /> Scan network again
          </button>
        </div>
      )}

      {recentPeers.length > 0 && (
        <div className="mt-8 shrink-0">
          <h2 className="peers-header" style={{ padding: 0, border: 'none', margin: 0, opacity: 0.6, marginBottom: '16px' }}>Recent computers (Offline)</h2>
          
          <div className="peers-grid-compact">
            {recentPeers.map((peer, i) => (
              <div 
                className="peer-card-compact opacity-50 grayscale transition-all hover:grayscale-0 hover:opacity-70 group"
                key={peer.id}
              >
                <button 
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-white/5 hover:bg-white/20 text-white/40 hover:text-white transition-colors opacity-0 group-hover:opacity-100 z-10"
                  onClick={(e) => handleHidePeer(e, peer.displayName || peer.name)}
                  title="Remove from recent"
                >
                  <X size={14} />
                </button>
                <div className="peer-avatar-compact">
                  {getInitials(peer.displayName || peer.name)}
                </div>
                <div className="peer-info flex-1 relative min-w-0">
                  <div className="text-[14px] font-medium text-white/70 truncate leading-tight">{peer.displayName || peer.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30"></div>
                    <span className="text-[12px] text-white/40">Offline</span>
                    {(peerStatuses[peer.displayName] || peerStatuses[peer.name]) && (
                      <>
                        <span className="text-[12px] text-white/20">•</span>
                        <span className="text-[11px] font-medium text-white/40 truncate">{peerStatuses[peer.displayName] || peerStatuses[peer.name]}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </div>
      ) : (
        <div 
          className="w-full flex flex-col items-center mb-auto animate-in fade-in duration-300 shrink-0 pb-12"
          style={{ paddingTop: '50px' }}
        >
          
          {/* Main QR Card */}
          <div className="bg-[#1a1b2f]/70 backdrop-blur-md border border-white/10 rounded-[24px] p-8 w-[380px] flex flex-col items-center text-center shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)]">
            
            <div style={{ marginTop: '16px', marginBottom: '36px' }}>
              <h3 className="text-[19px] font-semibold text-white mb-2">Scan to Connect</h3>
              <p className="text-[14px] text-[#94a3b8] leading-snug px-4">Point your phone camera to start transferring</p>
            </div>

            <div 
              className="bg-white rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.3)] flex-shrink-0"
              style={{ padding: '16px', marginBottom: '24px' }}
            >
              {localIp && port ? (
                <QRCodeSVG 
                  value={qrUrl} 
                  size={200} 
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="Q"
                  includeMargin={false}
                  style={{ display: 'block' }}
                />
              ) : (
                <div style={{ width: 200, height: 200 }} className="bg-gray-100 flex items-center justify-center">
                  <QrCode size={48} className="text-gray-300 animate-pulse" />
                </div>
              )}
            </div>
          </div>

          {/* Wi-Fi Pill (Outside Card) */}
          <div 
            className="w-[380px] flex items-center gap-4 bg-[#1a1b2f]/70 backdrop-blur-md border border-white/10 rounded-[16px] px-5 py-4 text-left shadow-[0_8px_16px_-4px_rgba(0,0,0,0.4)]"
            style={{ marginTop: '24px' }}
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
            className="w-[380px] group flex items-center justify-between bg-blue-500 hover:bg-blue-600 text-white border border-white/10 rounded-[16px] px-5 py-4 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.4)] transition-all active:scale-95"
            style={{ marginTop: '16px' }}
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

        </div>
      )}


    </section>
  )
}
