import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import CancelClient from './CancelClient';
import { SERVER_URL } from '../lib/config';

export const dynamic = 'force-dynamic';

type SessionPayload = {
  signed_in?: boolean;
  github_login?: string | null;
  github_name?: string | null;
  // Optional fields the Worker may add to expose cancel-pending state on
  // the session payload. Treated as optional here so the page survives
  // before the server-side fields land; the client will simply default
  // to the "active subscription" branch when these are missing/null.
  subscription_status?: string | null;
  cancel_at?: string | null;
};

// Server-side session resolve. We hit the Worker directly (not the Next
// proxy) because we already hold the inbound cookies and want to skip the
// extra hop. `force-dynamic` above + `cache: 'no-store'` here keeps the
// response per-request — server components default to caching otherwise.
async function loadSession(): Promise<SessionPayload | null> {
  const hdrs = await headers();
  const cookie = hdrs.get('cookie');
  const auth = hdrs.get('authorization');
  const reqHeaders: Record<string, string> = {};
  if (cookie) reqHeaders.Cookie = cookie;
  if (auth) reqHeaders.Authorization = auth;
  try {
    const res = await fetch(`${SERVER_URL}/library/session`, {
      headers: reqHeaders,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionPayload;
  } catch {
    return null;
  }
}

export default async function CancelPage() {
  const session = await loadSession();
  if (!session?.signed_in) {
    redirect('/join?returnTo=/cancel');
  }
  return (
    <CancelClient
      githubLogin={session.github_login || null}
      initialCancelAt={session.cancel_at || null}
      initialStatus={session.subscription_status || null}
    />
  );
}
