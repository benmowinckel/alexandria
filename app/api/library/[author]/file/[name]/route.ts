import { NextRequest } from 'next/server';
import { personalProtectedFile } from '../../../../../lib/personal-protected';
import { SERVER_URL } from '../../../../../lib/config';
import { libraryFetch, libraryHeaders, personalPublicFile, personalRequestError } from '../../../../../lib/library-proxy';

/**
 * Same-origin proxy for protocol-backed Library files.
 * Forwards Authorization so the API key never appears in a browser URL.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ author: string; name: string }> },
): Promise<Response> {
  const { author, name } = await ctx.params;
  const denied = personalRequestError(req, author);
  if (denied) return denied;
  const scope = req.nextUrl.searchParams.get('scope');
  const sessionId = req.nextUrl.searchParams.get('session_id');
  const invite = req.nextUrl.searchParams.get('invite') || req.nextUrl.searchParams.get('token');
  const upstreamUrl = new URL(`${SERVER_URL}/library/${encodeURIComponent(author)}/file/${encodeURIComponent(name)}`);
  if (sessionId) upstreamUrl.searchParams.set('session_id', sessionId);
  if (invite) upstreamUrl.searchParams.set('invite', invite);
  if (scope) upstreamUrl.searchParams.set('scope', scope);
  const local = await personalPublicFile(name, scope);
  const protectedFile = local ? null : await personalProtectedFile(req, name, scope);
  let upstream: Response;
  if (local) {
    upstream = new Response(local.bytes as BodyInit, { headers: { 'Content-Type': local.contentType } });
  } else if (protectedFile) {
    upstream = protectedFile;
  } else {
    try { upstream = await libraryFetch(upstreamUrl.pathname + upstreamUrl.search, { headers: libraryHeaders(req) }); }
    catch { return Response.json({ error: 'This file is temporarily unavailable.' }, { status: 503 }); }
  }

  // ?format=text — return the piece as plain text for the PLM's focus. PDFs are
  // extracted server-side (browser-independent, so it works in every browser).
  if (req.nextUrl.searchParams.get('format') === 'text' && upstream.ok) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    let text = '';
    if (buf.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
      try {
        // unpdf ships a serverless build of pdf.js — works on Vercel where
        // pdf-parse (worker/asset deps) silently returns nothing.
        const { extractText, getDocumentProxy } = await import('unpdf');
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text: t } = await extractText(pdf, { mergePages: true });
        text = (t || '').trim();
      } catch { text = ''; }
    } else {
      text = buf.toString('utf-8');
    }
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
      'Cache-Control': upstream.status === 200 ? 'private, no-store' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
