'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * PromptBox — the single composer used everywhere (profile page, reader).
 * One line by default (grows with content), Enter submits, Shift+Enter is a
 * newline. Dictation is the phone's — not a second product in the box.
 */

export type PromptBoxHandle = { focus: () => void };

/** Send — the house right arrow (same glyph as the join/start doors). The
 *  line runs left-to-right; the arrow says go. */
const SendArrow = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2.5 8h10M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PromptBox = forwardRef<PromptBoxHandle, {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  /** Keep the box typable (and submit live) while loading — the PARENT then
   *  owns what a mid-flight submit means (e.g. the PLM chat queues it). Default
   *  off: every other caller keeps the original loading gate. */
  typeWhileLoading?: boolean;
  /** Enter while an answer is in flight shakes the line instead of sending.
   *  The mind page queues instead; the reader uses this. */
  shakeWhenBusy?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  submitLabel?: string;
  /** Bare — no field box, no submit button: the question sits on one hairline
   *  and Enter sends it. For the composer docked under a document, where a
   *  chat-shaped box would read as an app bolted to a page (founder
   *  2026-07-27). Desktop-only surfaces, since Enter is the only submit. */
  bare?: boolean;
  /** Can the CURRENT suggestion be taken with tab? Off for a placeholder that
   *  isn't a question (e.g. the reader's framing line) — taking it would put a
   *  sentence about the mirror into a question to the mirror. */
  fillable?: boolean;
}>(function PromptBox({
  value, onChange, onSubmit, loading = false, typeWhileLoading = false, placeholder = '', ariaLabel, submitLabel = 'ask', bare = false, fillable = true,
  shakeWhenBusy = false,
}, ref) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [shake, setShake] = useState(false);

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

  const submit = () => {
    if (!value.trim()) return;
    if (loading) {
      if (shakeWhenBusy) {
        setShake(true);
        window.setTimeout(() => setShake(false), 420);
        return;
      }
      if (!typeWhileLoading) return;
    }
    onSubmit();
  };

  // Take the suggestion currently showing and put it in the box, ready to send
  // (or to edit first). Tab is the accepted gesture for accepting a completion.
  // The visible "tab"/"tap" key-cap hint was deleted 2026-08-02 (founder: "that
  // tab icon needs to be deleted. its implied") — the gesture stays, unlabeled.
  const canFill = fillable && !value && !!ghost && !(loading && !typeWhileLoading);
  const fillGhost = () => {
    if (!canFill) return;
    onChange(ghost);
    taRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab fills the suggestion instead of leaving the field — but ONLY with a
    // suggestion showing and nothing typed, so it never traps the keyboard user:
    // once the box has any text, Tab moves focus as normal.
    if (e.key === 'Tab' && !e.shiftKey && canFill) { e.preventDefault(); fillGhost(); return; }
    // Shift+Enter = newline; Enter submits.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={shake ? 'pb-shake' : undefined} style={{ display: 'flex', alignItems: 'stretch' }}>
      <style>{`
        @keyframes pb-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          55% { transform: translateX(3px); }
          80% { transform: translateX(-1.5px); }
        }
        .pb-shake { animation: pb-shake 0.38s ease; }
        @media (prefers-reduced-motion: reduce) { .pb-shake { animation: none; } }
        .pb-send {
          position: absolute; top: 0; bottom: 0; width: 1.85rem;
          display: flex; align-items: center; justify-content: center;
          border: none; background: none; padding: 0; line-height: 0;
        }
        .pb-send svg { display: block; }
      `}</style>
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
                background: 'none', fontSize: '1.05rem', padding: '0.35rem 0 0.5rem 0',
              }
              : {
                minHeight: '2.85rem', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--bg-secondary)',
                fontSize: '1rem', padding: '0.62rem 2.5rem 0.62rem 0.95rem',
              }),
          }}
        />
        {showOwnCaret && (
          // The caret sits just LEFT of the shared text origin (a ~2.5px gap),
          // never on the first letter, and is vertically centred on the text's
          // own line box (padding + border + half-leading) — so bar, ghost, and
          // typed text hold one baseline (founder, 2026-08-02: "it all needs
          // to be consistent").
          <span aria-hidden style={{
            position: 'absolute', left: bare ? '-4px' : 'calc(0.95rem - 2.5px)', top: bare ? '0.59rem' : '0.91rem',
            width: '1.5px', height: bare ? '1.05rem' : '1rem', background: 'var(--text-muted)', borderRadius: '1px',
            pointerEvents: 'none', animation: 'pb-caret-blink 1.5s ease-in-out infinite',
          }} />
        )}
        {/* the rotating suggestion — an exact overlay of the textarea's own
            text box: same left padding, top offset compensating the 1px border,
            so ghost and typed text share one origin and the Tab-fill never
            jumps (founder, 2026-08-02: "the ghost text is higher than the
            actual text… it all needs to be consistent" — supersedes the
            07-20 nudge-right, which put the ghost 0.4rem off the typed line). */}
        <div aria-hidden style={{
          position: 'absolute', left: bare ? 0 : '1px', top: bare ? 0 : '1px', right: bare ? 0 : '2.5rem',
          padding: bare ? '0.35rem 0 0.5rem 0' : '0.62rem 0 0.62rem 0.95rem',
          pointerEvents: 'none', color: 'var(--text-ghost)',
          fontFamily: 'var(--font-eb-garamond)', fontSize: bare ? '1.05rem' : '1rem', lineHeight: 1.45,
          whiteSpace: 'nowrap', overflow: 'hidden',
          // Bare sits on an open line, so a suggestion longer than the line
          // fades off its edge instead of stopping at an ellipsis — the same
          // dissolve the document above it uses, and it needs no width budget
          // to be right on a phone. Boxed keeps the ellipsis: inside a field,
          // a fade would read as a rendering fault.
          ...(bare
            ? { WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 2.6rem), transparent)',
              maskImage: 'linear-gradient(to right, #000 calc(100% - 2.6rem), transparent)' }
            : { textOverflow: 'ellipsis' }),
          opacity: (!value && ghostShown && !loading) ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}>{ghost}</div>
        {/* Bare has no standing submit button — Enter sends it. A soft
            keyboard has no reliable Enter, so once there are words a send
            arrow takes the slot. Nothing there while idle. */}
        {bare && value.trim() && (
          <button
            type="button"
            className="pb-send"
            onClick={submit}
            aria-label="send"
            title="send"
            style={{
              right: 0,
              cursor: 'pointer',
              color: 'var(--accent)', opacity: loading ? 0.45 : 1, transition: 'opacity 0.15s',
            }}
          >
            {SendArrow}
          </button>
        )}
        {/* Boxed submit — the big "ask" button was noise (founder, 2026-08-02:
            "the big ask button is noise… its obvious that pressing return is
            submitting"). One quiet glyph inside the field: ghost while empty,
            the accent once there's something to send — and the tap target
            phones need. Loading shows as the same slot's ellipsis. */}
        {!bare && (
          <button
            type="button"
            className="pb-send"
            onClick={submit}
            aria-label={submitLabel}
            title={submitLabel}
            style={{
              right: '0.45rem',
              cursor: value.trim() && !(loading && !typeWhileLoading) ? 'pointer' : 'default',
              color: value.trim() ? 'var(--accent)' : 'var(--text-ghost)', transition: 'color 0.15s, opacity 0.15s',
            }}
          >
            {loading && !typeWhileLoading ? (
              <span aria-hidden style={{ color: 'var(--text-ghost)', fontSize: '1rem', lineHeight: 1 }}>…</span>
            ) : SendArrow}
          </button>
        )}
      </div>
    </div>
  );
});

export default PromptBox;
