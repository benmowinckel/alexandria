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
  // then navigates to `next`. The meta-refresh is a pure JS-disabled fallback set
  // long (10s) ON PURPOSE: a short fallback would race the POST and navigate away
  // before the cookie lands on a slow network, dropping the viewer signed-out.
  // With JS on, the fetch resolves and navigates first; the refresh never fires.
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>alexandria.</title><meta http-equiv="refresh" content="10;url=${next
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')}"><style>:root{color-scheme:light;--paper:#fafafa;--ink:#211e18;--muted:#6f6a63}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:1rem/1.6 Georgia,"Times New Roman",serif;-webkit-font-smoothing:antialiased}header{display:flex;align-items:center;padding:28px 32px 0}.brand{margin:0;font-style:italic;font-size:21px;letter-spacing:.005em}.brand span{font-style:normal}main{width:min(100%,28rem);margin:clamp(3rem,18vh,8rem) auto 3rem;padding:0 1.5rem}p{margin:0;color:var(--muted);font-size:1.05rem;line-height:1.65}</style></head><body><header><p class="brand">alexandria<span>.</span></p></header><main><p>signing you in…</p></main><script>(function(){var code=${JSON.stringify(
    code,
  )},next=${JSON.stringify(
    next,
  )};function go(){window.location.replace(next);}if(!code){go();return;}fetch('/api/auth/session?code='+encodeURIComponent(code),{method:'POST',credentials:'include'}).then(go,go);})();</script></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // The URL carries the one-time code; keep it out of any Referer header.
      'Referrer-Policy': 'no-referrer',
    },
  });
}
