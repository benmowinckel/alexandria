import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import JoinCTA from './JoinCTA';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/join',
  title: 'join alexandria.',
  description:
    'the tool was the free sample — the community is the main course. first month free; three friends on = free while they stay; otherwise $10 — two coffees a month. become a founding member.',
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
          max-width: 720px; margin: 0 auto; padding: 3rem 40px 6rem; width: 100%;
          text-align: left;
        }

        /* The title label — small-caps, spaced, brand plum (founder 2026-07-17:
           "add back the colour to the community title"). The one spot of
           colour on the page; it also lifts the "flat" feeling. */
        .primer-eyebrow {
          margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 11.5px; letter-spacing: 0.3em;
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

        /* THE HERO — set in EB GARAMOND (not Spectral like the rest), so the
           page carries two distinct faces (founder 2026-07-17: "all the same
           font… looks flat"). EB Garamond's italic is markedly more
           calligraphic than the body serif — the biggest single un-flattening
           move. Expressive display: discretionary ligatures, contextual
           alternates, old-style figures. Ink only; the colour lives on the
           title. */
        .join-hero {
          margin: 0 0 30px; max-width: 620px;
          font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 500;
          font-size: clamp(29px, 1.5rem + 1.7vw, 36px); line-height: 1.2;
          letter-spacing: -0.005em; color: var(--text-primary);
          text-wrap: balance;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1, "swsh" 1;
        }

        /* THE OFFER — the two simple facts, roman body serif. "free" is set
           italic (.join-emph) so an accent of style falls on the value. */
        .join-offer { max-width: 560px; margin: 0 0 32px; }
        .join-offer-line {
          margin: 0 0 10px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px; line-height: 1.55; letter-spacing: 0.005em;
          color: var(--text-primary); text-wrap: pretty;
        }
        .join-offer-line:last-child { margin-bottom: 0; }
        .join-emph { font-style: italic; letter-spacing: 0.01em; }

        /* Plain one-line dollar sign — the serif glyph read too ornate. */
        .usd {
          font-family: -apple-system, system-ui, 'Helvetica Neue', Arial, sans-serif;
          font-size: 0.88em; letter-spacing: 0;
        }

        /* THE $10 TRUTH — de-emphasised reassurance, clearly below the action. */
        .join-explain {
          margin: 32px 0 0; max-width: 600px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14.5px; line-height: 1.72; letter-spacing: 0.01em;
          color: var(--text-secondary, rgba(26, 19, 24, 0.75)); text-wrap: pretty;
        }
        .join-explain p { margin: 0 0 14px; }
        .join-explain p:last-child { margin-bottom: 0; }
        /* The three price anchors — the reframe, pulled out as a scannable
           column so it never reads as a wall. Each on its own line, hung
           from a hairline marker, in primary ink so the eye lands here. */
        .join-anchors {
          list-style: none; margin: 0 0 16px; padding: 0;
        }
        .join-anchors li {
          position: relative; margin: 0 0 7px; padding-left: 20px;
          font-size: 15.5px; line-height: 1.4; color: var(--text-primary);
          font-variant-numeric: onum;
        }
        .join-anchors li::before {
          content: ""; position: absolute; left: 2px; top: 0.68em;
          width: 9px; height: 1px; background: var(--accent);
        }
        .join-anchors li:last-child { margin-bottom: 0; }
        /* The waive — quietest: his voice, the generosity that keeps it fair. */
        .join-waive {
          margin: 12px 0 0; max-width: 600px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14.5px; line-height: 1.72; letter-spacing: 0.01em;
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
          margin: 48px 0 0; padding-top: 34px; width: 100%; max-width: 600px;
          border-top: 1px solid var(--bg-tertiary, rgba(61, 54, 48, 0.12));
          display: flex; flex-direction: column; gap: 40px;
        }
        .join-door { width: 100%; }
        /* The three door questions — a small-caps tracked label (a different
           texture from the flowing serif above; echoes the plum title's label
           language but in muted ink). This is the bottom half's answer to
           "flat / all the same style". */
        .join-door-q {
          display: block; margin: 0 0 10px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 500; font-size: 12px; letter-spacing: 0.12em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: var(--text-muted); line-height: 1;
        }
        /* Auto-width underline field. The row hugs its content (inline-flex),
           and the input width is driven by its size attribute (set in JS to
           the longer of the ghost text and what is typed) — so the
           border-bottom sits under exactly the ghost text and grows only when
           they type past it (founder 2026-07-17). max-width stops a very long
           address from overrunning the column. */
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

        /* The action affordance — a small-caps action word + a stroked arrow
           that morphs to a tick on completion. On the two fields it appears
           only once they type (join-appear); on the install link it's static
           (.is-link) because a link is always actionable. */
        .join-door-go {
          display: inline-flex; align-items: center; gap: 5px; flex: none;
          align-self: center; padding: 0; background: none; border: none;
          color: var(--text-muted); cursor: pointer; text-decoration: none;
          transition: color 200ms, opacity 200ms;
          animation: joinGoAppear 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        .join-door-go.is-link { animation: none; }
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
        @keyframes joinGoAppear {
          from { opacity: 0; transform: translateX(-5px); }
          to { opacity: 1; transform: none; }
        }

        /* Install row — just a hyperlink ("the free tool"), no action word or
           arrow (founder 2026-07-17). Styled to sit at the same faint weight
           as the other sections' field line (the placeholder ghost tone), with
           the same underline; it darkens on hover so it still reads as a link. */
        .join-door-launchrow { text-decoration: none; cursor: pointer; }
        .join-door-faux {
          display: inline-flex; align-items: center; flex: none;
          height: 32px; padding: 0 1px;
          font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 15px;
          color: var(--text-muted);
          border-bottom: 1px solid var(--text-muted, rgba(61, 54, 48, 0.3));
          transition: color 200ms, border-color 200ms;
        }
        .join-door-launchrow:hover .join-door-faux {
          color: var(--text-primary); border-bottom-color: var(--text-secondary, rgba(61, 54, 48, 0.7));
        }

        .join-door-hint {
          margin: 9px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-size: 12.5px; letter-spacing: 0.02em;
          color: var(--text-muted, rgba(61, 54, 48, 0.5));
        }

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
