import { redirect } from 'next/navigation';
import { SERVER_URL } from '../../lib/config';

export const dynamic = 'force-dynamic';

/** Stable internal OAuth return path. Consent stays on the API origin that
 * owns the browser session; the independent website never receives that cookie. */
export default async function ConnectPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const destination = new URL('/connect/authorize', SERVER_URL);
  for (const name of ['author', 'site', 'state', 'code_challenge', 'code_challenge_method']) {
    const value = values[name];
    if (typeof value === 'string') destination.searchParams.set(name, value);
  }
  redirect(destination.toString());
}
