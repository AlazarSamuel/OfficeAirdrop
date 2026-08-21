import { useState, useEffect } from 'react'
import { Image as ImageIcon, X, Loader2, PlayCircle, Plus, Settings2, CheckCircle2, MonitorPlay, Timer, Minus, ImagePlus, Clock, Sparkles, ChevronUp, ChevronDown, Trash2, ListRestart, GripVertical } from 'lucide-react'
import { motion, AnimatePresence, Reorder } from 'motion/react'

export default function SlideMakerView({ triggerToast }) {
  const [images, setImages] = useState([])
  const [duration, setDuration] = useState(3)
  const [transition, setTransition] = useState('fade')
  const [status, setStatus] = useState('idle') // idle, processing, complete, error
  const [lastOutput, setLastOutput] = useState(null)

  const adjustDuration = (delta) => {
    setDuration(prev => Math.max(1, Math.min(15, prev + delta)))
  }

  useEffect(() => {
    let unsubs = []
    if (window.electronAPI) {
      if (window.electronAPI.onSlideshowProgress) {
        unsubs.push(window.electronAPI.onSlideshowProgress(() => {
          setStatus('processing')
        }))
      }
      if (window.electronAPI.onSlideshowComplete) {
        unsubs.push(window.electronAPI.onSlideshowComplete((result) => {
          setStatus('complete')
          setLastOutput(result.path)
          triggerToast('Slideshow generation complete!')
        }))
      }
      if (window.electronAPI.onSlideshowError) {
        unsubs.push(window.electronAPI.onSlideshowError((error) => {
          setStatus('error')
          triggerToast(`Failed: ${error}`)
        }))
      }
    }
    return () => unsubs.forEach(u => u())
  }, [triggerToast])

  const handlePickImages = async () => {
    if (!window.electronAPI) return
    try {
      const files = await window.electronAPI.pickFiles({ type: 'images' })
      if (files && files.length > 0) {
        const imageFiles = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i))
        if (imageFiles.length === 0) {
          triggerToast('No valid images selected.')
          return
        }
        setImages(prev => [...prev, ...imageFiles.map(path => ({ id: window.crypto.randomUUID(), path }))])
      }
    } catch (e) {
      triggerToast('Error picking images')
    }
  }

  const handleRemoveImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleMoveImage = (index, direction) => {
    setImages(prev => {
      const newImages = [...prev];
      if (direction === 'up' && index > 0) {
        [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
      } else if (direction === 'down' && index < newImages.length - 1) {
        [newImages[index + 1], newImages[index]] = [newImages[index], newImages[index + 1]];
      }
      return newImages;
    });
  }

  const handleClearAll = () => {
    setImages([])
    setStatus('idle')
    setLastOutput(null)
  }

  const handleStartNew = () => {
    handleClearAll()
  }

  const handleGenerate = async () => {
    if (images.length === 0) return
    if (!window.electronAPI) return
    setStatus('processing')
    setLastOutput(null)
    await window.electronAPI.createSlideshow(images.map(img => img.path), duration, transition)
  }

  const handleOpenFolder = () => {
    if (lastOutput && window.electronAPI) {
      window.electronAPI.openFolder(lastOutput)
    }
  }

  return (
    <div className="w-full h-full flex flex-col animate-fade-in" style={{ padding: '28px 36px', gap: '18px', paddingBottom: '80px' }}>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <ImageIcon size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>Slide Maker</h1>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0, marginTop: '2px' }}>
              Instantly turn your photos into cinematic landscape videos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <MonitorPlay size={14} color="#94a3b8" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1' }}>1080p Full HD • 16:9</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-[18px]">
        
        {/* Configuration Ribbon */}
        <div 
          className="flex items-center gap-[16px]"
          style={{
            background: 'rgba(26, 27, 47, 0.7)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '12px 18px'
          }}
        >
          <div className="flex items-center gap-[10px]">
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
              <Timer size={15} color="#818cf8" />
              Duration / Slide:
            </span>
            <div className="flex items-center" style={{ background: 'rgba(0, 0, 0, 0.35)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
              <button 
                onClick={() => adjustDuration(-1)}
                className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer text-slate-400 hover:text-white"
              >
                <Minus size={13} />
              </button>
              <span className="w-8 text-center font-semibold text-slate-200 text-sm">
                {duration}s
              </span>
              <button 
                onClick={() => adjustDuration(1)}
                className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer text-slate-400 hover:text-white"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-[10px]">
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
              <Sparkles size={15} color="#818cf8" />
              Transition:
            </span>
            <select 
              value={transition}
              onChange={e => setTransition(e.target.value)}
              className="outline-none"
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              <option value="random" style={{ background: '#121324' }}>Random (Mix & Match)</option>
              <option value="fade" style={{ background: '#121324' }}>Smooth Fade (Ken Burns)</option>
              <option value="slideleft" style={{ background: '#121324' }}>Dynamic Slide Left</option>
              <option value="circlecrop" style={{ background: '#121324' }}>Cinematic Circle Wipe</option>
              <option value="pixelize" style={{ background: '#121324' }}>Digital Pixelize</option>
            </select>
          </div>
        </div>

        {/* Dropzone / List */}
        <div className="flex-1 min-h-0 flex flex-col" style={{ gap: '10px' }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Selected Images <span style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8', padding: '2px 7px', borderRadius: '10px', fontSize: '0.75rem' }}>{images.length} photos</span>
            </span>
            {images.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-[6px] cursor-pointer transition-all"
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#f87171',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    padding: '6px 14px',
                    borderRadius: '8px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; e.currentTarget.style.color = '#fca5a5' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#f87171' }}
                >
                  <Trash2 size={14} /> Clear All
                </button>
                <button
                  onClick={handlePickImages}
                  className="flex items-center gap-[6px] cursor-pointer transition-all"
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#a5b4fc',
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    padding: '6px 14px',
                    borderRadius: '8px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)'; e.currentTarget.style.color = '#a5b4fc' }}
                >
                  <Plus size={14} /> Add Photos
                </button>
              </div>
            )}
          </div>

          <div 
            className="flex-1 overflow-y-auto"
            style={{
              background: 'rgba(255, 255, 255, 0.015)',
              border: '2px dashed rgba(255, 255, 255, 0.1)',
              borderRadius: '16px'
            }}
          >
            {images.length === 0 ? (
              <div 
                className="h-full flex flex-col items-center justify-center transition-colors cursor-pointer group"
                style={{ padding: '28px', gap: '12px' }}
                onClick={handlePickImages}
              >
                <div 
                  className="rounded-2xl flex items-center justify-center transition-colors"
                  style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', color: '#818cf8' }}
                >
                  <ImagePlus size={24} />
                </div>
                <div className="text-center" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Drag & drop photos here</h3>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>or click to browse from your computer or connected devices</p>
                </div>
                <div className="flex items-center mt-[4px]" style={{ gap: '6px' }}>
                  {['JPG', 'PNG', 'HEIC', 'WEBP'].map(fmt => (
                    <span key={fmt} style={{ fontSize: '0.7rem', color: '#64748b', background: 'rgba(255, 255, 255, 0.03)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence>
                <Reorder.Group axis="y" values={images} onReorder={setImages} className="p-4 flex flex-col gap-2">
                  {images.map((img, idx) => (
                    <Reorder.Item
                      key={img.id}
                      value={img}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      className="flex items-center justify-between rounded-lg p-3 group cursor-grab active:cursor-grabbing"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.05)'
                      }}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <GripVertical size={16} className="text-white/20 group-hover:text-white/40 cursor-grab active:cursor-grabbing" />
                        <div 
                          className="w-10 h-10 rounded overflow-hidden bg-black/50 flex-shrink-0"
                          style={{
                            backgroundImage: `url('file:///${img.path.replace(/\\/g, '/')}')`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                          }}
                        />
                        <span 
                          style={{ fontSize: '0.85rem', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          title={img.path}
                        >
                          {img.path.split(/[/\\]/).pop()}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveImage(idx, 'up'); }}
                          disabled={idx === 0}
                          className="p-1 cursor-pointer rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Up"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveImage(idx, 'down'); }}
                          disabled={idx === images.length - 1}
                          className="p-1 cursor-pointer rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Down"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-1"></div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveImage(idx); }}
                          className="p-1 cursor-pointer rounded hover:bg-red-500/20 text-red-400"
                          title="Remove Photo"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Generate Actions */}
        <div className="flex flex-col gap-3">
          {status === 'complete' && (
            <div 
              className="flex items-center justify-between p-3 rounded-xl mb-2"
              style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
            >
              <div className="flex items-center gap-2" style={{ color: '#34d399', fontSize: '0.85rem', fontWeight: 500 }}>
                <CheckCircle2 size={16} />
                Video Generated Successfully
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleStartNew}
                  className="cursor-pointer transition-colors"
                  style={{ fontSize: '0.8rem', fontWeight: 600, color: '#34d399', background: 'rgba(52, 211, 153, 0.15)', padding: '4px 12px', borderRadius: '6px' }}
                >
                  Start New
                </button>
                <button
                  onClick={handleOpenFolder}
                  className="cursor-pointer transition-colors"
                  style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', background: '#34d399', padding: '4px 12px', borderRadius: '6px' }}
                >
                  Open Folder
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between" style={{ paddingTop: '6px' }}>
            <div className="flex items-center gap-[6px]" style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
              <Clock size={15} />
              <span>Est. Video Length: <strong style={{ color: '#f1f5f9' }}>{images.length * duration} seconds</strong></span>
            </div>
            
            <button
              onClick={handleGenerate}
              disabled={images.length === 0 || status === 'processing'}
              className="flex items-center justify-center gap-[8px] cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              style={{
                padding: '10px 22px',
                borderRadius: '10px',
                background: images.length === 0 ? 'rgba(255,255,255,0.05)' : '#6366f1',
                color: images.length === 0 ? '#94a3b8' : '#fff',
                fontSize: '0.88rem',
                boxShadow: images.length === 0 ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.35)',
                transform: status === 'processing' || images.length === 0 ? 'none' : 'translateY(0)'
              }}
              onMouseEnter={e => { if(images.length > 0 && status !== 'processing') { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.45)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { if(images.length > 0 && status !== 'processing') { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.35)'; e.currentTarget.style.transform = 'translateY(0)' } }}
            >
              {status === 'processing' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Rendering...
                </>
              ) : (
                <>
                  <PlayCircle size={16} />
                  Generate Slideshow
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
