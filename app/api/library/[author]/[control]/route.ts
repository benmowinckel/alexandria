import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../../lib/config';
import { localAuth } from '../../../../lib/dev-auth';

const OWNER_CONTROLS = new Set([
  'profile',
  'file-categories',
  'file-order',
  'file-subtitles',
  'file-questions',
]);

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ author: string; control: string }> },
): Promise<Response> {
  const { author, control } = await ctx.params;
  if (!OWNER_CONTROLS.has(control)) return Response.json({ error: 'Unknown Library control' }, { status: 404 });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookie = req.headers.get('cookie');
  const auth = req.headers.get('authorization');
  if (cookie) headers.Cookie = cookie;
  if (auth) headers.Authorization = auth;
  Object.assign(headers, localAuth(auth));

  const upstream = await fetch(
    `${SERVER_URL}/library/${encodeURIComponent(author)}/${control}`,
    { method: 'PUT', headers, body: await req.text() },
  );
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
