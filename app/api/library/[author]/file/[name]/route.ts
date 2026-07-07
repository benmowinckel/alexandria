import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../../../lib/config';
import { localAuth } from '../../../../../lib/dev-auth';

/**
 * Same-origin proxy for protocol-backed Library files.
 * Forwards Authorization so the API key never appears in a browser URL.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ author: string; name: string }> },
): Promise<Response> {
  const { author, name } = await ctx.params;
  const auth = req.headers.get('authorization');
  const cookie = req.headers.get('cookie');
  const sessionId = req.nextUrl.searchParams.get('session_id');
  const invite = req.nextUrl.searchParams.get('invite') || req.nextUrl.searchParams.get('token');
  const upstreamUrl = new URL(`${SERVER_URL}/library/${encodeURIComponent(author)}/file/${encodeURIComponent(name)}`);
  if (sessionId) upstreamUrl.searchParams.set('session_id', sessionId);
  if (invite) upstreamUrl.searchParams.set('invite', invite);
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  if (cookie) headers.Cookie = cookie;
  Object.assign(headers, localAuth(auth));
  const upstream = await fetch(
    upstreamUrl.toString(),
    { headers },
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
      'Cache-Control': upstream.status === 200 ? 'private, no-store' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
