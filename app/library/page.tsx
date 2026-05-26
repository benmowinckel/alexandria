import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { SERVER_URL } from '../lib/config';
import { LibraryDirectory, type DirectoryAuthor } from './LibraryDirectory';

export const dynamic = 'force-dynamic';

const PAGE_TITLE = 'library — the directory of alexandria Authors.';
const PAGE_DESCRIPTION =
  "Browse the directory of alexandria Authors. Each page is a published view of one Author's mind — how they think, write, and what they've made.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  // Next.js metadata is shallow-merged: setting `openGraph` at all replaces
  // the root layout's block entirely. Re-declare siteName/locale/type so
  // they don't vanish when we override og:title and og:description.
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    siteName: 'alexandria',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

async function loadAuthors(): Promise<DirectoryAuthor[]> {
  try {
    const res = await fetch(`${SERVER_URL}/library`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as { authors?: Partial<DirectoryAuthor>[] };
    const rows = data.authors || [];
    return rows.map((author) => ({
      id: String(author.id ?? ''),
      alexandria_id: String(author.alexandria_id ?? ''),
      display_name: author.display_name ?? null,
      location: author.location ?? null,
      location_key: author.location_key ?? null,
      contact: author.contact ?? null,
      text: author.text ?? null,
      files_url: typeof author.files_url === 'string' ? author.files_url : `/library/${author.id ?? ''}`,
    }));
  } catch {
    return [];
  }
}

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
  const authors = await loadAuthors();

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '6rem 2rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem', display: 'inline-block', padding: '10px 0', margin: '-10px 0' }}>
            alexandria.
          </Link>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 400, color: 'var(--text-primary)', margin: '2rem 0 0', letterSpacing: '-0.01em' }}>
            library
          </h1>
        </header>

        {authors.length === 0 ? (
          <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem' }}>
            no Authors yet.
          </p>
        ) : (
          <LibraryDirectory authors={authors} initialLocationKeys={initialLocationKeys} />
        )}
      </main>
    </>
  );
}
