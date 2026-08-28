import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ThemeToggle } from '../components/ThemeToggle';
import { SERVER_URL, pageMetadata, librarySignInUrl, FOUNDER_PROFILE_PATH } from '../lib/config';
import { LibraryDirectory, type DirectoryAuthor, type LibrarySort } from './LibraryDirectory';
import SiteFooter from '../components/SiteFooter';
import { SignOutLink } from '../components/SignOutLink';
import { HeaderAction, HeaderActions } from '../components/HeaderActions';
import { localAuth } from '../lib/dev-auth';

export const dynamic = 'force-dynamic';

// Page-specific metadata. Without explicit openGraph / twitter overrides
// here, Next.js falls back to the root layout's homepage values and the
// social preview for /library is indistinguishable from /. Setting them
// at page level makes shared /library links render this page's own copy;
// pageMetadata supplies the per-page canonical + og:url.
const LIBRARY_TITLE = 'the library — alexandria.';
const LIBRARY_DESCRIPTION =
  'the library of human minds.';

export const metadata: Metadata = {
  ...pageMetadata({
    path: '/library',
    title: LIBRARY_TITLE,
    description: LIBRARY_DESCRIPTION,
  }),
  twitter: {
    card: 'summary_large_image',
    title: LIBRARY_TITLE,
    description: LIBRARY_DESCRIPTION,
    site: '@benmowinckel',
    creator: '@benmowinckel',
  },
};

interface DirectoryResponse {
  signed_in: boolean;
  membership_active: boolean;
  membership_available?: boolean;
  membership_status?: string;
  membership_source?: string;
  membership_verified_at?: string | null;
  authors: DirectoryAuthor[];
  you_listed: boolean;
  has_more_profiles: boolean;
}

// The directory is authors-only. We forward the viewer's library session
// cookie (set on the parent domain, so it's readable here) to the worker so
// it can identify a signed-in member; signed-out callers get an empty gate.
async function loadDirectory(): Promise<DirectoryResponse> {
  try {
    const cookieHeader = (await cookies()).toString();
    const headers: Record<string, string> = { ...localAuth(null) };
    if (cookieHeader) headers.cookie = cookieHeader;
    const res = await fetch(`${SERVER_URL}/library`, {
      cache: 'no-store',
      headers,
    });
    if (!res.ok) return { signed_in: false, membership_active: false, authors: [], you_listed: false, has_more_profiles: false };
    const data = await res.json() as {
      signed_in?: boolean;
      membership_active?: boolean;
      membership_available?: boolean;
      membership_status?: string;
      membership_source?: string;
      membership_verified_at?: string | null;
      authors?: Partial<DirectoryAuthor>[];
      you_listed?: boolean;
      has_more_profiles?: boolean;
    };
    const authors = (data.authors || []).map((author) => ({
      id: String(author.id ?? ''),
      alexandria_id: String(author.alexandria_id ?? ''),
      display_name: author.display_name ?? null,
      location: author.location ?? null,
      location_key: author.location_key ?? null,
      contact: author.contact ?? null,
      text: author.text ?? null,
      files_url: typeof author.files_url === 'string' ? author.files_url : `/library/${author.id ?? ''}`,
    }));
    return {
      signed_in: !!data.signed_in,
      membership_active: !!data.membership_active,
      membership_available: data.membership_available,
      membership_status: data.membership_status,
      membership_source: data.membership_source,
      membership_verified_at: data.membership_verified_at,
      authors,
      you_listed: !!data.you_listed,
      has_more_profiles: data.has_more_profiles === true,
    };
  } catch {
    return { signed_in: false, membership_active: false, authors: [], you_listed: false, has_more_profiles: false };
  }
}

const linkStyle = { color: 'var(--text-secondary)', textDecoration: 'underline', textDecorationColor: 'var(--text-muted)', textUnderlineOffset: '3px', textDecorationThickness: '1px' };

export default async function LibraryPage({ searchParams }: { searchParams?: Promise<{ q?: string; location?: string; sort?: string; preview?: string }> }) {
  const params = await searchParams;
  const initialQuery = (params?.q || '').trim().slice(0, 100);
  const initialLocation = (params?.location || '').trim().slice(0, 80);
  const initialSort: LibrarySort = ['number-asc', 'number-desc', 'name-asc', 'name-desc'].includes(params?.sort || '')
    ? params!.sort as LibrarySort
    : 'number-asc';
  const loaded = await loadDirectory();
  // Local review surfaces for the access states. They do not exist in a
  // production build and cannot change real authentication or membership.
  const preview = process.env.NODE_ENV === 'development' ? params?.preview : undefined;
  const directory: DirectoryResponse = preview === 'public'
    ? { ...loaded, signed_in: false, membership_active: false, authors: [], you_listed: false, has_more_profiles: true }
    : preview === 'gate'
      ? { ...loaded, signed_in: true, membership_active: false, membership_available: true, membership_status: 'none', authors: [], you_listed: false }
      : loaded;
  const { signed_in, membership_active, membership_available, membership_status, authors, you_listed, has_more_profiles } = directory;

  // Sign-in must return you to the directory, signed in — not the signup
  // callback page (which is a dead end for someone who just wanted to browse).
  // intent=library skips the billing funnel; next brings you back here.
  const returnParams = new URLSearchParams();
  if (initialQuery) returnParams.set('q', initialQuery);
  if (initialLocation) returnParams.set('location', initialLocation);
  if (initialSort !== 'number-asc') returnParams.set('sort', initialSort);
  const returnPath = returnParams.size ? `/library?${returnParams.toString()}` : '/library';
  const signInUrl = librarySignInUrl(returnPath);

  return (
    <div className="lib-page">
      <main className={signed_in && membership_active ? 'lib-main' : signed_in ? 'lib-main lib-main-gate' : 'lib-main lib-main-open'}>
        <header className="lib-header">
          <div className="lib-header-top">
            <Link href="/" className="lib-brand">
              alexandria<span className="lib-brand-dot">.</span>
            </Link>
            <div className="lib-head-actions">
            {signed_in && membership_active ? (
              <SignOutLink />
            ) : signed_in ? (
              <SignOutLink />
            ) : (
              <HeaderActions
                left={<HeaderAction href={signInUrl}>sign in</HeaderAction>}
                right={<HeaderAction href="/start">start</HeaderAction>}
              />
            )}
              <ThemeToggle inline />
            </div>
          </div>
          {signed_in && membership_active ? <p className="lib-eyebrow">the collective</p> : null}
          <h1 className="lib-h1">the library</h1>
          <p className="lib-intro">
            Public profiles from people using alexandria — what they make, build, and share.
          </p>
        </header>

        {!signed_in ? (
          <nav className="lib-doors" aria-label="open a mind">
            <Link href={FOUNDER_PROFILE_PATH} className="lib-open">
              <span>Benjamin a. Mowinckel</span>
              <span className="lib-founder">founder · a.0</span>
            </Link>
            {has_more_profiles ? (
              <div className="lib-others">
                <span>more profiles</span>
                <span className="lib-others-note">members can browse them</span>
              </div>
            ) : null}
            <p className="lib-access">
              Have an account? <Link href={signInUrl}>sign in</Link>.
              {' '}Already use alexandria? <Link href={signInUrl}>create your profile</Link>.
              {' '}New here? <Link href="/start">start your loop</Link>.
            </p>
          </nav>
        ) : !membership_active ? (
          <div className="lib-gate">
            <p className="lib-lede">
              {membership_available === false
                ? 'We could not verify your membership just now, so the member directory stays closed.'
                : 'You are signed in, but this account is not an active community membership.'}
            </p>
            <p className="lib-cta">
              <Link href="/join" className="lib-cta-link">
                {membership_status && membership_status !== 'none' ? 'reactivate membership' : 'join the community'}
              </Link>
            </p>
            <p className="lib-sub">
              Public profile links remain open — <Link href={FOUNDER_PROFILE_PATH} style={linkStyle}>see Benjamin&rsquo;s profile</Link>.
            </p>
          </div>
        ) : (
          <>
            {!you_listed ? (
              <p className="lib-notlisted">
                You&rsquo;re not listed yet — add a <em>location</em> (your city) and a{' '}
                <em>contact</em> to your library file to appear here for the others.
              </p>
            ) : null}
            {authors.length === 0 ? (
              <p className="lib-empty">
                No profiles listed yet — add your city and a contact to appear here.
              </p>
            ) : (
              <LibraryDirectory authors={authors} initialQuery={initialQuery} initialLocation={initialLocation} initialSort={initialSort} />
            )}
          </>
        )}
      </main>
      <SiteFooter cta="start your loop" />

      <style>{`
        .lib-page {
          background: var(--bg-primary);
          color: var(--text-primary);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
          background-image:
            radial-gradient(ellipse 120% 80% at 30% 15%, rgba(91, 31, 71, 0.025) 0%, transparent 60%),
            radial-gradient(ellipse 100% 70% at 72% 85%, rgba(74, 50, 30, 0.020) 0%, transparent 60%);
          animation: libFadeIn 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        @keyframes libFadeIn { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: none; } }

        .lib-main { flex: 1; width: 100%; max-width: 660px; margin: 0 auto; padding: 5.5rem 2rem 2rem; }
        /* The signed-out gate is short — centre it vertically so it reads as a
           composed card, not a fragment stranded at the top (the /join / primer
           idiom). The signed-in directory keeps the top-aligned scan layout. */
        .lib-main-gate { display: flex; flex-direction: column; justify-content: center; padding-top: 3rem; padding-bottom: 4rem; }
        .lib-header { margin-bottom: 2.4rem; }
        .lib-header-top { display: flex; justify-content: space-between; align-items: center; min-height: 2.75rem; gap: 1.5rem; }
        .lib-head-actions { display: flex; align-items: center; gap: 0.35rem; margin-right: -0.75rem; }
        .lib-brand {
          font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
          font-style: italic; font-size: 1.25rem; color: var(--text-primary);
          text-decoration: none; letter-spacing: 0.005em;
          display: inline-block; padding: 10px 8px; margin: -10px -8px; transition: opacity 220ms ease;
        }
        .lib-brand:hover { opacity: 0.6; }
        .lib-brand-dot { font-style: normal; }
        .lib-eyebrow {
          margin: 1.8rem 0 0; font-weight: 500; font-size: 11px; letter-spacing: 0.3em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1; color: var(--accent); line-height: 1;
        }
        .lib-h1 {
          margin: 0.7rem 0 0; font-style: italic; font-weight: 500;
          font-size: clamp(28px, 1.5rem + 1.5vw, 36px); line-height: 1.1;
          letter-spacing: -0.01em; color: var(--text-primary);
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "swsh" 1;
        }
        .lib-intro {
          max-width: 34rem; margin: 0.85rem 0 0; color: var(--text-muted); font-size: 1rem;
          line-height: 1.55; text-wrap: pretty;
        }
        .lib-main-open .lib-header { margin-bottom: 0; }
        .lib-main-open .lib-h1 { margin-top: 2.5rem; }
        .lib-doors { display: grid; gap: 1.35rem; margin: 2rem 0 0; }
        .lib-open {
          display: flex; align-items: baseline; justify-content: space-between; gap: 1.5rem;
          color: var(--text-primary); font-style: italic; font-size: 1.28rem;
          line-height: 1.35; text-decoration: none; letter-spacing: 0.005em;
          transition: opacity 200ms ease;
        }
        .lib-open:hover { opacity: 0.6; }
        .lib-founder { flex: none; color: var(--text-muted); font-style: normal; font-size: 0.88rem; letter-spacing: 0.02em; }
        .lib-others {
          display: flex; align-items: baseline; justify-content: space-between; gap: 1.5rem;
          color: var(--text-muted); font-size: 1.02rem; line-height: 1.35;
          text-decoration: none;
        }
        .lib-others-note { flex: none; color: var(--text-muted); font-size: 0.9rem; font-style: italic; }
        .lib-access {
          max-width: 34rem; margin: 1.5rem 0 0; color: var(--text-muted); font-size: 0.94rem; line-height: 1.65; text-wrap: pretty;
        }
        .lib-access a { color: var(--text-primary); text-decoration: underline; text-decoration-color: var(--border-light); text-underline-offset: 3px; }

        .lib-gate { max-width: 30rem; }
        .lib-lede { margin: 0 0 1.9rem; font-size: 1.08rem; line-height: 1.65; color: var(--text-secondary); text-wrap: pretty; }
        /* The one primary act — the instruction is plain prose, only the
           destination is the link (underlining the whole sentence made the
           instruction itself read as clickable). */
        .lib-cta { margin: 0 0 1.6rem; font-size: 1.08rem; line-height: 1.5; }
        .lib-cta-lead { color: var(--text-secondary); }
        .lib-cta-link {
          color: var(--text-primary); text-decoration: underline;
          text-decoration-color: var(--accent); text-underline-offset: 4px; text-decoration-thickness: 1.5px;
          transition: text-decoration-color 200ms, opacity 200ms;
        }
        .lib-cta-link:hover { opacity: 0.7; }
        .lib-sub { margin: 0; font-size: 0.98rem; line-height: 1.65; color: var(--text-muted); }

        .lib-notlisted { color: var(--text-ghost); font-size: 0.9rem; line-height: 1.6; margin: 0 0 1.75rem; }
        .lib-empty { color: var(--text-ghost); font-size: 0.95rem; }

        @media (max-width: 640px) {
          .lib-main { padding: 4rem 1.5rem 1.5rem; }
          .lib-main { padding-top: 2.7rem; }
          .lib-header-top { min-height: 2.75rem; }
          .lib-open, .lib-others { align-items: flex-start; flex-direction: column; gap: 0.18rem; }
        }
      `}</style>
    </div>
  );
}
