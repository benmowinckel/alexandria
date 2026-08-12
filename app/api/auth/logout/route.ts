import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../lib/config';
import { librarySessionClearCookies } from '../../../lib/session-cookie';

/**
 * End the browser Library session. The Worker deletes the server token;
 * this response expires the first-party cookie the handoff set.
 * Always 200 — signing out when already out is a no-op, not an error.
 * Does not revoke the machine API key or delete the account.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const cookie = req.headers.get('cookie');
  try {
    await fetch(`${SERVER_URL}/auth/logout`, {
      method: 'POST',
      cache: 'no-store',
      headers: cookie ? { cookie } : {},
    });
  } catch {
    /* Worker unreachable — still expire the local cookie so this device leaves. */
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  for (const value of librarySessionClearCookies()) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
