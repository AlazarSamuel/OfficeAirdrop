import React, { useState, useEffect, useRef } from 'react'
import { Download, X, Video, PlayCircle, Loader2, Link as LinkIcon, Clipboard, ArrowDownToLine, Film, Camera, Music2, MessageCircle, FolderOpen, Clock, RefreshCcw, AlertCircle, SlidersHorizontal, Minus, Plus, Scissors, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import TimeInput from '../components/TimeInput'
import TimelineSlider from '../components/TimelineSlider'

export default function DownloaderView({ triggerToast, isPro, setShowPayModal, setPayModalReason }) {
  const [url, setUrl] = useState('')
  const [downloads, setDownloads] = useState([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [activeMode, setActiveMode] = useState('vod') // 'vod' or 'live'
  const [quality, setQuality] = useState('1080')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [customLiveDur, setCustomLiveDur] = useState('10')
  const [customLiveUnit, setCustomLiveUnit] = useState('minutes')
  const [videoInfo, setVideoInfo] = useState(null)
  const [isFetchingInfo, setIsFetchingInfo] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [recordingStartTime, setRecordingStartTime] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const webviewRef = useRef(null)
  const stageRef = useRef(null)
  const playerCardRef = useRef(null)

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return ''
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDuration = (secs) => {
    if (!secs || isNaN(secs)) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const getPlatformIcon = (itemUrl) => {
    if (!itemUrl) return <LinkIcon size={16} className="text-slate-400" />
    const lower = itemUrl.toLowerCase()
    
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-red-500">
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-1.94C18.88 4 12 4 12 4s-6.88 0-8.6.48a2.78 2.78 0 0 0-1.94 1.94C1 8.14 1 12 1 12s0 3.86.46 5.58a2.78 2.78 0 0 0 1.94 1.94C5.12 20 12 20 12 20s6.88 0 8.6-.48a2.78 2.78 0 0 0 1.94-1.94C23 15.86 23 12 23 12s0-3.86-.46-5.58zM9.54 15.54V8.46L15.82 12l-6.28 3.54z"/>
        </svg>
      )
    }
    
    if (lower.includes('instagram.com')) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-500">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
        </svg>
      )
    }
    
    if (lower.includes('twitter.com') || lower.includes('x.com')) {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-slate-200">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      )
    }
    
    if (lower.includes('facebook.com') || lower.includes('fb.watch')) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-blue-500">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
        </svg>
      )
    }
    
    if (lower.includes('tiktok.com')) {
      return <Music2 size={15} className="text-slate-100" />
    }
    
    return <LinkIcon size={15} className="text-slate-400" />
  }

  // Dynamically size the player card to exact 16:9 pixels
  useEffect(() => {
    const stage = stageRef.current;
    const card = playerCardRef.current;
    if (!stage || !card) return;

    let rafId = null;

    const autoFitPlayer = () => {
      const availW = stage.clientWidth;
      const availH = stage.clientHeight;
      if (availW === 0 || availH === 0) return;

      // Ensure this exactly matches CSS .video-info-bar height + borders
      // To be completely dynamic, you could measure the info bar DOM element, 
      // but hardcoding is fine if CSS is strictly maintained.
      const INFO_BAR_HEIGHT = 40; 
      const videoAvailH = Math.max(0, availH - INFO_BAR_HEIGHT);

      // Width-bound calculation first
      let targetW = availW;
      let targetH = targetW * (9 / 16) + INFO_BAR_HEIGHT;

      // If exceeding available height, flip to height-bound calculation
      if (targetH > availH) {
        targetW = videoAvailH * (16 / 9);
        targetH = videoAvailH + INFO_BAR_HEIGHT;
      }

      // Apply direct styles to bypass React state latency on drag
      card.style.width = `${Math.floor(targetW)}px`;
      card.style.height = `${Math.floor(targetH)}px`;
    };

    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to sync with browser paint and avoid thrashing
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(autoFitPlayer);
    });

    resizeObserver.observe(stage);
    
    // Initial call
    autoFitPlayer();

    return () => {
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [videoInfo]);

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
          if (info && info.is_live) {
            setActiveMode('live')
            triggerToast('Live Stream detected! Switching to Live Studio.')
          }
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
              ? { ...d, status: 'complete', title: data.title || d.title, progress: 100, filePath: data.path || '', finalSize: data.finalSize, duration: data.duration, completedAt: Date.now() }
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

    // Pro Tier Interception
    if (!isPro) {
      if (quality === '4K') {
        triggerToast('Blocked: 4K video downloads are a Pro feature.')
        setPayModalReason('Native 4K video downloads are a Pro feature.')
        setShowPayModal(true)
        return
      }
      if (startTime.trim() || endTime.trim()) {
        triggerToast('Blocked: High-speed clipping is a Pro feature.')
        setPayModalReason('Advanced high-speed video clipping is a Pro feature.')
        setShowPayModal(true)
        return
      }
    }

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
      let text = '';
      if (window.electronAPI && window.electronAPI.readClipboard) {
        text = await window.electronAPI.readClipboard();
      } else {
        text = await navigator.clipboard.readText();
      }
      if (text) setUrl(text);
    } catch {
      triggerToast('Could not read clipboard');
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
    <div className="w-full flex flex-col flex-1 animate-in fade-in duration-300 mx-auto" style={{ gap: '22px', maxWidth: '1000px', padding: '32px 48px', alignSelf: 'center' }}>
      
      {/* Page Header */}
      <div className="page-header w-full mb-6" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
        <h1 className="page-title" style={{ justifyContent: 'flex-start' }}>
          <Video size={24} color="#818cf8" />
          Video Downloader
        </h1>
        <p className="subtitle">Download high-quality videos & audio directly to your local library</p>
      </div>

      {/* Platforms Ribbon with Crisp Vector Brand SVGs */}
      <div className="platforms-ribbon shrink-0">
        <span className="platforms-label">Supported Platforms:</span>
        <div className="platforms-list">
          <div className="platform-tag">
            <svg className="brand-svg" viewBox="0 0 24 24" fill="none">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
              <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#ffffff"/>
            </svg>
            <span>YouTube</span>
          </div>
          <div className="platform-tag">
            <svg className="brand-svg" viewBox="0 0 24 24" fill="none">
              <defs>
                <radialGradient id="ig-grad" cx="20%" cy="105%" r="115%">
                  <stop offset="0%" stopColor="#fdf497"/>
                  <stop offset="15%" stopColor="#fdf497"/>
                  <stop offset="45%" stopColor="#fd5949"/>
                  <stop offset="60%" stopColor="#d6249f"/>
                  <stop offset="90%" stopColor="#285AEB"/>
                </radialGradient>
              </defs>
              <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig-grad)"/>
              <rect x="5.5" y="5.5" width="13" height="13" rx="3.5" stroke="#ffffff" strokeWidth="1.6" fill="none"/>
              <circle cx="12" cy="12" r="3.2" stroke="#ffffff" strokeWidth="1.6" fill="none"/>
              <circle cx="16.3" cy="7.7" r="0.8" fill="#ffffff"/>
            </svg>
            <span>Instagram</span>
          </div>
          <div className="platform-tag">
            <svg className="brand-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#00f2fe"/>
              <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#fe2c55" style={{ mixBlendMode: 'screen' }}/>
            </svg>
            <span>TikTok</span>
          </div>
          <div className="platform-tag">
            <svg className="brand-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="#f8fafc"/>
            </svg>
            <span>X / Twitter</span>
          </div>
          <div className="platform-tag">
            <svg className="brand-svg" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="11" fill="#1877F2"/>
              <path d="M13.5 22V13.8h2.8l.4-3.2h-3.2V8.6c0-.9.3-1.6 1.6-1.6h1.7V4.2c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2H7v3.2h2.8V22h3.7z" fill="#ffffff"/>
            </svg>
            <span>Facebook</span>
          </div>
        </div>
      </div>

      {/* Video Mode Toggle */}
      <div className="mode-switch relative">
        <button 
          type="button"
          onClick={() => setActiveMode('vod')}
          className={`mode-btn relative z-10 ${activeMode === 'vod' ? 'active' : ''}`}
        >
          {activeMode === 'vod' && (
            <motion.div 
              layoutId="mode-pill-dl" 
              className="absolute inset-0 bg-[#252843] rounded-[7px] border border-white/5"
              style={{ zIndex: -1 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
            />
          )}
          <Film size={14} color={activeMode === 'vod' ? "#818cf8" : "currentColor"} />
          Standard Video
        </button>
        <button 
          type="button"
          onClick={() => setActiveMode('live')}
          className={`mode-btn relative z-10 ${activeMode === 'live' ? 'active' : ''}`}
        >
          {activeMode === 'live' && (
            <motion.div 
              layoutId="mode-pill-dl" 
              className="absolute inset-0 bg-[#252843] rounded-[7px] border border-white/5"
              style={{ zIndex: -1 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
            />
          )}
          <div className={`w-1.5 h-1.5 rounded-full ${activeMode === 'live' ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`} />
          Live Broadcast
        </button>
      </div>

      <form onSubmit={handleDownload} className="flex flex-col flex-1 w-full">
        {/* All-in-One Download Input Bar */}
        <div className={`download-bar shrink-0 ${isFetchingInfo ? 'opacity-70 pointer-events-none' : ''}`}>
          <LinkIcon className="link-icon" size={18} />
          <input 
            type="text" 
            className="url-input" 
            placeholder={activeMode === 'live' ? "Paste an active live stream URL here..." : "Paste YouTube, TikTok, X, or IG video link..."} 
            spellCheck="false"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onContextMenu={(e) => { e.preventDefault(); handlePaste(); }}
            onKeyDown={(e) => {
              if (e.key.toLowerCase() === 'v' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handlePaste();
              }
            }}
            readOnly={isFetchingInfo}
          />
          <div className="bar-controls">
            <select 
              className="quality-select"
              value={quality} 
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'best' && !isPro) {
                  setPayModalReason('4K & 8K Resolution');
                  setShowPayModal(true);
                  return;
                }
                setQuality(val);
              }}
            >
              <option value="best">4K Ultra HD (Pro)</option>
              <option value="1080">1080p HD</option>
              <option value="720">720p HD</option>
              <option value="audio">Audio Only (MP3)</option>
            </select>
            <button type="button" className="btn-paste" onClick={handlePaste}>
              <Clipboard size={14} /> Paste
            </button>
            <button type="submit" className="btn-download" disabled={!url.trim() || isFetchingInfo}>
              {isFetchingInfo ? <Loader2 size={15} className="spinner animate-spin" /> : <ArrowDownToLine size={15} />}
              {isFetchingInfo ? 'Loading...' : 'Download'}
            </button>
          </div>
        </div>
        
        {/* Rich Preview & Timestamps */}
        <div className="stage-wrapper mt-6 flex flex-col flex-1 w-full relative">
          {isFetchingInfo ? (
            <div className="fetching-stage" style={{ display: 'flex' }}>
              <div className="loader-ring-wrap">
                <div className="loader-ring"></div>
                <div className="loader-center-icon">
                  <Sparkles size={20} />
                </div>
              </div>

              <div className="fetching-text-group">
                <div className="fetching-title">Fetching video metadata...</div>
                <div className="fetching-sub">Resolving stream for: {url || 'active link'}</div>
              </div>

              {/* Animated Shimmer Bar */}
              <div className="skeleton-strip">
                <div className="skeleton-shimmer"></div>
              </div>
            </div>
          ) : fetchError ? (
            <div className="flex items-center justify-center p-6 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-400 gap-2 text-sm text-center font-medium">
              <AlertCircle size={16} className="shrink-0" />
              <div className="break-words max-w-xl">{fetchError}</div>
            </div>
          ) : videoInfo ? (
              <>
                <div className="player-theater-stage" ref={stageRef}>
                  <div className="player-card-adaptive" ref={playerCardRef}>
                    <div className="video-viewport-16-9">
                      <AnimatePresence>
                    {countdown !== null && (
                      <motion.div 
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-none"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      >
                        <motion.div
                          key={countdown}
                          initial={{ scale: 0.2, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 1.5, opacity: 0 }}
                          transition={{ type: 'spring', duration: 0.5 }}
                          className="text-[12rem] font-black text-white drop-shadow-[0_0_30px_rgba(239,68,68,0.8)] leading-none"
                        >
                          {countdown}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {recordingStartTime && (
                    <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full border border-red-500/30 pointer-events-none">
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                      <span className="text-red-400 font-bold tracking-widest text-sm">REC</span>
                    </div>
                  )}
                  {videoInfo.extractor === 'Youtube' && videoInfo.isLive ? (
                    <webview 
                      ref={webviewRef}
                      src={`data:text/html;charset=utf-8,${encodeURIComponent(`
                        <html>
                          <body style="margin:0;background:black;overflow:hidden;display:flex;align-items:center;justify-content:center">
                            <video id="video" width="100%" height="100%" autoplay></video>
                            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
                            <script>
                              var video = document.getElementById('video');
                                  var url = "${videoInfo.manifestUrl}";
                                  if (Hls.isSupported()) {
                                    var hls = new Hls();
                                    hls.loadSource(url);
                                    hls.attachMedia(video);
                                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                                      video.play().catch(e => console.log(e));
                                    });
                                    window.player = { seekTo: function(timeSec) { video.currentTime = timeSec; } };
                                  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                                    video.src = url;
                                    video.addEventListener('loadedmetadata', function() {
                                      video.play().catch(e => console.log(e));
                                    });
                                    window.player = { seekTo: function(timeSec) { video.currentTime = timeSec; } };
                                  }
                                </script>
                              </body>
                            </html>
                          `)}`}
                          style={{ width: '100%', height: '100%', background: 'black' }}
                          allowpopups="false"
                        />
                      ) : videoInfo.extractor === 'Youtube' ? (
                        <webview 
                          ref={(el) => {
                            webviewRef.current = el;
                            if (el && !el._cssInjected) {
                              el._cssInjected = true;
                              el.addEventListener('dom-ready', () => {
                                // Step 1: Inject simplified CSS to hide Chrome and allow player to expand
                                el.insertCSS(`
                                  #masthead-container, #primary-button, #below, #comments, #secondary,
                                  ytd-merch-shelf-renderer, ytd-engagement-panel-section-list-renderer,
                                  #related, #meta, #info, ytd-live-chat-frame, #ticket-shelf, #chat,
                                  ytd-watch-flexy[flexy] #player-overlays { display: none !important; }

                                  html, body, ytd-app, #content, #page-manager, ytd-watch-flexy {
                                    background: #000 !important;
                                    overflow: hidden !important;
                                    margin: 0 !important; padding: 0 !important;
                                    width: 100% !important; height: 100% !important;
                                  }

                                  #player-container-outer, #player-container-inner, #player-container, #ytd-player, #player,
                                  #player-theater-container, #player-full-bleed-container,
                                  .html5-video-player, .html5-video-container {
                                    position: fixed !important;
                                    top: 0 !important; left: 0 !important;
                                    width: 100% !important; height: 100% !important;
                                    max-width: 100% !important; max-height: 100% !important;
                                    margin: 0 !important; padding: 0 !important;
                                    z-index: 99999 !important;
                                  }

                                  .html5-main-video {
                                    position: absolute !important;
                                    width: 100% !important; height: 100% !important;
                                    top: 0 !important; left: 0 !important;
                                    transform: none !important;
                                    object-fit: contain !important;
                                  }
                                `).catch(() => {});

                                // Step 2: Lightweight JS to enforce 100% sizing against YouTube's active resizing
                                el.executeJavaScript(`
                                  (function() {
                                    let lastRun = 0;
                                    function forceResize() {
                                      const now = Date.now();
                                      if (now - lastRun < 100) return; // Throttle to 10fps max
                                      lastRun = now;
                                      
                                      const v = document.querySelector('.html5-main-video');
                                      if (v) {
                                        v.style.setProperty('width', '100%', 'important');
                                        v.style.setProperty('height', '100%', 'important');
                                      }
                                    }

                                    // Trigger theater mode so YouTube doesn't cap the size
                                    function tryTheater() {
                                      const flexy = document.querySelector('ytd-watch-flexy');
                                      if (flexy && !flexy.hasAttribute('theater')) {
                                        const btn = document.querySelector('.ytp-size-button');
                                        if (btn) btn.click();
                                      }
                                    }

                                    // Use a throttled MutationObserver on just the video container
                                    const vc = document.querySelector('.html5-video-container');
                                    if (vc) {
                                      new MutationObserver(forceResize).observe(vc, { attributes: true, attributeFilter: ['style', 'width', 'height'] });
                                    }

                                    setInterval(forceResize, 200);
                                    setTimeout(tryTheater, 1500);
                                    setTimeout(tryTheater, 3000);
                                  })();
                                `).catch(() => {});
                              });
                            }
                          }}
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

                        {/* Integrated 40px Info Bar */}
                        <div className="video-info-bar">
                          <span className="video-title" title={videoInfo?.title}>
                            {videoInfo?.title}
                          </span>
                          <div className="video-sub">
                            <span>{videoInfo?.uploader}</span>
                            <span>•</span>
                            {videoInfo.is_live ? (
                              <span style={{ color: '#f87171', fontWeight: 600 }}>LIVE (16:9)</span>
                            ) : (
                              <span>{Math.floor((videoInfo.duration||0)/60)}:{String((videoInfo.duration||0)%60).padStart(2,'0')}</span>
                            )}
                            {videoInfo.filesize ? <span>• {formatBytes(videoInfo.filesize)}</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>

                  {/* Live Studio Controls OR Trimmer Slider Under Preview */}
                  {videoInfo.is_live ? (
                    <div className="mt-4 p-4 bg-red-950/20 border border-red-500/20 rounded-xl flex flex-col gap-4 shrink-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-red-400 font-bold text-sm tracking-widest uppercase">Live Studio</span>
                        </div>
                        <span className="text-xs text-red-400/60 uppercase tracking-widest">Instant Replay</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <button type="button" className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300 font-medium transition-colors" 
                          onClick={async () => {
                            const id = Date.now().toString()
                            setDownloads(prev => [{ id, url, title: 'Syncing live edge...', progress: 0, status: 'downloading', speed: '--', eta: '--' }, ...prev])
                            try {
                              const freshInfo = await window.electronAPI.fetchVideoInfo(url.trim());
                              window.electronAPI.startLiveClip(url.trim(), 30, freshInfo.duration || 0, freshInfo.title, id);
                            } catch (err) {
                              setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'error', error: 'Sync failed' } : d));
                            }
                          }}>
                          ⏪ Last 30s
                        </button>
                        <button type="button" className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300 font-medium transition-colors" 
                          onClick={async () => {
                            const id = Date.now().toString()
                            setDownloads(prev => [{ id, url, title: 'Syncing live edge...', progress: 0, status: 'downloading', speed: '--', eta: '--' }, ...prev])
                            try {
                              const freshInfo = await window.electronAPI.fetchVideoInfo(url.trim());
                              window.electronAPI.startLiveClip(url.trim(), 60, freshInfo.duration || 0, freshInfo.title, id);
                            } catch (err) {
                              setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'error', error: 'Sync failed' } : d));
                            }
                          }}>
                          ⏪ Last 1 min
                        </button>
                        <button type="button" className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300 font-medium transition-colors" 
                          onClick={async () => {
                            const id = Date.now().toString()
                            setDownloads(prev => [{ id, url, title: 'Syncing live edge...', progress: 0, status: 'downloading', speed: '--', eta: '--' }, ...prev])
                            try {
                              const freshInfo = await window.electronAPI.fetchVideoInfo(url.trim());
                              window.electronAPI.startLiveClip(url.trim(), 300, freshInfo.duration || 0, freshInfo.title, id);
                            } catch (err) {
                              setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'error', error: 'Sync failed' } : d));
                            }
                          }}>
                          ⏪ Last 5 min
                        </button>
                      </div>

                      {/* Polished Custom Clip Toolbar */}
                      <div className="custom-clip-toolbar">
                        <div className="custom-clip-label">
                          <SlidersHorizontal size={14} color="#818cf8" />
                          <span>Custom Buffer:</span>
                        </div>

                        <div className="duration-control-wrap">
                          <div className="num-stepper">
                            <button className="num-stepper-btn" onClick={() => {
                              const val = Math.max(1, (parseInt(customLiveDur, 10) || 1) - 1);
                              setCustomLiveDur(String(val));
                            }}>
                              <Minus size={12} />
                            </button>
                            <input 
                              type="number"
                              className="num-stepper-val"
                              value={customLiveDur}
                              onChange={(e) => setCustomLiveDur(e.target.value)}
                            />
                            <button className="num-stepper-btn" onClick={() => {
                              const val = Math.max(1, (parseInt(customLiveDur, 10) || 1) + 1);
                              setCustomLiveDur(String(val));
                            }}>
                              <Plus size={12} />
                            </button>
                          </div>

                          <select 
                            className="unit-select"
                            value={customLiveUnit}
                            onChange={(e) => setCustomLiveUnit(e.target.value)}
                          >
                            <option value="minutes">Minutes</option>
                            <option value="seconds">Seconds</option>
                          </select>
                        </div>

                        <button 
                          className="btn-capture-custom"
                          onClick={async () => {
                            let val = parseInt(customLiveDur, 10);
                            if (isNaN(val) || val <= 0) return triggerToast('Invalid duration');
                            if (customLiveUnit === 'minutes') val *= 60;
                            if (val > 3600) return triggerToast('Maximum custom live clip is 1 hour (3600s)');
                            
                            const id = Date.now().toString()
                            setDownloads(prev => [{ id, url, title: 'Syncing live edge...', progress: 0, status: 'downloading', speed: '--', eta: '--' }, ...prev])
                            try {
                              const freshInfo = await window.electronAPI.fetchVideoInfo(url.trim());
                              window.electronAPI.startLiveClip(url.trim(), val, freshInfo.duration || 0, freshInfo.title, id);
                            } catch (err) {
                              setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'error', error: 'Sync failed' } : d));
                            }
                          }}
                        >
                          <Scissors size={13} />
                          Clip Buffer
                        </button>
                      </div>

                      <button type="button" 
                        className={`w-full mt-2 py-3 rounded-lg font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 ${
                          recordingStartTime ? 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse' : 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400'
                        }`}
                        onClick={async () => {
                          if (recordingStartTime) {
                            // STOP Recording
                            const durationSec = Math.max(1, Math.floor((Date.now() - recordingStartTime) / 1000));
                            setRecordingStartTime(null);
                            triggerToast(`Time-shifted capture: grabbing last ${durationSec}s...`);
                            
                            const id = Date.now().toString();
                            setDownloads(prev => [{ id, url, title: `Syncing ${durationSec}s capture...`, progress: 0, status: 'downloading', speed: '--', eta: '--' }, ...prev]);
                            try {
                              const freshInfo = await window.electronAPI.fetchVideoInfo(url.trim());
                              window.electronAPI.startLiveClip(url.trim(), durationSec, freshInfo.duration || 0, freshInfo.title, id);
                            } catch (err) {
                              setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'error', error: 'Sync failed' } : d));
                            }
                          } else {
                            // START Recording Countdown
                            if (countdown !== null) return; // already counting down
                            
                            setCountdown(3);
                            for (let i = 2; i >= 1; i--) {
                              await new Promise(r => setTimeout(r, 1000));
                              setCountdown(i);
                            }
                            await new Promise(r => setTimeout(r, 1000));
                            setCountdown(null);
                            setRecordingStartTime(Date.now());
                            triggerToast('Recording started! Press Stop to capture.');
                          }
                        }}>
                        {recordingStartTime ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            STOP RECORDING
                          </>
                        ) : countdown !== null ? (
                          `STARTING IN ${countdown}...`
                        ) : (
                          <>
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            START RECORDING
                          </>
                        )}
                      </button>
                    </div>
                  ) : videoInfo.duration > 0 && (
                    <div className="mt-4 shrink-0">
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
                    </div>
                  )}
                  </>
          ) : (
            <div className="empty-state" style={{ display: 'flex' }}>
              <div className="empty-icon-box">
                <ArrowDownToLine size={22} />
              </div>
              <div className="empty-title">Ready for downloads</div>
              <p className="empty-desc">Paste any video URL above to extract high-bitrate media directly to your drive.</p>
            </div>
          )}
        </div>
      </form>

      {downloads.length > 0 && (
        <>
          {/* Recent Downloads Section Header */}
          <div className="history-header shrink-0">
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

      {/* Downloads List */}
      <div className="flex flex-col shrink-0 pr-1 pb-8" style={{ gap: '12px' }}>
        <AnimatePresence>
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
                <div className="min-w-0 pr-4 flex-1 flex items-start gap-3">
                  <div className="mt-[2px] bg-white/5 p-1.5 rounded-md flex-shrink-0">
                    {getPlatformIcon(download.url)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-white/90 font-semibold truncate" style={{ fontSize: '0.92rem' }} title={download.title}>
                      {download.title}
                    </h4>
                    <div className="text-white/30 truncate" style={{ fontSize: '0.78rem', marginTop: '3px' }}>
                      {download.url}
                    </div>
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
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2" style={{ color: '#34d399', fontWeight: 600 }}>
                        <Download size={14} />
                        Complete
                      </div>
                      {(() => {
                        const parts = [];
                        if (download.finalSize && download.finalSize !== 'Unknown') parts.push(download.finalSize);
                        if (download.duration > 0) parts.push(formatDuration(download.duration));
                        if (download.completedAt) {
                          const dt = new Date(download.completedAt);
                          parts.push(dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
                        }
                        if (parts.length === 0) return null;
                        return (
                          <div className="flex items-center gap-2" style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500, paddingLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                            {parts.map((p, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <span>•</span>}
                                <span>{p}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        );
                      })()}
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
        </>
      )}
    </div>
  )
}
