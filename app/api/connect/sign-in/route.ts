import { NextRequest, NextResponse } from 'next/server';
import { PERSONAL_AUTHOR, PRIVATE_HEADERS } from '../../../lib/library-proxy';
import { connectUnavailable, newConnectFlow, pkceChallenge, personalOrigin, CONNECT_FLOW_COOKIE, CONNECT_FLOW_SECONDS } from '../../../lib/visitor-session';

export async function GET(req: NextRequest): Promise<Response> {
  const unavailable = connectUnavailable();
  if (unavailable) return unavailable;
  const flow = newConnectFlow(req.nextUrl.searchParams.get('next'));
  const target = new URL('/library/connect', 'https://alexandria-library.com');
  target.search = new URLSearchParams({ author: PERSONAL_AUTHOR, site: personalOrigin(req), state: flow.state, code_challenge: pkceChallenge(flow.verifier), code_challenge_method: 'S256' }).toString();
  const response = NextResponse.redirect(target, { headers: PRIVATE_HEADERS });
  response.cookies.set(CONNECT_FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax', path: '/', maxAge: CONNECT_FLOW_SECONDS });
  return response;
}
