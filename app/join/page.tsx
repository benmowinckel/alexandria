import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import JoinCTA from './JoinCTA';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/join',
  title: 'join alexandria.',
  description:
    'the tool was the free sample — the community is the full meal. first month free; three friends = free indefinitely; otherwise $10 — two coffees a month. become a founding member.',
});

// The founding-member JOIN — the paid half of the two things. The tool (the run)
// is free and keyless; this is the community (the Strava): the library, the
// marketplace, the tribe. Signing in with GitHub starts the trial ($10/mo, first
// month free, free with 3 kin, or email-to-waive) and assigns your number.
//
// The copy is FOUNDER-WRITTEN (2026-07-17, fifth pass — he dictated the
// whole page; near-verbatim, transcript cleaned). Above the button: the
// sample→full-meal frame, first-month-free-just-try-it, three-friends =
// free indefinitely. Under the button: his $10 paragraph (before you get
// yourself worked up / two coffees, one Uber, a package delivery charge /
// don't be a penny pincher! / a dollar there is a dollar here, but here
// you're supporting our project) and the no-friends-no-dollars waive ending
// on "keep thinking, together". Fine print under one hairline is his three
// questions: been referred by a friend? (code field) · don't want the
// community? (JoinInterest email) · don't have the free tool yet? (/start).
// "The full meal" fills his open slot ("the full product (or dish, or
// something idk)"). No roster pitch from the outside (who's in is visible
// once you're in, never the sell). A "no" has its own path: the JoinInterest
// email capture below the fine print — every decline leaves a contactable
// address (the reach the community gets recruited from).
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

        /* One flush-left editorial column, vertically centred. Wider than
           /start (620 vs 540) so the hero has room to breathe — the founder's
           "why is it so narrow" note. Body paragraphs re-cap their own measure
           for readability; the hero spans the full column. */
        .primer-main {
          flex: 1;
          display: flex; flex-direction: column;
          align-items: flex-start; justify-content: center;
          max-width: 620px; margin: 0 auto; padding: 3rem 32px 6rem; width: 100%;
          text-align: left;
        }

        /* The one label on the skeleton — small-caps, spaced, muted ink (no
           colour, per the founder's calm-monochrome steer). */
        .primer-eyebrow {
          margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 11px; letter-spacing: 0.3em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: var(--text-muted); line-height: 1;
        }

        /* Invite variant — warmer, personal, replaces the label when a kin
           link brought them here. */
        .join-invite {
          margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; letter-spacing: 0.02em; font-style: italic;
          color: var(--text-secondary); line-height: 1;
        }

        /* THE HERO — a calm headline, not a shout (founder 2026-07-17: "too
           loud… really simple"). Modest display size, ink only, italic. */
        .join-hero {
          margin: 0 0 26px; max-width: 480px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 400;
          font-size: clamp(23px, 1.5rem + 0.7vw, 27px); line-height: 1.28;
          letter-spacing: -0.01em; color: var(--text-primary);
          text-wrap: balance;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1;
        }

        /* THE OFFER — the two simple facts. Plain body ink, no colour, no
           emphasis — the reader's whole decision, read in two seconds. */
        .join-offer { max-width: 460px; margin: 0 0 30px; }
        .join-offer-line {
          margin: 0 0 10px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 16px; line-height: 1.55; letter-spacing: 0.005em;
          color: var(--text-primary); text-wrap: pretty;
        }
        .join-offer-line:last-child { margin-bottom: 0; }

        /* THE $10 TRUTH — de-emphasised reassurance, clearly below the action. */
        .join-explain {
          margin: 32px 0 0; max-width: 500px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.72; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(26, 19, 24, 0.75)); text-wrap: pretty;
        }
        /* The waive — quietest: his voice, the generosity that keeps it fair. */
        .join-waive {
          margin: 12px 0 0; max-width: 500px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.72; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-wrap: pretty;
        }
        .join-waive a {
          color: var(--text-secondary, rgba(26, 19, 24, 0.82));
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: color 200ms, text-decoration-color 200ms;
        }
        .join-waive a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }

        /* THE ONE ACTION — filled, calm, hung from the left spine. No shadow,
           no flourish; it just needs to be the obvious thing to click. */
        .join-btn {
          display: inline-flex; align-items: center; justify-content: center;
          margin: 26px 0 0; padding: 13px 28px; border-radius: 9px;
          background: var(--text-primary); color: var(--bg-primary);
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 16px;
          letter-spacing: 0.01em; text-decoration: none; cursor: pointer;
          transition: opacity 200ms, transform 120ms;
        }
        .join-btn:hover { opacity: 0.88; }
        .join-btn:active { transform: scale(0.99); }

        /* THE OTHER DOORS — the three exits under one hairline. Tertiary by
           design: each is a small muted question + an editorial underline
           control (no boxes), evenly spaced so the eye can pick its exit in
           one scan. This is the "simple to navigate" the founder asked for. */
        .join-doors {
          margin: 40px 0 0; padding-top: 30px; width: 100%; max-width: 520px;
          border-top: 1px solid var(--bg-tertiary, rgba(61, 54, 48, 0.12));
          display: flex; flex-direction: column; gap: 26px;
        }
        .join-door { width: 100%; }
        .join-door-q {
          display: block; margin: 0 0 9px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 14px; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(61, 54, 48, 0.7));
        }
        /* Underline field — border-bottom only, editorial not form-y. Capped
           short (founder: the write/paste lines "are too long and look weird")
           so the rule sits under the text, not across the whole column. */
        .join-door-field {
          display: flex; align-items: baseline; gap: 12px;
          max-width: 300px; width: 100%;
        }
        .join-door-field input {
          flex: 1; min-width: 0; height: 34px; padding: 0 2px;
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 15px;
          color: var(--text-primary); background: transparent;
          border: none; border-bottom: 1px solid var(--text-muted, rgba(61, 54, 48, 0.3));
          border-radius: 0; outline: none; transition: border-color 200ms;
        }
        .join-door-field input::placeholder { color: var(--text-muted, rgba(61, 54, 48, 0.42)); }
        .join-door-field input:focus { border-bottom-color: var(--text-secondary, rgba(61, 54, 48, 0.7)); }
        .join-door-submit {
          flex-shrink: 0; padding: 0 2px 4px; align-self: flex-end;
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 14px;
          font-style: italic; letter-spacing: 0.02em; color: var(--text-secondary, rgba(61, 54, 48, 0.7));
          background: none; border: none; cursor: pointer; transition: color 200ms;
        }
        .join-door-submit:hover { color: var(--text-primary); }
        .join-door-submit:disabled { opacity: 0.5; cursor: default; }
        .join-door-status {
          flex-shrink: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px; font-style: italic; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(61, 54, 48, 0.6));
        }
        .join-door-hint {
          margin: 8px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 12.5px; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(61, 54, 48, 0.5));
        }
        .join-door-done {
          margin: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.7; font-style: italic;
          color: var(--text-secondary, rgba(61, 54, 48, 0.82));
        }
        /* The install door — plain sentence with an inline link, no field. */
        .join-door-link {
          margin: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 14px; line-height: 1.6; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(61, 54, 48, 0.7));
        }
        .join-door-link a {
          font-style: normal; color: var(--text-primary);
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(61, 54, 48, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: text-decoration-color 200ms;
        }
        .join-door-link a:hover { text-decoration-color: var(--text-primary); }

        .primer-coda {
          margin: 56px 0 0; text-align: left; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 20px; font-style: italic; color: var(--text-primary);
          letter-spacing: 0.005em; opacity: 0.72;
        }

        @media (max-width: 640px) {
          .primer-main { padding: 2rem 24px 4rem; }
          .join-hero { margin-bottom: 26px; }
          .join-offer { margin-bottom: 30px; }
          .join-offer-line { font-size: 18px; }
          .primer-coda { font-size: 18px; margin-top: 48px; }
        }
      `}</style>
    </div>
  );
}
