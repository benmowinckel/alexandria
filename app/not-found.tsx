import Link from 'next/link';
import { ThemeToggle } from './components/ThemeToggle';

// The 404 — on the shared primer skeleton (2026-07-17 edge-page sweep; was
// the unstyled Next default). Quiet: name the miss, one route home.
export default function NotFound() {
  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        <p className="primer-eyebrow">not found</p>
        <h1 className="nf-hero">This page doesn&rsquo;t exist.</h1>
        <p className="nf-lede">
          The address may be old, or mistyped. Everything that does exist is
          reachable from <Link href="/">the front page</Link>.
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
  .primer-main {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: flex-start; justify-content: center;
    max-width: 620px; margin: 0 auto; padding: 3rem 40px 6rem; width: 100%;
    text-align: left;
  }
  .primer-eyebrow {
    margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-weight: 500; font-size: 11.5px; letter-spacing: 0.3em;
    text-transform: lowercase; font-variant-caps: all-small-caps;
    font-feature-settings: "smcp" 1, "kern" 1;
    color: var(--accent); line-height: 1;
  }
  .nf-hero {
    margin: 0 0 22px; max-width: 560px;
    font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
    font-style: italic; font-weight: 500;
    font-size: clamp(27px, 1.5rem + 1.4vw, 34px); line-height: 1.2;
    letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
  }
  .nf-lede {
    margin: 0; max-width: 480px;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 16px; line-height: 1.6; color: var(--text-secondary);
    text-wrap: pretty;
  }
  .nf-lede a {
    color: var(--text-primary);
    text-decoration: underline; text-decoration-color: var(--text-muted, rgba(61, 54, 48, 0.4));
    text-underline-offset: 3px; text-decoration-thickness: 1px;
    transition: text-decoration-color 200ms;
  }
  .nf-lede a:hover { text-decoration-color: var(--text-primary); }
  .primer-coda {
    margin: 48px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 20px; font-style: italic; color: var(--text-primary);
    letter-spacing: 0.005em; opacity: 0.72;
  }
  @media (max-width: 640px) {
    .primer-main { padding: 2rem 24px 4rem; }
    .nf-hero { font-size: 25px; }
    .primer-coda { font-size: 18px; margin-top: 40px; }
  }
`;
