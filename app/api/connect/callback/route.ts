import { NextRequest, NextResponse } from 'next/server';
import { libraryFetch, PERSONAL_AUTHOR, PRIVATE_HEADERS, VISITOR_COOKIE } from '../../../lib/library-proxy';
import { clearConnectFlow, connectUnavailable, personalOrigin, readConnectFlow } from '../../../lib/visitor-session';

export async function GET(req: NextRequest): Promise<Response> {
  const unavailable = connectUnavailable();
  if (unavailable) return unavailable;
  const flow = readConnectFlow(req);
  if (!flow) return Response.json({ error: 'This sign-in expired. Start again from the website.' }, { status: 400, headers: PRIVATE_HEADERS });
  const response = NextResponse.redirect(new URL(flow.next, personalOrigin(req)), { headers: { ...PRIVATE_HEADERS, 'Referrer-Policy': 'no-referrer' } });
  clearConnectFlow(response);
  if (req.nextUrl.searchParams.get('error') === 'access_denied') return response;
  const code = req.nextUrl.searchParams.get('code') || '';
  if (!/^avc_[a-f0-9]{64}$/.test(code)) return Response.json({ error: 'Invalid connection code.' }, { status: 400, headers: PRIVATE_HEADERS });
  try {
    const upstream = await libraryFetch('/connect/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: flow.verifier, author: PERSONAL_AUTHOR, site: personalOrigin(req) }) });
    const data = await upstream.json();
    if (!upstream.ok || data.author !== PERSONAL_AUTHOR || data.site !== personalOrigin(req) || typeof data.visitor_token !== 'string' || !data.visitor_token.startsWith('av1.')) {
      return Response.json({ error: 'The connection could not be verified. Start again from the website.' }, { status: 401, headers: PRIVATE_HEADERS });
    }
    response.cookies.set(VISITOR_COOKIE, data.visitor_token, { path: '/', httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax', maxAge: Math.min(Number(data.expires_in) || 0, 28_800) });
    return response;
  } catch { return Response.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
