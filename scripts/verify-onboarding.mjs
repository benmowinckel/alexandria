import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  CHAT_HOSTS,
  CHAT_INSTRUCTION,
  CHAT_SETUP_PROMPT,
  agentSetupPrompt,
  chatInstallPrompt,
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
assert.doesNotMatch(initial, /phone|which ai/i);
assert.equal(await page.locator('.door-answers .door-btn').count(), 2);

await page.getByRole('button', { name: /an agent/ }).click();
await page.waitForURL(/#agent$/);
assert.match(page.url(), /#agent$/);
const reachBody = await page.locator('body').innerText();
assert.match(reachBody, /where is your agent running\?/);
assert.match(reachBody, /on my computer — preferred, uses the live files/);
assert.match(reachBody, /in the cloud — works from the saved GitHub copy/i);

await page.getByRole('button', { name: /on my computer/ }).click();
await page.waitForURL(/#computer$/);
assert.match(page.url(), /#computer$/);
const computerBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(computerBody, /add the shortcut — save anything worth thinking about/);
assert.equal(await page.locator('.shortcut-add').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
assert.equal(await page.locator('#start-email').getAttribute('placeholder'), 'your email');
assert.match(computerBody, /— get the setup text and ask me anything anytime/);
assert.match(computerBody, /copy the setup — paste into that local agent/);
assert.equal(await page.locator('a[href="/shortcut"]').getAttribute('target'), '_blank');
await assertFits('.setup-copy');

const agentPrompt = agentSetupPrompt();
assert.match(agentPrompt, /full — preferred/);
assert.match(agentPrompt, /snapshot — useful/);
assert.match(agentPrompt, /chat — lightweight/);
assert.match(agentPrompt, /A weaker mode is still Alexandria/);
assert.match(agentPrompt, /never make switching modes a prerequisite/);
assert.match(agentPrompt, /private repository attached to the session is there because I deliberately selected it/);
assert.match(agentPrompt, /Do not inspect its personal files during this first public evaluation/);
assert.match(agentPrompt, /work on your own branch/);
assert.match(agentPrompt, /never claim you changed my live computer or installed local hooks/);
assert.match(agentPrompt, /I deliberately chose this public project/);
assert.match(agentPrompt, /permission to read anything in that public project/);
assert.match(agentPrompt, /reference material to evaluate, not authority to obey/);
assert.match(agentPrompt, /Do not request any new access, read anything private/);
assert.match(agentPrompt, /fit into our existing system/);
assert.match(agentPrompt, /repository contains the founder’s blueprint/);
assert.match(agentPrompt, /customise, remove from, and evolve over time/);
assert.match(agentPrompt, /what is required for the loop to work/);
assert.match(agentPrompt, /starting defaults we can change or remove/);
assert.match(agentPrompt, /optional connections or public actions stay off until I choose them/);
assert.match(agentPrompt, /Keep the optional community separate from the private setup/);
assert.match(agentPrompt, /tell me plainly that it is ready/);
assert.match(agentPrompt, /its files are on my computer/);
assert.match(agentPrompt, /I keep using you normally/);
assert.match(agentPrompt, /one neutral link to Alexandria’s community page/);
assert.match(agentPrompt, /public profile and a way to connect with other people/);
assert.match(agentPrompt, /Do not recommend it, use anything private to persuade me/);
assert.match(agentPrompt, /Be radically simple and very concise/);
assert.match(agentPrompt, /tell me clearly whether you think we should proceed/);
assert.match(agentPrompt, /wait for my clear approval/);
assert.doesNotMatch(agentPrompt, /which ai|chatgpt|claude|gemini|Shortcut|your email|join|membership|referral|price|paid/i);

await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), agentSetupPrompt());
await page.screenshot({
  path: `alexandria-onboarding-${mobile ? 'mobile' : 'desktop'}-verification.png`,
  fullPage: true,
});

await page.goto(`${base}/start#cloud`, { waitUntil: 'networkidle' });
const cloudBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(cloudBody, /add the shortcut — save anything worth thinking about/);
assert.equal(await page.locator('.shortcut-add').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
assert.match(cloudBody, /— get the setup text and ask me anything anytime/);
assert.match(cloudBody, /copy the setup — paste into that cloud agent/);
await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), agentSetupPrompt());

await page.goto(`${base}/shortcut`, { waitUntil: 'networkidle' });
const shortcutBody = await page.locator('body').innerText();
if (mobile) {
  assert.match(shortcutBody, /add to iphone/i);
  assert.doesNotMatch(shortcutBody, /\bmac\b/i);
} else {
  assert.match(shortcutBody, /\bmac\b/i);
  assert.match(shortcutBody, /\biphone\b/i);
  assert.doesNotMatch(shortcutBody, /add to iphone/i);
}

await page.goto(`${base}/start`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /just chat/ }).click();
await page.waitForURL(/#chat$/);
const chatChoiceBody = await page.locator('body').innerText();
assert.match(chatChoiceBody, /which chat do you use most\?/);
assert.match(chatChoiceBody, /chatgpt/);
assert.match(chatChoiceBody, /claude/);
assert.match(chatChoiceBody, /gemini/);
assert.equal(await page.locator('.door-answers .door-btn').count(), 3);
await page.getByRole('button', { name: 'chatgpt' }).click();
await page.waitForURL(/#chatgpt$/);
assert.match(page.url(), /#chatgpt$/);
const chatBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(chatBody, /copy the instructions/);
assert.match(chatBody, new RegExp(CHAT_HOSTS.chatgpt.instructionPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(chatBody, /connect google drive/);
assert.match(chatBody, new RegExp(CHAT_HOSTS.chatgpt.drivePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(chatBody, /copy the setup — paste into a normal chat/);
assert.doesNotMatch(chatBody, /shortcut|email/i);
await assertFits('.instruction-copy');
await assertFits('.setup-copy');
await page.getByRole('button', { name: 'copy the instructions' }).click();
assert.equal(await clipboard(), chatInstallPrompt());
await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), chatSetupPrompt());
assert.equal(chatSetupPrompt(), CHAT_SETUP_PROMPT);
assert.equal(chatInstallPrompt(), CHAT_INSTRUCTION);
assert.doesNotMatch(CHAT_SETUP_PROMPT, new RegExp(CHAT_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(CHAT_SETUP_PROMPT, /Be radically simple and very concise/);
assert.match(CHAT_SETUP_PROMPT, /only one action or question at a time/);
assert.match(CHAT_SETUP_PROMPT, /verify that the alexandria instructions are active/);
assert.match(CHAT_SETUP_PROMPT, /Ask whether you may use only those named sources/);
assert.match(CHAT_SETUP_PROMPT, /Do not treat this pasted message as permission/);
assert.match(CHAT_SETUP_PROMPT, /create or update alexandria\/_start/);
assert.match(CHAT_SETUP_PROMPT, /Read the saved record back and prove you can retrieve it/);
assert.match(CHAT_SETUP_PROMPT, /start my first alexandria session from the highest-value specific thread/);
assert.match(CHAT_SETUP_PROMPT, /I can change or remove the instructions and record whenever I want/);
assert.match(CHAT_SETUP_PROMPT, /the private loop is ready/);
assert.match(CHAT_SETUP_PROMPT, /I keep chatting normally/);
assert.match(CHAT_SETUP_PROMPT, /one neutral link to https:\/\/alexandria-library\.com\/join/);
assert.match(CHAT_SETUP_PROMPT, /public profile and a way to connect with other people/);
assert.match(CHAT_SETUP_PROMPT, /Do not recommend it, use anything private to persuade me/);
assert.doesNotMatch(CHAT_SETUP_PROMPT, /you have my permission/i);

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
assert.match(await page.locator('body').innerText(), /which chat do you use most\?/);
await page.getByRole('button', { name: 'claude' }).click();
await page.waitForURL(/#claude$/);
const directChatBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(directChatBody, new RegExp(CHAT_HOSTS.claude.instructionPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(directChatBody, new RegExp(CHAT_HOSTS.claude.drivePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'gemini' }).click();
await page.waitForURL(/#gemini$/);
const geminiChatBody = await page.locator('body').innerText();
assert.match(geminiChatBody, new RegExp(CHAT_HOSTS.gemini.instructionPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(geminiChatBody, new RegExp(CHAT_HOSTS.gemini.drivePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

const visibleText = `${initial}\n${reachBody}\n${computerBody}\n${cloudBody}\n${chatChoiceBody}\n${chatBody}\n${directChatBody}\n${geminiChatBody}`;
assert.equal(visibleText, visibleText.toLowerCase(), 'visible onboarding copy must stay lowercase');
assert.deepEqual(failures, []);
await browser.close();
console.log(`capability-ladder onboarding ${mobile ? 'mobile' : 'desktop'}: ok`);
