import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../../lib/config';

// Proxy POST /api/library/{author}/access-code → Worker mint endpoint.
// Forwards cookie + Authorization so the Worker can resolve the owner.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ author: string }> },
): Promise<Response> {
  const { author } = await ctx.params;
  const cookie = req.headers.get('cookie');
  const auth = req.headers.get('authorization');
  const body = await req.text();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (auth) headers.Authorization = auth;

  const upstream = await fetch(`${SERVER_URL}/library/${encodeURIComponent(author)}/access-code`, {
    method: 'POST',
    headers,
    body: body || '{}',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
