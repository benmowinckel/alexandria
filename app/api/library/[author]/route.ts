import { NextRequest } from 'next/server';
import { personalProtectedMetadata } from '../../../lib/personal-protected';
import { hasPersonalMirror, personalMirrorProfile } from '../../../lib/personal-inference';
import { canonicalLibraryLocation, libraryLocationKey } from '../../../../shared/library-locations';
import { libraryFetch, libraryHeaders, personalPublicProfile, personalRequestError, PERSONAL_AUTHOR, PRIVATE_HEADERS } from '../../../lib/library-proxy';

export async function GET(req: NextRequest, ctx: { params: Promise<{ author: string }> }): Promise<Response> {
  const { author } = await ctx.params;
  const denied = personalRequestError(req, author);
  if (denied) return denied;
  const snapshot = await personalPublicProfile();
  const publicPreview = process.env.NODE_ENV === 'development' && req.nextUrl.searchParams.get('preview') === 'public';
  if (snapshot && hasPersonalMirror() && !libraryHeaders(req, publicPreview)['X-Alexandria-Visitor']) return Response.json(await personalMirrorProfile(snapshot, req), { headers: PRIVATE_HEADERS });
  try {
    const upstream = await libraryFetch(`/library/${encodeURIComponent(author)}`, { headers: libraryHeaders(req, publicPreview) });
    // Losing a reader connection never hides this website's owned public
    // material. The fallback is explicitly signed out and contains no grants.
    if (!upstream.ok) {
      if (snapshot && (upstream.status === 401 || upstream.status === 402 || upstream.status === 403 || upstream.status >= 500)) return Response.json(await personalMirrorProfile(snapshot, req), { headers: PRIVATE_HEADERS });
      return new Response(upstream.body, { status: upstream.status, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' } });
    }
    const body = await upstream.json();
    if (body.author) {
      body.author.location = canonicalLibraryLocation(body.author.location);
      body.author.location_key = libraryLocationKey(body.author.location);
    }
    if (PERSONAL_AUTHOR) {
      body.viewer = { ...body.viewer, is_owner: false };
      delete body.twin?.context_scopes;
      delete body.twin?.context_preview_url;
      // Own published public bytes are the site's authority. Live protected
      // metadata adds only what the current reader is entitled to discover.
      if (snapshot) {
        body.author = snapshot.author;
        body.profile = snapshot.profile;
        const localProtected = await personalProtectedMetadata(req);
        const localKeys = new Set(localProtected.map(file => `${file.scope}/${file.name}`));
        body.files = [...snapshot.files, ...localProtected, ...(body.files || []).filter((file: { visibility: string; scope: string; name: string }) => file.visibility !== 'public' && !localKeys.has(`${file.scope}/${file.name}`))];
      }
    }
    return Response.json(await personalMirrorProfile(body, req), { headers: PRIVATE_HEADERS });
  } catch {
    return snapshot ? Response.json(await personalMirrorProfile(snapshot, req), { headers: PRIVATE_HEADERS }) : Response.json({ error: 'The connection is temporarily unavailable.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
