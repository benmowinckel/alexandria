import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import ChatDoor from './ChatDoor';

export const metadata = pageMetadata({
  path: '/chat',
  title: 'start alexandria.',
  description:
    'start your alexandria loop in chatgpt, claude, or gemini. paste one instruction into that app’s settings, then type a.',
});

function cleanRef(raw: string | undefined): string {
  return (raw || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
}

// Door 2 of the two-door onboarding (agents → /start; chat → here).
// Which chat → shortcut → optional email → paste into that app's
// official instructions → connect Drive only on claude → type a.
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  const ref = cleanRef(params.ref) || undefined;

  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        <h1 className="primer-h1">start your loop</h1>
        <ChatDoor refCode={ref} />
      </main>

      <style>{`
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
          max-width: 540px; margin: 0 auto; padding: 3rem 32px 6rem; width: 100%;
          text-align: left;
        }
        .primer-h1 {
          margin: 0 0 26px; font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 500;
          font-size: clamp(27px, 1.5rem + 1.4vw, 34px); line-height: 1.2;
          letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1, "swsh" 1;
        }

        .cta-section { display: flex; flex-direction: column; align-items: flex-start; gap: 0; margin: 12px 0 0; width: 100%; }
        .act-row {
          position: relative; width: 100%; max-width: 460px; margin: 0 0 10px;
        }
        .act-num {
          position: absolute; left: -24px; top: 50%; transform: translateY(-50%);
          width: 12px; text-align: right;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; color: var(--text-muted, rgba(26, 19, 24, 0.4));
          font-variant-numeric: lining-nums;
        }
        .door-btn {
          display: block; width: 100%; text-align: left;
          background: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.14)); border-radius: 9px;
          padding: 15px 18px; cursor: pointer;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 16px; letter-spacing: 0.01em; color: var(--text-primary);
          text-decoration: none;
          transition: border-color 200ms, transform 120ms;
        }
        .door-btn:hover { border-color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
        .door-btn:active { transform: scale(0.992); }
        .door-block { margin: 4px 0 0; width: 100%; }
        .door-q {
          margin: 0 0 16px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 19px; letter-spacing: 0.01em; color: var(--text-primary);
        }
        .door-answers { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 460px; }
        .act-box {
          width: 100%; max-width: none; text-decoration: none; display: block;
          font-size: 14px; white-space: normal; text-wrap: pretty; line-height: 1.4;
        }
        .act-box.is-note {
          cursor: default; margin: 0;
        }
        .act-box.is-note:hover { border-color: var(--bg-tertiary, rgba(26, 19, 24, 0.14)); }
        .act-box.is-note:active { transform: none; }
        .act-why { color: var(--text-muted, rgba(26, 19, 24, 0.55)); }
        .act-rest {
          display: block; margin-top: 3px;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
          text-wrap: pretty;
        }
        .act-email { display: flex; align-items: center; gap: 0; cursor: text; white-space: nowrap; }
        .act-email input {
          flex: none; width: 5.5em; min-width: 0; background: transparent; border: none; outline: none;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: inherit; letter-spacing: 0.01em; color: var(--text-primary);
          padding: 0;
        }
        .act-email input.has-val { flex: 1; }
        .act-email .join-door-go { margin-left: auto; }
        .act-email input::placeholder { color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
        .act-email input[data-shake="on"] { animation: chatShake 320ms ease-in-out; }
        .act-email-why {
          flex: none; max-width: 28em; overflow: hidden; opacity: 1;
          transition: opacity 180ms ease, max-width 220ms ease;
        }
        .act-email.is-focused .act-email-why {
          opacity: 0; max-width: 0; pointer-events: none;
        }
        .act-sent { font-size: inherit; }
        @keyframes chatShake {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-3px); border-bottom-color: #b3261e; }
          75%      { transform: translateX(3px);  border-bottom-color: #b3261e; }
        }
        .join-door-go {
          display: inline-flex; align-items: center; gap: 5px; flex: none;
          align-self: center; padding: 0; background: none; border: none;
          color: var(--text-muted); cursor: pointer; text-decoration: none;
          transition: color 200ms, opacity 200ms;
          animation: chatGoAppear 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        .join-door-go:hover { color: var(--text-primary); }
        .join-door-go:disabled { cursor: default; }
        .join-go-word {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 11px; letter-spacing: 0.1em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1; line-height: 1;
        }
        .join-door-go .door-glyph { display: block; }
        @keyframes chatGoAppear {
          from { opacity: 0; transform: translateX(-5px); }
          to { opacity: 1; transform: none; }
        }
        .cta-btn { white-space: normal; text-wrap: pretty; }
        .cta-btn.is-copied {
          border-color: var(--accent); background: var(--bg-primary);
        }

        @media (max-width: 640px) {
          .primer-main { padding: 2rem 24px 4rem; }
          .primer-h1 { font-size: 28px; line-height: 1.3; margin-bottom: 18px; }
          .act-box { font-size: 11.5px; letter-spacing: -0.02em; padding-left: 8px; padding-right: 8px; }
        }
      `}</style>
    </div>
  );
}
