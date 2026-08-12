import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../lib/config';
import { localAuth } from '../../../lib/dev-auth';
import { canonicalLibraryLocation, libraryLocationKey } from '../../../../shared/library-locations';

/**
 * Same-origin proxy for an Author's Library directory.
 * The API sends no CORS header for arbitrary origins, so a browser on a
 * different origin (localhost during dev, any embedding) can't read the
 * directory cross-origin. This proxy fetches it server-side and forwards the
 * cookie so signed-in state (twin.signed_in) resolves too.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ author: string }> },
): Promise<Response> {
  const { author } = await ctx.params;
  const cookie = req.headers.get('cookie');
  const auth = req.headers.get('authorization');
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (auth) headers.Authorization = auth;
  Object.assign(headers, localAuth(auth));

  const upstream = await fetch(`${SERVER_URL}/library/${encodeURIComponent(author)}`, { headers });
  const body = await upstream.json().catch(() => null) as Record<string, unknown> | null;
  if (body && upstream.ok && body.author && typeof body.author === 'object') {
    const profile = body.author as Record<string, unknown>;
    const location = canonicalLibraryLocation(typeof profile.location === 'string' ? profile.location : null);
    profile.location = location;
    profile.location_key = libraryLocationKey(location);
  }

  return Response.json(body, {
    status: upstream.status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
