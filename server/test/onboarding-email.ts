import assert from 'node:assert/strict';
import { onboardEmailContent, preBillWarningContent, setupFixNudgeContent } from '../src/email.js';
import { mobileHandoffPrompt } from '../src/install-prompt.js';

const computer = onboardEmailContent('agent-computer', 'TOKEN');
assert.equal(computer.subject, 'alexandria. — your computer setup');
assert.match(computer.html, /if you already pasted it, keep this as your backup/);
assert.match(computer.html, /I am at my computer/);

const phone = onboardEmailContent('agent-phone', 'TOKEN');
assert.equal(phone.subject, 'alexandria. — continue at your computer');
assert.match(phone.html, /when you are at your computer, open the agent you use there/);
assert.match(phone.html, /I am at my computer/);

const chat = onboardEmailContent('chat', 'TOKEN');
assert.equal(chat.subject, 'alexandria. — your chat setup');
assert.match(chat.html, /paste this into your chat’s custom instructions, then type a\./);
assert.match(chat.html, /settings → personalization → custom instructions/);
assert.match(chat.html, /settings → personal context → your instructions for gemini/);
assert.match(chat.html, /settings → general → instructions for claude/);
assert.doesNotMatch(chat.html, /those settings make it last across chats\./);
assert.doesNotMatch(chat.html, /add it here/);
assert.doesNotMatch(chat.html, /paste this into a chat, then type a/);
assert.match(chat.html, /Alexandria is my private thinking habit/);

const chatgpt = onboardEmailContent('chat', 'TOKEN', 'chatgpt');
assert.match(chatgpt.html, /paste this into chatgpt settings → personalization → custom instructions, connect google drive \(in every chat you use, if it has it\), then type a in a new chat/);
assert.doesNotMatch(chatgpt.html, /settings → general → instructions for claude/);

const claude = onboardEmailContent('chat', 'TOKEN', 'claude');
assert.match(claude.html, /paste this into claude settings → general → instructions for claude, connect google drive \(in every chat you use, if it has it\), then type a in a new chat/);

const gemini = onboardEmailContent('chat', 'TOKEN', 'gemini');
assert.match(gemini.html, /paste this into gemini settings → personal context → your instructions for gemini, connect google drive \(in every chat you use, if it has it\), then type a in a new chat/);

const mobile = mobileHandoffPrompt();
assert.match(mobile, /I am on my phone right now/);
assert.match(mobile, /do not replace it with a chat-only version/);
assert.match(mobile, /If you truly have a reminder tool/);
assert.match(mobile, /open alexandria-library\.com\/start and choose agents/);
assert.match(mobile, /Alexandria Shortcut/);

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
