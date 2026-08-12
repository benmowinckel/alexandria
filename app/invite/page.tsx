import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import InviteClient from './InviteClient';
import './invite.css';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/invite',
  title: 'an invitation — alexandria.',
  description:
    'A friend sent you Alexandria — free instructions that help your own AI build and use a living record in files you own.',
});

// The referral landing (founder 2026-07-17): the link members share. Before
// this, invite links dropped a cold recipient straight onto /start — a
// command-line install page with zero context ("they've got no idea what that
// is"). This page is the self-contained first touch: who sent you, what this
// is in one line, one action. The ref rides through to /start (install →
// eventual join) so kin attribution is unchanged.
function cleanRef(raw: string | undefined): string {
  return (raw || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  const ref = cleanRef(params.ref) || undefined;
  return (
    <div className="primer-page">
      <ThemeToggle />
      <InviteClient refCode={ref} />
    </div>
  );
}
