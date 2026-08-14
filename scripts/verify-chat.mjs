import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  CHAT_HOSTS,
  CHAT_INSTRUCTION,
  CHAT_SETUP_PROMPT,
  chatInstallPrompt,
  chatSetupPrompt,
  computerInstallPrompt,
  mobileHandoffPrompt,
} from '../shared/onboarding-prompts.ts';

const base = process.argv[2] || 'http://localhost:3000';
const mobile = process.argv[3] === 'mobile';
const requestedWidth = Number.parseInt(process.argv[4] || '', 10);
const mobileWidth = Number.isFinite(requestedWidth) ? requestedWidth : 390;
const origin = new URL(base).origin;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: mobile ? { width: mobileWidth, height: 844 } : { width: 1280, height: 900 },
  isMobile: mobile,
  hasTouch: mobile,
  ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' } : {}),
});
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
// Vercel's analytics scripts exist only on Vercel. Stub that external shell in
// local/CI verification so missing analytics never masks a product regression.
await page.route('**/_vercel/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
await page.route('**/onboard', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, delivered: true }),
  });
});

const chatgptPath = CHAT_HOSTS.chatgpt.pastePath;
const claudePath = CHAT_HOSTS.claude.pastePath;
const geminiPath = CHAT_HOSTS.gemini.pastePath;
const phoneChatgptPath = CHAT_HOSTS.chatgpt.phonePastePath;

await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
const chatUrl = page.url();
const chatTitle = await page.title();
const pickerBody = (await page.locator('body').innerText()).trim();
const overlay = await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count();
const hasHostPicker =
  pickerBody.includes('which ai do you use most?') &&
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
const chatStepNumbers = (await page.locator('.act-num').allInnerTexts()).map((value) => value.trim());
const stylesheetIndex = setupHtml.indexOf('rel="stylesheet"');
const primerMarkupIndex = setupHtml.indexOf('class="primer-page"');
const stylesLoadBeforeMarkup = stylesheetIndex >= 0 && stylesheetIndex < primerMarkupIndex;
const instructionButton = page.getByRole('button', { name: 'copy the alexandria instructions' });
const setupButton = page.getByRole('button', { name: 'copy the setup' });
const chatShortcut = page.getByRole('link', { name: /^add the shortcut/i });
const chatShortcutHref = await chatShortcut.getAttribute('href');
const copyBefore = await instructionButton.innerText();
const copyLines = copyBefore.split('\n').map((line) => line.trim()).filter(Boolean);
const copyIsTwoLines = copyLines.length >= 2
  && copyLines[0] === 'copy the alexandria instructions'
  && copyLines[1] === `paste in ${chatgptPath}`;
const setupBefore = await setupButton.innerText();
const setupIsOneLine = setupBefore.replace(/\s+/g, ' ').trim() === 'copy the setup — paste in a normal chat';
const setupLayout = await setupButton.evaluate((element) => {
  const tops = new Set();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
    node = walker.nextNode();
  }
  return {
    lineCount: tops.size,
    fits: element.scrollWidth <= element.clientWidth,
    whiteSpace: getComputedStyle(element).whiteSpace,
  };
});
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
await instructionButton.click();
await page.waitForFunction((path) =>
  Array.from(document.querySelectorAll('button')).some((element) => {
    const text = element.innerText || '';
    return text.includes('copied') && text.includes(`paste in ${path}`);
  }), chatgptPath);
const copiedIdle = await instructionButton.innerText();
const copiedLines = copiedIdle.split('\n').map((line) => line.trim()).filter(Boolean);
const chatCopiedWithoutEmail = copiedLines[0] === 'copied' && copiedLines[1] === `paste in ${chatgptPath}`;
await page.getByLabel('your email').fill('reader@example.com');
await page.getByLabel('save email').click();
await page.getByText('email saved', { exact: false }).waitFor();
await instructionButton.click();
await page.waitForFunction((path) =>
  Array.from(document.querySelectorAll('button')).some((element) => {
    const text = element.innerText || '';
    return text.includes('copied') && text.includes(`paste in ${path}`);
  }), chatgptPath);
const clickedText = await instructionButton.innerText();
const clipboard = await page.evaluate(() => navigator.clipboard.readText());
await setupButton.click();
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll('button')).some((element) => {
    const text = element.innerText || '';
    return text.includes('copied') && text.includes('paste in a normal chat');
  }));
const setupClickedText = await setupButton.innerText();
const setupClipboard = await page.evaluate(() => navigator.clipboard.readText());
await page.goBack();
await page.waitForFunction(() => !location.hash || location.hash === '#');
const backToPicker = (await page.locator('body').innerText()).includes('which ai do you use most?');
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
const expectedSetup = chatSetupPrompt();
const screenshot = mobile
  ? path.join(os.tmpdir(), 'alexandria-chat-mobile-verification.png')
  : path.join(os.tmpdir(), 'alexandria-chat-verification.png');
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
const phonePickerBody = (await page.locator('body').innerText()).trim();
const phoneHasHostPicker =
  phonePickerBody.includes('which ai do you use most?') &&
  phonePickerBody.includes('chatgpt') &&
  phonePickerBody.includes('claude') &&
  phonePickerBody.includes('gemini');
await page.getByRole('button', { name: /^chatgpt$/i }).click();
await page.waitForFunction(() => location.hash === '#phone-chatgpt');
const phoneBody = (await page.locator('body').innerText()).trim();
const phoneShortcutHref = await page.locator('a.act-box').first().getAttribute('href');
const phoneScreenshot = mobile
  ? path.join(os.tmpdir(), 'alexandria-start-phone-mobile-verification.png')
  : path.join(os.tmpdir(), 'alexandria-start-phone-verification.png');
await page.screenshot({ path: phoneScreenshot, fullPage: true });
const phoneInstructionButton = page.getByRole('button', { name: 'copy the alexandria instructions' });
await phoneInstructionButton.click();
const phoneInstructionClipboard = await page.evaluate(() => navigator.clipboard.readText());
const phoneButton = page.getByRole('button', { name: 'copy the setup' });
await phoneButton.click();
const phoneClipboard = await page.evaluate(() => navigator.clipboard.readText());
await page.goBack();
await page.waitForFunction(() => location.hash === '#phone');
const phoneBackToPicker = (await page.locator('body').innerText()).includes('which ai do you use most?');
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
  viewportWidth: mobile ? mobileWidth : 1280,
  title: chatTitle,
  bodyHasContent: body.length > 100,
  hasHostPicker,
  hasExactlyFourChatSteps: JSON.stringify(chatStepNumbers) === JSON.stringify(['1', '2', '3', '4']),
  hasChatShortcutStep: body.includes('add the shortcut') && body.includes('capture thoughts wherever you are'),
  chatShortcutMatchesDevice: mobile
    ? Boolean(chatShortcutHref?.includes('icloud.com/shortcuts/'))
    : chatShortcutHref === '/shortcut',
  computerShortcutHref,
  phoneShortcutHref,
  computerShortcutRoutesToPage: computerShortcutHref === '/shortcut',
  phoneShortcutOpensIcloud: Boolean(phoneShortcutHref?.includes('icloud.com/shortcuts/')),
  hasEmailStep: setupHtml.includes('act-email') && setupHtml.includes('your email') && body.includes('we’ll send your setup, then occasional useful notes'),
  hasCopyStep: body.includes('copy the alexandria instructions') && body.includes(`paste in ${chatgptPath}`),
  hasSetupStep: body.includes('copy the setup') && body.includes('paste in a normal chat'),
  copyIsTwoLines,
  setupIsOneLine: setupIsOneLine && setupLayout.lineCount === 1 && setupLayout.fits && setupLayout.whiteSpace === 'nowrap',
  setupLayout,
  pageLeavesRestToAi: !body.toLowerCase().includes('connect google drive') && !body.includes('type “a” in a new chat'),
  stylesLoadBeforeMarkup,
  chatgptHasNoThatsIt: !body.toLowerCase().includes('that’s it') && !body.toLowerCase().includes("that's it"),
  claudeGuidesSettings: claudeBody.includes(claudePath),
  claudeHasSetupStep: claudeBody.includes('copy the setup') && claudeBody.includes('paste in a normal chat'),
  geminiGuidesSettings: geminiBody.includes(geminiPath),
  geminiHasSetupStep: geminiBody.includes('copy the setup') && geminiBody.includes('paste in a normal chat'),
  geminiHasNoAccountFallback: !geminiBody.includes('personal accounts only') && !geminiBody.includes('Gem called Alexandria'),
  hasNoPathDump: !body.includes('those settings make it last across chats') && !pickerBody.includes('those settings make it last across chats'),
  hasNoDifferentChat: !body.includes('different chat') && !claudeBody.includes('different chat'),
  chatBackGoesOneSlide: backToPicker,
  startBackGoesOneSlide: nearbyAfterAgent && startBackToChoice && computerBackToNearby,
  chatCopiedWithoutEmail,
  buttonCopiedState: clickedText.includes('copied'),
  setupButtonCopiedState: setupClickedText.includes('copied') && setupClickedText.includes('paste in a normal chat'),
  clipboardExact: clipboard === expected,
  clipboardMatchesShared: clipboard === chatInstallPrompt(),
  setupClipboardExact: setupClipboard === expectedSetup && setupClipboard === CHAT_SETUP_PROMPT,
  factoryBootstrapMatchesShared: factoryBootstrap === expected,
  clipboardIsFirstPerson: clipboard.startsWith('alexandria is a loop in how you help me'),
  clipboardHasAdditiveGuard: clipboard.includes('Keep everything already there; replace nothing'),
  clipboardHasVisibleRoute:
    clipboard.includes('only each new ordinary chat’s first reply asks “Want me to start an alexandria chat on the side?”') &&
    clipboard.includes('Never repeat') &&
    clipboard.includes('On yes, open it with “a” if possible; else tell me how') &&
    clipboard.includes('Later mention it only for a useful read/save') &&
    clipboard.includes('save that to alexandria?'),
  clipboardRoutesEverySurface:
    clipboard.includes('Use hooks when available') &&
    clipboard.includes('~/alexandria') &&
    clipboard.includes('Cowork/ChatGPT Work') &&
    clipboard.includes('attached folder/project') &&
    clipboard.includes('Drive alexandria/_start') &&
    clipboard.includes('memory, with its limit'),
  clipboardStartsWithValue:
    clipboard.includes('start its highest-value specific thread') &&
    clipboard.includes('be generic only without personal context'),
  clipboardClosesLoop:
    clipboard.includes('save only confirmed changes') &&
    clipboard.includes('verify them') &&
    !clipboard.includes('never save'),
  clipboardFitsSmallestChatgptLimit: clipboard.length <= 1100 && clipboard.length < 1500,
  clipboardAdmitsNoPersistence: clipboard.includes('never fake a read/save') && clipboard.includes('memory, with its limit'),
  setupGuidesUserNotAiDrive:
    setupClipboard.includes('prove the instructions are active') &&
    setupClipboard.includes('If the instructions are not active, stop') &&
    setupClipboard.includes('You cannot connect it yourself') &&
    setupClipboard.includes('give me the exact native steps') &&
    setupClipboard.includes('without presenting alternatives or claiming file access'),
  setupPopulatesAndVerifies:
    setupClipboard.includes('everything you already know about me') &&
    setupClipboard.includes('fullest accurate first record') &&
    setupClipboard.includes('Read every saved item back') &&
    setupClipboard.includes('ask one high-signal question instead of inventing') &&
    setupClipboard.includes('do not claim setup worked'),
  setupRunsMiniLoop:
    setupClipboard.includes('miniature alexandria loop') &&
    setupClipboard.includes('one specific mirror') &&
    setupClipboard.includes('one real tension') &&
    setupClipboard.includes('one new connection'),
  setupDefersFullVersion:
    setupClipboard.includes('Only after that works') &&
    setupClipboard.includes('full version needs an ai agent on a computer') &&
    setupClipboard.includes('adds the alexandria community'),
  setupEndsWithRealTest:
    setupClipboard.includes('At the very end') &&
    setupClipboard.includes('open a new chat and type “a”') &&
    setupClipboard.includes('rather than a generic question'),
  clipboardHasNoJailbreak: jailbreakPhrases.every((phrase) => !clipboard.toLowerCase().includes(phrase)),
  emailFieldMatchesStart: JSON.stringify(chatEmailShape) === JSON.stringify(startEmailShape),
  computerCopiedWithoutEmail: computerClipboard === computerInstallPrompt(),
  computerAsksForInspection: computerClipboard.includes('decide for yourself whether it is safe') && computerClipboard.includes('wait for me to say `start`'),
  computerFirstPasteIsSafetyOnly:
    !computerClipboard.includes("Install and verify alexandria's normal hooks first") &&
    !computerClipboard.includes('which other ai app') &&
    !computerClipboard.includes('account or project instructions') &&
    computerClipboard.trim().endsWith('wait for me to say `start`.'),
  computerShortcutWhyMatchesPhone: computerShortcutWhy,
  phoneHasHostPicker,
  phoneRouteVisible:
    phoneBody.includes('copy the alexandria instructions') &&
    phoneBody.includes(`paste in ${phoneChatgptPath}`) &&
    phoneBody.includes('copy the setup') &&
    phoneBody.includes('paste in a normal chat') &&
    !phoneBody.includes('connect google drive') &&
    phoneBody.includes('type “a” in a new chat'),
  phoneCopiedWithoutEmail: phoneClipboard === mobileHandoffPrompt(),
  phoneHasExactFallback: phoneClipboard.includes('At your computer, open alexandria-library.com/start and choose agents.'),
  phonePromptExplainsShortcutAndReminder:
    phoneClipboard.includes('Explain in one sentence that the alexandria Shortcut') &&
    phoneClipboard.includes('If you can actually set reminders') &&
    phoneClipboard.includes('Never claim you changed my phone or computer'),
  phonePromptLeavesDirectSetupOnPage:
    phoneClipboard.includes('send me to step 1 at alexandria-library.com/start') &&
    phoneClipboard.includes('completed step 3 without replacing my existing instructions') &&
    !phoneClipboard.includes('--- ALEXANDRIA BLOCK ---') &&
    !phoneClipboard.includes(CHAT_INSTRUCTION),
  phoneInstructionClipboardExact: phoneInstructionClipboard === CHAT_INSTRUCTION,
  phoneBackGoesOneSlide: phoneBackToPicker,
  startCopyIsLowercase:
    startBody.includes('start your loop') &&
    startBody.includes('what do you have access to?') &&
    startBody.includes('an agent — eg codex, cursor, cowork') &&
    startBody.includes('just chat — eg claude, chatgpt, gemini'),
  visibleOnboardingCopyIsLowercase: [pickerBody, body, claudeBody, geminiBody, startBody, phonePickerBody, phoneBody]
    .every((text) => !/\b(?:Alexandria|AI)\b/.test(text)),
  startHasUniversalChatDoor,
  errorOverlay: overlay > 0,
  consoleErrors,
  pageErrors,
  screenshot,
  phoneScreenshot,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();

if (
  !result.bodyHasContent ||
  !result.hasHostPicker ||
  !result.hasExactlyFourChatSteps ||
  !result.hasChatShortcutStep ||
  !result.chatShortcutMatchesDevice ||
  !result.computerShortcutRoutesToPage ||
  !result.phoneShortcutOpensIcloud ||
  !result.hasEmailStep ||
  !result.hasCopyStep ||
  !result.hasSetupStep ||
  !result.copyIsTwoLines ||
  !result.setupIsOneLine ||
  !result.pageLeavesRestToAi ||
  !result.stylesLoadBeforeMarkup ||
  !result.chatgptHasNoThatsIt ||
  !result.claudeGuidesSettings ||
  !result.claudeHasSetupStep ||
  !result.geminiGuidesSettings ||
  !result.geminiHasSetupStep ||
  !result.geminiHasNoAccountFallback ||
  !result.hasNoPathDump ||
  !result.hasNoDifferentChat ||
  !result.chatBackGoesOneSlide ||
  !result.startBackGoesOneSlide ||
  !result.chatCopiedWithoutEmail ||
  !result.buttonCopiedState ||
  !result.setupButtonCopiedState ||
  !result.clipboardExact ||
  !result.clipboardMatchesShared ||
  !result.setupClipboardExact ||
  !result.clipboardIsFirstPerson ||
  !result.clipboardHasAdditiveGuard ||
  !result.clipboardHasVisibleRoute ||
  !result.clipboardRoutesEverySurface ||
  !result.clipboardStartsWithValue ||
  !result.clipboardClosesLoop ||
  !result.clipboardFitsSmallestChatgptLimit ||
  !result.clipboardAdmitsNoPersistence ||
  !result.setupGuidesUserNotAiDrive ||
  !result.setupPopulatesAndVerifies ||
  !result.setupRunsMiniLoop ||
  !result.setupDefersFullVersion ||
  !result.setupEndsWithRealTest ||
  !result.clipboardHasNoJailbreak ||
  !result.emailFieldMatchesStart ||
  !result.computerCopiedWithoutEmail ||
  !result.computerAsksForInspection ||
  !result.computerFirstPasteIsSafetyOnly ||
  !result.computerShortcutWhyMatchesPhone ||
  !result.phoneHasHostPicker ||
  !result.phoneRouteVisible ||
  !result.phoneCopiedWithoutEmail ||
  !result.phoneHasExactFallback ||
  !result.phonePromptExplainsShortcutAndReminder ||
  !result.phonePromptLeavesDirectSetupOnPage ||
  !result.phoneInstructionClipboardExact ||
  !result.phoneBackGoesOneSlide ||
  !result.startCopyIsLowercase ||
  !result.visibleOnboardingCopyIsLowercase ||
  !result.startHasUniversalChatDoor ||
  result.errorOverlay ||
  result.consoleErrors.length ||
  result.pageErrors.length
) {
  process.exitCode = 1;
}
