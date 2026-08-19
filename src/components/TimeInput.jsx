import React, { useState, useEffect, useRef } from 'react';

export default function TimeInput({ value, onChange }) {
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  
  const hoursRef = useRef(null);
  const minutesRef = useRef(null);
  const secondsRef = useRef(null);

  // Parse initial value from parent (e.g., '01:23:45')
  useEffect(() => {
    if (value && value.includes(':')) {
      const parts = value.split(':');
      if (parts.length === 3) {
        setHours(parts[0]);
        setMinutes(parts[1]);
        setSeconds(parts[2]);
      } else if (parts.length === 2) {
        setHours('00');
        setMinutes(parts[0]);
        setSeconds(parts[1]);
      }
    } else if (!value) {
      setHours('');
      setMinutes('');
      setSeconds('');
    }
  }, [value]);

  const updateParent = (h, m, s) => {
    if (!h && !m && !s) {
      onChange('');
      return;
    }
    const hh = (h || '00').padStart(2, '0');
    const mm = (m || '00').padStart(2, '0');
    const ss = (s || '00').padStart(2, '0');
    onChange(`${hh}:${mm}:${ss}`);
  };

  const handleFocus = (e) => e.target.select();

  const handleChange = (e, type) => {
    const rawVal = e.target.value.replace(/\D/g, ''); // only numbers
    const val = rawVal.slice(0, 2); // max 2 digits

    if (type === 'hours') {
      setHours(val);
      if (val.length === 2) minutesRef.current?.focus();
      updateParent(val, minutes, seconds);
    } else if (type === 'minutes') {
      const safeVal = parseInt(val) > 59 ? '59' : val;
      setMinutes(safeVal);
      if (safeVal.length === 2) secondsRef.current?.focus();
      updateParent(hours, safeVal, seconds);
    } else if (type === 'seconds') {
      const safeVal = parseInt(val) > 59 ? '59' : val;
      setSeconds(safeVal);
      updateParent(hours, minutes, safeVal);
    }
  };

  const handleKeyDown = (e, type) => {
    if (e.key === 'Backspace') {
      if (type === 'seconds' && !seconds) {
        minutesRef.current?.focus();
      } else if (type === 'minutes' && !minutes) {
        hoursRef.current?.focus();
      }
    }
  };

  const inputStyle = {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e2e8f0',
    width: '18px',
    textAlign: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: 0
  };

  const labelStyle = {
    fontSize: '0.65rem',
    color: '#64748b',
    fontWeight: 600,
    marginRight: '2px'
  };

  return (
    <div 
      className="flex items-center gap-[2px] transition-colors"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: '4px 8px',
      }}
    >
      <input 
        ref={hoursRef}
        value={hours}
        onChange={(e) => handleChange(e, 'hours')}
        onKeyDown={(e) => handleKeyDown(e, 'hours')}
        onFocus={handleFocus}
        placeholder="00"
        style={inputStyle}
      />
      <span style={labelStyle}>h</span>
      <span style={{ color: '#334155', margin: '0 2px' }}>:</span>
      
      <input 
        ref={minutesRef}
        value={minutes}
        onChange={(e) => handleChange(e, 'minutes')}
        onKeyDown={(e) => handleKeyDown(e, 'minutes')}
        onFocus={handleFocus}
        placeholder="00"
        style={inputStyle}
      />
      <span style={labelStyle}>m</span>
      <span style={{ color: '#334155', margin: '0 2px' }}>:</span>
      
      <input 
        ref={secondsRef}
        value={seconds}
        onChange={(e) => handleChange(e, 'seconds')}
        onKeyDown={(e) => handleKeyDown(e, 'seconds')}
        onFocus={handleFocus}
        placeholder="00"
        style={inputStyle}
      />
      <span style={labelStyle}>s</span>
    </div>
  );
}
