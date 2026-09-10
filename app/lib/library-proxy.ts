import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { SERVER_URL, SITE_URL } from './config';
import { localAuth } from './dev-auth';

export const PERSONAL_AUTHOR = process.env.NEXT_PUBLIC_PERSONAL_AUTHOR || '';
export const VISITOR_COOKIE = 'alex_mirror_visitor';
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

// Personal deployments never borrow their owner's API key or company cookie.
// The only authenticated credential here is a reader's deliberately delegated,
// Author- and website-scoped visitor token. The API enforces its scope anew.
export function libraryHeaders(req: NextRequest, publicOnly = false): Record<string, string> {
  if (publicOnly) return {};
  if (PERSONAL_AUTHOR) {
    const token = req.cookies.get(VISITOR_COOKIE)?.value;
    return token ? { 'X-Alexandria-Visitor': token, 'X-Alexandria-Site': new URL(SITE_URL).origin } : {};
  }
  const auth = req.headers.get('authorization');
  const cookie = req.headers.get('cookie');
  return { ...(cookie ? { Cookie: cookie } : {}), ...(auth ? { Authorization: auth } : {}), ...localAuth(auth) };
}

export function personalRequestError(req: NextRequest, author?: string): Response | null {
  if (!PERSONAL_AUTHOR) return null;
  if (author && author !== PERSONAL_AUTHOR) return Response.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS });
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.get('origin') !== req.nextUrl.origin) {
    return Response.json({ error: 'Use this website to submit a question.' }, { status: 403, headers: PRIVATE_HEADERS });
  }
  return null;
}

export function libraryFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SERVER_URL}${path}`, { ...init, cache: 'no-store', signal: init.signal || AbortSignal.timeout(12_000), redirect: 'error' });
}

type PublicFile = {
  name: string; scope: string; visibility: string; local_file?: string;
  [key: string]: unknown;
};
export type PublicProfile = {
  author: { id: string; [key: string]: unknown };
  files: PublicFile[];
  viewer?: Record<string, unknown>;
  twin?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function personalPublicProfile(): Promise<PublicProfile | null> {
  if (!PERSONAL_AUTHOR) return null;
  try {
    const profile = JSON.parse(await readFile(join(process.cwd(), 'data/public-profile.json'), 'utf8')) as PublicProfile;
    if (profile.author?.id !== PERSONAL_AUTHOR || !Array.isArray(profile.files)) return null;
    return {
      ...profile,
      files: profile.files.filter((file) => file.visibility === 'public' && /^public(?:\/[a-z0-9-]+)*$/.test(file.scope)),
      viewer: { signed_in: false, is_owner: false, membership_active: false },
      twin: { ...profile.twin, online: false, signed_in: false },
    };
  } catch { return null; }
}

export async function personalPublicFile(name: string, scope: string | null): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const snapshot = await personalPublicProfile();
  const file = snapshot?.files.find((candidate) => candidate.name === name && candidate.scope === (scope || 'public'));
  // Publication-time manifest only. No user-controlled filesystem path and no
  // URL fetch; protected content can never be placed in the public directory.
  if (!file?.local_file || !/^\/mirror\/files\/[a-z0-9][a-z0-9-]*\.(md|pdf)$/.test(file.local_file)) return null;
  try {
    return {
      bytes: new Uint8Array(await readFile(join(process.cwd(), 'public', file.local_file))),
      contentType: file.local_file.endsWith('.pdf') ? 'application/pdf' : 'text/markdown; charset=utf-8',
    };
  } catch { return null; }
}
