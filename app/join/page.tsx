import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import JoinCTA from './JoinCTA';
import { parseReferralInput } from '../lib/referral';
import './join.css';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/join',
  title: 'join alexandria.',
  description: 'Your mind gets better with other minds.',
});

function cleanRef(raw: string | undefined): string {
  return parseReferralInput(raw || '');
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; ref_source?: string; billing?: string }>;
}) {
  const params = await searchParams;
  const ref = cleanRef(params.ref) || undefined;
  const refSource = (params.ref_source || 'invite').replace(/[^a-z_]/g, '').slice(0, 24) || 'invite';
  const billingStatus = params.billing === 'cancel' || params.billing === 'refresh'
    ? params.billing
    : undefined;

  return (
    <div className="join-page">
      <ThemeToggle />
      <header className="join-header">
        <Link href="/" className="join-brand">alexandria<span>.</span></Link>
      </header>
      <main className="join-main">
        <JoinCTA urlRef={ref} refSource={refSource} billingStatus={billingStatus} />
      </main>
    </div>
  );
}
