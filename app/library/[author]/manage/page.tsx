import { redirect } from 'next/navigation';

export default async function LegacyManageProfile({ params }: { params: Promise<{ author: string }> }) {
  const { author } = await params;
  redirect(`/library/${encodeURIComponent(author)}`);
}
