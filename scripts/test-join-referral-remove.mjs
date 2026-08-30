#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  assert(port > 0, 'could not reserve a local test port');
  return port;
}

async function waitForPage(url, serverState) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverState.exited) {
      throw new Error(`dev server exited before it was ready\n${serverState.output}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* the server is still starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`timed out waiting for ${url}\n${serverState.output}`);
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => server.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function mockReferralValidation(context) {
  await context.route('**/api/referral?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true }),
    });
  });
}

const configuredBaseUrl = process.env.JOIN_REFERRAL_BASE_URL?.replace(/\/$/, '');
const port = configuredBaseUrl ? null : await freePort();
const baseUrl = configuredBaseUrl || `http://127.0.0.1:${port}`;
const serverState = { exited: false, output: '' };
let devServer;
let browser;

try {
  if (!configuredBaseUrl) {
    devServer = spawn(
      process.execPath,
      [resolve(repoRoot, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const capture = (chunk) => {
      serverState.output = `${serverState.output}${chunk}`.slice(-8_000);
    };
    devServer.stdout.on('data', capture);
    devServer.stderr.on('data', capture);
    devServer.once('exit', () => { serverState.exited = true; });
    await waitForPage(`${baseUrl}/join`, serverState);
  }

  browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  await mockReferralValidation(desktop);
  const page = await desktop.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(`${baseUrl}/join?ref=testfriend&ref_source=invite`, { waitUntil: 'networkidle' });
  const saved = page.locator('.act-email.is-saved');
  await saved.waitFor();
  const remove = page.getByRole('button', { name: 'remove @testfriend referral' });
  const tick = page.locator('.join-referral-tick');
  assert(Number(await remove.evaluate((element) => getComputedStyle(element).opacity)) < 0.05, 'remove control is visible before hover');
  assert(Number(await tick.evaluate((element) => getComputedStyle(element).opacity)) > 0.95, 'saved tick is hidden before hover');
  assert((await page.locator('.act-primary').getAttribute('href'))?.includes('ref=testfriend'), 'join link did not carry the referral');

  await saved.hover();
  await page.waitForTimeout(220);
  assert(Number(await remove.evaluate((element) => getComputedStyle(element).opacity)) > 0.95, 'remove control did not appear on hover');
  assert(Number(await tick.evaluate((element) => getComputedStyle(element).opacity)) < 0.05, 'saved tick did not yield on hover');

  await remove.click();
  const input = page.getByRole('textbox', { name: 'referral github handle or invite link' });
  await input.waitFor();
  const cleanUrl = new URL(page.url());
  assert(!cleanUrl.searchParams.has('ref'), 'ref remained in the page address');
  assert(!cleanUrl.searchParams.has('ref_source'), 'ref_source remained in the page address');
  assert(await page.evaluate(() => localStorage.getItem('alexandria-referrer')) === null, 'referral remained in local storage');
  assert(!(await page.locator('.act-primary').getAttribute('href'))?.includes('ref='), 'join link retained a removed referral');

  await input.fill('newfriend');
  await page.waitForTimeout(500);
  await input.press('Enter');
  await page.getByText('@newfriend invited you', { exact: false }).waitFor();
  assert(await page.evaluate(() => localStorage.getItem('alexandria-referrer')) === 'newfriend', 'replacement referral was not saved');
  assert((await page.locator('.act-primary').getAttribute('href'))?.includes('ref=newfriend'), 'join link did not use the replacement referral');

  const replacementRemove = page.getByRole('button', { name: 'remove @newfriend referral' });
  await replacementRemove.focus();
  await page.waitForTimeout(220);
  assert(Number(await replacementRemove.evaluate((element) => getComputedStyle(element).opacity)) > 0.95, 'remove control did not appear on keyboard focus');
  await replacementRemove.click();
  await input.waitFor();
  assert(await page.getByText('@testfriend invited you', { exact: false }).count() === 0, 'the initial referral reappeared');
  await page.reload({ waitUntil: 'networkidle' });
  await input.waitFor();
  assert(await page.locator('.act-email.is-saved').count() === 0, 'a removed referral returned after refresh');
  await desktop.close();

  const persisted = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await persisted.addInitScript(() => localStorage.setItem('alexandria-referrer', 'storedfriend'));
  await mockReferralValidation(persisted);
  const persistedPage = await persisted.newPage();
  persistedPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await persistedPage.goto(`${baseUrl}/join`, { waitUntil: 'networkidle' });
  await persistedPage.getByText('@storedfriend invited you', { exact: false }).waitFor();
  await persisted.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await mockReferralValidation(mobile);
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${baseUrl}/join?ref=touchfriend`, { waitUntil: 'networkidle' });
  const mobileSaved = mobilePage.locator('.act-email.is-saved');
  await mobileSaved.waitFor();
  const mobileRemove = mobilePage.getByRole('button', { name: 'remove @touchfriend referral' });
  const mobileTick = mobilePage.locator('.join-referral-tick');
  assert(Number(await mobileRemove.evaluate((element) => getComputedStyle(element).opacity)) > 0.95, 'touch remove control is hidden');
  assert(Number(await mobileTick.evaluate((element) => getComputedStyle(element).opacity)) < 0.05, 'saved tick overlaps the touch remove control');
  const cardBox = await mobileSaved.boundingBox();
  const removeBox = await mobileRemove.boundingBox();
  assert(cardBox && removeBox && removeBox.x + removeBox.width <= cardBox.x + cardBox.width, 'touch remove control overflows its card');
  await mobileRemove.tap();
  await mobilePage.getByRole('textbox', { name: 'referral github handle or invite link' }).waitFor();
  await mobile.close();

  assert(consoleErrors.length === 0, `browser console errors: ${consoleErrors.join(' | ')}`);
  console.log('join referral removal: passed');
} finally {
  if (browser) await browser.close();
  await stopServer(devServer);
}
