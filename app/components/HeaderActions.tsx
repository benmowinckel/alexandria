'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * The library header's account actions — one quiet voice.
 * Always two-word labels. A middot only when two actions sit together.
 */
export const headerActionStyle: CSSProperties = {
  color: 'var(--text-muted)',
  background: 'none',
  border: 0,
  padding: '0.2rem 0',
  margin: 0,
  fontFamily: 'inherit',
  fontSize: '0.95rem',
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacing: '0.02em',
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  cursor: 'pointer',
};

export const headerActionDotStyle: CSSProperties = {
  color: 'var(--text-ghost)',
  fontSize: '0.95rem',
  lineHeight: 1.35,
  letterSpacing: 0,
  padding: '0 0.9rem',
  userSelect: 'none',
};

const pairStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  flex: 'none',
};

export function HeaderAction({
  href,
  onClick,
  busy,
  tone = 'muted',
  children,
}: {
  href?: string;
  onClick?: () => void;
  busy?: boolean;
  tone?: 'muted' | 'accent';
  children: ReactNode;
}) {
  const style: CSSProperties = {
    ...headerActionStyle,
    color: tone === 'accent' ? 'var(--accent)' : 'var(--text-muted)',
    cursor: busy ? 'wait' : 'pointer',
    ...(busy ? { opacity: 0.7 } : {}),
  };
  if (href) {
    return (
      <span style={{ display: 'contents' }}>
        <a href={href} className="hdr-action" style={style}>
          {children}
        </a>
        <HeaderActionStyle />
      </span>
    );
  }
  return (
    <span style={{ display: 'contents' }}>
      <button type="button" onClick={onClick} disabled={busy} className="hdr-action" style={style}>
        {children}
      </button>
      <HeaderActionStyle />
    </span>
  );
}

function HeaderActionStyle() {
  return (
    <style>{`
      .hdr-action { transition: opacity 200ms ease; }
      .hdr-action:hover:not(:disabled) { opacity: 0.6; }
    `}</style>
  );
}

export function HeaderActions({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <nav aria-label="account" style={pairStyle}>
      {left}
      {right ? (
        <>
          <span aria-hidden style={headerActionDotStyle}>·</span>
          {right}
        </>
      ) : null}
    </nav>
  );
}
