import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

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
    element.textContent?.includes('copied — paste it into claude, chatgpt, or gemini'),
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
const chatDoor = page.getByRole('link', { name: /^just a chat/i });
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
const result = {
  url: chatUrl,
  mobile,
  title: chatTitle,
  bodyHasContent: body.length > 100,
  hasEmailStep: html.includes('act-email') && html.includes('your email'),
  hasCopyStep: body.includes('copy this setup — paste it into claude, chatgpt, or gemini'),
  hasTypeAStep: body.includes('type a — start your first thinking session'),
  buttonCopiedState: clickedText.includes('copied'),
  clipboardExact: clipboard === expected,
  clipboardHasAdditiveGuard: clipboard.includes('Preserve existing instructions, memories, and connections'),
  clipboardHasReviewGate: clipboard.includes('ordinary text to account preferences'),
  clipboardHasTwoActions: clipboard.includes('two short actions'),
  clipboardHasStoragePlan: clipboard.includes("use connected Drive if writable; otherwise use this app's memory") && clipboard.includes('never mention setup'),
  emailFieldMatchesStart: JSON.stringify(chatEmailShape) === JSON.stringify(startEmailShape),
  startCopyIsLowercase:
    startBody.includes('start your loop') &&
    startBody.includes('what do you have access to?') &&
    startBody.includes('an agent — claude code, codex, cursor') &&
    startBody.includes('just a chat — claude, chatgpt, gemini') &&
    !startBody.includes('If you have both'),
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
  !result.hasEmailStep ||
  !result.hasCopyStep ||
  !result.hasTypeAStep ||
  !result.buttonCopiedState ||
  !result.clipboardExact ||
  !result.clipboardHasAdditiveGuard ||
  !result.clipboardHasReviewGate ||
  !result.clipboardHasTwoActions ||
  !result.clipboardHasStoragePlan ||
  !result.emailFieldMatchesStart ||
  !result.startCopyIsLowercase ||
  !result.startHasUniversalChatDoor ||
  result.errorOverlay ||
  result.consoleErrors.length ||
  result.pageErrors.length
) {
  process.exitCode = 1;
}
