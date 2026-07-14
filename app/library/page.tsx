import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ThemeToggle } from '../components/ThemeToggle';
import { SERVER_URL, pageMetadata, librarySignInUrl, FOUNDER_PROFILE_PATH } from '../lib/config';
import { LibraryDirectory, type DirectoryAuthor } from './LibraryDirectory';

export const dynamic = 'force-dynamic';

// Page-specific metadata. Without explicit openGraph / twitter overrides
// here, Next.js falls back to the root layout's homepage values and the
// social preview for /library is indistinguishable from /. Setting them
// at page level makes shared /library links render this page's own copy;
// pageMetadata supplies the per-page canonical + og:url.
const LIBRARY_TITLE = 'the library of human minds — alexandria.';
const LIBRARY_DESCRIPTION =
  'the member directory of the collective — find the Alexandrians near you and reach them. each mind has its own page, shared by link.';

export const metadata: Metadata = {
  title: LIBRARY_TITLE,
  description: LIBRARY_DESCRIPTION,
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
  authors: DirectoryAuthor[];
  you_listed: boolean;
}

// The directory is authors-only. We forward the viewer's library session
// cookie (set on the parent domain, so it's readable here) to the worker so
// it can identify a signed-in member; signed-out callers get an empty gate.
async function loadDirectory(): Promise<DirectoryResponse> {
  try {
    const cookieHeader = (await cookies()).toString();
    const res = await fetch(`${SERVER_URL}/library`, {
      cache: 'no-store',
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });
    if (!res.ok) return { signed_in: false, authors: [], you_listed: false };
    const data = await res.json() as {
      signed_in?: boolean;
      authors?: Partial<DirectoryAuthor>[];
      you_listed?: boolean;
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
    return { signed_in: !!data.signed_in, authors, you_listed: !!data.you_listed };
  } catch {
    return { signed_in: false, authors: [], you_listed: false };
  }
}

const linkStyle = { color: 'var(--text-primary)', textDecoration: 'underline', textUnderlineOffset: '3px' };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ locations?: string; location?: string }>;
}) {
  const params = await searchParams;
  const initialLocationKeys = (params?.locations || params?.location || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const { signed_in, authors, you_listed } = await loadDirectory();

  // Sign-in must return you to the directory, signed in — not the signup
  // callback page (which is a dead end for someone who just wanted to browse).
  // intent=library skips the billing funnel; next brings you back here. Preserve
  // any location filter so you land on the same view you left. (This is a server
  // component — no window.location — so we rebuild the path from searchParams.)
  const nextQuery = new URLSearchParams();
  if (params?.locations) nextQuery.set('locations', params.locations);
  else if (params?.location) nextQuery.set('location', params.location);
  const nextPath = `/library${nextQuery.toString() ? `?${nextQuery}` : ''}`;
  const signInUrl = librarySignInUrl(nextPath);

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '820px', margin: '0 auto', padding: '6rem 2.5rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem', display: 'inline-block', padding: '10px 0', margin: '-10px 0' }}>
            alexandria.
          </Link>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 400, color: 'var(--text-primary)', margin: '2rem 0 0', letterSpacing: '-0.01em' }}>
            library
          </h1>
        </header>

        {!signed_in ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 1rem' }}>
              the member directory is for the collective — sign in to browse the Alexandrians,
              find who&rsquo;s near you, and reach them.
            </p>
            <p style={{ margin: '0 0 1.25rem' }}>
              new here? see one for real — <Link href={FOUNDER_PROFILE_PATH} style={linkStyle}>Benjamin&rsquo;s mind &amp; library &rarr;</Link>
            </p>
            <p style={{ margin: '0 0 0.75rem' }}>
              <a href={signInUrl} style={linkStyle}>sign in</a>
            </p>
            <p style={{ margin: 0, color: 'var(--text-ghost)', fontSize: '0.9rem' }}>
              not a member yet? <Link href="/join" style={linkStyle}>join the collective</Link>.
              &nbsp;have a direct link to someone&rsquo;s page? that always works.
            </p>
          </div>
        ) : (
          <>
            {!you_listed ? (
              <p style={{ color: 'var(--text-ghost)', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 1.75rem' }}>
                you&rsquo;re not listed yet — add a <em>location</em> (your city) and a{' '}
                <em>contact</em> to your library file to appear here for the others.
              </p>
            ) : null}
            {authors.length === 0 ? (
              <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem' }}>
                no Alexandrians listed yet — be the first: add your city and a contact to your file.
              </p>
            ) : (
              <LibraryDirectory authors={authors} initialLocationKeys={initialLocationKeys} />
            )}
          </>
        )}
      </main>
    </>
  );
}
