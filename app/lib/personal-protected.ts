import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { libraryFetch, libraryHeaders, PERSONAL_AUTHOR } from './library-proxy';

// Optional publication inventory owned by this website. It contains selected
// publishable tiered material, never a path into the owner's private canon.
type ProtectedFile = {
  name: string; scope: string; visibility: 'authors' | 'invite' | 'paid';
  title: string; subtitle?: string; category?: string; local_file: string;
  listed?: boolean; price_cents?: number; updated_at?: string;
};
async function inventory(): Promise<ProtectedFile[]> {
  if (!PERSONAL_AUTHOR) return [];
  try {
    const data = JSON.parse(await readFile(join(process.cwd(), 'data/protected-files.json'), 'utf8'));
    if (!Array.isArray(data) || data.length > 128) return [];
    return data.filter((file): file is ProtectedFile => {
      if (!file || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(file.name) || !/^(authors|invite|paid)(\/[a-z0-9][a-z0-9-]{0,63})*$/.test(file.scope)) return false;
      if (file.visibility !== file.scope.split('/')[0] || typeof file.title !== 'string') return false;
      return file.local_file === `${file.scope}/${file.name}.md` || file.local_file === `${file.scope}/${file.name}.pdf`;
    });
  } catch { return []; }
}

/** Only publication-inventory text in an exact configured and currently
 * granted scope may become model context. No arbitrary path or URL is read. */
export async function personalProtectedText(req: NextRequest, scopes: readonly string[]) {
  const files = (await inventory()).filter(file => scopes.includes(file.scope) && file.local_file.endsWith('.md'));
  const permitted = new Set<string>();
  for (const scope of new Set(files.map(file => file.scope))) {
    if (await canReadPersonalScope(req, scope)) permitted.add(scope);
  }
  const result = [];
  let total = 0;
  for (const file of files) {
    if (!permitted.has(file.scope) || total >= 750_000) continue;
    const handle = await open(join(process.cwd(), 'data/mirror', file.local_file), 'r').catch(() => null);
    if (!handle) continue;
    try {
      const buffer = Buffer.alloc(200_000);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const content = buffer.subarray(0, bytesRead).toString('utf8').slice(0, Math.min(50_000, 750_000 - total));
      total += content.length;
      result.push({ name: file.name, title: file.title, scope: file.scope, visibility: file.visibility, category: file.category || 'shadows', content });
    } finally { await handle.close(); }
  }
  return result;
}
type ScopeAccess = { allowed: true } | { allowed: false; status: number; reason: string };
async function personalScopeAccess(req: NextRequest, scope: string): Promise<ScopeAccess> {
  const headers = libraryHeaders(req);
  if (!headers['X-Alexandria-Visitor']) return { allowed: false, status: 401, reason: 'unauthenticated' };
  const unavailable: ScopeAccess = { allowed: false, status: 503, reason: 'connection_unavailable' };
  try {
    const query = new URLSearchParams({ scope });
    const invite = req.nextUrl.searchParams.get('invite')?.trim() || req.nextUrl.searchParams.get('token')?.trim();
    if (invite && scope.split('/')[0] === 'invite') {
      if (invite.length > 256) return { allowed: false, status: 400, reason: 'invalid_invite' };
      query.set('invite', invite);
    }
    const response = await libraryFetch(`/connect/access/${encodeURIComponent(PERSONAL_AUTHOR)}?${query}`, { headers });
    const decision = await response.json().catch(() => null);
    const exact = decision?.author === PERSONAL_AUTHOR && decision?.scope === scope;
    if (response.ok) return exact && decision.allowed === true ? { allowed: true } : unavailable;
    const deniedReasons: Record<string, number> = {
      invalid_invite: 400, unauthenticated: 401, invite_required: 401,
      membership_required: 402, payment_required: 402, unknown_visibility: 403,
      membership_unavailable: 503,
    };
    if (exact && decision.allowed === false && deniedReasons[decision.reason] === response.status) {
      return { allowed: false, status: response.status, reason: decision.reason };
    }
    // The visitor middleware can reject the connection before an Author/scope
    // decision exists. Do not describe the publisher's inactive connection as
    // a missing membership or purchase belonging to this reader.
    if (response.status === 401) return { allowed: false, status: 401, reason: 'unauthenticated' };
    if (response.status === 402) return { allowed: false, status: 402, reason: 'connection_inactive' };
    if (response.status === 403) return { allowed: false, status: 403, reason: 'access_denied' };
    return unavailable;
  } catch { return unavailable; }
}
export async function canReadPersonalScope(req: NextRequest, scope: string): Promise<boolean> {
  return (await personalScopeAccess(req, scope)).allowed;
}
export async function personalProtectedMetadata(req: NextRequest): Promise<Record<string, unknown>[]> {
  const files = await inventory();
  const scopes = [...new Set(files.map(file => file.scope))];
  // A bounded batch; no contents or file names are sent to the shared server.
  const access = new Map<string, boolean>();
  for (let offset = 0; offset < scopes.length; offset += 8) {
    await Promise.all(scopes.slice(offset, offset + 8).map(async scope => access.set(scope, await canReadPersonalScope(req, scope))));
  }
  return files.flatMap((file, index) => {
    const allowed = access.get(file.scope) === true;
    if (!allowed && !file.listed) return [];
    if (!allowed) return [{ name: `local-cover-${index}`, scope: file.visibility, visibility: file.visibility, title: file.title, subtitle: file.subtitle || '', category: file.category, cover_only: true }];
    const metadata: Record<string, unknown> = { ...file };
    delete metadata.local_file;
    return [{ ...metadata, cover_only: false }];
  });
}
export async function personalProtectedFile(req: NextRequest, name: string, scope: string | null): Promise<Response | null> {
  const file = (await inventory()).find(file => file.name === name && file.scope === scope);
  if (!file) return null;
  const access = await personalScopeAccess(req, file.scope);
  if (!access.allowed) {
    const errors: Record<string, string> = {
      unauthenticated: 'Sign in to check your access to this material.',
      invite_required: 'Use an invite code or ask the Author for access to this exact material.',
      invalid_invite: 'This invite code is invalid.',
      membership_required: 'An active Alexandria membership is required for this material.',
      payment_required: 'The Author must grant access to this material. Checkout is not available on this website.',
      connection_inactive: 'This website’s Alexandria connection is inactive. Contact the Author.',
      membership_unavailable: 'Your membership could not be checked. Try again.',
      connection_unavailable: 'Access could not be checked. Try again.',
    };
    return Response.json({ error: errors[access.reason] || 'Access denied.', reason: access.reason, visibility: file.visibility,
      ...(file.visibility === 'paid' ? { checkout_available: false } : {}),
    }, { status: access.status });
  }
  try {
    const bytes = new Uint8Array(await readFile(join(process.cwd(), 'data/mirror', file.local_file)));
    return new Response(bytes, { headers: { 'Content-Type': file.local_file.endsWith('.pdf') ? 'application/pdf' : 'text/markdown; charset=utf-8' } });
  } catch { return Response.json({ error: 'File unavailable.' }, { status: 404 }); }
}
