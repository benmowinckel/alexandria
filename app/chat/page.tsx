import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import ChatCTA from './ChatCTA';

export const metadata = pageMetadata({
  path: '/chat',
  title: 'alexandria in every chat.',
  description:
    'Paste Alexandria once into ChatGPT or Claude instructions. Memory keeps your thinking; instructions keep Alexandria running.',
});

// Door 2 of the two-door onboarding (can you run a terminal command? no → here).
// One compact block fits the free ChatGPT instruction limit and works in
// Claude profile instructions. The user's AI selects memory, Drive, or files.
function readBootstrap(): string {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'factory', 'chat', 'bootstrap.md'),
    'utf8',
  );
  const m = raw.match(/---PROMPT START---\n([\s\S]*?)\n---PROMPT END---/);
  return m ? m[1].trim() : '';
}

export default function ChatPage() {
  const bootstrap = readBootstrap();

  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        <h1 className="primer-h1">Paste once.<br />Then keep chatting normally.</h1>

        <p className="start-grab">
          Put Alexandria in your AI&apos;s Instructions once. Memory keeps your thinking; the instruction keeps Alexandria running.
        </p>

        <ChatCTA bootstrap={bootstrap} />

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
        .primer-eyebrow {
          margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 11px; letter-spacing: 0.3em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: var(--accent); line-height: 1;
        }
        .primer-h1 {
          margin: 0 0 26px; font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 500;
          font-size: clamp(27px, 1.5rem + 1.4vw, 34px); line-height: 1.2;
          letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1, "swsh" 1;
        }
        .start-grab {
          margin: -6px 0 30px; max-width: 480px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 16px; line-height: 1.6; color: var(--text-secondary);
          text-wrap: pretty;
        }
        .start-grab strong { font-weight: 600; color: var(--text-primary); }

        .cta-section { display: flex; flex-direction: column; align-items: flex-start; gap: 0; margin: 12px 0 0; width: 100%; }
        .step-line {
          margin: 0 0 12px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px; letter-spacing: 0.01em;
          color: var(--text-primary);
        }
        .step-two { margin: 28px 0 6px; }
        .step-num { color: var(--text-muted, rgba(26, 19, 24, 0.45)); font-variant-numeric: lining-nums; }
        .chat-rest {
          margin: 14px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 14px; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .chat-where {
          margin: 3px 0 0; font-size: 14px; color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .chat-details {
          margin: 13px 0 0; font-size: 13px; line-height: 1.55;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .chat-details summary { cursor: pointer; }
        .chat-details p { margin: 8px 0 0; max-width: 450px; }


        .door-btn {
          display: block; width: 100%; max-width: 460px; text-align: left;
          background: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.14)); border-radius: 10px;
          padding: 17px 20px; cursor: pointer;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px; letter-spacing: 0.01em; color: var(--text-primary);
          transition: border-color 220ms, transform 120ms, background 220ms;
        }
        .door-btn:hover { border-color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
        .door-btn:active { transform: scale(0.992); }
        .act-why { color: var(--text-muted, rgba(26, 19, 24, 0.55)); }
        .cta-btn.is-copied {
          border-color: var(--accent); color: var(--text-primary);
          background: var(--bg-primary);
        }
        .start-details {
          margin: 36px 0 0; padding-top: 24px; width: 100%; max-width: 460px;
          border-top: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.10));
          display: flex; flex-direction: column; gap: 16px;
        }
        .start-qa { margin: 0; }
        .start-qa-q {
          margin: 0 0 5px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 11px; letter-spacing: 0.12em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: var(--text-muted, rgba(26, 19, 24, 0.5)); line-height: 1;
        }
        .start-qa-a {
          margin: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13.5px; line-height: 1.6; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.62));
        }
        .start-shortcut-a {
          color: var(--text-primary);
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: text-decoration-color 200ms;
        }
        .start-shortcut-a:hover { text-decoration-color: var(--text-primary); }

        .primer-coda {
          margin: 28px 0 0; text-align: left; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 20px; font-style: italic; color: var(--text-primary);
          letter-spacing: 0.005em; opacity: 0.72;
        }

        @media (max-width: 640px) {
          .primer-main { padding: 2rem 24px 4rem; }
          .primer-h1 { font-size: 28px; line-height: 1.3; margin-bottom: 18px; }
          .primer-coda { font-size: 18px; margin-top: 52px; }
        }
      `}</style>
    </div>
  );
}
