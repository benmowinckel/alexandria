import { NextRequest } from 'next/server';
import { libraryFetch, libraryHeaders, personalRequestError, PRIVATE_HEADERS } from '../../../../lib/library-proxy';
import { askPersonalMirror, hasPersonalMirror } from '../../../../lib/personal-inference';

export async function POST(req: NextRequest, ctx: { params: Promise<{ author: string }> }): Promise<Response> {
  const { author } = await ctx.params;
  const denied = personalRequestError(req, author);
  if (denied) return denied;
  const body = await req.text();
  if (body.length > 100_000) return Response.json({ error: 'Question too long.' }, { status: 413, headers: PRIVATE_HEADERS });
  if (hasPersonalMirror()) {
    let input: unknown;
    try { input = JSON.parse(body); } catch { return Response.json({ error: 'Invalid question.' }, { status: 400, headers: PRIVATE_HEADERS }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({ error: 'Invalid question.' }, { status: 400, headers: PRIVATE_HEADERS });
    const direct = await askPersonalMirror(req, input as Record<string, unknown>);
    if (direct) return direct;
  }
  try {
    const upstream = await libraryFetch(`/library/${encodeURIComponent(author)}/ask`, {
      method: 'POST', headers: { ...libraryHeaders(req), 'Content-Type': 'application/json' }, body,
      signal: AbortSignal.timeout(90_000),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { ...PRIVATE_HEADERS, 'Content-Type': upstream.headers.get('content-type') || 'application/json' } });
  } catch {
    return Response.json({ error: 'The mirror could not be reached. Your question was not answered.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
