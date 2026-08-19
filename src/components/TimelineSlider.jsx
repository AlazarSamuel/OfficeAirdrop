import React, { useState, useEffect, useRef, useCallback } from 'react';

// Helper to convert "HH:MM:SS" or "MM:SS" to total seconds
function timeStringToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number).reverse();
  let secs = 0;
  if (parts[0]) secs += parts[0];
  if (parts[1]) secs += parts[1] * 60;
  if (parts[2]) secs += parts[2] * 3600;
  return secs;
}

// Helper to convert seconds to "HH:MM:SS" or "MM:SS"
function secondsToTimeString(seconds, forceHours = false) {
  if (isNaN(seconds)) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0 || forceHours) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  } else {
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}

export default function TimelineSlider({ duration, startTimeStr, endTimeStr, onChange, onScrub }) {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(null); // 'left' or 'right'
  
  // Internal state in seconds for smooth dragging
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(duration || 0);

  // Sync internal state with external props when not dragging
  useEffect(() => {
    if (!isDragging) {
      const parsedStart = timeStringToSeconds(startTimeStr);
      const parsedEnd = endTimeStr ? timeStringToSeconds(endTimeStr) : duration;
      
      setStartSec(Math.min(parsedStart, duration));
      setEndSec(Math.min(parsedEnd || duration, duration));
    }
  }, [startTimeStr, endTimeStr, duration, isDragging]);

  const handlePointerDown = (e, thumb) => {
    e.preventDefault();
    setIsDragging(thumb);
  };

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !trackRef.current || !duration) return;

    const rect = trackRef.current.getBoundingClientRect();
    let clientX = e.clientX;
    
    // Handle touch events
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    }

    // Calculate percentage and new seconds
    let percentage = (clientX - rect.left) / rect.width;
    percentage = Math.max(0, Math.min(1, percentage));
    
    let newSec = Math.round(percentage * duration);

    if (isDragging === 'left') {
      newSec = Math.min(newSec, endSec - 1); // Left thumb can't cross right thumb
      newSec = Math.max(0, newSec);
      if (newSec !== startSec) {
        setStartSec(newSec);
        if (onScrub) onScrub(newSec);
      }
    } else if (isDragging === 'right') {
      newSec = Math.max(newSec, startSec + 1); // Right thumb can't cross left thumb
      newSec = Math.min(duration, newSec);
      if (newSec !== endSec) {
        setEndSec(newSec);
        if (onScrub) onScrub(newSec);
      }
    }
  }, [isDragging, duration, startSec, endSec, onScrub]);

  const handlePointerUp = useCallback(() => {
    if (isDragging) {
      // Commit changes to parent
      const forceHours = duration >= 3600;
      
      const newStartStr = startSec > 0 ? secondsToTimeString(startSec, forceHours) : '';
      const newEndStr = endSec < duration ? secondsToTimeString(endSec, forceHours) : '';
      
      if (onChange) {
        onChange(newStartStr, newEndStr);
      }
      setIsDragging(null);
    }
  }, [isDragging, startSec, endSec, duration, onChange]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('touchend', handlePointerUp);
      return () => {
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('mouseup', handlePointerUp);
        window.removeEventListener('touchmove', handlePointerMove);
        window.removeEventListener('touchend', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  if (!duration) return null;

  const leftPercent = (startSec / duration) * 100;
  const rightPercent = (endSec / duration) * 100;

  return (
    <div className="trimmer-container">
      <div 
        ref={trackRef}
        className="timeline-bar"
        style={{ cursor: 'pointer' }}
      >
        <div 
          className="timeline-active"
          style={{ 
            left: `${leftPercent}%`, 
            width: `${rightPercent - leftPercent}%`,
            transition: isDragging ? 'none' : 'all 0.2s ease'
          }}
        />

        <div 
          className="handle start"
          style={{ left: `${leftPercent}%`, zIndex: isDragging === 'left' ? 10 : 1 }}
          onMouseDown={(e) => handlePointerDown(e, 'left')}
          onTouchStart={(e) => handlePointerDown(e, 'left')}
        />

        <div 
          className="handle end"
          style={{ left: `${rightPercent}%`, zIndex: isDragging === 'right' ? 10 : 1 }}
          onMouseDown={(e) => handlePointerDown(e, 'right')}
          onTouchStart={(e) => handlePointerDown(e, 'right')}
        />
      </div>
      
      <div className="trimmer-inputs">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Start:</span>
          <span className="font-mono time-chip">{secondsToTimeString(startSec, true)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Selected: <strong style={{ color: '#cbd5e1' }}>{secondsToTimeString(endSec - startSec)}</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>End:</span>
          <span className="font-mono time-chip">{secondsToTimeString(endSec, true)}</span>
        </div>
      </div>
    </div>
  );
}
