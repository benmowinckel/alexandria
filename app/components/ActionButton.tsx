'use client';

import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * A button that runs an action and briefly flips its icon to a check, so a
 * copy / download reads as having worked. Shared by every such control.
 */
const CheckIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const ErrorIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export default function ActionButton({
  icon, onAction, title, style, className, label, doneLabel = 'copied', failedLabel = 'couldn’t finish — try again',
}: {
  icon: ReactNode;
  onAction: () => void | Promise<void>;
  title?: string;
  style?: CSSProperties;
  className?: string;
  /** Optional word beside the icon, for the rare control that has to say what
   *  it does (an icon alone can't carry "take this away with you"). */
  label?: string;
  doneLabel?: string;
  failedLabel?: string;
}) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  return (
    <button
      type="button"
      title={failed ? failedLabel : done ? 'done' : title}
      aria-label={failed ? failedLabel : done ? 'done' : (title || label)}
      onClick={async () => {
        if (running.current) return;
        running.current = true;
        setFailed(false);
        try {
          await onAction();
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          setFailed(true);
          setTimeout(() => setFailed(false), 2200);
        } finally {
          running.current = false;
        }
      }}
      style={{ ...style, color: done || failed ? 'var(--accent)' : (style?.color ?? 'var(--text-ghost)') }}
      className={className}
    >
      <span className="ab-swap" aria-hidden="true">
        <span className="ab-swap-face" data-on={!done && !failed || undefined}>{icon}</span>
        <span className="ab-swap-face" data-on={done || undefined}>{CheckIcon}</span>
        <span className="ab-swap-face" data-on={failed || undefined}>{ErrorIcon}</span>
      </span>
      {label && <span>{failed ? failedLabel : done ? doneLabel : label}</span>}
      <style>{`
        .ab-swap { display: inline-grid; place-items: center; }
        .ab-swap-face {
          grid-area: 1 / 1; display: inline-flex;
          opacity: 0; transform: scale(0.82);
          transition: opacity 220ms ease, transform 220ms ease, color 200ms ease;
          pointer-events: none;
        }
        .ab-swap-face[data-on] { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          .ab-swap-face { transform: none; transition: opacity 180ms ease, color 180ms ease; }
        }
      `}</style>
    </button>
  );
}
