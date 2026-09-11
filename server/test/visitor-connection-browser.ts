/** A real cross-origin form redirect under the production response policy. */
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
const stranger = createServer((_req, res) => { res.end('unrelated website'); });
const otherSite = await listen(stranger);
const app = new Hono();
app.use('*', browserSecurityHeaders);
let destination = site;
let allowReturn = true;
app.get('/connect/authorize', c => {
  if (allowReturn) c.set('visitorFormTarget', site);
  return c.html(renderVisitorConnectionPage({ site, readerLogin: 'reader', intent: 'sealed-fixture' }));
});
app.post('/connect/authorize', async c => {
  assert.equal(c.req.header('origin'), authOrigin);
  const form = new URLSearchParams(await c.req.text());
  assert.equal(form.get('intent'), 'sealed-fixture');
  if (allowReturn) c.set('visitorFormTarget', site);
  return c.redirect(`${destination}/callback?decision=${form.get('decision')}`, 303);
});
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
    for (const decision of ['continue', 'cancel']) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${authOrigin}/connect/authorize`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByText('about this connection', { exact: true }).click();
      assert.equal(await page.getByText(/No private map/).isVisible(), true);
      await page.getByRole('button', { name: decision, exact: true }).click();
      await page.waitForURL(`${site}/callback?decision=${decision === 'continue' ? 'allow' : 'deny'}`);
      assert.equal(errors.length, 0, errors.join('\n'));
      await page.close();
    }
  }
  assert.equal(received.length, 4, 'both decisions reached the registered site on desktop and mobile');
  for (const scenario of ['old-policy', 'unrelated-site']) {
    allowReturn = scenario !== 'old-policy';
    destination = scenario === 'unrelated-site' ? otherSite : site;
    const page = await browser.newPage();
    const blocked = page.waitForEvent('console', { predicate: message => /form-action/.test(message.text()) });
    await page.goto(`${authOrigin}/connect/authorize`);
    await page.getByRole('button', { name: 'continue', exact: true }).click();
    await blocked;
    assert.equal(page.url(), `${authOrigin}/connect/authorize`, scenario);
    await page.close();
  }
  assert.equal(received.length, 4, 'a blocked return cannot reach the reader');
  const escaped = renderVisitorConnectionPage({ site, readerLogin: '<script>bad()</script>', intent: '\"><img src=x>' });
  assert.ok(!escaped.includes('<script>') && !escaped.includes('<img '));
  assert.ok(!renderVisitorConnectionPage({ site, error: 'expired', restartUrl: 'javascript:alert(1)' }).includes('href='));
  console.log('visitor connection browser: desktop/mobile continue and cancel, old-policy reproduction, unrelated-site denial, and escaping passed');
} finally {
  await browser.close();
  auth.close(); reader.close(); stranger.close();
}
