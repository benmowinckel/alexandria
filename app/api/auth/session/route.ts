import { NextRequest } from 'next/server';
import { SERVER_URL, SITE_URL } from '../../../lib/config';

/**
 * Sets the library session cookie first-party, from a client-initiated fetch.
 *
 * Why a fetch and not the /auth/handoff navigation response: Safari drops a
 * cookie set on any response that is the target of a redirect chain tracing back
 * to a cross-site hop (GitHub → api → …), which is exactly the OAuth landing.
 * A cookie set on a same-origin XHR/fetch response is NOT a navigation target, so
 * it sits outside that mitigation and every browser stores it. The handoff page
 * loads (a redirect target, sets nothing), then its script POSTs here; this
 * exchanges the one-time code for the session token server-side and returns the
 * Set-Cookie. Only then does the page navigate on to the library, cookie in hand.
 */

function cookieDomain(): string {
  try {
    const host = new URL(SITE_URL).hostname.replace(/^(api|www)\./, '');
    return host ? `; Domain=.${host}` : '';
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code') || '';
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (!code) return new Response(JSON.stringify({ ok: false }), { status: 400, headers });

  let token = '';
  try {
    const res = await fetch(`${SERVER_URL}/auth/session/exchange?code=${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    if (res.ok) token = ((await res.json()) as { token?: string }).token || '';
  } catch {
    /* exchange unreachable — return ok:false, caller still navigates on (signed-out) */
  }

  if (token) {
    headers.append(
      'Set-Cookie',
      `alex_library_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${cookieDomain()}`,
    );
  }
  return new Response(JSON.stringify({ ok: !!token }), { status: 200, headers });
}
