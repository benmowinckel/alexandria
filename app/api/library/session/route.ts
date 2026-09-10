import { NextRequest } from 'next/server';
import { libraryFetch, libraryHeaders, PERSONAL_AUTHOR, PRIVATE_HEADERS } from '../../../lib/library-proxy';

export async function GET(req: NextRequest): Promise<Response> {
  const headers = libraryHeaders(req);
  if (PERSONAL_AUTHOR && !headers['X-Alexandria-Visitor']) return Response.json({ signed_in: false, membership_active: false }, { headers: PRIVATE_HEADERS });
  try {
    const upstream = await libraryFetch('/library/session', { headers });
    return new Response(upstream.body, { status: upstream.status, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' } });
  } catch {
    return Response.json({ signed_in: false, membership_available: false }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
