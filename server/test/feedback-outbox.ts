/** Feedback must survive a broken GitHub relay and drain cleanly on retry. */
import assert from 'node:assert/strict';
import { setKV } from '../src/kv.js';
import { flushPendingFeedback, publishFeedback } from '../src/marketplace.js';

class FakeKV {
  readonly values = new Map<string, string>();

  async put(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async delete(key: string): Promise<void> { this.values.delete(key); }
  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: Array<{ name: string }>; list_complete: true }> {
    const prefix = options?.prefix || '';
    const limit = options?.limit ?? 1000;
    return {
      keys: [...this.values.keys()].filter((key) => key.startsWith(prefix)).slice(0, limit).map((name) => ({ name })),
      list_complete: true,
    };
  }
}

const originalFetch = globalThis.fetch;
const kv = new FakeKV();
setKV(kv as unknown as KVNamespace);
process.env.GITHUB_BOT_TOKEN = 'test-token';
process.env.ENCRYPTION_KEY = '01'.repeat(32);

try {
  let relayAvailable = false;
  globalThis.fetch = async () => relayAvailable
    ? new Response('{}', { status: 201 })
    : new Response('temporary relay failure', { status: 503 });

  const id = await publishFeedback({
    author: 'test-author',
    t: '2026-08-21T05:45:00.000Z',
    text: 'exact user-approved feedback',
    context: 'direct',
  });
  assert.match(id, /^2026-08-21-[a-f0-9]{6}$/);
  assert.equal(kv.values.size, 1, 'failed relay must retain one durable outbox item');

  relayAvailable = true;
  assert.deepEqual(await flushPendingFeedback(), { delivered: 1, retained: 0 });
  assert.equal(kv.values.size, 0, 'successful retry must clear the outbox item');

  // If the first GitHub request succeeded but its response was lost, retrying
  // sees the existing path (PUT 422, GET 200) and clears the item as delivered.
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    requests++;
    if (init?.method === 'PUT') return new Response('already exists', { status: 422 });
    return new Response('{}', { status: 200 });
  };
  await publishFeedback({
    author: 'test-author',
    t: '2026-08-21T05:46:00.000Z',
    text: 'second exact user-approved feedback',
    context: 'direct',
  });
  assert.equal(requests, 2, 'idempotent retry must confirm the existing GitHub path');
  assert.equal(kv.values.size, 0, 'confirmed existing GitHub item must not stay queued');

  console.log('feedback outbox: pass');
} finally {
  globalThis.fetch = originalFetch;
}
