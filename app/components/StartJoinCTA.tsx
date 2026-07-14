'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

/**
 * StartJoinCTA — the ONE conversion block, shared by every surface that would
 * otherwise dead-end (the profile, the PLM, the info + video pages). It keeps
 * (named for its two doors — distinct from app/join/JoinCTA, the join page's
 * own OAuth/referral cluster.)
 * the funnel coherent: two doors in one fixed order —
 *   1. start free  → /start  (the tool: free, yours, runs on your own files)
 *   2. join the collective → /join  (the tribe: the library beside everyone else's)
 * Kept in a single component so the copy and the look can never diverge page to
 * page, and so every route reinforces the same next step instead of trailing off.
 *
 * `lead`/`sub` let a surface tune the framing (a profile says "one like this",
 * an info page says "ready to start") while the doors stay identical. `align`
 * left for prose columns, center for standalone footers. `compact` drops the
 * sub line for tight, app-like contexts.
 */
export default function StartJoinCTA({
  lead = 'make your own.',
  sub = 'the tool is free — one line adds it to the ai you already use, and your mind lives in a folder you own. join the collective to put it in the library, beside everyone else’s.',
  align = 'center',
  compact = false,
}: {
  lead?: string;
  sub?: string;
  align?: 'center' | 'left';
  compact?: boolean;
}) {
  const wrap: CSSProperties = {
    fontFamily: 'var(--font-eb-garamond)',
    textAlign: align,
    maxWidth: '34rem',
    margin: align === 'center' ? '0 auto' : '0',
    padding: '2.4rem 0 0.4rem',
    borderTop: '1px solid var(--border-light)',
  };
  const primary: CSSProperties = {
    display: 'inline-block',
    borderRadius: '11px',
    background: 'var(--accent)',
    color: 'var(--bg-primary)',
    padding: '0.62rem 1.3rem',
    fontSize: '1rem',
    textDecoration: 'none',
  };
  const secondary: CSSProperties = {
    color: 'var(--text-muted)',
    fontSize: '1rem',
    textDecoration: 'none',
  };

  return (
    <div style={wrap}>
      <p style={{ color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.01em', margin: '0 0 0.5rem' }}>
        {lead}
      </p>
      {!compact && sub && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.6, margin: '0 0 1.3rem' }}>
          {sub}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem 1.4rem', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start', marginTop: compact ? '0.9rem' : 0 }}>
        <Link href="/start" style={primary} className="hover:opacity-80">start free →</Link>
        <Link href="/join" style={secondary} className="hover:opacity-60">or join the collective →</Link>
      </div>
    </div>
  );
}
