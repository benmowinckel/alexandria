import { NextRequest, NextResponse } from 'next/server';
import { VISITOR_COOKIE, PRIVATE_HEADERS } from '../../../lib/library-proxy';
import { clearConnectFlow, connectUnavailable, personalOrigin } from '../../../lib/visitor-session';

export async function GET(req: NextRequest): Promise<Response> {
  const unavailable = connectUnavailable();
  if (unavailable) return unavailable;
  const response = NextResponse.redirect(new URL('/', personalOrigin(req)), { headers: PRIVATE_HEADERS });
  response.cookies.set(VISITOR_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax' });
  clearConnectFlow(response);
  return response;
}
