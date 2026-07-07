import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../../lib/config';
import { localAuth } from '../../../../lib/dev-auth';

/**
 * Same-origin proxy for the "ask this mind" twin endpoint. Forwards the
 * question (and any auth cookie / API key) so the browser never talks to the
 * API host directly and no key lands in a URL. Mirrors the file proxy pattern.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ author: string }> },
): Promise<Response> {
  const { author } = await ctx.params;
  const auth = req.headers.get('authorization');
  const cookie = req.headers.get('cookie');

  const bodyText = await req.text();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  if (cookie) headers.Cookie = cookie;
  Object.assign(headers, localAuth(auth));

  const upstream = await fetch(
    `${SERVER_URL}/library/${encodeURIComponent(author)}/ask`,
    { method: 'POST', headers, body: bodyText },
  );

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
