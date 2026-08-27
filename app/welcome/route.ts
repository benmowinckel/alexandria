import { NextRequest } from 'next/server';
import { SERVER_URL } from '../lib/config';

/**
 * The founding-member page, served FIRST-PARTY on the website — so the session
 * cookie set after signup/billing sticks in Safari.
 *
 * The Worker can't reliably set the library cookie itself: its founding-member
 * page renders on the api subdomain at the tail of the cross-site OAuth redirect,
 * exactly where Safari drops cookies (WebKit #196375). So signup/billing stash
 * the rendered page + a session token under a one-time code and redirect here.
 * We fetch the page server-side, serve it from our own origin, and inject a
 * script that POSTs the code to /api/auth/session — the same same-origin cookie
 * set that already works for library sign-in. The private session token moves
 * only Worker→Vercel server-side; it never rides a browser-visible URL.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code') || '';

  let html = '';
  if (code) {
    try {
      const res = await fetch(`${SERVER_URL}/auth/welcome/peek?code=${encodeURIComponent(code)}`, {
        cache: 'no-store',
      });
      if (res.ok) html = ((await res.json()) as { html?: string }).html || '';
    } catch {
      /* peek unreachable — fall through to a fresh identity-bound welcome */
    }
  }

  // The welcome handoff is deliberately one-use. Once it has been consumed,
  // refreshing continues into the signed-in Library instead of starting a
  // new account-connection decision the person did not ask for.
  if (!html) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/library' },
    });
  }

  // Set the cookie first-party via a same-origin POST (off the redirect chain).
  const script = `<script>fetch(${JSON.stringify(
    '/api/auth/session?code=' + encodeURIComponent(code),
  )},{method:'POST',credentials:'include'}).then(function(){history.replaceState({},'', '/welcome');}).catch(function(){});</script>`;
  const injected = html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : html + script;

  return new Response(injected, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // The URL carries the one-time code; keep it out of any Referer header.
      'Referrer-Policy': 'no-referrer',
    },
  });
}
