import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../lib/config';

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('response too large');
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('response too large');
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

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
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      const message = upstream.status === 401
        ? 'Sign in to Alexandria first.'
        : upstream.status === 403
          ? 'An active Alexandria membership is required.'
          : 'Alexandria could not make a connection code. Try again.';
      return new Response(message, {
        status: upstream.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const code = await readBoundedText(upstream, 128);
    if (!/^alex_connect_[a-f0-9]{48}$/.test(code)) {
      return new Response('Alexandria returned an invalid connection code.', {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return new Response(code, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
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
