import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  CHAT_INSTRUCTION,
  CHAT_SETUP_PROMPT,
  agentSetupPrompt,
  chatSetupPrompt,
} from '../shared/onboarding-prompts.ts';

const base = process.argv[2] || 'http://localhost:3000';
const mobile = process.argv[3] === 'mobile';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: mobile ? { width: 375, height: 812 } : { width: 1280, height: 900 },
  ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : {}),
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const failures = [];
await page.route('**/_vercel/insights/**', (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: '',
}));
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => failures.push(`page: ${error.message}`));

async function clipboard() {
  return page.evaluate(() => navigator.clipboard.readText());
}

async function assertFits(selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} must be visible`);
  assert.ok(box.x >= 0 && box.x + box.width <= (mobile ? 375 : 1280), `${selector} must fit the viewport`);
}

await page.goto(`${base}/start`, { waitUntil: 'networkidle' });
const initial = await page.locator('body').innerText();
assert.match(initial, /what do you have access to\?/);
assert.match(initial, /an agent/);
assert.match(initial, /just chat/);
assert.doesNotMatch(initial, /phone|computer|which ai/i);
assert.equal(await page.locator('.door-answers .door-btn').count(), 2);

await page.getByRole('button', { name: /an agent/ }).click();
await page.locator('.setup-copy').waitFor();
assert.match(page.url(), /#agent$/);
const agentBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 1);
assert.match(agentBody, /copied — paste into your agent/);
assert.doesNotMatch(agentBody, /phone|computer|which ai|chatgpt|claude|gemini|shortcut|email/i);
await assertFits('.setup-copy');
assert.equal(await clipboard(), agentSetupPrompt());

const agentPrompt = agentSetupPrompt();
assert.match(agentPrompt, /Do not ask me which/);
assert.match(agentPrompt, /run commands and read and write files on my computer/);
assert.match(agentPrompt, /COMPUTER ROUTE/);
assert.match(agentPrompt, /LATER ROUTE/);
assert.match(agentPrompt, /wait for me to say `start`/);
assert.match(agentPrompt, /real reminder that works outside this chat/);
assert.match(agentPrompt, /temporary line below the instructions already in this app/);
assert.match(agentPrompt, /ask what I see instead of inventing a path/);
assert.doesNotMatch(agentPrompt, /which ai|chatgpt|claude|gemini|Shortcut|your email/i);

await page.goBack();
await page.getByRole('button', { name: /an agent/ }).waitFor();
assert.doesNotMatch(page.url(), /#agent$/);
assert.match(await page.locator('body').innerText(), /what do you have access to\?/);

await page.getByRole('button', { name: /just chat/ }).click();
await page.locator('.setup-copy').waitFor();
assert.match(page.url(), /#chat$/);
const chosenChatBody = await page.locator('body').innerText();
assert.match(chosenChatBody, /copied — paste into your chat/);
assert.equal(await clipboard(), chatSetupPrompt());

await page.goBack();
await page.getByRole('button', { name: /just chat/ }).waitFor();
assert.doesNotMatch(page.url(), /#chat$/);

await page.goto(`${base}/start#agent`, { waitUntil: 'networkidle' });
assert.match(await page.locator('body').innerText(), /copy the setup — paste into your agent/);
await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), agentSetupPrompt());

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
const chatBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 1);
assert.match(chatBody, /copy the setup — paste into your chat/);
assert.doesNotMatch(chatBody, /which ai|chatgpt|claude|gemini|shortcut|email|custom instructions/i);
await assertFits('.setup-copy');
await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), chatSetupPrompt());
assert.equal(chatSetupPrompt(), CHAT_SETUP_PROMPT);
assert.ok(CHAT_SETUP_PROMPT.includes(CHAT_INSTRUCTION));
assert.match(CHAT_SETUP_PROMPT, /Do not ask which app I use/);
assert.match(CHAT_SETUP_PROMPT, /use only controls and capabilities you can verify/);
assert.match(CHAT_SETUP_PROMPT, /one action and wait/);
assert.match(CHAT_SETUP_PROMPT, /Keep every instruction already there/);
assert.match(CHAT_SETUP_PROMPT, /supports Google Drive/);
assert.match(CHAT_SETUP_PROMPT, /Ask me directly whether you may use those named sources/);
assert.match(CHAT_SETUP_PROMPT, /miniature alexandria loop/);
assert.match(CHAT_SETUP_PROMPT, /full version needs an ai agent on a computer/);
assert.match(CHAT_SETUP_PROMPT, /final test/);
assert.doesNotMatch(CHAT_SETUP_PROMPT, /you have my permission/i);

const visibleText = `${initial}\n${agentBody}\n${chosenChatBody}\n${chatBody}`;
assert.equal(visibleText, visibleText.toLowerCase(), 'visible onboarding copy must stay lowercase');
assert.deepEqual(failures, []);

await page.screenshot({
  path: `alexandria-onboarding-${mobile ? 'mobile' : 'desktop'}-verification.png`,
  fullPage: true,
});
await browser.close();
console.log(`universal onboarding ${mobile ? 'mobile' : 'desktop'}: ok`);
