import React, { useState, useEffect } from 'react'
import { Search, Filter, Film, Image as ImageIcon, FileText, FileArchive, FolderOpen, Send, Trash2, AlertCircle } from 'lucide-react'

// Helper formatters
const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()
  
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today, ${timeStr}`
  if (isYesterday) return `Yesterday, ${timeStr}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timeStr}`
}

const getFileType = (fileName) => {
  if (!fileName) return 'doc'
  const ext = fileName.split('.').pop().toLowerCase()
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'].includes(ext)) return 'video'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip'
  return 'doc'
}

export default function HistoryView({ triggerToast }) {
  const [history, setHistory] = useState([])
  const [peers, setPeers] = useState([])
  
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all', 'sent', 'received'
  const [rowErrors, setRowErrors] = useState({})

  useEffect(() => {
    if (window.electronAPI) {
      // Load initial history
      if (window.electronAPI.getHistory) {
        window.electronAPI.getHistory().then(setHistory)
      }
      
      // Live updates for history
      if (window.electronAPI.onHistoryUpdated) {
        window.electronAPI.onHistoryUpdated(setHistory)
      }
      
      // Live peers for "Send again" validation
      if (window.electronAPI.onDiscoveredPeers) {
        window.electronAPI.onDiscoveredPeers(setPeers)
      }
    }
  }, [])

  const handleOpenFolder = (filePath) => {
    if (window.electronAPI && window.electronAPI.openFolder && filePath) {
      window.electronAPI.openFolder(filePath)
    }
  }

  const handleDelete = (id) => {
    if (window.electronAPI && window.electronAPI.deleteHistory) {
      window.electronAPI.deleteHistory(id)
      triggerToast('Removed from history.')
    }
  }

  const sendAgain = (item) => {
    const peer = peers.find(p => p.name === item.peerName)
    if (!peer) {
      setRowErrors(prev => ({ ...prev, [item.id]: `${item.peerName || 'Peer'} is offline` }))
      setTimeout(() => {
        setRowErrors(prev => {
          const next = { ...prev }
          delete next[item.id]
          return next
        })
      }, 3000)
      return
    }
    
    if (window.electronAPI && window.electronAPI.sendFiles && item.filePath) {
      window.electronAPI.sendFiles(peer.id, [item.filePath])
      triggerToast(`Sending to ${peer.name}…`)
    }
  }

  const cycleFilter = () => {
    setFilterType(prev => {
      if (prev === 'all') return 'sent'
      if (prev === 'sent') return 'received'
      return 'all'
    })
  }

  const filteredHistory = history.filter(item => {
    // Direction filter
    if (filterType === 'sent' && item.direction !== 'sent') return false
    if (filterType === 'received' && item.direction !== 'received') return false
    
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const ext = item.fileName ? item.fileName.split('.').pop().toLowerCase() : ''
      const nameMatch = item.fileName && item.fileName.toLowerCase().includes(q)
      const peerMatch = item.peerName && item.peerName.toLowerCase().includes(q)
      const extMatch = ext.includes(q)
      
      if (!nameMatch && !peerMatch && !extMatch) return false
    }
    
    return true
  })

  const renderIcon = (type) => {
    switch (type) {
      case 'video': return <Film size={16} />
      case 'image': return <ImageIcon size={16} />
      case 'doc': return <FileText size={16} />
      case 'zip': return <FileArchive size={16} />
      default: return <FileText size={16} />
    }
  }

  return (
    <section id="screen-history" aria-labelledby="history-title">
      <h1 className="page-title" id="history-title">Transfer history</h1>
      <p className="page-sub">All sent and received files on this machine</p>

      <div className="history-toolbar">
        <div className="search-wrap">
          <Search className="search-icon" size={15} />
          <input 
            type="text" 
            className="search-box" 
            placeholder="Search files, computers, or types (e.g. mp4)…" 
            aria-label="Search history" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="filter-btn" onClick={cycleFilter}>
          <Filter size={14} /> 
          {filterType === 'all' ? 'Filter' : filterType === 'sent' ? 'Sent' : 'Received'}
        </button>
      </div>

      <div className="history-list" role="list">
        {filteredHistory.length > 0 ? filteredHistory.map(item => {
          const type = getFileType(item.fileName)
          
          return (
            <div className="history-row relative" role="listitem" key={item.id}>
              <div className={`file-icon-wrap fi-${type}`}>
                {renderIcon(type)}
              </div>
              
              <div className="history-info">
                <div className="history-fname">{item.fileName}</div>
                <div className="history-meta">{item.peerName || 'Unknown Peer'} · {formatSize(item.fileSize)} · {formatTime(item.timestamp)}</div>
              </div>
              
              {item.direction === 'sent' ? (
                <span className="dir-badge sent">Sent</span>
              ) : (
                <span className="dir-badge recv">Received</span>
              )}
              
              <div className="row-actions flex items-center gap-1">
                {rowErrors[item.id] && (
                  <div className="text-red-400 text-[12px] flex items-center gap-1 mr-2 px-2 py-1 bg-red-400/10 rounded-md whitespace-nowrap">
                    <AlertCircle size={12} />
                    {rowErrors[item.id]}
                  </div>
                )}
                <button className="icon-btn" title="Open file location" onClick={() => handleOpenFolder(item.filePath)}>
                  <FolderOpen size={14} />
                </button>
                {item.direction === 'sent' && (
                  <button className="icon-btn" title="Send again" onClick={() => sendAgain(item)}>
                    <Send size={14} />
                  </button>
                )}
                <button className="icon-btn" title="Delete record" onClick={() => handleDelete(item.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        }) : (
          <div className="text-center text-white/50 text-[13px] py-12">
            No history records found.
          </div>
        )}
      </div>
    </section>
  )
}
