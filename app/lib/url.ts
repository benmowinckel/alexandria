// Scheme allowlist for any user-derived URL that reaches an <a href>. Without
// this, a profile `contact`/`website` value of `javascript:…` / `data:…` /
// `vbscript:…` becomes stored XSS in the alexandria-library.com origin the
// moment those fields become writable (today they're hardcoded `{}`, so this is
// pre-emptive — ship it BEFORE the profile editor). Anything off the allowlist
// collapses to '#'. (security-audit-2026-06-23 L1)
export function safeUrl(url: string | null | undefined): string {
  const t = (url ?? '').trim();
  if (!t) return '#';
  // Relative path on our own origin (not protocol-relative `//`) — safe.
  if (t.startsWith('/') && !t.startsWith('//')) return t;
  try {
    const u = new URL(t);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? t : '#';
  } catch {
    return '#';
  }
}
