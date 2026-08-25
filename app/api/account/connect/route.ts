import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../lib/config';

/**
 * Same-origin bridge from the signed-in website to the Worker.
 *
 * The browser's HttpOnly Library cookie proves the member account. The Worker
 * returns only a short-lived, one-use connection paste; the persistent machine
 * key is minted later by the audited connector and never reaches this route.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) {
    return new Response('Forbidden.', { status: 403 });
  }

  const cookie = req.headers.get('cookie');
  if (!cookie) {
    return new Response('Sign in to Alexandria first.', { status: 401 });
  }

  try {
    const upstream = await fetch(`${SERVER_URL}/account/connect/browser`, {
      method: 'POST',
      headers: { Cookie: cookie },
      cache: 'no-store',
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Alexandria could not create the connection text. Try again.', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
