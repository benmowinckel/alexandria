/** Error page layout, safe restart links, and markup escaping. */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { chromium } from 'playwright';
import { Hono } from 'hono';
import { browserSecurityHeaders } from '../src/browser-security.js';
import { renderVisitorConnectionPage } from '../src/visitor-connection-page.js';

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}
const received: string[] = [];
const reader = createServer((req, res) => {
  received.push(req.url!);
  res.setHeader('Content-Type', 'text/html');
  res.end('<p>back at the mirror</p>');
});
const site = await listen(reader);
const app = new Hono();
app.use('*', browserSecurityHeaders);
app.get('/connect/authorize', c => c.html(renderVisitorConnectionPage({
  site, error: 'This connection has expired. Start again.', restartUrl: site,
})));
const auth = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const response = await app.request(`${authOrigin}${req.url}`, {
    method: req.method, headers: req.headers as Record<string, string>,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
});
const authOrigin = await listen(auth);
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${authOrigin}/connect/authorize`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.getByText('alexandria.', { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('status').innerText(), 'This connection has expired. Start again.');
    await page.getByRole('link', { name: `back to ${new URL(site).hostname}` }).click();
    await page.waitForURL(site + '/');
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.close();
  }
  assert.equal(received.length, 2, 'desktop and mobile return to the registered site');
  const escaped = renderVisitorConnectionPage({ site, error: '<script>bad()</script>' });
  assert.ok(!escaped.includes('<script>') && escaped.includes('&lt;script&gt;'));
  assert.ok(!renderVisitorConnectionPage({ site, error: 'expired', restartUrl: 'javascript:alert(1)' }).includes('href='));
  console.log('visitor connection browser: desktop/mobile error return, and escaping passed');
} finally {
  await browser.close();
  auth.close(); reader.close();
}
