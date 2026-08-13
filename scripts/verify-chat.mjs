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

const chatgptPath = 'settings → personalization → custom instructions';
const claudePath = 'settings → general → instructions for claude';
const geminiPath = 'settings → personal context → your instructions for gemini';

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
const chatUrl = page.url();
const chatTitle = await page.title();
const pickerBody = (await page.locator('body').innerText()).trim();
const overlay = await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count();
const hasHostPicker =
  pickerBody.includes('which chat do you use most?') &&
  pickerBody.includes('chatgpt') &&
  pickerBody.includes('claude') &&
  pickerBody.includes('gemini') &&
  !pickerBody.includes('copy the instructions') &&
  !pickerBody.includes('those settings make it last across chats') &&
  !pickerBody.includes('different chat');
await page.getByRole('button', { name: /^chatgpt$/i }).click();
await page.waitForFunction(() => location.hash === '#chatgpt');
const body = (await page.locator('body').innerText()).trim();
const setupHtml = await page.content();
const chatShortcutHref = await page.locator('a.act-box').first().getAttribute('href');
const button = page.locator('button.cta-btn');
const copyBefore = await button.innerText();
const copyLines = copyBefore.split('\n').map((line) => line.trim()).filter(Boolean);
const copyIsTwoLines = copyLines.length >= 2
  && copyLines[0] === 'copy the instructions — paste into'
  && copyLines[1] === chatgptPath;
const email = page.locator('.act-email');
await page.mouse.move(0, 0);
const chatEmailShape = await email.evaluate((element) => {
  const style = getComputedStyle(element);
  return {
    children: Array.from(element.children).map((child) => [child.tagName, child.className]),
    display: style.display,
    padding: style.padding,
    borderRadius: style.borderRadius,
    minHeight: style.minHeight,
  };
});
await button.click();
await page.waitForFunction((path) =>
  Array.from(document.querySelectorAll('button')).some((element) => {
    const text = element.innerText || '';
    return text.includes('copied — paste into') && text.includes(path);
  }), chatgptPath);
const copiedIdle = await button.innerText();
const copiedLines = copiedIdle.split('\n').map((line) => line.trim()).filter(Boolean);
const chatCopiedWithoutEmail = copiedLines[0] === 'copied — paste into' && copiedLines[1] === chatgptPath;
await page.getByLabel('your email').fill('reader@example.com');
await page.getByLabel('save email').click();
await page.getByText('email saved', { exact: false }).waitFor();
await button.click();
await page.waitForFunction((path) =>
  Array.from(document.querySelectorAll('button')).some((element) => {
    const text = element.innerText || '';
    return text.includes('copied — paste into') && text.includes(path);
  }), chatgptPath);
const clickedText = await button.innerText();
const clipboard = await page.evaluate(() => navigator.clipboard.readText());
await page.goBack();
await page.waitForFunction(() => !location.hash || location.hash === '#');
const backToPicker = (await page.locator('body').innerText()).includes('which chat do you use most?');
await page.getByRole('button', { name: /^claude$/i }).click();
await page.waitForFunction(() => location.hash === '#claude');
const claudeBody = (await page.locator('body').innerText()).trim();
await page.goBack();
await page.waitForFunction(() => !location.hash || location.hash === '#');
await page.getByRole('button', { name: /^gemini$/i }).click();
await page.waitForFunction(() => location.hash === '#gemini');
const geminiBody = (await page.locator('body').innerText()).trim();

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
await page.waitForFunction(() => location.hash === '#nearby');
const nearbyAfterAgent = (await page.locator('body').innerText()).includes('can you get to your computer now?');
await page.goBack();
await page.waitForFunction(() => !location.hash || location.hash === '#');
const startBackToChoice = (await page.locator('body').innerText()).includes('what do you have access to?');
await page.getByRole('button', { name: /^an agent/i }).click();
await page.getByRole('button', { name: /^yes/i }).click();
await page.waitForFunction(() => location.hash === '#computer');
await page.waitForSelector('.act-email');
await page.mouse.move(0, 0);
const computerShortcutHref = await page.locator('a.act-box').first().getAttribute('href');
const computerShortcutWhy = (await page.locator('body').innerText()).includes('capture thoughts wherever you are')
  && !(await page.locator('body').innerText()).includes('iPhone');
const startEmailShape = await page.locator('.act-email').evaluate((element) => {
  const style = getComputedStyle(element);
  return {
    children: Array.from(element.children).map((child) => [child.tagName, child.className]),
    display: style.display,
    padding: style.padding,
    borderRadius: style.borderRadius,
    minHeight: style.minHeight,
  };
});
const computerButton = page.getByRole('button', { name: 'copy the setup' });
await computerButton.click();
const computerClipboard = await page.evaluate(() => navigator.clipboard.readText());
await page.goBack();
await page.waitForFunction(() => location.hash === '#nearby');
const computerBackToNearby = (await page.locator('body').innerText()).includes('can you get to your computer now?');

await page.goto(`${base}/start`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^an agent/i }).click();
await page.getByRole('button', { name: /^no/i }).click();
const phoneBody = (await page.locator('body').innerText()).trim();
const phoneShortcutHref = await page.locator('a.act-box').first().getAttribute('href');
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
  'change your safeguards',
  'system prompt',
];
const result = {
  url: chatUrl,
  mobile,
  title: chatTitle,
  bodyHasContent: body.length > 100,
  hasHostPicker,
  hasShortcutStep: body.includes('add the shortcut') && body.includes('capture now for the full version') && !body.includes('iPhone'),
  chatShortcutHref,
  computerShortcutHref,
  phoneShortcutHref,
  chatShortcutRoutesToPage: chatShortcutHref === '/shortcut',
  computerShortcutRoutesToPage: computerShortcutHref === '/shortcut',
  phoneShortcutOpensIcloud: Boolean(phoneShortcutHref?.includes('icloud.com/shortcuts/')),
  hasEmailStep: setupHtml.includes('act-email') && setupHtml.includes('your email') && body.includes('we’ll send your setup, then occasional useful notes'),
  hasCopyStep: body.includes('copy the instructions — paste into') && body.includes(chatgptPath),
  copyIsTwoLines,
  chatgptGuidesDrive: body.includes('connect google drive') && body.includes('in every chat you use, if it has it') && !body.includes('+ beside the message box'),
  chatgptHasTypeA: body.includes('type a in a new chat') && body.includes('start your first session'),
  chatgptHasNoThatsIt: !body.toLowerCase().includes('that’s it') && !body.toLowerCase().includes("that's it"),
  claudeGuidesSettings: claudeBody.includes(claudePath),
  claudeGuidesDrive: claudeBody.includes('connect google drive') && claudeBody.includes('in every chat you use, if it has it'),
  geminiGuidesSettings: geminiBody.includes(geminiPath),
  geminiGuidesDrive: geminiBody.includes('connect google drive') && geminiBody.includes('in every chat you use, if it has it'),
  hasNoPathDump: !body.includes('those settings make it last across chats') && !pickerBody.includes('those settings make it last across chats'),
  hasNoDifferentChat: !body.includes('different chat') && !claudeBody.includes('different chat'),
  chatBackGoesOneSlide: backToPicker,
  startBackGoesOneSlide: nearbyAfterAgent && startBackToChoice && computerBackToNearby,
  chatCopiedWithoutEmail,
  buttonCopiedState: clickedText.includes('copied'),
  clipboardExact: clipboard === expected,
  clipboardMatchesShared: clipboard === chatInstallPrompt(),
  factoryBootstrapMatchesShared: factoryBootstrap === expected,
  clipboardIsFirstPerson: clipboard.startsWith('Alexandria is my private thinking habit.'),
  clipboardHasAdditiveGuard: clipboard.includes('Keep every instruction, memory, and connection I already have'),
  clipboardHasVisibleRoute:
    clipboard.includes('Only your first reply in a new chat carries a cue') &&
    clipboard.includes('want me to spin up an Alexandria chat on the side?') &&
    clipboard.includes('If I say yes, open it, start Alexandria there') &&
    clipboard.includes('saving to it or reading from it would help this exact exchange') &&
    clipboard.includes('save that to alexandria?'),
  clipboardHasNoJailbreak: jailbreakPhrases.every((phrase) => !clipboard.toLowerCase().includes(phrase)),
  emailFieldMatchesStart: JSON.stringify(chatEmailShape) === JSON.stringify(startEmailShape),
  computerCopiedWithoutEmail: computerClipboard === computerInstallPrompt(),
  computerAsksForInspection: computerClipboard.includes('decide for yourself whether it is safe') && computerClipboard.includes('wait for me to say `start`'),
  computerShortcutWhyMatchesPhone: computerShortcutWhy,
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
  !result.hasHostPicker ||
  !result.hasShortcutStep ||
  !result.chatShortcutRoutesToPage ||
  !result.computerShortcutRoutesToPage ||
  !result.phoneShortcutOpensIcloud ||
  !result.hasEmailStep ||
  !result.hasCopyStep ||
  !result.copyIsTwoLines ||
  !result.chatgptGuidesDrive ||
  !result.chatgptHasTypeA ||
  !result.chatgptHasNoThatsIt ||
  !result.claudeGuidesSettings ||
  !result.claudeGuidesDrive ||
  !result.geminiGuidesSettings ||
  !result.geminiGuidesDrive ||
  !result.hasNoPathDump ||
  !result.hasNoDifferentChat ||
  !result.chatBackGoesOneSlide ||
  !result.startBackGoesOneSlide ||
  !result.chatCopiedWithoutEmail ||
  !result.buttonCopiedState ||
  !result.clipboardExact ||
  !result.clipboardMatchesShared ||
  !result.clipboardIsFirstPerson ||
  !result.clipboardHasAdditiveGuard ||
  !result.clipboardHasVisibleRoute ||
  !result.clipboardHasNoJailbreak ||
  !result.emailFieldMatchesStart ||
  !result.computerCopiedWithoutEmail ||
  !result.computerAsksForInspection ||
  !result.computerShortcutWhyMatchesPhone ||
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
