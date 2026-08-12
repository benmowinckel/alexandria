import { NextRequest } from 'next/server';
import { SERVER_URL } from '../../lib/config';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export async function GET(req: NextRequest): Promise<Response> {
  const code = (req.nextUrl.searchParams.get('code') || '')
    .replace(/[^A-Za-z0-9-]/g, '')
    .slice(0, 39);

  if (!code) {
    return new Response(JSON.stringify({ valid: false }), { status: 200, headers: JSON_HEADERS });
  }

  try {
    const response = await fetch(`${SERVER_URL}/check-kin?code=${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => ({ valid: false }))) as { valid?: boolean };
    return new Response(JSON.stringify({ valid: response.ok && data.valid === true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify({ valid: false }), { status: 200, headers: JSON_HEADERS });
  }
}
