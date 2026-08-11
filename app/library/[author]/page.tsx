import type { Metadata } from 'next';
import AuthorPageClient from './client';
import { SERVER_URL } from '../../lib/config';

export async function generateMetadata({ params }: { params: Promise<{ author: string }> }): Promise<Metadata> {
  const { author } = await params;
  try {
    const res = await fetch(`${SERVER_URL}/library/${author}`, { cache: 'no-store' });
    if (!res.ok) return { title: 'library — alexandria.' };
    const data = await res.json();
    const name = data.author?.display_name || data.author?.id || author;
    const description = data.author?.text || `${data.author?.alexandria_id || author} — Alexandria Author`;
    return {
      title: `${name} — library`,
      description,
      openGraph: {
        title: name,
        description,
        siteName: 'Alexandria',
        type: 'profile',
      },
      twitter: { card: 'summary', title: name, description },
    };
  } catch {
    return { title: 'library — alexandria.' };
  }
}

export default async function AuthorPage({ params }: { params: Promise<{ author: string }> }) {
  const { author } = await params;
  return (
    <>
      <link
        rel="alternate"
        type="application/vnd.alexandria.library-capabilities+json"
        href={`/api/library/${encodeURIComponent(author)}/capabilities`}
        title="How this Library profile works"
      />
      <AuthorPageClient params={Promise.resolve({ author })} />
    </>
  );
}
