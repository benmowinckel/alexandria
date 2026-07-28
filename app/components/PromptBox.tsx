'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

export type PromptBoxHandle = { focus: () => void };

const PromptBox = forwardRef<PromptBoxHandle, {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  /** Keep the box typable (and submit live) while loading — the PARENT then
   *  owns what a mid-flight submit means (e.g. the PLM chat queues it). Default
   *  off: every other caller keeps the original loading gate. */
  typeWhileLoading?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  submitLabel?: string;
  /** Bare — no field box, no submit button: the question sits on one hairline
   *  and Enter sends it. For the composer docked under a document, where a
   *  chat-shaped box would read as an app bolted to a page (founder
   *  2026-07-27). Desktop-only surfaces, since Enter is the only submit. */
  bare?: boolean;
}>(function PromptBox({
  value, onChange, onSubmit, loading = false, typeWhileLoading = false, placeholder = '', ariaLabel, submitLabel = 'ask', bare = false,
}, ref) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  useEffect(() => { setVoiceOn(!!getSpeechRecognition()); }, []);

  // Ghost text as a soft overlay (not the native placeholder) so a rotating
  // suggestion crossfades instead of snapping (founder 2026-07-20 — "too quick,
  // too abrupt; slow it down, make it flow"). When the placeholder changes we
  // fade the old line out, swap, fade the new one in; it shows only while the
  // box is empty. The native placeholder stays empty so the two never collide.
  const [ghost, setGhost] = useState(placeholder);
  const [ghostShown, setGhostShown] = useState(true);
  // A calmer caret: the OS caret blink rate isn't controllable, so when the box
  // is empty + focused we hide the native caret and draw our own, blinking
  // slowly with a soft fade (founder 2026-07-20). Once you type, the native
  // caret takes over so it tracks the cursor normally.
  const [focused, setFocused] = useState(false);
  const showOwnCaret = focused && !value;
  useEffect(() => {
    if (placeholder === ghost) return;
    // Schedule both steps (never setState synchronously in the effect): fade the
    // current line out, then swap to the new one and fade it back in.
    const fadeOut = setTimeout(() => setGhostShown(false), 30);
    const swap = setTimeout(() => { setGhost(placeholder); setGhostShown(true); }, 430);
    return () => { clearTimeout(fadeOut); clearTimeout(swap); };
  }, [placeholder, ghost]);

  // Let callers drop the cursor in the box (e.g. when a collapsed chat pane
  // expands) so you can start typing immediately.
  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }), []);

  // Grow from one line as content is added (Shift+Enter or wrapping), capped.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  // Tear down recognition. `silent` nulls the callbacks first, so the final
  // result the browser delivers on .stop() — and any late continuous result —
  // can't write back into a box the parent may have just cleared on submit.
  const endVoice = (silent = false) => {
    const rec = recRef.current;
    if (rec) {
      if (silent) { rec.onresult = null; rec.onend = null; rec.onerror = null; }
      try { rec.stop(); } catch { /* */ }
    }
    recRef.current = null;
    setListening(false);
  };
  const stopVoice = () => endVoice(false);

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

  // The one submit path for button + Enter. Kill dictation SILENTLY before
  // firing, so a late speech result can't refill the box after the parent
  // clears it. On mobile submit arrives via the button or the soft keyboard's
  // "go" — neither hits onKeyDown's "any key ends dictation", so the recognizer
  // would otherwise keep running through the clear.
  const submit = () => {
    if ((loading && !typeWhileLoading) || !value.trim()) return;
    endVoice(true);
    onSubmit();
  };

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
      submit();
    }
  };

  const disabled = (loading && !typeWhileLoading) || !value.trim();
  const btn: CSSProperties = {
    // position:relative so the loading "…" can overlay the label instead of
    // replacing it — the label stays in flow (invisible) to hold the button's
    // width, so nothing shifts when ask↔… swap (founder: "lock it tighter").
    position: 'relative',
    border: 'none', borderRadius: '11px', background: 'var(--accent)', color: 'var(--bg-primary)',
    fontFamily: 'inherit', fontSize: '0.95rem', padding: '0.72rem 1.25rem',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
  };

  const ghostRight = voiceOn ? '2.6rem' : '0.95rem';
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={loading && !typeWhileLoading}
          placeholder=""
          aria-label={ariaLabel || placeholder}
          style={{
            width: '100%', resize: 'none', overflow: 'auto', maxHeight: '160px', boxSizing: 'border-box',
            color: 'var(--text-primary)', fontFamily: 'var(--font-eb-garamond)', lineHeight: 1.45,
            outline: 'none',
            // Quieter, greyer caret; hidden entirely while our slow caret shows.
            caretColor: showOwnCaret ? 'transparent' : 'var(--text-muted)',
            ...(bare
              ? {
                minHeight: '2.2rem', border: 'none', borderBottom: '1px solid var(--border-light)', borderRadius: 0,
                background: 'none', fontSize: '1.05rem', padding: `0.35rem ${voiceOn ? '1.9rem' : '0'} 0.5rem 0`,
              }
              : {
                minHeight: '2.85rem', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--bg-secondary)',
                fontSize: '1rem', padding: `0.62rem ${voiceOn ? '2.6rem' : '0.95rem'} 0.62rem 0.95rem`,
              }),
          }}
        />
        {showOwnCaret && (
          <span aria-hidden style={{
            position: 'absolute', left: bare ? '1px' : '0.98rem', top: bare ? '0.52rem' : '0.78rem',
            width: '1.5px', height: '1.05rem', background: 'var(--text-muted)', borderRadius: '1px',
            pointerEvents: 'none', animation: 'pb-caret-blink 1.5s ease-in-out infinite',
          }} />
        )}
        {/* the rotating suggestion — nudged right of the caret so the blinking
            cursor never sits on the first letter (founder 2026-07-20) */}
        <div aria-hidden style={{
          position: 'absolute', left: 0, top: 0, right: bare ? (voiceOn ? '1.9rem' : 0) : ghostRight,
          padding: bare ? '0.35rem 0 0.5rem 0.4rem' : '0.62rem 0 0.62rem 1.35rem',
          pointerEvents: 'none', color: 'var(--text-ghost)',
          fontFamily: 'var(--font-eb-garamond)', fontSize: bare ? '1.05rem' : '1rem', lineHeight: 1.45,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          opacity: (!value && ghostShown) ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}>{ghost}</div>
        {/* Bare has no standing submit button — Enter sends it. But a soft
            keyboard has no reliable Enter, so once there are words the mic
            (useless mid-question anyway) gives its slot to a send arrow. One
            control, always the useful one, and nothing there while idle. */}
        {bare && value.trim() && (
          <button
            type="button"
            onClick={submit}
            aria-label="send"
            title="send"
            style={{
              position: 'absolute', right: 0, bottom: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer', padding: '0.2rem',
              color: 'var(--accent)', opacity: loading ? 0.45 : 1, transition: 'opacity 0.15s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        )}
        {voiceOn && !(bare && value.trim()) && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? 'stop voice input' : 'voice input'}
            title={listening ? 'stop  (⌘D)' : 'speak  (⌘D)'}
            style={{
              position: 'absolute', right: bare ? 0 : '0.55rem', bottom: bare ? '0.42rem' : '0.5rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      {/* Bare has no button — Enter is the gesture, and the row stays one line
          of text on one rule. Loading shows as a lone ellipsis in its place. */}
      {bare ? (loading && <span aria-hidden style={{ flex: 'none', color: 'var(--text-ghost)', paddingBottom: '0.5rem' }}>…</span>) : (
        <button type="button" onClick={submit} disabled={disabled}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = disabled ? '0.5' : '1'; }}
          style={btn}>
          {/* Label always reserves the width; the "…" overlays it centered while
              loading, so the button never resizes between states. */}
          <span style={{ visibility: loading ? 'hidden' : undefined }}>{submitLabel}</span>
          {loading && (
            <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>…</span>
          )}
        </button>
      )}
    </div>
  );
});

export default PromptBox;
