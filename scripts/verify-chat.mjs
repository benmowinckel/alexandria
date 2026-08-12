import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { chatInstallPrompt, computerInstallPrompt, mobileHandoffPrompt } from '../shared/onboarding-prompts.ts';

const base = process.argv[2] || 'http://localhost:3000';
const mobile = process.argv[3] === 'mobile';
const origin = new URL(base).origin;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
  isMobile: mobile,
  hasTouch: mobile,
});
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.route('**/onboard', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, delivered: true }),
  });
});

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
const chatUrl = page.url();
const chatTitle = await page.title();
const body = (await page.locator('body').innerText()).trim();
const html = await page.content();
const button = page.getByRole('button', { name: 'copy your instruction' });
const email = page.locator('.act-email');
const chatEmailShape = await email.evaluate((element) => {
  const style = getComputedStyle(element);
  return {
    children: Array.from(element.children).map((child) => [child.tagName, child.className]),
    display: style.display,
    padding: style.padding,
    border: style.border,
    borderRadius: style.borderRadius,
    minHeight: style.minHeight,
  };
});
const overlay = await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count();
await button.click();
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll('button')).some((element) =>
    element.textContent?.includes('copied — paste into settings, then type a'),
  ),
);
const chatCopiedWithoutEmail = (await button.innerText()).includes('copied — paste into settings, then type a');
await page.getByLabel('your email').fill('reader@example.com');
await page.getByLabel('save email').click();
await page.getByText('email saved', { exact: false }).waitFor();
await button.click();
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll('button')).some((element) =>
    element.textContent?.includes('copied — paste into settings, then type a'),
  ),
);
const clickedText = await button.innerText();
const clipboard = await page.evaluate(() => navigator.clipboard.readText());

const source = fs.readFileSync(path.join(process.cwd(), 'factory/chat/bootstrap.md'), 'utf8');
const match = source.match(/---PROMPT START---\n([\s\S]*?)\n---PROMPT END---/);
const factoryBootstrap = match ? match[1].trim() : '';
const expected = chatInstallPrompt();
const screenshot = mobile
  ? '/private/tmp/alexandria-chat-mobile-verification.png'
  : '/private/tmp/alexandria-chat-verification.png';
await page.screenshot({ path: screenshot, fullPage: true });

await page.goto(`${base}/start`, { waitUntil: 'networkidle' });
const startBody = (await page.locator('body').innerText()).trim();
const chatDoor = page.getByRole('link', { name: /just chat/i });
const startHasUniversalChatDoor =
  (await chatDoor.count()) === 1 &&
  (await chatDoor.getAttribute('href')) === '/chat' &&
  (await chatDoor.innerText()).toLowerCase().includes('claude, chatgpt, gemini');
await page.getByRole('button', { name: /^an agent/i }).click();
await page.getByRole('button', { name: /^yes/i }).click();
await page.waitForSelector('.act-email');
const startEmailShape = await page.locator('.act-email').evaluate((element) => {
  const style = getComputedStyle(element);
  return {
    children: Array.from(element.children).map((child) => [child.tagName, child.className]),
    display: style.display,
    padding: style.padding,
    border: style.border,
    borderRadius: style.borderRadius,
    minHeight: style.minHeight,
  };
});
const computerButton = page.getByRole('button', { name: 'copy the setup' });
await computerButton.click();
const computerClipboard = await page.evaluate(() => navigator.clipboard.readText());

await page.goto(`${base}/start`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^an agent/i }).click();
await page.getByRole('button', { name: /^no/i }).click();
const phoneBody = (await page.locator('body').innerText()).trim();
const phoneButton = page.getByRole('button', { name: 'copy for your phone' });
await phoneButton.click();
const phoneClipboard = await page.evaluate(() => navigator.clipboard.readText());
const jailbreakPhrases = [
  'this is setup',
  'not instructions for this reply',
  'ordinary text to account preferences',
  'give exactly two short actions',
  'put only the preference',
  'ignore previous',
  'bypass a safeguard',
  'system prompt',
];
const result = {
  url: chatUrl,
  mobile,
  title: chatTitle,
  bodyHasContent: body.length > 100,
  hasShortcutStep: body.includes('add the shortcut') && body.includes('capture thoughts wherever you are'),
  hasEmailStep: html.includes('act-email') && html.includes('your email') && body.includes('we’ll send your setup, then occasional useful notes'),
  hasCopyStep: body.includes('copy your instruction') && body.includes('paste into settings, then type a'),
  hasSettingsPaths:
    body.includes('chatgpt — Profile → Personalization → Custom instructions') &&
    body.includes('gemini — Settings → Personal context → Your instructions for Gemini') &&
    body.includes('claude — Settings → General → Instructions for Claude'),
  hasChatFallback: body.includes("if you don't see those, paste into a chat — it works in that conversation"),
  chatCopiedWithoutEmail,
  buttonCopiedState: clickedText.includes('copied'),
  clipboardExact: clipboard === expected,
  clipboardMatchesShared: clipboard === chatInstallPrompt(),
  factoryBootstrapMatchesShared: factoryBootstrap === expected,
  clipboardIsFirstPerson: clipboard.startsWith('Alexandria is my private thinking habit.'),
  clipboardHasAdditiveGuard: clipboard.includes('Keep every instruction, memory, and connection I already have'),
  clipboardHasNoJailbreak: jailbreakPhrases.every((phrase) => !clipboard.toLowerCase().includes(phrase)),
  clipboardHasStoragePlan: clipboard.includes('save to connected Drive if you can write there; otherwise this app\'s memory'),
  emailFieldMatchesStart: JSON.stringify(chatEmailShape) === JSON.stringify(startEmailShape),
  computerCopiedWithoutEmail: computerClipboard === computerInstallPrompt(),
  computerAsksForInspection: computerClipboard.includes('decide for yourself whether it is safe') && computerClipboard.includes('wait for me to say `start`'),
  phoneRouteVisible: phoneBody.includes('copy for your phone') && phoneBody.includes('paste into the AI on your phone'),
  phoneCopiedWithoutEmail: phoneClipboard === mobileHandoffPrompt(),
  phoneHasExactFallback: phoneClipboard.includes('At your computer, open alexandria-library.com/start and choose agents.'),
  phoneRefusesChatSubstitute: phoneClipboard.includes('do not replace it with a chat-only version'),
  startCopyIsLowercase:
    startBody.includes('start your loop') &&
    startBody.includes('what do you have access to?') &&
    startBody.includes('an agent — eg codex, cursor, cowork') &&
    startBody.includes('just chat — eg claude, chatgpt, gemini'),
  startHasUniversalChatDoor,
  errorOverlay: overlay > 0,
  consoleErrors,
  pageErrors,
  screenshot,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();

if (
  !result.bodyHasContent ||
  !result.hasShortcutStep ||
  !result.hasEmailStep ||
  !result.hasCopyStep ||
  !result.hasSettingsPaths ||
  !result.hasChatFallback ||
  !result.chatCopiedWithoutEmail ||
  !result.buttonCopiedState ||
  !result.clipboardExact ||
  !result.clipboardMatchesShared ||
  !result.clipboardIsFirstPerson ||
  !result.clipboardHasAdditiveGuard ||
  !result.clipboardHasNoJailbreak ||
  !result.clipboardHasStoragePlan ||
  !result.emailFieldMatchesStart ||
  !result.computerCopiedWithoutEmail ||
  !result.computerAsksForInspection ||
  !result.phoneRouteVisible ||
  !result.phoneCopiedWithoutEmail ||
  !result.phoneHasExactFallback ||
  !result.phoneRefusesChatSubstitute ||
  !result.startCopyIsLowercase ||
  !result.startHasUniversalChatDoor ||
  result.errorOverlay ||
  result.consoleErrors.length ||
  result.pageErrors.length
) {
  process.exitCode = 1;
}
