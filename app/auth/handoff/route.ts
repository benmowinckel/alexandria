import { NextRequest } from 'next/server';

/**
 * First-party session handoff — the fix for Safari dropping the library session.
 *
 * The OAuth callback lives on the api subdomain, so its Set-Cookie lands at the
 * tail of a cross-site redirect chain (GitHub → api), which Safari refuses to
 * keep (WebKit #196375 / #219650) — and it drops the cookie anywhere in a chain
 * that traces back to that cross-site hop, so setting it on this landing page's
 * own response fails too. So this page sets NOTHING itself: it loads, then its
 * script POSTs the one-time code to /api/auth/session, which sets the cookie on a
 * plain same-origin fetch response (not a navigation target → outside the
 * mitigation, stored by every browser). Only once that resolves does the page
 * navigate on to the library, cookie in hand.
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

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code') || '';
  const next = sanitizeNext(req.nextUrl.searchParams.get('next'));

  // The script sets the cookie via a same-origin POST (off the redirect chain),
  // then navigates to `next`. If the POST fails or JS is off, the meta-refresh
  // still lands the viewer on `next` (signed-out — no worse than before).
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>alexandria.</title><meta http-equiv="refresh" content="3;url=${next
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')}"></head><body style="font-family:'EB Garamond',Georgia,serif;background:#f5f0e8;color:#8a8078;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><p>signing you in&hellip;</p><script>(function(){var code=${JSON.stringify(
    code,
  )},next=${JSON.stringify(
    next,
  )};function go(){window.location.replace(next);}if(!code){go();return;}fetch('/api/auth/session?code='+encodeURIComponent(code),{method:'POST',credentials:'include'}).then(go,go);})();</script></body></html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
