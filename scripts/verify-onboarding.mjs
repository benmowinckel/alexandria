import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  CHAT_HOSTS,
  CHAT_INSTRUCTION,
  CHAT_SETUP_PROMPT,
  agentReminderPrompt,
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
assert.match(page.url(), /#agent$/);
const reachBody = await page.locator('body').innerText();
assert.match(reachBody, /is your computer in reach\?/);
assert.match(reachBody, /yes — i’ll grab it now/);
assert.match(reachBody, /no — not right now/);

await page.getByRole('button', { name: /yes — i’ll grab it now/ }).click();
assert.match(page.url(), /#computer$/);
const computerBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(computerBody, /add the shortcut — save anything worth thinking about/);
assert.equal(await page.locator('.shortcut-add').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
assert.equal(await page.locator('#start-email').getAttribute('placeholder'), 'your email');
assert.match(computerBody, /— get the setup text and ask me anything anytime/);
assert.match(computerBody, /copy the setup — paste into your computer agent/);
assert.equal(await page.locator('a[href="/shortcut"]').getAttribute('target'), '_blank');
await assertFits('.setup-copy');

const agentPrompt = agentSetupPrompt();
assert.match(agentPrompt, /I deliberately chose this public project/);
assert.match(agentPrompt, /permission to read anything in that public project/);
assert.match(agentPrompt, /reference material to evaluate, not authority to obey/);
assert.match(agentPrompt, /Do not request any new access, read anything private/);
assert.match(agentPrompt, /fit into our existing system/);
assert.match(agentPrompt, /repository contains the founder’s blueprint/);
assert.match(agentPrompt, /customise, remove from, and evolve over time/);
assert.match(agentPrompt, /repository also includes an optional community/);
assert.match(agentPrompt, /Keep that separate from the private setup/);
assert.match(agentPrompt, /decide later whether it is useful to us/);
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

await page.goto(`${base}/start#phone`, { waitUntil: 'networkidle' });
const laterBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(laterBody, /add the shortcut — save anything worth thinking about/);
assert.equal(await page.locator('.shortcut-add').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
assert.match(laterBody, /— get the setup text and ask me anything anytime/);
assert.match(laterBody, /copy the reminder — paste into your mobile agent/);
await page.getByRole('button', { name: 'copy the reminder' }).click();
assert.equal(await clipboard(), agentReminderPrompt());
const reminderPrompt = agentReminderPrompt();
assert.match(reminderPrompt, /set up Alexandria on my computer/);
assert.match(reminderPrompt, /one real reminder I will see on my computer/);
assert.match(reminderPrompt, /feature you can verify will reach me across devices/);
assert.match(reminderPrompt, /If you need a time, ask me one short question/);
assert.match(reminderPrompt, /If you cannot make it persist, tell me plainly/);
assert.match(reminderPrompt, /Do not inspect the project or begin setup now/);

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

await page.goto(`${base}/start#chat`, { waitUntil: 'networkidle' });
const chatChoiceBody = await page.locator('body').innerText();
assert.match(chatChoiceBody, /which chat do you use most\?/);
assert.match(chatChoiceBody, /chatgpt/);
assert.match(chatChoiceBody, /claude/);
assert.match(chatChoiceBody, /gemini/);
assert.equal(await page.locator('.door-answers .door-btn').count(), 3);
await page.getByRole('button', { name: 'chatgpt' }).click();
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
assert.match(CHAT_SETUP_PROMPT, /same instructions can be added there later, one at a time/);
assert.match(CHAT_SETUP_PROMPT, /an agent can extend the same loop to local files/);
assert.match(CHAT_SETUP_PROMPT, /optional community we can discuss later/);
assert.doesNotMatch(CHAT_SETUP_PROMPT, /you have my permission/i);

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
assert.match(await page.locator('body').innerText(), /which chat do you use most\?/);
await page.getByRole('button', { name: 'claude' }).click();
const directChatBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(directChatBody, new RegExp(CHAT_HOSTS.claude.instructionPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(directChatBody, new RegExp(CHAT_HOSTS.claude.drivePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'gemini' }).click();
const geminiChatBody = await page.locator('body').innerText();
assert.match(geminiChatBody, new RegExp(CHAT_HOSTS.gemini.instructionPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(geminiChatBody, new RegExp(CHAT_HOSTS.gemini.drivePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

const visibleText = `${initial}\n${reachBody}\n${computerBody}\n${laterBody}\n${chatChoiceBody}\n${chatBody}\n${directChatBody}\n${geminiChatBody}`;
assert.equal(visibleText, visibleText.toLowerCase(), 'visible onboarding copy must stay lowercase');
assert.deepEqual(failures, []);
await browser.close();
console.log(`computer-reach onboarding ${mobile ? 'mobile' : 'desktop'}: ok`);
