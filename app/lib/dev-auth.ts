/**
 * Local-dev only. When ALX_LOCAL_KEY is set (in .env.local, gitignored), attach
 * it as a Bearer on the same-origin Library proxies so localhost is "already
 * signed in" as the Author — the Worker resolves the account by API key
 * (`account = byKey || bySession`), unlocking gated pieces and the deep PLM
 * without the OAuth cookie flow. The var is unset in production, so this is
 * inert there. Never overrides real incoming auth.
 */
export function localAuth(incomingAuth?: string | null): Record<string, string> {
  if (incomingAuth) return {};
  const key = process.env.ALX_LOCAL_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}
