import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../../lib/config';
import { localAuth } from '../../../lib/dev-auth';

export async function GET(req: NextRequest): Promise<Response> {
  const cookie = req.headers.get('cookie');
  const auth = req.headers.get('authorization');
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (auth) headers.Authorization = auth;
  Object.assign(headers, localAuth(auth));

  const upstream = await fetch(`${SERVER_URL}/library/session`, { headers });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
