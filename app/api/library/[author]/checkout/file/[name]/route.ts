import { NextRequest } from 'next/server';
import { libraryFetch, libraryHeaders, personalRequestError } from '../../../../../../lib/library-proxy';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ author: string; name: string }> },
): Promise<Response> {
  const { author, name } = await ctx.params;
  const denied = personalRequestError(req, author);
  if (denied) return denied;
  const scope = req.nextUrl.searchParams.get('scope');
  const path = `/library/${encodeURIComponent(author)}/checkout/file/${encodeURIComponent(name)}`;
  const query = scope ? `?${new URLSearchParams({ scope })}` : '';
  let upstream: Response;
  try {
    upstream = await libraryFetch(path + query, {
      method: 'POST',
      headers: { ...libraryHeaders(req), 'Content-Type': req.headers.get('content-type') || 'application/json' },
      body: await req.text(),
    });
  } catch {
    return Response.json({ error: 'Checkout is temporarily unavailable.' }, { status: 503 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
