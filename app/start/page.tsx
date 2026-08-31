import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import StartDoor from './StartDoor';

// Own metadata (2026-07-17 SEO sweep) — the highest-priority page after
// the homepage was inheriting the root title and description.
export const metadata = pageMetadata({
  path: '/start',
  title: 'start alexandria.',
  description:
    'start your alexandria loop from the ai you already use — local, remote, folder-based, or chat.',
});

// One front door, then agent or chat. The agent branch names the preferred live
// computer mode and the useful cloud-snapshot mode. Chat restores its approved
// host-specific instructions → Drive → first-setup path.
//
// Composition: a single flush-left editorial column (not a centred stack). The
// eyebrow ("the free tool") is the one accent on the skeleton and names which
// half of the two things this is — the free tool, vs the community at /join.
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
        {/* No lede (2026-07-16, radical simplicity): the two steps are the
            page; the lede's privacy line lives in the fine print below. */}
        <h1 className="primer-h1">start your loop</h1>

        {/* The person chooses the category they already understand. Agents
            then split only on live-computer or cloud-snapshot execution. */}
        <StartDoor refCode={ref} />

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

        /* The hero — EB Garamond calligraphic italic, matching the /join
           title treatment (founder 2026-07-17: "I like the bold title we
           have in the other pages"). */
        .primer-h1 {
          margin: 0 0 26px; font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 500;
          font-size: clamp(27px, 1.5rem + 1.4vw, 34px); line-height: 1.2;
          letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1, "swsh" 1;
        }

        .primer-lede {
          margin: 0 0 44px; max-width: 460px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px; line-height: 1.6; color: var(--text-secondary);
          text-wrap: pretty;
        }

        /* CTA — every box shares the text spine; numerals sit just outside it. */
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
        .step-agents {
          margin: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.6;
          color: var(--text-secondary, rgba(26, 19, 24, 0.75));
        }
        .step-agents code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12.5px; color: var(--text-primary);
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
        .copy-word {
          background: none; border: none; padding: 0; cursor: pointer;
          font: inherit; color: var(--text-primary);
          border-bottom: 1px dotted var(--text-muted, rgba(26, 19, 24, 0.45));
          transition: border-color 200ms;
        }
        .copy-word:hover { border-bottom-color: var(--text-primary); }
        .email-line {
          margin: 30px 0 10px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.6));
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

        /* Do-it-later net — the SECOND section, in /join's door idiom:
           small-caps question, underline field sized to its ghost text, the
           send-arrow appearing only on typing, tick on sent, shake on an
           invalid submit. */
        .start-later {
          margin: 34px 0 0; padding-top: 28px; width: 100%; max-width: 460px;
          border-top: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.10));
        }
        .join-door-q {
          display: block; margin: 0 0 10px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 12px; letter-spacing: 0.12em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: var(--text-muted); line-height: 1;
        }
        .join-door-field {
          display: inline-flex; align-items: baseline; gap: 9px;
          max-width: 100%;
        }
        .join-door-field input {
          width: auto; flex: none; min-width: 0; max-width: 340px;
          height: 32px; padding: 0 1px;
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 15px;
          color: var(--text-primary); background: transparent;
          border: none; border-bottom: 1px solid var(--text-muted, rgba(61, 54, 48, 0.3));
          border-radius: 0; outline: none; transition: border-color 200ms;
        }
        .join-door-field input::placeholder { color: var(--text-muted, rgba(61, 54, 48, 0.42)); }
        .join-door-field input:focus { border-bottom-color: var(--text-secondary, rgba(61, 54, 48, 0.7)); }
        .join-door-field input[data-shake="on"] { animation: startShake 320ms ease-in-out; }
        @keyframes startShake {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-3px); border-bottom-color: #b3261e; }
          75%      { transform: translateX(3px);  border-bottom-color: #b3261e; }
        }
        .join-door-go {
          display: inline-flex; align-items: center; gap: 5px; flex: none;
          align-self: center; padding: 0; background: none; border: none;
          color: var(--text-muted); cursor: pointer; text-decoration: none;
          transition: color 200ms, opacity 200ms;
          animation: startGoAppear 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        .join-door-go:hover { color: var(--text-primary); }
        .join-door-go.is-done { color: var(--text-primary); cursor: default; }
        .join-door-go:disabled { cursor: default; }
        .join-go-word {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 11px; letter-spacing: 0.1em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1; line-height: 1;
        }
        .join-door-go .door-glyph { display: block; }
        @keyframes startGoAppear {
          from { opacity: 0; transform: translateX(-5px); }
          to { opacity: 1; transform: none; }
        }
        .join-door-hint {
          margin: 9px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 12.5px; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(61, 54, 48, 0.5));
        }

        .primer-coda {
          margin: 28px 0 0; text-align: left; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 20px; font-style: italic; color: var(--text-primary);
          letter-spacing: 0.005em; opacity: 0.72;
        }

        .door-block { margin: 4px 0 0; width: 100%; }
        .door-stage {
          width: 100%;
          transition:
            opacity 170ms cubic-bezier(0.65, 0, 0.35, 1),
            transform 170ms cubic-bezier(0.65, 0, 0.35, 1);
        }
        .door-stage.is-leaving {
          opacity: 0;
          transform: translateY(-4px);
          pointer-events: none;
        }
        .door-stage.is-entering {
          animation: doorStageIn 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
          pointer-events: none;
        }
        @keyframes doorStageIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        .door-q {
          margin: 0 0 16px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 19px; letter-spacing: 0.01em; color: var(--text-primary);
        }
        .door-answers { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 460px; }
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
        .door-choice {
          transition:
            opacity 180ms ease,
            border-color 200ms,
            background 220ms ease;
        }
        .door-choice.is-selected {
          border-color: var(--accent);
          background: var(--bg-primary);
        }
        .door-choice.is-dismissed {
          opacity: 0.28; pointer-events: none;
        }
        .door-confirmation {
          display: inline-block;
          animation: doorConfirmationIn 240ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        @keyframes doorConfirmationIn {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: none; }
        }
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
        .act-box {
          width: 100%; max-width: none; text-decoration: none; display: block;
          font-size: 14px; white-space: normal; text-wrap: pretty; line-height: 1.4;
          max-inline-size: 100%; overflow-wrap: anywhere;
        }
        .act-why { color: var(--text-muted, rgba(26, 19, 24, 0.55)); }
        .act-rest {
          display: block; margin-top: 3px;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
          white-space: normal; font-size: 12px; line-height: 1.35; letter-spacing: 0;
          max-inline-size: 100%; overflow-wrap: anywhere;
        }
        .setup-copy {
          white-space: nowrap; text-wrap: nowrap; overflow-wrap: normal; letter-spacing: 0;
        }
        .shortcut-add {
          white-space: nowrap; text-wrap: nowrap; overflow-wrap: normal; letter-spacing: 0;
        }
        .act-sub {
          margin: -2px 0 14px 46px; max-width: 420px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; line-height: 1.55; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.5));
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
        .act-email-error { margin-left: 8px; color: var(--text-muted, rgba(26, 19, 24, 0.55)); }
        .act-email input::placeholder { color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
        .act-email input[data-shake="on"] { animation: startShake 320ms ease-in-out; }
        .act-email-why {
          flex: none; max-width: 28em; overflow: hidden; opacity: 1;
          transition: opacity 180ms ease, max-width 220ms ease;
        }
        .act-email.is-focused .act-email-why {
          opacity: 0; max-width: 0; pointer-events: none;
        }
        .act-sent { font-size: inherit; }
        .cta-btn.is-copied {
          border-color: var(--accent); background: var(--bg-primary);
        }
        .door-hint {
          margin: 14px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 13px; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .chat-block-label {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 15px; letter-spacing: 0.02em;
          color: var(--text-primary);
        }
        .start-footnote code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
        }
        .chat-rest {
          margin: 14px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 14px; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .door-next { margin-top: 30px; max-width: 460px; }
        .start-footnote {
          margin: 44px 0 0; padding-top: 18px; max-width: 460px;
          border-top: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.10));
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 12.5px; line-height: 1.65; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.5));
        }
        .start-footnote a {
          color: var(--text-secondary, rgba(26, 19, 24, 0.7));
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.35));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
        }
        .door-switch {
          margin: 26px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .start-grab {
          margin: -6px 0 30px; max-width: 480px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 16px; line-height: 1.6; color: var(--text-secondary);
          text-wrap: pretty;
        }

        /* The 2×2 section labels — computer / phone. Small-caps, a notch
           more present than the fine-print questions. */
        .start-section {
          margin: 0 0 16px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 12.5px; letter-spacing: 0.14em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: var(--text-muted); line-height: 1;
        }
        .start-section-later {
          margin-top: 38px; padding-top: 28px; width: 100%; max-width: 460px;
          border-top: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.10));
        }
        .start-shortcut-a {
          color: var(--text-primary);
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: text-decoration-color 200ms;
        }
        .start-shortcut-a:hover { text-decoration-color: var(--text-primary); }

        /* Fine print as three question/answer pairs — the door idiom, one
           notch quieter than the phone section above. */
        .start-qa { margin: 0 0 16px; }
        .start-qa:last-child { margin-bottom: 0; }
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
        .start-qa-a code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px; color: var(--text-primary);
        }

        @media (max-width: 640px) {
          .primer-main { padding: 2rem 24px 4rem; }
          .primer-h1 { font-size: 28px; line-height: 1.3; margin-bottom: 18px; }
          .primer-lede { font-size: 16px; margin-bottom: 36px; }
          .install-cmd { font-size: 12.5px; }
          .primer-coda { font-size: 18px; margin-top: 52px; }
          .act-box { font-size: 14px; padding-left: 12px; padding-right: 12px; }
          .shortcut-add { font-size: clamp(10.5px, 3.25vw, 14px); }
          .act-email { flex-wrap: wrap; white-space: normal; overflow: visible; }
          .act-email-why {
            flex: none; flex-basis: 100%; max-width: 100%; margin-top: 3px;
            white-space: normal; overflow: visible;
          }
          .act-email.is-focused { flex-wrap: nowrap; }
          .act-email.is-focused .act-email-why { flex-basis: 0; margin-top: 0; }
          .act-email input { font-size: 16px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .door-stage {
            transition: opacity 80ms cubic-bezier(0.25, 1, 0.5, 1);
          }
          .door-stage.is-leaving { transform: none; }
          .door-stage.is-entering {
            animation: doorStageFadeIn 160ms cubic-bezier(0.25, 1, 0.5, 1) both;
          }
          @keyframes doorStageFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
