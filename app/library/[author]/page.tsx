import type { Metadata } from 'next';
import AuthorPageClient, { type AuthorData } from './client';
import { SERVER_URL, SITE_URL } from '../../lib/config';
import { PERSONAL_AUTHOR, PERSONAL_NAME, PERSONAL_SITE } from '../../lib/personal-site';
import { personalPublicProfile } from '../../lib/library-proxy';
import { notFound } from 'next/navigation';

export async function generateMetadata({ params }: { params: Promise<{ author: string }> }): Promise<Metadata> {
  const { author } = await params;
  if (PERSONAL_SITE) return {
    title: PERSONAL_NAME,
    description: `${PERSONAL_NAME} — public work and thinking.`,
    alternates: { canonical: SITE_URL },
  };
  try {
    const res = await fetch(`${SERVER_URL}/library/${author}`, { cache: 'no-store' });
    if (!res.ok) return { title: 'library — alexandria.' };
    const data = await res.json();
    const name = data.author?.display_name || data.author?.id || author;
    const slug = data.author?.id || author;
    const title = `alexandria/${slug}`;
    const description = `${name}’s public alexandria profile — what they make, build, and share.`;
    const url = `${SITE_URL}/library/${encodeURIComponent(slug)}`;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        siteName: 'alexandria',
        type: 'profile',
      },
      twitter: { card: 'summary', title, description },
    };
  } catch {
    return { title: 'library — alexandria.' };
  }
}

export default async function AuthorPage({ params }: { params: Promise<{ author: string }> }) {
  const { author } = await params;
  if (PERSONAL_SITE && author !== PERSONAL_AUTHOR) notFound();
  const initialData = PERSONAL_SITE ? await personalPublicProfile() : null;
  return (
    <>
      <link
        rel="alternate"
        type="application/vnd.alexandria.library-capabilities+json"
        href={`/api/library/${encodeURIComponent(author)}/capabilities`}
        title="How this profile works"
      />
      <AuthorPageClient params={Promise.resolve({ author })} initialData={initialData ? initialData as unknown as AuthorData : undefined} />
    </>
  );
}
