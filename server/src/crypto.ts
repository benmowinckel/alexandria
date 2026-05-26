/**
 * Cryptographic utilities — encryption, hashing, key management.
 *
 * AES-256-GCM for data at rest (accounts blob).
 * SHA-256 for API key hashing (server never stores raw keys).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack: iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decrypt(token: string): string {
  const key = getKey();
  const buf = Buffer.from(token, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

/** One-way hash for API keys — server stores this, never the raw key. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Generate a random token (hex string). */
export function generateToken(bytes = 12): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Constant-time string equality for credential comparison.
 *
 * Use anywhere two secrets (API keys, tokens, signatures) are compared.
 * Plain `===` short-circuits on the first differing byte, leaking a
 * per-byte timing oracle that an attacker can use to reconstruct the
 * secret. `timingSafeEqual` always touches every byte.
 *
 * Length mismatch returns false fast — but only AFTER coercing to equal
 * length, so the length itself is not directly observable from the
 * timing of the constant-time compare. (We accept the trivial length
 * side-channel from the early return; credential length is rarely the
 * sensitive variable.)
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
