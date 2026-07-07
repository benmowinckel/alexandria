import { NextRequest } from 'next/server';
import { SERVER_URL, SITE_URL } from '../../lib/config';

/**
 * First-party session handoff — the fix for Safari dropping the library session.
 *
 * The OAuth callback lives on the api subdomain, so the cookie it sets lands at
 * the tail of a cross-site redirect chain (GitHub → api). Safari refuses to keep
 * a cookie set in that position (WebKit #196375 / #219650), so returning members
 * bounced back to the site still signed-out. The callback now hands us a
 * one-time code instead; we exchange it for the session token SERVER-SIDE and set
 * the cookie HERE, first-party on the website's own origin, which every browser
 * honours. The cookie is set on a normal 200 response (not another redirect) and
 * the browser then loads `next` as a fresh same-site navigation, so the cookie is
 * present the first time the app reads it.
 */

// Only ever return the viewer to a library path on our own site (open-redirect
// guard). Mirrors the worker's sanitizeNextPath; the library root is allowed.
function sanitizeNext(raw: string | null): string {
  if (!raw) return '/library';
  try {
    const v = decodeURIComponent(raw).trim();
    if (!v.startsWith('/') || v.startsWith('//')) return '/library';
    return v === '/library' || v.startsWith('/library/') || v.startsWith('/library?') ? v : '/library';
  } catch {
    return '/library';
  }
}

// Cookie shared across the apex + api subdomain, same as the worker minted it —
// derived from SITE_URL so it lands on the website's registrable domain.
function cookieDomain(): string {
  try {
    const host = new URL(SITE_URL).hostname.replace(/^(api|www)\./, '');
    return host ? `; Domain=.${host}` : '';
  } catch {
    return '';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string),
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code') || '';
  const next = sanitizeNext(req.nextUrl.searchParams.get('next'));

  let token = '';
  if (code) {
    try {
      const res = await fetch(`${SERVER_URL}/auth/session/exchange?code=${encodeURIComponent(code)}`, {
        cache: 'no-store',
      });
      if (res.ok) token = ((await res.json()) as { token?: string }).token || '';
    } catch {
      /* exchange failed — fall through, land signed-out rather than error */
    }
  }

  // meta-refresh + JS replace: navigate to `next` as a fresh same-site load once
  // the cookie is committed. Both paths are belt-and-suspenders across browsers.
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>alexandria.</title><meta http-equiv="refresh" content="0;url=${escapeHtml(
    next,
  )}"></head><body style="font-family:'EB Garamond',Georgia,serif;background:#f5f0e8;color:#8a8078;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><p>signing you in&hellip;</p><script>window.location.replace(${JSON.stringify(
    next,
  )})</script></body></html>`;

  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (token) {
    headers.append(
      'Set-Cookie',
      `alex_library_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${cookieDomain()}`,
    );
  }
  return new Response(html, { status: 200, headers });
}
