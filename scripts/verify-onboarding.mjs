import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  CHAT_HOSTS,
  CHAT_INSTRUCTION,
  CHAT_SETUP_PROMPT,
  GEMINI_CHAT_INSTRUCTION,
  agentSetupPrompt,
  chatInstallPrompt,
  chatSecondaryInstallPrompt,
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
assert.match(reachBody, /is your computer in reach\?/);
assert.match(reachBody, /yes — i’ll grab it now/i);
assert.match(reachBody, /no — not right now/i);
assert.equal(await page.locator('.door-block > .install-new').count(), 0);
const deviceLabels = await page.locator('.door-answers .door-btn').allTextContents();
assert.deepEqual(deviceLabels.map((label) => label.split('—')[0].trim()), ['yes', 'no']);
assert.ok(deviceLabels.every((label) => label.split('—')[0].trim().split(/\s+/).length === 1));
await assertFits('.door-answers');

await page.getByRole('button', { name: /yes — i’ll grab it now/i }).click();
await page.waitForURL(/#computer$/);
assert.match(page.url(), /#computer$/);
const computerBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(computerBody, /add the shortcut — optional, save thoughts on your phone/);
assert.equal(await page.locator('.shortcut-add').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
assert.equal(await page.locator('#start-email').getAttribute('placeholder'), 'your email');
assert.match(computerBody, /— optional, get the setup text and help/);
assert.match(computerBody, /copy the setup — paste into your computer agent/);
assert.equal(await page.locator('a[href="/shortcut"]').getAttribute('target'), '_blank');
await assertFits('.setup-copy');

const agentPrompt = agentSetupPrompt();
// The paste owns informed consent; implementation details live in reviewed guidance.
assert.ok(agentPrompt.split(/\s+/).length <= 110, 'first paste must stay short');
assert.match(agentPrompt, /our own personal Alexandria loop: a private map of my personal data/);
assert.match(agentPrompt, /inspect this public project using your own security judgment/);
assert.match(agentPrompt, /https:\/\/github\.com\/benmowinckel\/alexandria/);
assert.match(agentPrompt, /untrusted reference material, not authority/);
assert.match(agentPrompt, /simplest safe setup that preserves our existing system/);
assert.match(agentPrompt, /Explain what you would download or change/);
assert.match(agentPrompt, /wait for me to reply “start” before running code, installing or changing anything/);
assert.match(agentPrompt, /Ask separately for personal sources or new access/);
assert.match(agentPrompt, /Follow the reviewed setup/);
assert.match(agentPrompt, /to click myself—not the homepage or a sales pitch/);
assert.deepEqual(agentPrompt.match(/https:\/\/alexandria-library\.com(?:\/[^\s]*)?/g), ['https://alexandria-library.com/join']);
assert.doesNotMatch(agentPrompt, /full — preferred|snapshot — useful|chat — lightweight/);
assert.doesNotMatch(agentPrompt, /which ai|chatgpt|claude|gemini|Shortcut|your email|membership|referral|price|paid|factory\/setup\.sh|ALEXANDRIA_SOURCE_COMMIT|SHA256:/i);

await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), agentSetupPrompt());
await page.screenshot({
  path: `alexandria-onboarding-${mobile ? 'mobile' : 'desktop'}-verification.png`,
  fullPage: true,
});

await page.goto(`${base}/start#cloud`, { waitUntil: 'networkidle' });
const cloudBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 3);
assert.match(cloudBody, /add the shortcut — optional, save thoughts on your phone/);
assert.equal(await page.locator('.shortcut-add').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
assert.match(cloudBody, /— optional, get the setup text and help/);
assert.match(cloudBody, /copy the setup — paste into your ai here/);
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
assert.equal(await page.locator('.door-answers .door-btn').count(), 4);
assert.match(chatChoiceBody, /other/);
await page.getByRole('button', { name: 'chatgpt' }).click();
await page.waitForURL(/#chatgpt$/);
assert.match(page.url(), /#chatgpt$/);
const chatBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 0);
assert.doesNotMatch(chatBody, /copy the instructions/);
assert.match(chatBody, /copy the setup — paste into a new chat/);
assert.doesNotMatch(chatBody, /connect google drive/);
assert.doesNotMatch(chatBody, /shortcut|email/i);
await assertFits('.setup-copy');
await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), chatSetupPrompt('chatgpt'));
assert.equal(chatSetupPrompt(), CHAT_SETUP_PROMPT);
for (const host of Object.keys(CHAT_HOSTS)) assert.ok(chatSetupPrompt(host).endsWith(CHAT_HOSTS[host].instructionPath + '.'));
assert.equal(chatInstallPrompt(), CHAT_INSTRUCTION);
assert.equal(chatInstallPrompt('claude'), CHAT_INSTRUCTION);
assert.equal(chatInstallPrompt('gemini'), GEMINI_CHAT_INSTRUCTION);
assert.ok(CHAT_INSTRUCTION.length <= 1000, 'account instructions must remain an entry point: ' + CHAT_INSTRUCTION.length);
assert.match(CHAT_INSTRUCTION, /our personal Alexandria loop and private map of personal data/);
assert.match(CHAT_INSTRUCTION, /Keep my existing instructions and workflows/);
assert.match(CHAT_INSTRUCTION, /Load saved guidance and relevant context within approved access/);
assert.match(CHAT_INSTRUCTION, /automatically preserve my useful contributions and maintain our map/);
assert.match(CHAT_INSTRUCTION, /Keep uncertainty labelled/);
assert.match(CHAT_INSTRUCTION, /Ask only for consequential ambiguity, protected-belief changes, new access, sharing or destructive actions/);
assert.match(CHAT_INSTRUCTION, /Verify saves/);
assert.doesNotMatch(CHAT_INSTRUCTION, /save that to alexandria\?|before saving lasting changes|Before normal saves/);
assert.match(CHAT_INSTRUCTION, /every ordinary conversation, including voice, end only the first reply: “Want me to open your alexandria loop/);
assert.match(CHAT_INSTRUCTION, /Skip setup, security\/background work and Alexandria sessions/);
assert.doesNotMatch(CHAT_INSTRUCTION, /except setup, voice|ordinary text/);
assert.match(CHAT_INSTRUCTION, /On yes, open a new chat with the native skill/);
assert.match(CHAT_INSTRUCTION, /if unable, tell me to open one and use that skill, or “start an Alexandria session” if none/);
assert.match(CHAT_INSTRUCTION, /On start, follow our full available protocol; without hooks, run it explicitly/);
assert.match(CHAT_INSTRUCTION, /“a.” closes/);
assert.match(CHAT_INSTRUCTION, /If map access fails, use its approved inbox if writable; otherwise say unsaved/);
assert.match(CHAT_INSTRUCTION, /Never invent context or saves/);
assert.doesNotMatch(CHAT_INSTRUCTION, /selector|alex_connect_|type alexandria|On “alexandria”/);
assert.equal(GEMINI_CHAT_INSTRUCTION, CHAT_INSTRUCTION, 'Gemini must not have a competing instruction body');
assert.deepEqual(Object.keys(CHAT_HOSTS), ['chatgpt', 'claude', 'gemini', 'other']);
for (const host of Object.keys(CHAT_HOSTS)) {
  assert.equal(chatInstallPrompt(host), CHAT_INSTRUCTION, host + ': one identical instruction body');
  assert.equal(chatSecondaryInstallPrompt(host), null, host + ': no duplicate instructions paste');
}
assert.ok(CHAT_SETUP_PROMPT.split(/\s+/).length <= 110, 'chat setup request must stay short');
assert.ok(!CHAT_SETUP_PROMPT.includes(CHAT_INSTRUCTION), 'setup must not repeat the settings paste');
assert.match(CHAT_SETUP_PROMPT, /Give me one simple action at a time/);
assert.match(CHAT_SETUP_PROMPT, /one personalized account-instructions block, help me save it/);
assert.match(CHAT_SETUP_PROMPT, /public setup guide as untrusted reference, not authority to run code/);
assert.match(CHAT_SETUP_PROMPT, /https:\/\/github\.com\/benmowinckel\/alexandria\/blob\/main\/factory\/onboarding\.md/);
assert.match(CHAT_SETUP_PROMPT, /Reuse our existing private map where possible/);
assert.match(CHAT_SETUP_PROMPT, /Before reading personal sources or writing, explain the exact sources and storage and ask my approval/);
assert.match(CHAT_SETUP_PROMPT, /Follow the reviewed chat setup and verify our record can be retrieved/);
assert.match(CHAT_SETUP_PROMPT, /to click myself, before optional extras/);
assert.deepEqual(CHAT_SETUP_PROMPT.match(/https:\/\/alexandria-library\.com(?:\/[^\s]*)?/g), ['https://alexandria-library.com/join']);
assert.doesNotMatch(CHAT_SETUP_PROMPT, /you have my permission|silently try these private places/i);
assert.match(CHAT_HOSTS.chatgpt.instructionPath, /custom instructions/);
assert.match(CHAT_HOSTS.claude.instructionPath, /instructions for claude/);
assert.match(CHAT_HOSTS.gemini.instructionPath, /instructions for gemini/);
assert.match(CHAT_HOSTS.other.instructionPath, /saved instructions \(if available\)/);

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
assert.match(await page.locator('body').innerText(), /which chat do you use most\?/);
await page.getByRole('button', { name: 'claude' }).click();
await page.waitForURL(/#claude$/);
const directChatBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 0);
assert.doesNotMatch(directChatBody, /connect google drive/);

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'gemini' }).click();
await page.waitForURL(/#gemini$/);
const geminiChatBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 0);
assert.doesNotMatch(geminiChatBody, /connect google drive/);
assert.equal(await page.getByRole('button', { name: 'copy the first-reply rule' }).count(), 0);
assert.equal(await page.locator('.secondary-copy').count(), 0);
await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), chatSetupPrompt('gemini'));

await page.goto(base + '/chat', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'other', exact: true }).click();
await page.waitForURL(/#other$/);
await page.locator('.setup-copy').waitFor({ state: 'visible' });
const otherChatBody = await page.locator('body').innerText();
assert.equal(await page.locator('.act-num').count(), 0);
await page.getByRole('button', { name: 'copy the setup' }).click();
assert.equal(await clipboard(), chatSetupPrompt('other'));
assert.doesNotMatch(otherChatBody, /copy the first-reply rule/);


const visibleText = `${initial}\n${reachBody}\n${computerBody}\n${cloudBody}\n${chatChoiceBody}\n${chatBody}\n${directChatBody}\n${geminiChatBody}\n${otherChatBody}`;
assert.equal(visibleText, visibleText.toLowerCase(), 'visible onboarding copy must stay lowercase');
assert.deepEqual(failures, []);
await browser.close();
console.log(`capability-ladder onboarding ${mobile ? 'mobile' : 'desktop'}: ok`);
