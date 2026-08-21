import { createHmac, randomBytes } from 'crypto';
import { safeEqual } from './crypto.js';

export type OAuthStateData = {
  ref?: string;
  ref_source?: string;
  ref_id?: string;
  next?: string;
  intent?: string;
  waive?: string;
};

function signature(secret: string, state: string, payload: string): string {
  return createHmac('sha256', secret).update(`${state}.${payload}`).digest('base64url');
}

/**
 * Keep OAuth context in a signed, HttpOnly browser cookie instead of KV.
 * GitHub receives only the random state nonce; referral and waiver context
 * stays first-party, and the callback has no eventually-consistent read.
 */
export function createOAuthState(secret: string, data: OAuthStateData): { state: string; cookieValue: string } {
  const state = randomBytes(16).toString('hex');
  const payload = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  return { state, cookieValue: `${state}.${payload}.${signature(secret, state, payload)}` };
}

export function readOAuthState(secret: string, state: string, cookieValue: string): OAuthStateData | null {
  const [cookieState, payload, suppliedSignature, ...rest] = cookieValue.split('.');
  if (rest.length || !cookieState || !payload || !suppliedSignature) return null;
  if (!safeEqual(cookieState, state)) return null;
  if (!safeEqual(suppliedSignature, signature(secret, state, payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as OAuthStateData : null;
  } catch {
    return null;
  }
}
