import type { MiddlewareHandler } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    visitorFormTarget: string | undefined;
  }
}

// Security headers — all responses
export const browserSecurityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  const serverUrl = process.env.SERVER_URL || 'https://api.alexandria-library.com';
  const websiteUrl = process.env.WEBSITE_URL || 'https://alexandria-library.com';
  const target = c.get('visitorFormTarget');
  // The connection route sets this only after exact website registration
  // checks. Browsers also apply form-action to the post-submit redirect.
  const formAction = target ? `'self' ${target}` : "'self'";
  c.header('Content-Security-Policy', `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ${serverUrl} ${websiteUrl}; img-src 'self' ${websiteUrl}; frame-ancestors 'none'; base-uri 'none'; form-action ${formAction}`);
};

