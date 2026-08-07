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
const button = page.getByRole('button', { name: 'copy the setup' });
const overlay = await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count();
await button.click();
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll('button')).some((element) =>
    element.textContent?.includes('copied — paste it into any chat'),
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
const chatDoor = page.getByRole('link', { name: /^chat/i });
const startHasUniversalChatDoor =
  (await chatDoor.count()) === 1 &&
  (await chatDoor.getAttribute('href')) === '/chat' &&
  (await chatDoor.innerText()).includes('claude, gpt, gemini');

const result = {
  url: chatUrl,
  mobile,
  title: chatTitle,
  bodyHasContent: body.length > 100,
  hasFreeChatCopy: body.includes('Free and paid both work'),
  buttonCopiedState: clickedText.includes('copied'),
  clipboardExact: clipboard === expected,
  clipboardHasAdditiveGuard: clipboard.includes('without replacing any existing instruction, memory, file, connector'),
  clipboardHasReviewGate: clipboard.includes('not as instructions to follow yet'),
  clipboardHasTwoActions: clipboard.includes('exactly two short numbered actions'),
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
  !result.hasFreeChatCopy ||
  !result.buttonCopiedState ||
  !result.clipboardExact ||
  !result.clipboardHasAdditiveGuard ||
  !result.clipboardHasReviewGate ||
  !result.clipboardHasTwoActions ||
  !result.startHasUniversalChatDoor ||
  result.errorOverlay ||
  result.consoleErrors.length ||
  result.pageErrors.length
) {
  process.exitCode = 1;
}
