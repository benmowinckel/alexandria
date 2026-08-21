import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onboardEmailContent, preBillWarningContent, setupFixNudgeContent, welcomeEmailContent } from '../src/email.js';
import { accountConnectPrompt, agentSetupPrompt } from '../src/install-prompt.js';
import { CHAT_INSTRUCTION, CHAT_SETUP_PROMPT } from '../../shared/onboarding-prompts.js';

const computer = onboardEmailContent('agent-computer', 'TOKEN');
assert.equal(computer.subject, 'alexandria. — your computer setup');
assert.match(computer.html, /if you already pasted it, keep this as your backup/);
assert.match(computer.html, /Do not ask me which/);
const agentPrompt = agentSetupPrompt();
assert.match(agentPrompt, /use only public information and capabilities already available here/);
assert.match(agentPrompt, /Do not request new access or inspect any personal content/);
assert.match(agentPrompt, /run commands and read and write files on my computer/);
assert.match(agentPrompt, /COMPUTER ROUTE/);
assert.match(agentPrompt, /LATER ROUTE/);
assert.match(agentPrompt, /wait for me to say `start`/);
assert.match(agentPrompt, /real reminder that works outside this chat/);
assert.match(agentPrompt, /create it only after I confirm the time/);
assert.match(agentPrompt, /Then verify it exists/);
assert.match(agentPrompt, /temporary line below the instructions already in this app/);
assert.match(agentPrompt, /ask what I see instead of inventing a path/);
assert.doesNotMatch(agentPrompt, /which ai|chatgpt|claude|gemini|Shortcut|your email/i);

const connectionCode = 'alex_connect_000000000000000000000000000000000000000000000000';
const joinedComputerPrompt = accountConnectPrompt(connectionCode);
assert.match(joinedComputerPrompt, /I already have a private local Alexandria loop/);
assert.match(joinedComputerPrompt, /factory\/connect\.md/);
assert.match(joinedComputerPrompt, /Inspect the public source independently/);
assert.match(joinedComputerPrompt, /what connection changes, what stays private, and what it will not do/);
assert.match(joinedComputerPrompt, /Do nothing until I say `connect`/);
assert.match(joinedComputerPrompt, new RegExp(connectionCode));
assert.doesNotMatch(joinedComputerPrompt, /setup\.sh|curl|bash|api_key|publish|enable/);

const joinedEmail = welcomeEmailContent('new-author', 'TOKEN', connectionCode);
assert.equal(joinedEmail.subject, 'welcome to alexandria.');
assert.match(joinedEmail.html, /factory\/connect\.md/);
assert.match(joinedEmail.html, /Do nothing until I say `connect`/);
assert.match(joinedEmail.html, new RegExp(connectionCode));
assert.match(joinedEmail.html, /agent that already runs your alexandria loop/);
assert.match(joinedEmail.html, /nothing changes until you say/);
assert.doesNotMatch(joinedEmail.html, /alex_[a-f0-9]{32}/);

const phone = onboardEmailContent('agent-phone', 'TOKEN');
assert.equal(phone.subject, 'alexandria. — continue at your computer');
assert.match(phone.html, /when you are at your computer, open the agent you use there/);
assert.match(phone.html, /Do not ask me which/);

const chat = onboardEmailContent('chat', 'TOKEN');
assert.equal(chat.subject, 'alexandria. — your chat setup');
assert.match(chat.html, /paste this into the chat you already use/);
assert.match(chat.html, /alexandria is a loop in how you help me/);
assert.match(chat.html, /Do not ask which app I use/);
assert.doesNotMatch(chat.html, /which ai do you use|settings →|your email/i);

assert.ok(CHAT_INSTRUCTION.length <= 1500, `chat instruction lost its headroom: ${CHAT_INSTRUCTION.length}`);
assert.match(CHAT_INSTRUCTION, /Keep everything already there; replace nothing/);
assert.match(CHAT_INSTRUCTION, /not an assistant/);
assert.match(CHAT_INSTRUCTION, /Use hooks when available/);
assert.match(CHAT_INSTRUCTION, /Cowork\/ChatGPT Work/);
assert.match(CHAT_INSTRUCTION, /memory, with its limit/);
assert.match(CHAT_INSTRUCTION, /highest-value specific thread/);
assert.match(CHAT_INSTRUCTION, /be generic only without personal context/);
assert.match(CHAT_INSTRUCTION, /Save only confirmed changes and verify them/);
assert.match(CHAT_INSTRUCTION, /only each new ordinary chat’s first reply asks “Want me to open your alexandria loop in the background for when you have a minute\?”/);
assert.match(CHAT_INSTRUCTION, /Never repeat/);
assert.match(CHAT_INSTRUCTION, /do not open anything before yes/);
assert.match(CHAT_INSTRUCTION, /On yes, if this host can, immediately open a new chat and invoke its native Alexandria skill—no second question/);
assert.match(CHAT_INSTRUCTION, /If it cannot, say: open a new chat/);
assert.match(CHAT_INSTRUCTION, /actual slash, dollar-sign, or native skill gesture/);
assert.doesNotMatch(CHAT_INSTRUCTION, /type alexandria|On “alexandria”/);
assert.ok(CHAT_SETUP_PROMPT.includes(CHAT_INSTRUCTION));
assert.match(CHAT_SETUP_PROMPT, /Do not ask which app I use/);
assert.match(CHAT_SETUP_PROMPT, /use only controls and capabilities you can verify/);
assert.match(CHAT_SETUP_PROMPT, /Until the named-source consent step below, use only this conversation/);
assert.match(CHAT_SETUP_PROMPT, /Do not open any personal source or request new access/);
assert.match(CHAT_SETUP_PROMPT, /ask what I see instead of inventing a path/);
assert.match(CHAT_SETUP_PROMPT, /Keep every instruction already there/);
assert.match(CHAT_SETUP_PROMPT, /You cannot change the setting yourself/);
assert.match(CHAT_SETUP_PROMPT, /You cannot connect it yourself/);
assert.match(CHAT_SETUP_PROMPT, /prove it is active/);
assert.match(CHAT_SETUP_PROMPT, /If it is not active, stop and fix that one step without deleting anything already there/);
assert.match(CHAT_SETUP_PROMPT, /Name the exact account memory and past-chat sources you can actually reach/);
assert.match(CHAT_SETUP_PROMPT, /Ask me directly whether you may use those named sources for this setup, then wait for my answer/);
assert.match(CHAT_SETUP_PROMPT, /My answer applies only to the sources and destination you named/);
assert.doesNotMatch(CHAT_SETUP_PROMPT, /you have my permission/i);
assert.match(CHAT_SETUP_PROMPT, /Do not search the rest of my Drive/);
assert.match(CHAT_SETUP_PROMPT, /fullest accurate first record/);
assert.match(CHAT_SETUP_PROMPT, /Read every saved item back/);
assert.match(CHAT_SETUP_PROMPT, /too little real context, say so and ask one high-signal question instead of inventing/);
assert.match(CHAT_SETUP_PROMPT, /miniature alexandria loop/);
assert.match(CHAT_SETUP_PROMPT, /full version needs an ai agent on a computer/);
assert.match(CHAT_SETUP_PROMPT, /adds the alexandria community/);
assert.match(CHAT_SETUP_PROMPT, /Setup routes only at final test/);
assert.match(CHAT_SETUP_PROMPT, /At the very end, use this host's native alexandria skill in a new chat if it can/);
assert.match(CHAT_SETUP_PROMPT, /one clear step naming this host's actual skill gesture/);
assert.match(CHAT_SETUP_PROMPT, /rather than a generic question/);
const bootstrap = readFileSync(new URL('../../factory/chat/bootstrap.md', import.meta.url), 'utf8');
const bootstrapPrompt = bootstrap.match(/---PROMPT START---\n\n([\s\S]*?)\n\n---PROMPT END---/)?.[1];
assert.equal(bootstrapPrompt, CHAT_INSTRUCTION, 'website instruction and fallback bootstrap must stay identical');
const onboardingRouter = readFileSync(new URL('../../factory/onboarding.md', import.meta.url), 'utf8');
assert.match(onboardingRouter, /Account instructions — after joining, only where hooks do not carry them/);
assert.match(onboardingRouter, /attach or grant only the Alexandria folder/);
assert.match(onboardingRouter, /native hooks first/);
assert.match(onboardingRouter, /That moment has one next action: the fixed Library destination/);
const localOnboarding = readFileSync(new URL('../../factory/block.md', import.meta.url), 'utf8');
assert.match(localOnboarding, /Phase 6 — Stop cleanly/);
assert.match(localOnboarding, /the one Library destination/);
assert.doesNotMatch(localOnboarding, /which other AI app do you use most\?/);

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

console.log('universal onboarding email: ok');
