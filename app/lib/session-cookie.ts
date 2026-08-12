import { SITE_URL } from './config';

export const LIBRARY_SESSION_COOKIE = 'alex_library_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function cookieDomain(): string {
  try {
    const host = new URL(SITE_URL).hostname.replace(/^(api|www)\./, '');
    return host ? `; Domain=.${host}` : '';
  } catch {
    return '';
  }
}

const COOKIE_FLAGS = 'Path=/; HttpOnly; Secure; SameSite=Lax';

export function librarySessionSetCookie(token: string): string {
  return `${LIBRARY_SESSION_COOKIE}=${token}; ${COOKIE_FLAGS}; Max-Age=${SESSION_MAX_AGE}${cookieDomain()}`;
}

/** Expire both the Domain-scoped cookie and any leftover host-only copy. */
export function librarySessionClearCookies(): string[] {
  const base = `${LIBRARY_SESSION_COOKIE}=; ${COOKIE_FLAGS}; Max-Age=0`;
  const domain = cookieDomain();
  return domain ? [base, `${base}${domain}`] : [base];
}
