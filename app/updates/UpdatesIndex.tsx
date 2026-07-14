'use client';

import Link from 'next/link';
import type { UpdateMeta } from '../lib/updates';
import { INK, PAPER, INK_MUTED, RULE } from '../lib/palette';

export default function UpdatesIndex({ updates }: { updates: UpdateMeta[] }) {
  return (
    <main className="updates-root">
      <Link href="/" className="nav-brand" aria-label="alexandria">
        <em>alexandria</em>
        <span className="nav-dot">.</span>
      </Link>

      <section className="page">
        <header className="page-head">
          <h1 className="page-title"><em>updates.</em></h1>
        </header>

        {updates.length === 0 ? (
          <p className="empty"><em>the first update is being written.</em></p>
        ) : (
          <ol className="list">
            {updates.map((u) => (
              <li key={u.slug} className="row">
                <Link href={`/updates/${u.slug}`} className="row-link">
                  <span className="row-inner">
                    <span className="row-subject">{u.subject}</span>
                    <span className="row-date">{u.date}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="cta"><em>keep thinking.</em> <Link href="/start" className="cta-link">start free →</Link> <span className="cta-sep">·</span> <Link href="/join" className="cta-link">join the collective →</Link></p>
      </section>

      <span className="watermark" aria-hidden><em>a.</em></span>

      <style jsx>{`
        :global(html), :global(body) { background: ${PAPER}; }
        .updates-root {
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
          background: ${PAPER};
          color: ${INK};
          font-family: var(--font-eb-garamond), Georgia, 'Times New Roman', serif;
          -webkit-font-smoothing: antialiased;
        }
        .nav-brand {
          position: fixed;
          top: 12px;
          left: calc(clamp(24px, 6vw, 120px) - 8px);
          z-index: 10;
          font-style: italic;
          font-weight: 500;
          font-size: 28px;
          line-height: 1;
          color: ${INK};
          text-decoration: none;
          display: inline-flex;
          align-items: baseline;
          padding: 10px 8px;
          transition: opacity 200ms ease;
        }
        .nav-brand:hover { opacity: 0.7; }
        .nav-brand :global(em) { font-style: italic; }
        .nav-brand .nav-dot {
          font-style: normal;
          display: inline-block;
          animation: dotBreathe 3.2s ease-in-out infinite;
        }
        @keyframes dotBreathe {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.42; }
        }
        .page {
          max-width: 640px;
          margin: 0 auto;
          padding: 128px clamp(24px, 6vw, 80px) 96px;
        }
        .page-head { margin-bottom: 56px; }
        .page-title {
          font-size: 38px;
          font-weight: 400;
          letter-spacing: -0.015em;
          margin: 0;
        }
        .page-title :global(em) { font-style: italic; }
        .empty {
          font-size: 18px;
          color: ${INK_MUTED};
          margin: 0;
        }
        .empty :global(em) { font-style: italic; }
        .list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .row {
          border-top: 1px solid ${RULE};
        }
        .row:last-child {
          border-bottom: 1px solid ${RULE};
        }
        .row-link {
          display: block;
          color: ${INK};
          text-decoration: none;
        }
        .row-inner {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 24px;
          padding: 22px 0;
          transition: opacity 200ms ease;
        }
        .row-link:hover .row-inner { opacity: 0.62; }
        .row-subject {
          font-size: 20px;
          letter-spacing: -0.005em;
        }
        .row-date {
          font-size: 13px;
          color: ${INK_MUTED};
          font-variant-numeric: tabular-nums;
          font-style: italic;
        }
        .cta {
          margin: 64px 0 0;
          padding-top: 28px;
          border-top: 1px solid ${RULE};
          font-size: 17px;
          color: ${INK_MUTED};
        }
        .cta :global(em) { font-style: italic; color: ${INK}; }
        .cta :global(.cta-link) { color: ${INK}; text-decoration: none; border-bottom: 1px solid ${RULE}; transition: opacity 200ms ease; }
        .cta :global(.cta-link):hover { opacity: 0.6; }
        .cta .cta-sep { color: ${INK_MUTED}; margin: 0 4px; }
        .watermark {
          position: fixed;
          bottom: 22px;
          right: clamp(24px, 6vw, 120px);
          z-index: 10;
          font-size: 22px;
          font-style: italic;
          color: ${INK};
          pointer-events: none;
        }
        .watermark :global(em) { font-style: italic; }
        @media (max-width: 600px) {
          .nav-brand { font-size: 24px; top: 8px; left: 14px; }
          .watermark { font-size: 20px; bottom: 18px; right: 22px; }
          .page { padding: 104px 24px 80px; }
          .page-title { font-size: 32px; }
          .row-inner { gap: 16px; }
          .row-subject { font-size: 17px; }
        }
      `}</style>
    </main>
  );
}
