import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../../lib/config';

/**
 * Same-origin proxy for the handoff bundle — the Author's public shadow and the
 * index of their public work, which the reader takes with them to their own ai.
 *
 * Public by construction: the upstream route serves only public-visibility
 * substrate, so nothing is forwarded here — no cookie, no key. Anything that
 * needed an identity to authorise would not belong in a handoff.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ author: string }> },
): Promise<Response> {
  const { author } = await ctx.params;
  const upstream = await fetch(`${SERVER_URL}/library/${encodeURIComponent(author)}/handoff`, {
    headers: { Accept: 'application/json' },
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
