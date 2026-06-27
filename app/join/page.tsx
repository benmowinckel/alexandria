import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { SERVER_URL, pageMetadata } from '../lib/config';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/join',
  title: 'join alexandria.',
  description:
    'become a founding member of the collective — the library of minds, the people, the place you are seen. the tool is free; this is the other half.',
});

// The founding-member JOIN — the paid half of the two things. The tool (the run)
// is free and keyless; this is the collective (the Strava): the library, the
// marketplace, the tribe. Signing in with GitHub starts the trial ($10/mo, first
// month free, free with 3 kin, or email-to-waive) and assigns your number.
//
// This is also the invite target: a member's invite link is /join?ref=THEIR_CODE.
// The ref rides through GitHub OAuth (server round-trips it) so the inviter is
// credited as kin. GitHub usernames are [A-Za-z0-9-], so we sanitise ref to that
// before it touches the href or the display — React escapes anyway, this just
// keeps a junk param from rendering.
function cleanRef(raw: string | undefined): string {
  return (raw || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; ref_source?: string }>;
}) {
  const params = await searchParams;
  const ref = cleanRef(params.ref);
  const refSource = (params.ref_source || 'invite').replace(/[^a-z_]/g, '').slice(0, 24) || 'invite';

  const joinQuery = new URLSearchParams();
  if (ref) joinQuery.set('ref', ref);
  joinQuery.set('ref_source', refSource);
  const joinUrl = `${SERVER_URL}/auth/github?${joinQuery.toString()}`;

  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        {ref ? (
          <p className="join-eyebrow">@{ref} invited you in.</p>
        ) : null}

        <h1 className="primer-h1">become a founding member.</h1>

        <p className="join-pitch">
          the tool is free and always will be. joining the collective is the part
          you pay for &mdash; a place in the shared library, the people building
          it alongside you, and being seen among them.
        </p>

        <a className="join-btn" href={joinUrl}>
          join with github
        </a>

        <p className="join-deal">
          <span className="join-free">first month free</span>, then $10/month
          &mdash; or <span className="join-free">free for good</span>{' '}when
          three friends join through you. if that&rsquo;s a stretch, just email and
          it&rsquo;s waived. you&rsquo;re joining the collective, never paying to
          use the tool.
        </p>

        <p className="join-secondary">
          here for the free tool? you don&rsquo;t need this &mdash;{' '}
          <Link href="/start">install it in one line</Link>.
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

        .primer-main {
          flex: 1;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          max-width: 540px; margin: 0 auto; padding: 3rem 24px 6rem; width: 100%;
        }

        .join-eyebrow {
          margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; letter-spacing: 0.04em; font-style: italic;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: center;
        }

        .primer-h1 {
          margin: 0 0 22px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic; font-weight: 400; font-size: 31px; line-height: 1.4;
          letter-spacing: -0.005em; color: var(--text-primary); text-wrap: balance;
          text-align: center; font-feature-settings: "kern" 1, "liga" 1, "dlig" 1;
        }

        .join-pitch {
          margin: 0 0 40px; max-width: 460px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px; line-height: 1.65; color: var(--text-secondary, rgba(26, 19, 24, 0.8));
          text-align: center; text-wrap: pretty;
        }
        .join-pitch em { font-style: italic; color: var(--text-primary); }

        /* The one action on the page. Filled, calm, unmistakable. */
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

        .join-deal {
          margin: 32px 0 0; max-width: 440px; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.7; letter-spacing: 0.01em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55)); text-align: center;
          font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
        }
        .join-free { color: var(--text-secondary, rgba(26, 19, 24, 0.82)); }

        .join-secondary {
          margin: 28px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px; line-height: 1.6; color: var(--text-muted, rgba(26, 19, 24, 0.55));
          text-align: center;
        }
        .join-secondary a {
          color: var(--text-secondary, rgba(26, 19, 24, 0.8));
          text-decoration: underline; text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-underline-offset: 3px; text-decoration-thickness: 1px;
          transition: color 200ms, text-decoration-color 200ms;
        }
        .join-secondary a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }

        .primer-coda {
          margin: 56px 0 0; text-align: center; font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 20px; font-style: italic; color: var(--text-primary);
          letter-spacing: 0.005em; opacity: 0.72;
        }

        @media (max-width: 640px) {
          .primer-main { padding: 2rem 20px 4rem; }
          .primer-h1 { font-size: 25px; line-height: 1.4; margin-bottom: 18px; }
          .join-pitch { font-size: 15.5px; margin-bottom: 32px; }
          .primer-coda { font-size: 18px; margin-top: 48px; }
        }
      `}</style>
    </div>
  );
}
