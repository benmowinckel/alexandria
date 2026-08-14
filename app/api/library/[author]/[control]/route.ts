import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../../lib/config';
import { localAuth } from '../../../../lib/dev-auth';
import { canonicalLibraryLocation } from '../../../../../shared/library-locations';

const OWNER_CONTROLS = new Set([
  'profile',
  'file-order',
  'file-subtitles',
  'twin',
]);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ author: string; control: string }> },
): Promise<Response> {
  const { author, control } = await ctx.params;
  if (control !== 'context-preview') return Response.json({ error: 'Unknown Library control' }, { status: 404 });

  const headers: Record<string, string> = {};
  const cookie = req.headers.get('cookie');
  const auth = req.headers.get('authorization');
  if (cookie) headers.Cookie = cookie;
  if (auth) headers.Authorization = auth;
  Object.assign(headers, localAuth(auth));

  const upstream = await fetch(
    `${SERVER_URL}/library/${encodeURIComponent(author)}/twin/context-preview${req.nextUrl.search}`,
    { headers },
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

  let body = await req.text();
  if (control === 'profile') {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(body || '{}') as Record<string, unknown>; }
    catch { return Response.json({ error: 'Invalid profile data.' }, { status: 400 }); }
    if (typeof parsed.location === 'string') {
      const location = canonicalLibraryLocation(parsed.location);
      if (parsed.location.trim() && !location) return Response.json({ error: 'Choose a location from the list.' }, { status: 400 });
      parsed.location = location || '';
    }
    body = JSON.stringify(parsed);
  }

  const upstreamPath = control === 'twin' ? 'twin' : control;
  const upstream = await fetch(
    `${SERVER_URL}/library/${encodeURIComponent(author)}/${upstreamPath}`,
    { method: control === 'twin' ? 'POST' : 'PUT', headers, body },
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
