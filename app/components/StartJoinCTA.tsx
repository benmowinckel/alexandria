'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

/**
 * StartJoinCTA — the ONE conversion block, shared by every surface that would
 * otherwise dead-end (the profile, the PLM, the info + video pages). Kept in a
 * single component so the copy and the look can never diverge page to page.
 * (Named historically for its two doors — distinct from app/join/JoinCTA, the
 * join page's own OAuth/referral cluster.)
 *
 * ONE door now (founder, 2026-07-17: "no one would join the community without
 * having started" — the second door only split attention): try it free →
 * /start. The sentiment is the free sample, not the signup — you just try it,
 * build your own; the rest of the funnel happens from inside.
 *
 * `lead`/`sub` let a surface tune the framing (a profile says "one like this",
 * an info page says "ready to start") while the door stays identical. `align`
 * left for prose columns, center for standalone footers. `compact` drops the
 * sub line for tight, app-like contexts.
 */
export default function StartJoinCTA({
  lead = 'make your own.',
  sub = 'one line adds it to the ai you already use — free, and your mind lives in a folder you own. build it, and a page like this comes with it.',
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
        <Link href="/start" style={primary} className="hover:opacity-80">build your own</Link>
      </div>
    </div>
  );
}
