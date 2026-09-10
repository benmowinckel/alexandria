/** Server-only own-site mirror. Imports only publication manifests, never canon
 * or account keys. The adapter owns provider credentials and inference limits. */
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { publicMirrorSystem, publicMirrorUsesFirstPerson } from '../../shared/mirror-context';
import { accessHeaders, healthEndpointFrom, readMirrorJson, runTwinInference, validateSidecarUrl, type TwinInferenceOpts, type TwinWork } from '../../shared/mirror-transport';
import { personalPublicFile, personalPublicProfile, PERSONAL_AUTHOR, PRIVATE_HEADERS, type PublicProfile } from './library-proxy';
import { canReadPersonalScope, personalProtectedText } from './personal-protected';

const scopePattern = /^(public|authors|invite|paid)(\/[a-z0-9][a-z0-9-]{0,63})*$/;
function exactScope(value: unknown): value is string { return typeof value === 'string' && value.length <= 240 && scopePattern.test(value); }
export function hasPersonalMirror(): boolean { return !!PERSONAL_AUTHOR && !!(process.env.PERSONAL_MIRROR_URL || process.env.PERSONAL_MIRROR_SECRET || process.env.PERSONAL_MIRROR_MODEL); }
function configuration(): { adapter: TwinInferenceOpts; model: string; scopes: string[] } | null {
  const url = process.env.PERSONAL_MIRROR_URL?.trim();
  const secret = process.env.PERSONAL_MIRROR_SECRET?.trim();
  const model = process.env.PERSONAL_MIRROR_MODEL?.trim();
  if (!url || validateSidecarUrl(url) || !secret || !model) return null;
  const access_client_id = process.env.PERSONAL_MIRROR_ACCESS_CLIENT_ID?.trim();
  const access_client_secret = process.env.PERSONAL_MIRROR_ACCESS_CLIENT_SECRET?.trim();
  if (!!access_client_id !== !!access_client_secret) return null;
  try {
    const scopes: unknown = JSON.parse(process.env.PERSONAL_MIRROR_SCOPES || '["public"]');
    if (!Array.isArray(scopes) || !scopes.length || scopes.length > 64 || !scopes.every(exactScope)) return null;
    return { adapter: { url, secret, access_client_id, access_client_secret, timeoutMs: 90_000 }, model, scopes: [...new Set(scopes)] };
  } catch { return null; }
}

/** Configuration alone is not liveness. No hosted model name or budget leaks
 * into the presentation when this website has its own adapter. */
export async function personalMirrorProfile(profile: PublicProfile, req?: NextRequest): Promise<PublicProfile> {
  if (!hasPersonalMirror()) return profile;
  const cfg = configuration();
  let online = false, model: string | null = null;
  if (cfg) {
    try {
      const response = await fetch(healthEndpointFrom(cfg.adapter.url!), { headers: accessHeaders(cfg.adapter), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(3000) });
      const health = response.ok ? await readMirrorJson(response, 8192) : null;
      online = health?.ok === true && health?.inference !== 'failing';
      if (online && typeof health?.model === 'string') model = health.model.slice(0, 120);
    } catch { /* unavailable is explicitly offline */ }
  }
  const currentScopes: string[] = [];
  if (cfg && req) for (const scope of cfg.scopes.filter(scope => !scope.startsWith('public'))) {
    if (await canReadPersonalScope(req, scope)) currentScopes.push(scope);
  }
  return { ...profile, twin: { enabled: true, online, model, depth: displayDepth(currentScopes), questions: profile.twin?.questions || [], variants: [{ variant: 'context', enabled: true, accessible: true, visibility: 'public', tools: { works: true, web: false } }] } };
}

function displayDepth(scopes: string[]): 'invite' | 'paid' | 'authors' | 'public' {
  for (const tier of ['invite', 'paid', 'authors'] as const) if (scopes.some(scope => scope.split('/')[0] === tier)) return tier;
  return 'public';
}

function error(message: string, status: number, reason?: string): Response { return Response.json({ error: message, reason }, { status, headers: PRIVATE_HEADERS }); }
export async function askPersonalMirror(req: NextRequest, body: Record<string, unknown>): Promise<Response | null> {
  if (!hasPersonalMirror()) return null;
  const cfg = configuration();
  if (!cfg) return error('This mirror is not connected correctly. Your question was not answered.', 503, 'offline');
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 20_000) return error('Ask a question of at most 20,000 characters.', 400);
  if (body.variant && body.variant !== 'context') return error('This mirror offers its published context.', 400);
  const artifact = body.artifact && typeof body.artifact === 'object' ? body.artifact as Record<string, unknown> : null;
  if (body.artifact && (!artifact || typeof artifact.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(artifact.name) || !exactScope(artifact.scope))) return error('Invalid artifact reference.', 400);
  const profile = await personalPublicProfile();
  if (!profile) return error('Published context is unavailable.', 503);
  const scopes = body.depth === 'public' ? cfg.scopes.filter(scope => scope.split('/')[0] === 'public') : cfg.scopes;
  const works: TwinWork[] = [];
  let chars = 0;
  let focus: { name: string; content: string } | undefined;
  const append = (file: { name: string; title?: unknown; scope: string; visibility: string; category?: unknown }, text: string) => {
    if (works.length >= 128 || chars >= 750_000) return;
    const content = text.slice(0, Math.min(50_000, 750_000 - chars));
    if (!content.trim()) return;
    const name = typeof file.title === 'string' && file.title.trim() ? file.title : file.name;
    works.push({ name, scope: file.scope, visibility: file.visibility, category: typeof file.category === 'string' ? file.category : 'shadows', content });
    chars += content.length;
    if (artifact?.name === file.name && artifact.scope === file.scope) focus = { name, content };
  };
  for (const file of profile.files.slice(0, 128)) {
    if (!scopes.includes(file.scope) || !file.local_file?.endsWith('.md')) continue;
    const source = await personalPublicFile(file.name, file.scope);
    if (source) append(file, new TextDecoder().decode(source.bytes));
  }
  // Only exact selected scopes with current grants can contribute private-tier
  // publication bytes. A public question has no Connector dependency.
  const protectedScopes = scopes.filter(scope => scope.split('/')[0] !== 'public');
  if (protectedScopes.length) for (const file of await personalProtectedText(req, protectedScopes)) append(file, file.content);
  if (artifact && !focus) return error('This mirror cannot access that exact piece as text.', 403, 'artifact_outside_context');
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  let historyChars = 0;
  if (Array.isArray(body.messages)) for (const raw of body.messages.slice(-20)) {
    if (!raw || !['user', 'assistant'].includes(raw.role) || typeof raw.content !== 'string') continue;
    const content = raw.content.trim().slice(0, 8000);
    if (!content || historyChars + content.length > 60_000) continue;
    historyChars += content.length;
    messages.push({ role: raw.role, content });
  }
  const name = typeof profile.author.display_name === 'string' ? profile.author.display_name : PERSONAL_AUTHOR;
  const contextScopes = [...new Set(works.map(work => work.scope))];
  const contextHash = createHash('sha256').update(JSON.stringify({ works, focus: focus || null, scopes: contextScopes })).digest('hex');
  const request = { variant: 'context' as const, model: cfg.model, author: PERSONAL_AUTHOR, question, system: publicMirrorSystem(name), maxTokens: 512, tools: { works: true, web: false }, works, focus, messages, contextHash, contextScopes, tier: displayDepth(contextScopes) };
  let result = await runTwinInference(request, cfg.adapter);
  if (result.ok && publicMirrorUsesFirstPerson(result.answer)) {
    result = await runTwinInference({ ...request, system: `${request.system} This is an identity-boundary retry: answer again from scratch with no first-person pronouns.` }, cfg.adapter);
    if (result.ok && publicMirrorUsesFirstPerson(result.answer)) return error('The mirror could not answer without speaking as the author. Your question was not answered.', 502, 'identity_violation');
  }
  if (!result.ok) return Response.json({ error: result.error, reason: result.reason, ...(result.status === 429 ? { handoff: true } : {}) }, { status: result.status, headers: PRIVATE_HEADERS });
  return Response.json({ ok: true, twin: true, author: PERSONAL_AUTHOR, author_name: name, variant: 'context', label: null, answer: result.answer, disclaimer: `ai reflecting ${name}'s published thinking.` }, { headers: PRIVATE_HEADERS });
}
