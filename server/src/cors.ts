/** CORS — single source of truth for allowed origins. */

export function getAllowedOrigins(): string[] {
  const base = process.env.WEBSITE_URL || 'https://alexandria-library.com';
  const origins = [base, base.replace('https://', 'https://www.')];
  // localhost is a DEV-only origin and must NEVER sit in the production
  // credentialed allowlist (Access-Control-Allow-Credentials: true) — a
  // permanent localhost entry lets a malicious page running on a victim's own
  // machine make credentialed cross-origin calls to the API. Fail closed:
  // included ONLY when a dev environment explicitly opts in, so production
  // (which sets neither var) never allows it.
  if (process.env.NODE_ENV === 'development' || process.env.ALLOW_LOCALHOST_CORS === '1') {
    origins.push('http://localhost:3000');
  }
  return origins;
}
