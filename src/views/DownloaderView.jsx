import React, { useState, useEffect, useRef } from 'react'
import { Download, X, Video, PlayCircle, Loader2, Link as LinkIcon, Clipboard, ArrowDownToLine, Film, Camera, Music2, MessageCircle, FolderOpen, Clock, RefreshCcw, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import TimeInput from '../components/TimeInput'
import TimelineSlider from '../components/TimelineSlider'

export default function DownloaderView({ triggerToast }) {
  const [url, setUrl] = useState('')
  const [downloads, setDownloads] = useState([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [quality, setQuality] = useState('1080')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [isFetchingInfo, setIsFetchingInfo] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const webviewRef = useRef(null)

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return ''
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Sync current time back from player (for live trim point display)
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !videoInfo) return;

    const handleDomReady = () => {
      // Force the player to cover the entire webview
      webview.insertCSS(`
        body { overflow: hidden !important; background: black !important; }
        #movie_player, [data-e2e="video-player"], x-tiktok-video-player, .tiktok-video-player {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483647 !important;
          background: black !important;
        }
        /* Generic fallback to stretch any video tag to the top */
        video {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483646 !important;
          object-fit: contain !important;
          background: black !important;
        }
        /* Hide annoying UI overlays */
        ytd-consent-bump-v2-lightbox, dialog, [data-e2e="feed-action-right"], [data-e2e="video-desc"], header, nav { display: none !important; }
      `).catch(() => {});
      
      // Auto-play the video and try to dismiss popups
      webview.executeJavaScript(`
        var v = document.querySelector('video');
        if (v) { 
          v.controls = true;
          v.play().catch(()=>{}); 
        }
      `).catch(() => {});

      // Poll currentTime every 500ms to drive the slider position
      const interval = setInterval(() => {
        if (webviewRef.current) {
          webviewRef.current.executeJavaScript(
            `document.querySelector('video')?.currentTime ?? 0`
          ).then(time => setCurrentTime(time)).catch(() => {});
        }
      }, 500);
      
      return () => clearInterval(interval);
    };

    webview.addEventListener('dom-ready', handleDomReady);
    return () => webview.removeEventListener('dom-ready', handleDomReady);
  }, [videoInfo]);

  useEffect(() => {
    if (url.trim().startsWith('http') && window.electronAPI && window.electronAPI.fetchVideoInfo) {
      setIsFetchingInfo(true)
      setIsPlaying(false)
      setStartTime('')
      setEndTime('')
      setFetchError(null)
      window.electronAPI.fetchVideoInfo(url.trim())
        .then(info => {
          setVideoInfo(info)
        })
        .catch((err) => {
          console.error("fetchVideoInfo error:", err)
          setFetchError(err.message || 'Failed to fetch video details')
          setVideoInfo(null)
        })
        .finally(() => {
          setIsFetchingInfo(false)
        })
    } else {
      setVideoInfo(null)
      setFetchError(null)
      setIsPlaying(false)
      setStartTime('')
      setEndTime('')
    }
  }, [url])

  useEffect(() => {
    // Load persisted download history on mount
    if (window.electronAPI?.getDownloadHistory) {
      window.electronAPI.getDownloadHistory().then(saved => {
        if (saved && saved.length > 0) setDownloads(saved)
      })
    }
  }, [])

  // Save to disk whenever a download completes or errors
  const persistDownloads = (list) => {
    if (window.electronAPI?.saveDownloadHistory) {
      // Only persist completed/error items (not in-progress ones)
      const toSave = list.filter(d => d.status === 'complete' || d.status === 'error')
      window.electronAPI.saveDownloadHistory(toSave)
    }
  }

  useEffect(() => {
    let unsubs = []
    
    if (window.electronAPI) {
      unsubs.push(window.electronAPI.onDownloadProgress((data) => {
        setDownloads(prev => prev.map(d => 
          d.id === data.id 
            ? { ...d, progress: data.percent, speed: data.speed, eta: data.eta, title: data.title, segments: data.segments }
            : d
        ))
      }))
      
      unsubs.push(window.electronAPI.onDownloadComplete((data) => {
        setDownloads(prev => {
          const updated = prev.map(d => 
            d.id === data.id 
              ? { ...d, status: 'complete', title: data.title || d.title, progress: 100, filePath: data.path || '' }
              : d
          )
          persistDownloads(updated)
          return updated
        })
        triggerToast('Video downloaded successfully!')
      }))
      
      unsubs.push(window.electronAPI.onDownloadError((data) => {
        setDownloads(prev => {
          const updated = prev.map(d => 
            d.id === data.id 
              ? { ...d, status: 'error', error: data.error }
              : d
          )
          persistDownloads(updated)
          return updated
        })
        triggerToast(`Download failed: ${data.error}`)
      }))

      if (window.electronAPI.onExternalUrl) {
        unsubs.push(window.electronAPI.onExternalUrl((payload) => {
          let incomingUrl = payload;
          let autoDownload = false;
          let incomingQuality = 'best';
          if (typeof payload === 'object') {
            incomingUrl = payload.url;
            autoDownload = payload.autoDownload;
            if (payload.quality) incomingQuality = payload.quality;
          }
          
          if (autoDownload && window.electronAPI) {
            const id = Date.now().toString();
            const newDownload = {
              id,
              url: incomingUrl,
              title: 'Fetching details...',
              progress: 0,
              status: 'downloading',
              speed: '--',
              eta: '--'
            };
            setDownloads(prev => {
              const updated = [newDownload, ...prev];
              persistDownloads(updated);
              return updated;
            });
            window.electronAPI.downloadVideo(incomingUrl, id, incomingQuality, '', '');
            triggerToast('Auto-download started!');
          } else {
            setUrl(incomingUrl);
            triggerToast('Link received from Chrome!');
          }
        }))
      }
    }

    return () => unsubs.forEach(u => u())
  }, [triggerToast])

  const handleDownload = async (e) => {
    e.preventDefault()
    if (!url.trim()) return

    const id = Date.now().toString()
    const newDownload = {
      id,
      url,
      title: 'Fetching details...',
      progress: 0,
      status: 'downloading',
      speed: '--',
      eta: '--'
    }
    
    setDownloads(prev => [newDownload, ...prev])
    setUrl('')
    
    if (window.electronAPI) {
      window.electronAPI.downloadVideo(url, id, quality, startTime.trim(), endTime.trim())
    } else {
      triggerToast('Not in Electron environment')
    }
  }

  const handleCancel = (id) => {
    const dl = downloads.find(d => d.id === id)
    if (dl && dl.status === 'downloading' && window.electronAPI) {
      window.electronAPI.cancelDownload(id)
    }
    setDownloads(prev => {
      const updated = prev.filter(d => d.id !== id)
      persistDownloads(updated)
      return updated
    })
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setUrl(text)
    } catch {
      triggerToast('Could not read clipboard')
    }
  }

  const handleResetEngine = async () => {
    if (window.electronAPI) {
      await window.electronAPI.resetEngine()
      setDownloads(prev => {
        const updated = prev.map(d => 
          d.status === 'downloading' 
            ? { ...d, status: 'error', error: 'Forcefully Terminated by Hard Reset' }
            : d
        )
        persistDownloads(updated)
        return updated
      })
      triggerToast('Engine forcefully reset and temp files cleared.')
    }
  }

  const filteredDownloads = downloads.filter(d => {
    if (activeFilter === 'downloading') return d.status === 'downloading'
    if (activeFilter === 'completed') return d.status === 'complete'
    return true
  })

  const platforms = [
    { icon: Film, label: 'YouTube', color: '#ef4444' },
    { icon: Camera, label: 'Instagram', color: '#ec4899' },
    { icon: Music2, label: 'TikTok', color: '#06b6d4' },
    { icon: MessageCircle, label: 'X / Twitter', color: '#38bdf8' },
  ]

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'downloading', label: 'Downloading' },
    { key: 'completed', label: 'Completed' },
  ]

  return (
    <div className="w-full flex flex-col h-full animate-in fade-in duration-300" style={{ gap: '22px' }}>
      
      {/* Header */}
      <div>
        <h1 className="page-title">
          <Video size={20} style={{ color: '#818cf8' }} />
          Video Downloader
        </h1>
        <p className="subtitle">Download high-quality videos & audio directly to your local library</p>
      </div>

      {/* URL Input Card */}
      <form onSubmit={handleDownload}>
        <div className="input-wrapper">
          <div className="url-field">
            <LinkIcon size={16} style={{ color: '#64748b' }} />
            <input 
              type="text" 
              placeholder="Paste YouTube, TikTok, X, or IG video link..." 
              spellCheck="false"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          
          <select className="quality-select" value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="best" className="bg-[#1a1b2f]">4K Ultra HD</option>
            <option value="1080" className="bg-[#1a1b2f]">1080p HD</option>
            <option value="720" className="bg-[#1a1b2f]">720p HD</option>
            <option value="audio" className="bg-[#1a1b2f]">MP3 Audio Only</option>
          </select>

          <button type="button" className="paste-btn" onClick={handlePaste}>
            <Clipboard size={14} />
            Paste
          </button>

          <button type="submit" className="download-btn" disabled={!url.trim()}>
            <Download size={15} />
            Download
          </button>
        </div>
        
        {/* Rich Preview & Timestamps */}
        <AnimatePresence mode="popLayout">
          {(isFetchingInfo || videoInfo || fetchError) ? (
            <motion.div
              key="preview-card"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4"
            >
              {isFetchingInfo ? (
                <div className="flex items-center justify-center p-6 bg-white/5 rounded-2xl border border-white/10 text-slate-400 gap-2 text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  Fetching video details...
                </div>
              ) : fetchError ? (
                <div className="flex items-center justify-center p-6 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-400 gap-2 text-sm text-center font-medium">
                  <AlertCircle size={16} className="shrink-0" />
                  <div className="break-words max-w-xl">{fetchError}</div>
                </div>
              ) : videoInfo && (
                  <div className="media-card">
                    {/* 16:9 Clean Player Viewport */}
                    <div className="video-viewport" style={{ background: '#000' }}>
                      {videoInfo.extractor === 'Youtube' ? (
                        <webview 
                          ref={webviewRef}
                          src={`https://www.youtube.com/watch?v=${videoInfo.id}`}
                          style={{ width: '100%', height: '100%', background: 'black' }}
                          allowpopups="false"
                          useragent={videoInfo.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"}
                        />
                      ) : videoInfo.extractor === 'TikTok' ? (
                        <webview 
                          ref={webviewRef}
                          src={url}
                          style={{ width: '100%', height: '100%', background: 'black' }}
                          allowpopups="false"
                          useragent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
                        />
                      ) : videoInfo.previewUrl ? (
                        <webview 
                          ref={webviewRef}
                          src={`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:black;overflow:hidden;display:flex;align-items:center;justify-content:center"><video width="100%" height="100%" controls controlsList="nodownload" autoplay><source src="${videoInfo.previewUrl}"></video></body></html>`)}`}
                          style={{ width: '100%', height: '100%', background: 'black' }}
                          allowpopups="false"
                        />
                      ) : (
                        <img src={videoInfo.thumbnail || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&q=85"} alt="Video Preview" />
                      )}
                    </div>

                    {/* Meta Row Under Video */}
                    <div className="video-meta-row mt-3 px-1">
                          <div>
                            <h3 className="video-title-text">{videoInfo.title}</h3>
                            <p className="channel-subtext">
                              {videoInfo.uploader} • {Math.floor((videoInfo.duration||0)/60)}:{String((videoInfo.duration||0)%60).padStart(2,'0')} Duration
                              {videoInfo.filesize ? ` • ${formatBytes(videoInfo.filesize)}` : ''}
                            </p>
                          </div>
                          <span className="duration-pill">
                            {Math.floor((videoInfo.duration||0)/60)}:{String((videoInfo.duration||0)%60).padStart(2,'0')}
                          </span>
                    </div>

                  {/* Trimmer Slider Under Preview */}
                  {videoInfo.duration > 0 && (
                    <TimelineSlider 
                      duration={videoInfo.duration}
                      startTimeStr={startTime}
                      endTimeStr={endTime}
                      onChange={(start, end) => {
                        setStartTime(start)
                        setEndTime(end)
                      }}
                      onScrub={(timeSec) => {
                        if (webviewRef.current) {
                          webviewRef.current.executeJavaScript(`
                            (function() {
                              var v = document.querySelector('video');
                              if (v) v.currentTime = ${timeSec};
                              else if (window.player) window.player.seekTo(${timeSec}, true);
                            })()
                          `).catch(err => console.error("Seek error:", err));
                        }
                      }}
                    />
                  )}
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </form>

      {/* Supported Platforms */}
      <div className="supported-platforms">
        <span>Supported Platforms:</span>
        <span className="platform-pill"><Film size={12} color="#ef4444" /> YouTube</span>
        <span className="platform-pill"><Camera size={12} color="#ec4899" /> Instagram</span>
        <span className="platform-pill"><Music2 size={12} color="#06b6d4" /> TikTok</span>
        <span className="platform-pill"><MessageCircle size={12} color="#38bdf8" /> X / Twitter</span>
      </div>

      {/* Recent Downloads Section Header */}
      <div className="history-header">
        <h2>Active & Recent Downloads</h2>
        <div className="history-controls">
          <button
            type="button"
            onClick={handleResetEngine}
            className="filter-btn"
            style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.2)' }}
            title="Forcefully reset the downloader engine and clear stuck downloads"
          >
            <RefreshCcw size={13} />
            Hard Reset
          </button>
          <div className="filter-tabs">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`filter-btn ${activeFilter === f.key ? 'active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Downloads List or Empty State */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1" style={{ gap: '12px' }}>
        <AnimatePresence>
          {filteredDownloads.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
              style={{
                border: '1px dashed rgba(255,255,255,0.08)',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.015)',
                padding: '32px',
                gap: '12px',
                minHeight: '180px',
              }}
            >
              <div 
                className="flex items-center justify-center"
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  color: '#818cf8',
                }}
              >
                <ArrowDownToLine size={24} />
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0' }}>No downloads in progress</div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', maxWidth: '260px', lineHeight: 1.4 }}>
                Paste a valid video or reel link above and click Download to save it locally.
              </p>
            </motion.div>
          )}

          {filteredDownloads.map(download => (
            <motion.div 
              key={download.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative overflow-hidden"
              style={{
                background: 'rgba(26, 27, 47, 0.7)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px',
                padding: '14px 16px',
              }}
            >
              {/* Progress bar background fill */}
              {download.status === 'downloading' && (
                <div 
                  className="absolute inset-y-0 left-0 transition-all duration-300 ease-out z-0"
                  style={{ 
                    width: `${download.progress}%`,
                    background: 'linear-gradient(90deg, rgba(99,102,241,0.08), rgba(99,102,241,0.15))',
                  }}
                />
              )}
              
              <div className="relative z-10 flex justify-between items-start">
                <div className="min-w-0 pr-4 flex-1">
                  <h4 className="text-white/90 font-semibold truncate" style={{ fontSize: '0.92rem' }} title={download.title}>
                    {download.title}
                  </h4>
                  <div className="text-white/30 truncate" style={{ fontSize: '0.78rem', marginTop: '3px' }}>
                    {download.url}
                  </div>
                </div>
                <button 
                  onClick={() => handleCancel(download.id)}
                  className="p-1.5 hover:bg-white/10 rounded-full text-white/30 hover:text-white transition-colors shrink-0"
                  title={download.status === 'downloading' ? 'Cancel' : 'Remove'}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="relative z-10 flex items-center justify-between mt-2" style={{ fontSize: '0.82rem' }}>
                {download.status === 'downloading' && (
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex items-center gap-2" style={{ color: '#818cf8' }}>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Downloading {download.progress ? download.progress.toFixed(1) : 0}%</span>
                    </div>
                    <div className="flex gap-3" style={{ color: '#64748b' }}>
                      <span>{download.speed}</span>
                      <span>ETA: {download.eta}</span>
                    </div>
                    
                    {download.segments && download.segments.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3 w-full">
                        <span className="text-[0.65rem] text-slate-500 font-semibold uppercase tracking-widest">
                          Active Network Segments
                        </span>
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 w-full">
                          {download.segments.map((seg, idx) => {
                            const pct = seg.total > 0 ? (seg.downloaded / seg.total) * 100 : 0;
                            return (
                              <div key={seg.uid || idx} className="flex flex-col bg-black/20 rounded p-1.5 border border-white/5" title={`${pct.toFixed(1)}% - ${seg.speedStr}`}>
                                <div className="flex justify-between items-center text-[0.6rem] text-slate-400 mb-1">
                                  <span>#{idx + 1}</span>
                                  <span className="truncate max-w-[40px]" title={seg.speedStr}>{seg.speedStr}</span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden w-full">
                                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {download.status === 'complete' && (
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2" style={{ color: '#34d399', fontWeight: 600 }}>
                      <Download size={14} />
                      Complete
                    </div>
                    {download.filePath && (
                      <button
                        onClick={() => window.electronAPI?.openFolder(download.filePath)}
                        className="flex items-center gap-[5px] cursor-pointer transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#94a3b8',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8' }}
                      >
                        <FolderOpen size={13} />
                        Open Folder
                      </button>
                    )}
                  </div>
                )}
                {download.status === 'error' && (
                  <div style={{ color: '#f87171', fontWeight: 500 }}>
                    Error: {download.error}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
