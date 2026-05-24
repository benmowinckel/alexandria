import { notFound } from 'next/navigation';
import { loadAllUpdates, loadUpdate } from '../../lib/updates';
import UpdateLetter from './UpdateLetter';

export const dynamicParams = false;

export function generateStaticParams() {
  return loadAllUpdates().map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = loadUpdate(slug);
  if (!u) return { title: 'updates — alexandria' };
  return {
    title: `${u.slug} — ${u.subject} — alexandria`,
    description: u.subject,
  };
}

export default async function UpdateLetterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const update = loadUpdate(slug);
  if (!update) notFound();

  const all = loadAllUpdates();
  const chronological = [...all].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.slug < b.slug ? -1 : 1,
  );

  return <UpdateLetter update={update} chronological={chronological} />;
}
