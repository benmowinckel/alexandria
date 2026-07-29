'use client';

import { useState } from 'react';
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

export default function ActionButton({
  icon, onAction, title, style, className, label, doneLabel = 'copied',
}: {
  icon: ReactNode;
  onAction: () => void;
  title?: string;
  style?: CSSProperties;
  className?: string;
  /** Optional word beside the icon, for the rare control that has to say what
   *  it does (an icon alone can't carry "take this away with you"). */
  label?: string;
  doneLabel?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={done ? 'done' : title}
      aria-label={done ? 'done' : (title || label)}
      onClick={() => { onAction(); setDone(true); setTimeout(() => setDone(false), 1400); }}
      style={{ ...style, color: done ? 'var(--accent)' : (style?.color ?? 'var(--text-ghost)') }}
      className={className}
    >
      {done ? CheckIcon : icon}
      {label && <span>{done ? doneLabel : label}</span>}
    </button>
  );
}
