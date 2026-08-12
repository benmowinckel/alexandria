import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import JoinCTA from './JoinCTA';
import './join.css';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/join',
  title: 'join alexandria.',
  description: 'Connect the people and minds that shaped you.',
});

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
    <div className="join-page">
      <ThemeToggle />
      <header className="join-header">
        <Link href="/" className="join-brand">alexandria<span>.</span></Link>
      </header>
      <main className="join-main">
        <JoinCTA urlRef={ref} refSource={refSource} />
      </main>
    </div>
  );
}
