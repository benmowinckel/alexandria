'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

/**
 * PromptBox — the single PLM composer used everywhere (profile page, reader).
 * One line by default (grows with content), Enter submits, Shift+Enter is a
 * newline, and a native voice-input mic when the browser supports it. One
 * component so every ask surface is identical by construction.
 */

// Native voice input — ride the browser's SpeechRecognition, don't build one.
type SpeechRec = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
type SpeechRecCtor = new () => SpeechRec;
function getSpeechRecognition(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function PromptBox({
  value, onChange, onSubmit, loading = false, placeholder = '', ariaLabel, submitLabel = 'ask',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  submitLabel?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  useEffect(() => { setVoiceOn(!!getSpeechRecognition()); }, []);

  // Grow from one line as content is added (Shift+Enter or wrapping), capped.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const stopVoice = () => { try { recRef.current?.stop(); } catch { /* */ } };

  const startVoice = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true; // keep listening through pauses — only a keypress ends it
    // Dictation appends onto whatever's already typed.
    const base = value ? `${value} ` : '';
    rec.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      onChange(base + t);
    };
    // Ended (by us, or a browser timeout): clear the indicator, cursor back in box.
    rec.onend = () => { setListening(false); recRef.current = null; taRef.current?.focus(); };
    rec.onerror = () => { setListening(false); recRef.current = null; taRef.current?.focus(); };
    recRef.current = rec;
    setListening(true);
    rec.start();
    taRef.current?.focus();
  };

  const toggleVoice = () => { if (listening) { stopVoice(); } else { startVoice(); } };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+D toggles voice — full keyboard + voice control, no mouse.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); toggleVoice(); return; }
    // While dictating, ANY key ends it (Enter/other). Enter just ends here; the
    // next Enter submits. Other keys end it and type through normally.
    if (listening) {
      stopVoice();
      if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
      return;
    }
    // Shift+Enter = newline; Enter submits.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && value.trim()) onSubmit();
    }
  };

  const disabled = loading || !value.trim();
  const btn: CSSProperties = {
    border: 'none', borderRadius: '11px', background: 'var(--accent)', color: 'var(--bg-primary)',
    fontFamily: 'inherit', fontSize: '0.95rem', padding: '0.72rem 1.25rem',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          placeholder={placeholder}
          aria-label={ariaLabel || placeholder}
          style={{
            width: '100%', resize: 'none', overflow: 'auto', minHeight: '2.85rem', maxHeight: '160px', boxSizing: 'border-box',
            border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--bg-secondary)',
            color: 'var(--text-primary)', fontFamily: 'var(--font-eb-garamond)', fontSize: '1rem', lineHeight: 1.45,
            outline: 'none', padding: `0.62rem ${voiceOn ? '2.6rem' : '0.95rem'} 0.62rem 0.95rem`,
          }}
        />
        {voiceOn && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? 'stop voice input' : 'voice input'}
            title={listening ? 'stop' : 'speak'}
            style={{
              position: 'absolute', right: '0.55rem', bottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer', padding: '0.2rem',
              color: listening ? 'var(--accent)' : 'var(--text-ghost)', transition: 'color 0.15s',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
            </svg>
          </button>
        )}
      </div>
      <button type="button" onClick={() => { if (!disabled) onSubmit(); }} disabled={disabled}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.opacity = '0.85'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = disabled ? '0.5' : '1'; }}
        style={btn}>
        {loading ? '…' : submitLabel}
      </button>
    </div>
  );
}
