// D1 + R2 accessor — mirrors kv.ts pattern

export function getDB(): D1Database {
  const db = (globalThis as any).__d1;
  if (!db) throw new Error('D1 not initialized — check wrangler.toml [[d1_databases]] binding');
  return db;
}

export function getR2(): R2Bucket {
  const r2 = (globalThis as any).__r2;
  if (!r2) throw new Error('R2 not initialized — check wrangler.toml [[r2_buckets]] binding');
  return r2;
}

// ULID-like ID generator (time-sortable, no dependency)
export function generateId(): string {
  const t = Date.now().toString(36).padStart(9, '0');
  const r = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12);
  return `${t}${r}`;
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// Lazy-add the per-file paid price column (additive, nullable). Mirrors the
// ensureCounterSchema pattern — works on deploy with no separate migration
// apply. Memoized per isolate; the ALTER throws "duplicate column" once the
// column exists, which we ignore.
// Paid-item price clamp — $1 to $1000 (cents). Single source of truth for the
// valid price range, used both at write (PUT /file) and at checkout.
export function clampPaidAmount(amountCents: number): number {
  return Math.max(100, Math.min(100000, amountCents));
}

let _filePriceColReady = false;
export async function ensureFilePriceColumn(): Promise<void> {
  if (_filePriceColReady) return;
  try {
    await getDB().prepare('ALTER TABLE protocol_files ADD COLUMN price_cents INTEGER').run();
  } catch {
    /* column already exists */
  }
  _filePriceColReady = true;
}

// Lazy-add the explicit display title column (additive, nullable). Same pattern.
// The subtitle already lives in the existing `text` column; this is the title an
// Author sets at upload (falls back to the pretty filename when unset).
let _fileTitleColReady = false;
export async function ensureFileTitleColumn(): Promise<void> {
  if (_fileTitleColReady) return;
  try {
    await getDB().prepare('ALTER TABLE protocol_files ADD COLUMN title TEXT').run();
  } catch {
    /* column already exists */
  }
  _fileTitleColReady = true;
}
