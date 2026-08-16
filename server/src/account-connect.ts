/** Short-lived, one-use account connection codes. */

import { randomBytes } from 'crypto';
import { hashApiKey } from './crypto.js';
import { getDB } from './db.js';

const CODE_PREFIX = 'alex_connect_';
const CODE_TTL_MS = 24 * 60 * 60 * 1000;

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getDB().prepare(
    `CREATE TABLE IF NOT EXISTS account_connect_codes (
      code_hash TEXT PRIMARY KEY,
      account_key TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();
  schemaReady = true;
}

export function isAccountConnectCode(value: string): boolean {
  return /^alex_connect_[a-f0-9]{48}$/.test(value);
}

export async function createAccountConnectCode(accountKey: string): Promise<string> {
  await ensureSchema();
  const code = `${CODE_PREFIX}${randomBytes(24).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  await getDB().batch([
    getDB().prepare('DELETE FROM account_connect_codes WHERE expires_at <= ?').bind(now.toISOString()),
    getDB().prepare(
      `INSERT INTO account_connect_codes (code_hash, account_key, expires_at, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind(hashApiKey(code), accountKey, expiresAt, now.toISOString()),
  ]);
  return code;
}

/** Read-only lookup used before membership validation. */
export async function peekAccountConnectCode(code: string): Promise<string | null> {
  if (!isAccountConnectCode(code)) return null;
  await ensureSchema();
  const row = await getDB().prepare(
    `SELECT account_key FROM account_connect_codes
     WHERE code_hash = ? AND expires_at > ?`
  ).bind(hashApiKey(code), new Date().toISOString()).first<{ account_key: string }>();
  return row?.account_key || null;
}

/** Atomic consume: concurrent requests can never redeem the same code twice. */
export async function consumeAccountConnectCode(code: string): Promise<string | null> {
  if (!isAccountConnectCode(code)) return null;
  await ensureSchema();
  const row = await getDB().prepare(
    `DELETE FROM account_connect_codes
     WHERE code_hash = ? AND expires_at > ?
     RETURNING account_key`
  ).bind(hashApiKey(code), new Date().toISOString()).first<{ account_key: string }>();
  return row?.account_key || null;
}
