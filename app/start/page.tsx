import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import StartCTA from './StartCTA';
import MobileStart from './MobileStart';

// The front door for someone who already clicked "join the tribe" — bought in,
// here to act. One job: get the command into their agent. So: brand header, the
// command, and one quiet line that dissolves the curl|bash hesitation (their own
// ai reads the open script). No product pitch — the homepage/video did that.
//
// Two CTAs, switched on input method, not width (a narrow desktop window still
// has a terminal; a wide iPad doesn't): pointer-fine devices get the copy-paste
// command, touch devices get the Shortcut + send-it-to-my-computer flow.
export default function StartPage() {
  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        <h1 className="primer-h1">becoming alexandrian</h1>

        <div className="start-desktop">
          <StartCTA />

          <p className="primer-trust">
            it just adds a folder and a thin layer to the ai you already use
            &mdash; nothing&rsquo;s ever sent to us. not sure? paste it in and ask what
            it does first; your agent reads every line of the{' '}
            <a
              href="https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh"
              target="_blank"
              rel="noopener noreferrer"
            >
              open script
            </a>
            .
          </p>
        </div>

        <div className="start-mobile">
          <MobileStart />
        </div>

        <p className="primer-coda"><em>keep thinking.</em></p>
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

        /* The whole page is centred in the viewport — the command floating in
           space, framed by one line above and a few words below. */
        .primer-main {
          flex: 1;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          max-width: 540px; margin: 0 auto; padding: 3rem 24px 6rem; width: 100%;
        }

        .primer-h1 {
          margin: 0 0 56px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 400; font-size: 31px; line-height: 1.4;
          letter-spacing: -0.005em; color: var(--text-primary); text-wrap: balance;
          text-align: center; font-feature-settings: "kern" 1, "liga" 1, "dlig" 1;
        }
        .primer-h1 em { font-style: italic; }

        .primer-trust {
          margin: 40px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.6; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: center;
          font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
        }
        .primer-trust a {
          color: var(--text-secondary, rgba(26, 19, 24, 0.8));
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: color 200ms, text-decoration-color 200ms;
        }
        .primer-trust a:hover { text-decoration-color: var(--text-primary); color: var(--text-primary); }

        /* CTA — one-click claude code first, the copy-block as the
           universal fallback beneath. */
        .cta-section { display: flex; flex-direction: column; align-items: center; gap: 0; margin: 0; }
        .cc-cta {
          display: inline-flex; align-items: center; justify-content: center;
          min-height: 52px; padding: 14px 34px; border-radius: 9px;
          background: var(--text-primary); color: var(--bg-primary);
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 17.5px;
          letter-spacing: 0.01em; text-decoration: none; cursor: pointer;
          transition: opacity 200ms, transform 120ms;
        }
        .cc-cta:hover { opacity: 0.85; }
        .cc-cta:active { transform: scale(0.99); }
        .cc-hint { margin-top: 14px; }
        .cta-or {
          margin: 34px 0 14px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 12.5px; letter-spacing: 0.06em;
          color: var(--text-muted, rgba(26, 19, 24, 0.45)); user-select: none;
        }
        .install-block {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          width: 100%; max-width: 440px; background: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.14)); border-radius: 9px;
          padding: 16px 18px; cursor: pointer; font: inherit; text-align: left;
          transition: border-color 200ms, transform 120ms;
        }
        .install-block:hover { border-color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
        .install-block:active { transform: scale(0.992); }
        .install-cmd {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 14px; color: var(--text-primary); white-space: nowrap;
          overflow-x: auto; scrollbar-width: none;
        }
        .install-cmd::-webkit-scrollbar { display: none; }
        .install-copy {
          display: inline-flex; align-items: center; flex-shrink: 0;
          color: var(--text-muted, rgba(26, 19, 24, 0.5)); transition: color 200ms;
        }
        .install-block:hover .install-copy { color: var(--text-primary); }
        .install-hint {
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-style: italic;
          font-size: 13px; letter-spacing: 0.04em; color: var(--text-muted, rgba(26, 19, 24, 0.55));
          margin: 16px 0 0; text-align: center;
        }
        .install-where {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 12px; line-height: 1.6; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.42)); text-align: center;
          margin: 8px 0 0; max-width: 420px;
        }

        .primer-coda {
          margin: 60px 0 0; text-align: center; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 20px; font-style: italic; color: var(--text-primary);
          letter-spacing: 0.005em; opacity: 0.72;
        }

        /* Input-method switch: touch devices have no terminal, so they get the
           Shortcut + email flow; everything else keeps the copy-paste command. */
        .start-desktop { display: contents; }
        .start-mobile { display: none; }
        @media (hover: none) and (pointer: coarse) {
          .start-desktop { display: none; }
          .start-mobile { display: contents; }
        }

        /* Mobile CTA — the Shortcut is the one action (filled, calm, generous
           touch target); the email delivery sits quiet underneath. */
        .mobile-cta {
          display: flex; flex-direction: column; align-items: center;
          width: 100%; max-width: 380px;
        }
        .mobile-shortcut-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 100%; min-height: 54px; padding: 14px 30px; border-radius: 9px;
          background: var(--text-primary); color: var(--bg-primary);
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 18px;
          letter-spacing: 0.01em; text-decoration: none; cursor: pointer;
          transition: opacity 200ms, transform 120ms;
        }
        .mobile-shortcut-btn:active { transform: scale(0.99); opacity: 0.85; }
        .mobile-shortcut-hint {
          margin: 16px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 13.5px; line-height: 1.6; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: center;
          max-width: 320px;
        }

        .mobile-email {
          display: flex; flex-direction: column; align-items: center;
          width: 100%; margin-top: 52px;
        }
        .mobile-email-lead {
          margin: 0 0 14px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(26, 19, 24, 0.8)); text-align: center;
        }
        .mobile-email-row {
          display: flex; gap: 8px; width: 100%;
        }
        .mobile-email-row input {
          flex: 1; min-width: 0; min-height: 48px; padding: 10px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.14));
          border-radius: 9px; color: var(--text-primary);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 16px; /* >=16px — prevents iOS zoom-on-focus */
          outline: none; transition: border-color 200ms;
        }
        .mobile-email-row input:focus { border-color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
        .mobile-email-row input::placeholder { color: var(--text-muted, rgba(26, 19, 24, 0.4)); }
        .mobile-email-row button {
          min-height: 48px; padding: 10px 20px; border-radius: 9px;
          background: transparent; color: var(--text-primary);
          border: 1px solid var(--text-muted, rgba(26, 19, 24, 0.35));
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 16px;
          letter-spacing: 0.01em; cursor: pointer;
          transition: opacity 200ms, transform 120ms;
        }
        .mobile-email-row button:active { transform: scale(0.98); }
        .mobile-email-row button:disabled { opacity: 0.5; }
        .mobile-email-hint {
          margin: 12px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 12.5px; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(26, 19, 24, 0.5)); text-align: center;
        }
        .mobile-email-done {
          margin: 6px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 15px; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(26, 19, 24, 0.8)); text-align: center;
        }

        @media (max-width: 640px) {
          .primer-main { padding: 2rem 20px 4rem; }
          .primer-h1 { font-size: 25px; line-height: 1.4; margin-bottom: 48px; }
          .install-cmd { font-size: 12.5px; }
          .primer-coda { font-size: 18px; margin-top: 52px; }
        }
      `}</style>
    </div>
  );
}
