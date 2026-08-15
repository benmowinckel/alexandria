import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onboardEmailContent, preBillWarningContent, setupFixNudgeContent } from '../src/email.js';
import { computerInstallPrompt, mobileHandoffPrompt } from '../src/install-prompt.js';
import { CHAT_INSTRUCTION, CHAT_SETUP_PROMPT } from '../../shared/onboarding-prompts.js';

const computer = onboardEmailContent('agent-computer', 'TOKEN');
assert.equal(computer.subject, 'alexandria. — your computer setup');
assert.match(computer.html, /if you already pasted it, keep this as your backup/);
assert.match(computer.html, /I am at my computer/);
const computerPrompt = computerInstallPrompt();
assert.doesNotMatch(computerPrompt, /Install and verify alexandria's normal hooks first/);
assert.doesNotMatch(computerPrompt, /which other ai app/);
assert.doesNotMatch(computerPrompt, /account or project instructions/);
assert.ok(computerPrompt.trim().endsWith('wait for me to say `start`.'));

const joinedComputerPrompt = computerInstallPrompt({ apiKey: 'PREVIEW-NOT-A-REAL-KEY' });
assert.match(joinedComputerPrompt, /verify the live account response/);
assert.match(joinedComputerPrompt, /integrity-verified local module map/);
assert.match(joinedComputerPrompt, /what joining makes available, and what still needs a separate exact approval/);
assert.match(joinedComputerPrompt, /Do not browse, install, publish, enable, or send anything merely to explain it/);
assert.match(joinedComputerPrompt, /Record the module-map version in ~\/alexandria\/system\/\.module_guide_seen only after I have actually seen that orientation/);

const phone = onboardEmailContent('agent-phone', 'TOKEN');
assert.equal(phone.subject, 'alexandria. — continue at your computer');
assert.match(phone.html, /when you are at your computer, open the agent you use there/);
assert.match(phone.html, /I am at my computer/);

const chat = onboardEmailContent('chat', 'TOKEN');
assert.equal(chat.subject, 'alexandria. — your chat setup');
assert.match(chat.html, /1\. paste these alexandria instructions into your chat’s custom instructions without deleting your current instructions\./);
assert.match(chat.html, /2\. paste this into a normal chat\. your ai will take it from there\./);
assert.match(chat.html, /settings → personalization → custom instructions/);
assert.match(chat.html, /settings → personal context → your instructions for gemini/);
assert.match(chat.html, /settings → general → instructions for claude/);
assert.doesNotMatch(chat.html, /those settings make it last across chats\./);
assert.doesNotMatch(chat.html, /add it here/);
assert.doesNotMatch(chat.html, /paste this into a chat, then type a/);
assert.match(chat.html, /alexandria is a loop in how you help me/);
assert.match(chat.html, /Finish the setup with me one action at a time/);

const chatgpt = onboardEmailContent('chat', 'TOKEN', 'chatgpt');
assert.match(chatgpt.html, /1\. paste these alexandria instructions into chatgpt at settings → personalization → custom instructions without deleting your current instructions\./);
assert.doesNotMatch(chatgpt.html, /connect google drive/);

const claude = onboardEmailContent('chat', 'TOKEN', 'claude');
assert.match(claude.html, /1\. paste these alexandria instructions into claude at settings → general → instructions for claude without deleting your current instructions\./);

const gemini = onboardEmailContent('chat', 'TOKEN', 'gemini');
assert.match(gemini.html, /1\. paste these alexandria instructions into gemini at settings → personal context → your instructions for gemini without deleting your current instructions\./);
assert.doesNotMatch(gemini.html, /Gem called Alexandria/);

assert.ok(CHAT_INSTRUCTION.length <= 1100, `chat instruction lost its headroom: ${CHAT_INSTRUCTION.length}`);
assert.match(CHAT_INSTRUCTION, /Keep everything already there; replace nothing/);
assert.match(CHAT_INSTRUCTION, /not an assistant/);
assert.match(CHAT_INSTRUCTION, /Use hooks when available/);
assert.match(CHAT_INSTRUCTION, /Cowork\/ChatGPT Work/);
assert.match(CHAT_INSTRUCTION, /memory, with its limit/);
assert.match(CHAT_INSTRUCTION, /highest-value specific thread/);
assert.match(CHAT_INSTRUCTION, /be generic only without personal context/);
assert.match(CHAT_INSTRUCTION, /save only confirmed changes and verify them/);
assert.match(CHAT_INSTRUCTION, /only each new ordinary chat’s first reply asks “Want me to start an alexandria chat on the side\?”/);
assert.match(CHAT_INSTRUCTION, /Never repeat/);
assert.match(CHAT_INSTRUCTION, /On yes, open it with “a” if possible; else tell me how/);
assert.match(CHAT_INSTRUCTION, /Setup routes only at final test/);
assert.doesNotMatch(CHAT_INSTRUCTION, /type [/$]a/);
assert.match(CHAT_SETUP_PROMPT, /You cannot connect it yourself/);
assert.match(CHAT_SETUP_PROMPT, /prove the instructions are active/);
assert.match(CHAT_SETUP_PROMPT, /If the instructions are not active, stop and help me add them without deleting anything already there/);
assert.match(CHAT_SETUP_PROMPT, /everything you already know about me/);
assert.match(CHAT_SETUP_PROMPT, /Do not search the rest of my Drive/);
assert.match(CHAT_SETUP_PROMPT, /fullest accurate first record/);
assert.match(CHAT_SETUP_PROMPT, /Read every saved item back/);
assert.match(CHAT_SETUP_PROMPT, /too little real context, say so and ask one high-signal question instead of inventing/);
assert.match(CHAT_SETUP_PROMPT, /miniature alexandria loop/);
assert.match(CHAT_SETUP_PROMPT, /full version needs an ai agent on a computer/);
assert.match(CHAT_SETUP_PROMPT, /adds the alexandria community/);
assert.match(CHAT_SETUP_PROMPT, /At the very end, tell me to open a new chat and type “a”/);
assert.match(CHAT_SETUP_PROMPT, /rather than a generic question/);
const bootstrap = readFileSync(new URL('../../factory/chat/bootstrap.md', import.meta.url), 'utf8');
const bootstrapPrompt = bootstrap.match(/---PROMPT START---\n\n([\s\S]*?)\n\n---PROMPT END---/)?.[1];
assert.equal(bootstrapPrompt, CHAT_INSTRUCTION, 'website instruction and fallback bootstrap must stay identical');
const onboardingRouter = readFileSync(new URL('../../factory/onboarding.md', import.meta.url), 'utf8');
assert.match(onboardingRouter, /Account instructions — every Author, only where hooks do not carry them/);
assert.match(onboardingRouter, /attach or grant only the Alexandria folder/);
assert.match(onboardingRouter, /native hooks first/);
assert.match(onboardingRouter, /guide the rest one at a time/);
const localOnboarding = readFileSync(new URL('../../factory/block.md', import.meta.url), 'utf8');
assert.match(localOnboarding, /Phase 6 — Add Alexandria to their other AI apps/);
assert.match(localOnboarding, /Open `~\/alexandria\/system\/\.account-instructions\.md`/);
assert.match(localOnboarding, /only after Phase 5 has shown the first personalized result/i);

const mobile = mobileHandoffPrompt();
assert.ok(mobile.trim().split(/\s+/).length <= 100, `phone handoff became too long: ${mobile.trim().split(/\s+/).length} words`);
assert.match(mobile, /setting up alexandria on this phone/);
assert.match(mobile, /If you can actually set reminders/);
assert.match(mobile, /open alexandria-library\.com\/start and choose agents/);
assert.match(mobile, /alexandria Shortcut/);
assert.match(mobile, /send me to step 1 at alexandria-library\.com\/start/);
assert.doesNotMatch(mobile, /connect Google Drive/);
assert.match(mobile, /type “a” in a new chat/);
assert.match(mobile, /Never claim you changed my phone or computer/);
assert.doesNotMatch(mobile, /--- ALEXANDRIA BLOCK ---/);
assert.doesNotMatch(mobile, /Use working alexandria hooks/);

for (const content of [computer, phone, chat]) {
  assert.match(content.html, /stop these emails/);
  assert.match(content.html, /reply if you get stuck/);
  assert.doesNotMatch(content.html, /we&rsquo;ll also send/);
  assert.doesNotMatch(content.html, /useful for your loop/);
}

const preBill = preBillWarningContent({
  githubLogin: 'benmowinckel',
  kinCompliant: 2,
  kinNeeded: 1,
  amountDollars: 30,
  dueAt: new Date(2026, 7, 20),
  emailToken: 'TOKEN',
});
assert.equal(preBill.subject, 'alexandria. — heads up');
assert.match(preBill.html, /you&rsquo;re nearly there/);
assert.match(preBill.html, /2 active friends, just 1 more and it&rsquo;s free/);
assert.match(preBill.html, /send your link to one more friend/);
assert.match(preBill.html, /alexandria-library\.com\/invite\?ref=benmowinckel/);
assert.match(preBill.html, /\$30 on august 20 otherwise/);
assert.match(preBill.html, /just reply and i&rsquo;ll waive it/);
assert.match(preBill.html, /Benjamin a\. Mowinckel/);
assert.match(preBill.html, /stop these emails/);
assert.doesNotMatch(preBill.html, /the examined life/);
assert.doesNotMatch(preBill.html, /\/join\?ref=/);
assert.doesNotMatch(preBill.html, /active kin/);

const short = preBillWarningContent({
  githubLogin: 'benmowinckel',
  kinCompliant: 0,
  kinNeeded: 3,
  amountDollars: 10,
  dueAt: null,
});
assert.match(short.html, /0 active friends, 3 more and it&rsquo;s free/);
assert.match(short.html, /send your link to a few friends/);
assert.match(short.html, /\$10 otherwise/);
assert.doesNotMatch(short.html, /you&rsquo;re nearly there/);
assert.doesNotMatch(short.html, /stop these emails/);

const nudge = setupFixNudgeContent('TOKEN');
assert.equal(nudge.subject, 'alexandria. — quick fix');
assert.match(nudge.html, /i fixed a setup issue/);
assert.match(nudge.html, /alexandria-library\.com\/join/);
assert.match(nudge.html, /Benjamin a\. Mowinckel/);
assert.doesNotMatch(nudge.html, /we fixed a setup issue/);

console.log('onboarding email and mobile handoff: ok');
