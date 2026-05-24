'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Update, UpdateMeta } from '../../lib/updates';

const INK = '#1a1318';
const PAPER = '#f7f2ec';
const INK_MUTED = 'rgba(26, 19, 24, 0.55)';
const INK_FAINT = 'rgba(26, 19, 24, 0.32)';
const RULE = 'rgba(26, 19, 24, 0.20)';

export default function UpdateLetter({
  update,
  chronological,
}: {
  update: Update;
  chronological: UpdateMeta[];
}) {
  return (
    <main className="letter-root">
      <Link href="/" className="nav-brand" aria-label="alexandria">
        <em>alexandria</em>
        <span className="nav-dot">.</span>
      </Link>

      <article className="letter">
        <header className="letter-head">
          <p className="letter-meta">
            <Link href="/updates" className="letter-meta-link">updates</Link>
            <span className="letter-meta-sep"> · </span>
            <span className="letter-slug">{update.slug}</span>
            {update.date ? (
              <>
                <span className="letter-meta-sep"> · </span>
                <span className="letter-date">{update.date}</span>
              </>
            ) : null}
          </p>
          <h1 className="letter-title">{update.subject}</h1>
        </header>

        <div className="letter-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{update.body}</ReactMarkdown>
        </div>

        {chronological.length > 1 ? (
          <nav className="letter-nav" aria-label="other updates">
            {chronological.map((u, i) => (
              <span key={u.slug} className="letter-nav-item">
                {u.slug === update.slug ? (
                  <strong>{u.slug}</strong>
                ) : (
                  <Link href={`/updates/${u.slug}`}>{u.slug}</Link>
                )}
                {i < chronological.length - 1 ? <span className="letter-nav-sep"> · </span> : null}
              </span>
            ))}
          </nav>
        ) : null}
      </article>

      <span className="watermark" aria-hidden><em>a.</em></span>

      <style jsx>{`
        :global(html), :global(body) { background: ${PAPER}; }
        .letter-root {
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
        .letter {
          max-width: 600px;
          margin: 0 auto;
          padding: 128px clamp(24px, 6vw, 80px) 96px;
        }
        .letter-head {
          margin-bottom: 40px;
        }
        .letter-meta {
          margin: 0 0 14px;
          font-size: 13px;
          color: ${INK_MUTED};
          letter-spacing: 0.02em;
          font-style: italic;
        }
        .letter-meta-link {
          color: ${INK_MUTED};
          text-decoration: none;
          border-bottom: 1px solid ${INK_FAINT};
          padding-bottom: 1px;
        }
        .letter-meta-link:hover { color: ${INK}; }
        .letter-meta-sep { color: ${INK_FAINT}; font-style: normal; }
        .letter-slug { font-variant-numeric: tabular-nums; }
        .letter-date { font-variant-numeric: tabular-nums; }
        .letter-title {
          font-size: 32px;
          font-weight: 400;
          letter-spacing: -0.015em;
          line-height: 1.2;
          margin: 0;
        }
        .letter-body {
          font-size: 19px;
          line-height: 1.7;
          color: ${INK};
        }
        .letter-body :global(p) { margin: 0 0 1.4em; }
        .letter-body :global(em) { font-style: italic; }
        .letter-body :global(strong) { font-weight: 600; }
        .letter-body :global(a) {
          color: ${INK};
          text-decoration: none;
          border-bottom: 1px solid ${RULE};
        }
        .letter-body :global(a:hover) { border-bottom-color: ${INK}; }
        .letter-body :global(hr) {
          border: none;
          border-top: 1px solid ${RULE};
          margin: 2.2em 0;
        }
        .letter-body :global(blockquote) {
          margin: 1.4em 0;
          padding-left: 18px;
          border-left: 2px solid ${RULE};
          color: ${INK_MUTED};
          font-style: italic;
        }
        .letter-nav {
          margin-top: 56px;
          padding-top: 24px;
          border-top: 1px solid ${RULE};
          font-size: 14px;
          color: ${INK_MUTED};
          letter-spacing: 0.02em;
          font-variant-numeric: tabular-nums;
        }
        .letter-nav :global(a) {
          color: ${INK_MUTED};
          text-decoration: none;
          transition: color 200ms ease;
        }
        .letter-nav :global(a:hover) { color: ${INK}; }
        .letter-nav :global(strong) {
          color: ${INK};
          font-weight: 500;
        }
        .letter-nav-sep { color: ${INK_FAINT}; }
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
          .letter { padding: 104px 24px 80px; }
          .letter-title { font-size: 26px; }
          .letter-body { font-size: 17px; }
        }
      `}</style>
    </main>
  );
}
