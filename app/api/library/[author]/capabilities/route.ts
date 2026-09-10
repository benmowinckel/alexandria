import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../../lib/config';
import { libraryFetch, libraryHeaders, personalRequestError, PERSONAL_AUTHOR } from '../../../../lib/library-proxy';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ author: string }> },
): Promise<Response> {
  const { author } = await ctx.params;
  const denied = personalRequestError(req, author);
  if (denied) return denied;
  if (PERSONAL_AUTHOR) return Response.json({
    schema: 'alexandria.personal-site.v1', author,
    profile: '/', public_export: '/mirror/profile.json',
    public_content_host: 'this website',
    access: 'Exact live membership, invite and paid grants; visitor credentials permit reading and questions only.',
    sign_in: '/api/connect/sign-in',
    shared_service: `${SERVER_URL}/connect/site/${encodeURIComponent(author)}`,
  }, { headers: { 'Cache-Control': 'no-store' } });
  const upstream = await libraryFetch(`/library/${encodeURIComponent(author)}/capabilities`, { headers: libraryHeaders(req) });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
