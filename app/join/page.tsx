import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import JoinCTA from './JoinCTA';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/join',
  title: 'join alexandria.',
  description:
    'the tool is free forever; the community is two coffees a month — one uber ride, or free when three friends join with your code. become a founding member.',
});

// The founding-member JOIN — the paid half of the two things. The tool (the run)
// is free and keyless; this is the community (the Strava): the library, the
// marketplace, the tribe. Signing in with GitHub starts the trial ($10/mo, first
// month free, free with 3 kin, or email-to-waive) and assigns your number.
//
// The pitch is the homepage's FREE-SAMPLE frame, carried to the counter
// (founder direction 2026-07-17, mirroring the /start radical-simplicity
// pass): the tool is the sample and stays free; the community is the paid
// part, priced in throwaway money — two coffees a month, one Uber ride — so
// the reader's own spending does the arguing, and the close is his sentence:
// "support the project, and be a founding member". His same-day notes: never
// say "thing", no founding-number pitch, and the REFERRAL is the main ask —
// so the three-friends deal sits first-class under the button (join-referral),
// not in the fine print. The founding-bet honesty (founder verdict
// 2026-07-09: never sell the library/marketplace as arrived value) survives
// in the deal line ("you're founding one"). No roster pitch from the outside
// (who's in is visible once you're in, never the sell). A "no" has its own
// path: the JoinInterest email capture below the deal — every decline leaves
// a contactable address (the reach the community gets recruited from).
//
// Composition mirrors /start: one flush-left editorial column, an accent
// eyebrow ("the community") as the spine's anchor — the paid half, twinned
// with /start's "the free tool".
//
// This is also the invite target: a member's invite link is /join?ref=THEIR_CODE.
// The ref rides through GitHub OAuth (server round-trips it) so the inviter is
// credited as kin. GitHub usernames are [A-Za-z0-9-], so we sanitise ref to that
// before it touches the client — React escapes anyway, this just keeps a junk
// param from rendering. The client (JoinCTA) then validates the ref against
// /check-kin before the invite eyebrow shows or the code rides the OAuth URL, so
// a fake/typo ref never displays "invited you in" or credits a non-member.
function cleanRef(raw: string | undefined): string {
  return (raw || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; ref_source?: string }>;
}) {
  const params = await searchParams;
  const ref = cleanRef(params.ref) || undefined;
  const refSource = (params.ref_source || 'invite').replace(/[^a-z_]/g, '').slice(0, 24) || 'invite';

  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        {/* Eyebrow through decline path — a client cluster (JoinCTA) so the
            invite eyebrow, the join button's URL, and the have-a-code field all
            read the SAME /check-kin-validated ref. This is what fixes the
            invalid-ref eyebrow bug: nothing ref-dependent renders until the
            code is confirmed a real member login. */}
        <JoinCTA urlRef={ref} refSource={refSource} />

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

        /* One flush-left editorial column, vertically centred — the same spine
           as /start. */
        .primer-main {
          flex: 1;
          display: flex; flex-direction: column;
          align-items: flex-start; justify-content: center;
          max-width: 540px; margin: 0 auto; padding: 3rem 32px 6rem; width: 100%;
          text-align: left;
        }

        /* The one accent on the skeleton — small-caps, spaced, brand plum. */
        .primer-eyebrow {
          margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 11px; letter-spacing: 0.3em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: var(--accent); line-height: 1;
        }

        /* Invite variant — warmer, personal, replaces the label when a kin
           link brought them here. */
        .join-invite {
          margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; letter-spacing: 0.02em; font-style: italic;
          color: var(--accent); line-height: 1;
        }

        .primer-h1 {
          margin: 0 0 20px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 400; font-size: 34px; line-height: 1.25;
          letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1;
        }

        .primer-lede {
          margin: 0 0 40px; max-width: 460px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px; line-height: 1.6; color: var(--text-secondary);
          text-wrap: pretty;
        }

        /* The one action on the page. Filled, calm, hung from the left spine. */
        .join-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 14px 30px; border-radius: 9px;
          background: var(--text-primary); color: var(--bg-primary);
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 17px;
          letter-spacing: 0.01em; text-decoration: none; cursor: pointer;
          transition: opacity 200ms, transform 120ms;
        }
        .join-btn:hover { opacity: 0.85; }
        .join-btn:active { transform: scale(0.99); }

        /* The referral pitch — the main ask, so it reads at body weight
           (secondary ink, 15px), clearly above the muted fine print. */
        .join-referral {
          margin: 28px 0 0; max-width: 450px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 15px; line-height: 1.65; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(26, 19, 24, 0.82)); text-align: left;
          font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
        }

        .join-deal {
          margin: 32px 0 0; max-width: 450px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.7; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: left;
          font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
        }
        .join-deal a {
          color: var(--text-secondary, rgba(26, 19, 24, 0.82));
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: color 200ms, text-decoration-color 200ms;
        }
        .join-deal a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }

        /* Have-a-referral-code field — subtle by design: it sits under the join
           button for the person told a code with no ?ref= link, and must never
           compete with the button. Small label, low-contrast, single line. */
        .join-code { margin: 20px 0 0; max-width: 450px; width: 100%; }
        .join-code-label {
          display: block; margin: 0 0 8px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.5));
        }
        .join-code-row { display: flex; align-items: center; gap: 10px; }
        .join-code-row input {
          flex: 1; min-width: 0; height: 38px; padding: 0 12px;
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 16px;
          color: var(--text-primary); background: transparent;
          border: 1px solid var(--text-muted, rgba(26, 19, 24, 0.22)); border-radius: 8px;
          outline: none; transition: border-color 200ms;
        }
        .join-code-row input::placeholder { color: var(--text-muted, rgba(26, 19, 24, 0.4)); }
        .join-code-row input:focus { border-color: var(--text-muted, rgba(26, 19, 24, 0.5)); }
        .join-code-status {
          flex-shrink: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; font-style: italic; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.6));
        }

        /* Decline path — quiet by design: the escape hatch must not compete
           with the join button. Input/button heights matched; 16px input font
           so iOS Safari doesn't zoom on focus. */
        .join-interest { margin: 36px 0 0; max-width: 450px; width: 100%; }
        .join-interest-lede {
          margin: 0 0 12px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.7; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }
        .join-interest-row { display: flex; gap: 8px; }
        .join-interest-row input {
          flex: 1; min-width: 0; height: 40px; padding: 0 12px;
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 16px;
          color: var(--text-primary); background: transparent;
          border: 1px solid var(--text-muted, rgba(26, 19, 24, 0.3)); border-radius: 8px;
          outline: none; transition: border-color 200ms;
        }
        .join-interest-row input::placeholder { color: var(--text-muted, rgba(26, 19, 24, 0.45)); }
        .join-interest-row input:focus { border-color: var(--text-secondary, rgba(26, 19, 24, 0.6)); }
        .join-interest-row button {
          height: 40px; padding: 0 16px; flex-shrink: 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 14px;
          letter-spacing: 0.01em; color: var(--text-secondary, rgba(26, 19, 24, 0.82));
          background: transparent; border: 1px solid var(--text-muted, rgba(26, 19, 24, 0.3));
          border-radius: 8px; cursor: pointer; transition: border-color 200ms, color 200ms;
        }
        .join-interest-row button:hover { color: var(--text-primary); border-color: var(--text-secondary, rgba(26, 19, 24, 0.6)); }
        .join-interest-row button:disabled { opacity: 0.5; cursor: default; }
        .join-interest-done {
          margin: 36px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.7; font-style: italic;
          color: var(--text-secondary, rgba(26, 19, 24, 0.82));
        }
        .join-interest-hint {
          margin: 8px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }

        .join-secondary {
          margin: 28px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.6; color: var(--text-muted, rgba(26, 19, 24, 0.55));
          text-align: left;
        }
        .join-secondary a {
          color: var(--text-secondary, rgba(26, 19, 24, 0.8));
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: color 200ms, text-decoration-color 200ms;
        }
        .join-secondary a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }

        .primer-coda {
          margin: 56px 0 0; text-align: left; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 20px; font-style: italic; color: var(--text-primary);
          letter-spacing: 0.005em; opacity: 0.72;
        }

        @media (max-width: 640px) {
          .primer-main { padding: 2rem 24px 4rem; }
          .primer-h1 { font-size: 28px; line-height: 1.3; margin-bottom: 18px; }
          .primer-lede { font-size: 16px; margin-bottom: 32px; }
          .primer-coda { font-size: 18px; margin-top: 48px; }
        }
      `}</style>
    </div>
  );
}
