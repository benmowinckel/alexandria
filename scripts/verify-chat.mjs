import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { computerInstallPrompt, mobileHandoffPrompt } from '../shared/onboarding-prompts.ts';

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
const button = page.getByRole('button', { name: 'copy the setup' });
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
    element.textContent?.includes('copied — paste into your chat'),
  ),
);
const chatCopiedWithoutEmail = (await button.innerText()).includes('copied — paste into your chat');
await page.getByLabel('your email').fill('reader@example.com');
await page.getByLabel('save email').click();
await page.getByText('email saved', { exact: false }).waitFor();
await button.click();
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll('button')).some((element) =>
    element.textContent?.includes('copied — paste into your chat'),
  ),
);
const clickedText = await button.innerText();
const clipboard = await page.evaluate(() => navigator.clipboard.readText());

const source = fs.readFileSync(path.join(process.cwd(), 'factory/chat/bootstrap.md'), 'utf8');
const match = source.match(/---PROMPT START---\n([\s\S]*?)\n---PROMPT END---/);
const expected = match ? match[1].trim() : '';
const screenshot = mobile
  ? '/private/tmp/alexandria-chat-mobile-verification.png'
  : '/private/tmp/alexandria-chat-verification.png';
await page.screenshot({ path: screenshot, fullPage: true });

await page.goto(`${base}/start`, { waitUntil: 'networkidle' });
const startBody = (await page.locator('body').innerText()).trim();
const chatDoor = page.getByRole('link', { name: /^chat/i });
const startHasUniversalChatDoor =
  (await chatDoor.count()) === 1 &&
  (await chatDoor.getAttribute('href')) === '/chat' &&
  (await chatDoor.innerText()).toLowerCase().includes('claude, chatgpt, gemini');
await page.getByRole('button', { name: /^agents/i }).click();
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
await page.getByRole('button', { name: /^agents/i }).click();
await page.getByRole('button', { name: /^no/i }).click();
const phoneBody = (await page.locator('body').innerText()).trim();
const phoneButton = page.getByRole('button', { name: 'copy for your phone' });
await phoneButton.click();
const phoneClipboard = await page.evaluate(() => navigator.clipboard.readText());
const result = {
  url: chatUrl,
  mobile,
  title: chatTitle,
  bodyHasContent: body.length > 100,
  hasShortcutStep: body.includes('add the shortcut') && body.includes('capture thoughts wherever you are'),
  hasEmailStep: html.includes('act-email') && html.includes('your email') && body.includes('we’ll send your setup, then occasional useful notes'),
  hasCopyStep: body.includes('copy the setup') && body.includes('paste into your chat'),
  chatCopiedWithoutEmail,
  buttonCopiedState: clickedText.includes('copied'),
  clipboardExact: clipboard === expected,
  clipboardHasAdditiveGuard: clipboard.includes('Preserve existing instructions, memories, and connections'),
  clipboardHasReviewGate: clipboard.includes('ordinary text to account preferences'),
  clipboardHasTwoActions: clipboard.includes('two short actions'),
  clipboardHasStoragePlan: clipboard.includes("use connected Drive if writable; otherwise use this app's memory") && clipboard.includes('never mention setup'),
  emailFieldMatchesStart: JSON.stringify(chatEmailShape) === JSON.stringify(startEmailShape),
  computerCopiedWithoutEmail: computerClipboard === computerInstallPrompt(),
  phoneRouteVisible: phoneBody.includes('copy for your phone') && phoneBody.includes('paste into the AI on your phone'),
  phoneCopiedWithoutEmail: phoneClipboard === mobileHandoffPrompt(),
  phoneHasExactFallback: phoneClipboard.includes('At your computer, open alexandria-library.com/start and choose agents.'),
  phoneRefusesChatSubstitute: phoneClipboard.includes('do not replace it with a chat-only version'),
  startCopyIsLowercase:
    startBody.includes('start your loop') &&
    startBody.includes('what do you use?') &&
    startBody.includes('agents — eg claude code, codex, cowork') &&
    startBody.includes('chat — eg claude, chatgpt, gemini'),
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
  !result.chatCopiedWithoutEmail ||
  !result.buttonCopiedState ||
  !result.clipboardExact ||
  !result.clipboardHasAdditiveGuard ||
  !result.clipboardHasReviewGate ||
  !result.clipboardHasTwoActions ||
  !result.clipboardHasStoragePlan ||
  !result.emailFieldMatchesStart ||
  !result.computerCopiedWithoutEmail ||
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
