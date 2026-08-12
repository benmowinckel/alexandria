import FollowForm from './FollowForm';
import { pageMetadata } from '../lib/config';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/follow',
  title: 'follow alexandria.',
  description: 'Follow Alexandria as it is built. Occasional notes from Benjamin a. Mowinckel; leave whenever you like.',
});

export default async function FollowPage({
  searchParams,
}: {
  searchParams: Promise<{ thanks?: string }>;
}) {
  const { thanks } = await searchParams;
  return <FollowForm initialDone={thanks === '1'} />;
}
