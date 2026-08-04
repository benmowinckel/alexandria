'use client';

import Link from 'next/link';
import type { UpdateMeta } from '../lib/updates';
import { ThemeToggle } from '../components/ThemeToggle';

// The member newsletter index — rebuilt onto the shared primer skeleton
// (founder 2026-07-17, funnel-consistency sweep): flush-left editorial spine,
// CSS-var theme (dark mode now works), ThemeToggle, brand header, coda —
// matching /start · /join · /follow · welcome. Was centered with the old
// hardcoded palette (styled-jsx, no real dark mode) and the "a." watermark /
// top-left-brand chrome. The list itself (subject + date, one row each, linking
// to /updates/[slug]) is unchanged.
export default function UpdatesIndex({ updates }: { updates: UpdateMeta[] }) {
  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        <p className="primer-eyebrow">the newsletter</p>
        <h1 className="updates-hero">updates.</h1>

        {updates.length === 0 ? (
          <p className="updates-empty"><em>the first update is being written.</em></p>
        ) : (
          <ol className="updates-list">
            {updates.map((u) => (
              <li key={u.slug} className="updates-row">
                <Link href={`/updates/${u.slug}`} className="updates-row-link">
                  <span className="updates-subject">{u.subject}</span>
                  <span className="updates-date">{u.date}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {/* One quiet route back (founder 2026-07-17): a single question to
            the homepage, not a mini-menu of funnel doors. */}
        <p className="updates-links">
          Ready to try it? <Link href="/start">start your loop &rarr;</Link>
        </p>

        <p className="primer-coda"><em>keep thinking.</em></p>
      </main>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .primer-page {
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    background-image:
      radial-gradient(ellipse 120% 80% at 30% 20%, rgba(91, 31, 71, 0.025) 0%, transparent 60%),
      radial-gradient(ellipse 100% 70% at 70% 80%, rgba(74, 50, 30, 0.020) 0%, transparent 60%);
    animation: primerFadeIn 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  @keyframes primerFadeIn {
    0% { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .primer-header { padding: 28px 32px 0; }
  .primer-brand {
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-style: italic; font-weight: 400; font-size: 21px;
    color: var(--text-primary); text-decoration: none;
    letter-spacing: 0.005em; transition: opacity 220ms ease;
    display: inline-block; padding: 10px 8px; margin: -10px -8px;
  }
  .primer-brand:hover { opacity: 0.6; }
  .primer-brand-dot { font-style: normal; }

  /* Flush-left editorial column. Top-weighted (justify-content: flex-start,
     padded down) rather than vertically centred — it's a list that can grow. */
  .primer-main {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: flex-start; justify-content: flex-start;
    max-width: 620px; margin: 0 auto; padding: clamp(4rem, 12vh, 8rem) 40px 6rem; width: 100%;
    text-align: left;
  }

  .primer-eyebrow {
    margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-weight: 500; font-size: 11.5px; letter-spacing: 0.3em;
    text-transform: lowercase; font-variant-caps: all-small-caps;
    font-feature-settings: "smcp" 1, "kern" 1;
    color: var(--accent); line-height: 1;
  }

  .updates-hero {
    margin: 0 0 40px;
    font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
    font-style: italic; font-weight: 400;
    font-size: clamp(30px, 1.6rem + 1.8vw, 40px); line-height: 1.1;
    letter-spacing: -0.015em; color: var(--text-primary);
  }

  .updates-empty {
    margin: 0; font-size: 17px; line-height: 1.6; font-style: italic;
    color: var(--text-muted);
  }

  .updates-list { list-style: none; padding: 0; margin: 0; width: 100%; }
  .updates-row { border-top: 1px solid var(--bg-tertiary, rgba(61, 54, 48, 0.12)); }
  .updates-row:last-child { border-bottom: 1px solid var(--bg-tertiary, rgba(61, 54, 48, 0.12)); }
  .updates-row-link {
    display: flex; justify-content: space-between; align-items: baseline; gap: 24px;
    padding: 22px 0; color: var(--text-primary); text-decoration: none;
    transition: opacity 200ms ease;
  }
  .updates-row-link:hover { opacity: 0.6; }
  .updates-subject { font-size: 19px; letter-spacing: -0.005em; }
  .updates-date {
    flex-shrink: 0; font-size: 13px; color: var(--text-muted);
    font-variant-numeric: tabular-nums; font-style: italic; letter-spacing: 0.01em;
  }

  /* Quiet route back into the funnel — subordinate to the list. */
  .updates-links {
    margin: 40px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 15px; line-height: 1.6; color: var(--text-muted);
  }
  .updates-links a {
    color: var(--text-secondary, rgba(61, 54, 48, 0.82));
    text-decoration: underline; text-decoration-color: var(--text-muted, rgba(61, 54, 48, 0.4));
    text-underline-offset: 3px; text-decoration-thickness: 1px;
    transition: color 200ms, text-decoration-color 200ms;
  }
  .updates-links a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }
  .updates-sep { color: var(--text-muted, rgba(61, 54, 48, 0.5)); margin: 0 10px; }

  .primer-coda {
    margin: 48px 0 0; text-align: left; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 20px; font-style: italic; color: var(--text-primary);
    letter-spacing: 0.005em; opacity: 0.72;
  }

  @media (max-width: 640px) {
    .primer-main { padding: 3rem 24px 4rem; }
    .updates-hero { font-size: 28px; margin-bottom: 32px; }
    .updates-subject { font-size: 17px; }
    .updates-row-link { gap: 16px; }
    .primer-coda { font-size: 18px; margin-top: 40px; }
  }
`;
