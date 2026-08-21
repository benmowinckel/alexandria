import assert from 'node:assert';
import { Hono } from 'hono';
import { createRequestBodyLimit } from '../src/body-limit.js';

const app = new Hono();
app.use('*', createRequestBodyLimit(8, 16));
app.post('/plain', async (c) => c.text(await c.req.text()));
app.put('/file/test.md', async (c) => c.text(await c.req.text()));

async function streamRequest(path: string, method: 'POST' | 'PUT', text: string): Promise<Response> {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, Math.ceil(bytes.length / 2)));
      controller.enqueue(bytes.subarray(Math.ceil(bytes.length / 2)));
      controller.close();
    },
  });
  return app.request(new Request(`https://example.com${path}`, {
    method,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' }));
}

const small = await streamRequest('/plain', 'POST', '12345678');
assert.strictEqual(small.status, 200);

const oversizedWithoutLength = await streamRequest('/plain', 'POST', '123456789');
assert.strictEqual(oversizedWithoutLength.status, 413);
assert.strictEqual(await oversizedWithoutLength.text(), 'Request body too large');

const uploadWithinItsLargerLimit = await streamRequest('/file/test.md', 'PUT', '123456789');
assert.strictEqual(uploadWithinItsLargerLimit.status, 200);

const oversizedUploadWithoutLength = await streamRequest('/file/test.md', 'PUT', '12345678901234567');
assert.strictEqual(oversizedUploadWithoutLength.status, 413);

console.log('  4 body-limit tests passed');
