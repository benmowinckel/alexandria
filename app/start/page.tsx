import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import StartCTA from './StartCTA';
import MobileStart from './MobileStart';

// The front door for someone who already clicked "join the tribe" — bought in,
// here to act. One job: get the command into their agent. So: brand header, the
// command, and one quiet line that dissolves the curl|bash hesitation (their own
// ai reads the open script). No product pitch — the homepage/video did that.
//
// Composition: a single flush-left editorial column (not a centred stack). The
// eyebrow ("the free tool") is the one accent on the skeleton and names which
// half of the two things this is — the free tool, vs the community at /join.
//
// Two CTAs, switched on input method, not width (a narrow desktop window still
// has a terminal; a wide iPad doesn't): pointer-fine devices get the copy-paste
// command, touch devices get the Shortcut + send-it-to-my-computer flow.
//
// Invite target: a member's link is /start?ref=THEIR_LOGIN. The ref rides down
// into StartCTA, which validates it against /check-kin before showing the invite
// banner or tagging the install command. GitHub logins are [A-Za-z0-9-], so we
// sanitise ref to that before it touches the client.
function cleanRef(raw: string | undefined): string {
  return (raw || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
}

export default async function StartPage({
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
        <p className="primer-eyebrow">the free tool</p>
        {/* No lede (2026-07-16, radical simplicity): the two steps are the
            page; the lede's privacy line lives in the fine print below. */}
        <h1 className="primer-h1">becoming an alexandrian</h1>

        <div className="start-desktop">
          {/* StartCTA carries the command, the curl|bash reassurance, and the
              do-it-later email net (the trust line moved inside it 2026-07-13
              so the email fallback stays the terminal element). */}
          <StartCTA refCode={ref} />
        </div>

        <div className="start-mobile">
          <MobileStart refCode={ref} />
        </div>

        {/* The handoff to the other half: the tool is free and stands alone, but
            the funnel's terminal step is the community. Quiet, below the action,
            so it reads as "next" not "instead". */}
        <p className="primer-next">
          once it&rsquo;s running, <Link href="/join" className="primer-next-link">join the community &rarr;</Link>
        </p>

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

        /* One flush-left editorial column, vertically centred. The left edge is
           the spine every element hangs from — no centred stack, no ragged tail. */
        .primer-main {
          flex: 1;
          display: flex; flex-direction: column;
          align-items: flex-start; justify-content: center;
          max-width: 540px; margin: 0 auto; padding: 3rem 32px 6rem; width: 100%;
          text-align: left;
        }

        /* The one accent on the skeleton — small-caps, spaced, in the brand
           plum. Names the half of the product this page is. */
        .primer-eyebrow {
          margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 11px; letter-spacing: 0.3em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: var(--accent); line-height: 1;
        }

        .primer-h1 {
          margin: 0 0 20px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 400; font-size: 34px; line-height: 1.25;
          letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1;
        }

        .primer-lede {
          margin: 0 0 44px; max-width: 460px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px; line-height: 1.6; color: var(--text-secondary);
          text-wrap: pretty;
        }

        .primer-trust {
          margin: 36px 0 0; max-width: 460px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.65; letter-spacing: 0.01em;
          color: var(--text-muted); text-align: left;
          font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
        }
        .primer-trust a {
          color: var(--text-secondary);
          text-decoration: underline; text-decoration-color: var(--text-muted);
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: color 200ms, text-decoration-color 200ms;
        }
        .primer-trust a:hover { text-decoration-color: var(--text-primary); color: var(--text-primary); }

        /* CTA — the copy-block command is the single primary action; the whole
           cluster hangs from the left spine. */
        .cta-section { display: flex; flex-direction: column; align-items: flex-start; gap: 0; margin: 12px 0 0; width: 100%; }

        /* The two steps — readable instructions, faint numerals; the page IS
           these two lines plus the block between them. */
        .step-line {
          margin: 0 0 12px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px; letter-spacing: 0.01em;
          color: var(--text-primary);
        }
        .step-two { margin: 28px 0 6px; }
        .step-num { color: var(--text-muted, rgba(26, 19, 24, 0.45)); font-variant-numeric: lining-nums; }
        .step-copied {
          font-style: italic; font-size: 14px;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .step-agents {
          margin: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.6;
          color: var(--text-secondary, rgba(26, 19, 24, 0.75));
        }

        /* The fine print — every caveat, grouped under one hairline, quiet
           enough to skim past and small enough never to compete. */
        .start-details {
          margin: 36px 0 0; padding-top: 24px; width: 100%; max-width: 460px;
          border-top: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.10));
          display: flex; flex-direction: column; gap: 8px;
        }
        .start-details p {
          margin: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; line-height: 1.6; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .start-details code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11.5px;
        }

        /* Invite banner — warmer, personal, sits above the command when a kin
           link brought them here (only after the ref validates). */
        .install-invite {
          margin: 0 0 20px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; letter-spacing: 0.02em; font-style: italic;
          color: var(--accent); line-height: 1;
        }
        .install-block {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          width: 100%; max-width: 460px; background: var(--bg-secondary);
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
          margin: 14px 0 0; text-align: left;
        }
        .install-where {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 12px; line-height: 1.6; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.42)); text-align: left;
          margin: 8px 0 0; max-width: 460px;
        }
        .install-where code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
        }

        /* Quiet secondary link — the not-yet-convinced visitor's route back to
           the homepage pitch. Sits under the CTA cluster, subordinate to it. */
        .install-new {
          margin: 18px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: left;
        }
        .install-new a {
          color: var(--text-secondary, rgba(26, 19, 24, 0.8));
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: color 200ms, text-decoration-color 200ms;
        }
        .install-new a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }

        /* Do-it-later net — quiet by design (the command is the hero; this
           only catches the not-right-now visitor). Hairline rule sets it
           apart; input/button match the quiet decline capture on /join. */
        .start-later {
          margin: 30px 0 0; padding-top: 26px; width: 100%; max-width: 460px;
          border-top: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.10));
        }
        .start-later-lede {
          margin: 0 0 12px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13.5px; line-height: 1.65; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: left;
        }
        .start-later-row { display: flex; gap: 8px; width: 100%; }
        .start-later-row input {
          flex: 1; min-width: 0; height: 42px; padding: 0 14px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 16px; /* >=16px — prevents iOS zoom-on-focus */
          color: var(--text-primary); background: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.14)); border-radius: 8px;
          outline: none; transition: border-color 200ms;
        }
        .start-later-row input::placeholder { color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
        .start-later-row input:focus { border-color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
        .start-later-row button {
          height: 42px; padding: 0 18px; flex-shrink: 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 15px;
          letter-spacing: 0.01em; color: var(--text-secondary, rgba(26, 19, 24, 0.82));
          background: transparent; border: 1px solid var(--text-muted, rgba(26, 19, 24, 0.3));
          border-radius: 8px; cursor: pointer; transition: border-color 200ms, color 200ms;
        }
        .start-later-row button:hover { color: var(--text-primary); border-color: var(--text-secondary, rgba(26, 19, 24, 0.6)); }
        .start-later-row button:disabled { opacity: 0.5; cursor: default; }
        .start-later-done {
          margin: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.65; font-style: italic;
          color: var(--text-secondary, rgba(26, 19, 24, 0.82)); text-align: left;
        }
        .start-later-hint {
          margin: 8px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: left;
        }

        .primer-next {
          margin: 44px 0 0; text-align: left; max-width: 460px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 15px; line-height: 1.6; color: var(--text-muted);
        }
        .primer-next-link {
          color: var(--text-secondary);
          text-decoration: underline; text-decoration-color: var(--text-muted);
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: opacity 220ms ease;
        }
        .primer-next-link:hover { opacity: 0.6; }

        .primer-coda {
          margin: 28px 0 0; text-align: left; font-family: var(--font-serif), ui-serif, Georgia, serif;
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

        /* Mobile flow — installs happen on a computer, not a phone, so email
           is the hero (leave it, get the command + a nudge later); the Shortcut
           and the follow/explore links sit quiet underneath. */
        .mobile-cta {
          display: flex; flex-direction: column; align-items: flex-start;
          width: 100%; max-width: 400px;
        }

        /* The explanation — why the phone can't install, what to do instead. */
        .mobile-lede {
          margin: 0 0 26px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 15.5px; line-height: 1.6; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(26, 19, 24, 0.8)); text-align: left;
          max-width: 384px; text-wrap: pretty;
        }

        /* Email — the primary action. min-height reserves the form's footprint
           (row 48 + hint 25 + gap) so the swap to the one-line "sent" state
           doesn't pull the secondary block up. */
        .mobile-email {
          display: flex; flex-direction: column; align-items: flex-start;
          width: 100%; min-height: 86px;
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
        /* Filled — this is now the primary action on the page. */
        .mobile-email-row button {
          min-height: 48px; padding: 10px 24px; border-radius: 9px;
          background: var(--text-primary); color: var(--bg-primary);
          border: 1px solid var(--text-primary);
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 16px;
          letter-spacing: 0.01em; cursor: pointer;
          transition: opacity 200ms, transform 120ms;
        }
        .mobile-email-row button:hover { opacity: 0.85; }
        .mobile-email-row button:active { transform: scale(0.98); }
        .mobile-email-row button:disabled { opacity: 0.5; }
        .mobile-email-hint {
          margin: 12px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 12.5px; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(26, 19, 24, 0.5)); text-align: left;
        }
        .mobile-email-done {
          margin: 6px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 15px; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(26, 19, 24, 0.8)); text-align: left;
        }

        /* Secondary — do these from the phone now. Separated by a hairline
           rule; the Shortcut is demoted to a ghost button (email is the hero). */
        .mobile-more {
          display: flex; flex-direction: column; align-items: flex-start;
          width: 100%; margin-top: 38px; padding-top: 32px;
          border-top: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.10));
        }
        .mobile-more-lead {
          margin: 0 0 16px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 13.5px; letter-spacing: 0.03em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: left;
        }
        .mobile-shortcut-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 100%; min-height: 52px; padding: 13px 28px; border-radius: 9px;
          background: transparent; color: var(--text-primary);
          border: 1px solid var(--text-muted, rgba(26, 19, 24, 0.35));
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 17px;
          letter-spacing: 0.01em; text-decoration: none; cursor: pointer;
          transition: border-color 200ms, transform 120ms;
        }
        .mobile-shortcut-btn:hover { border-color: var(--text-primary); }
        .mobile-shortcut-btn:active { transform: scale(0.99); }
        .mobile-shortcut-hint {
          margin: 12px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 13px; line-height: 1.6; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: left;
          max-width: 340px;
        }
        .mobile-more-links {
          margin: 22px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: left;
        }
        .mobile-more-links a {
          color: var(--text-secondary, rgba(26, 19, 24, 0.8));
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: color 200ms, text-decoration-color 200ms;
        }
        .mobile-more-links a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }
        .mobile-more-sep { color: var(--text-muted, rgba(26, 19, 24, 0.4)); margin: 0 10px; }

        @media (max-width: 640px) {
          .primer-main { padding: 2rem 24px 4rem; }
          .primer-h1 { font-size: 28px; line-height: 1.3; margin-bottom: 18px; }
          .primer-lede { font-size: 16px; margin-bottom: 36px; }
          .install-cmd { font-size: 12.5px; }
          .primer-coda { font-size: 18px; margin-top: 52px; }
        }
      `}</style>
    </div>
  );
}
