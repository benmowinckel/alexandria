import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { SITE_URL } from './config';
import { PERSONAL_AUTHOR, PRIVATE_HEADERS } from './library-proxy';

export const CONNECT_FLOW_COOKIE = 'alex_mirror_connect';
export const CONNECT_FLOW_SECONDS = 300;
export type ConnectFlow = { state: string; verifier: string; next: string; created: number };
export function safePersonalNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw)) return '/';
  try {
    const url = new URL(raw, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || url.pathname.startsWith('/api/')) return '/';
    return url.pathname + url.search;
  } catch { return '/'; }
}
export function newConnectFlow(next: string | null): ConnectFlow {
  return { state: randomBytes(24).toString('base64url'), verifier: randomBytes(32).toString('base64url'), next: safePersonalNext(next), created: Date.now() };
}
export function pkceChallenge(verifier: string): string { return createHash('sha256').update(verifier).digest('base64url'); }
export function readConnectFlow(req: NextRequest): ConnectFlow | null {
  try {
    const flow = JSON.parse(Buffer.from(req.cookies.get(CONNECT_FLOW_COOKIE)?.value || '', 'base64url').toString()) as ConnectFlow;
    const state = req.nextUrl.searchParams.get('state') || '';
    if (!/^[A-Za-z0-9_-]{32}$/.test(flow.state) || !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier)) return null;
    if (typeof flow.created !== 'number' || Date.now() - flow.created > CONNECT_FLOW_SECONDS * 1000 || flow.created > Date.now()) return null;
    const expected = Buffer.from(flow.state), supplied = Buffer.from(state);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    return { ...flow, next: safePersonalNext(flow.next) };
  } catch { return null; }
}
export function personalOrigin(req: NextRequest): string {
  // The deployed callback never trusts Host/X-Forwarded-Host. Development is
  // explicitly local, with no production visitor authorization credentials.
  return process.env.NODE_ENV === 'development' ? req.nextUrl.origin : new URL(SITE_URL).origin;
}
export function connectUnavailable(): Response | null {
  return PERSONAL_AUTHOR ? null : Response.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS });
}
export function clearConnectFlow(response: NextResponse): void {
  response.cookies.set(CONNECT_FLOW_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax' });
}
