import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onboardEmailContent, preBillWarningContent, setupFixNudgeContent, welcomeEmailContent } from '../src/email.js';
import { accountConnectPrompt, agentSetupPrompt } from '../src/install-prompt.js';
import { CHAT_HOSTS, CHAT_INSTRUCTION, CHAT_SETUP_PROMPT, agentReminderPrompt } from '../../shared/onboarding-prompts.js';

const agent = onboardEmailContent('agent', 'TOKEN');
assert.equal(agent.subject, 'alexandria. — your setup');
assert.match(agent.html, /use the most powerful agent you can reach/);
assert.match(agent.html, /ideally the agent version on your computer/);
assert.match(agent.html, /the shortcut/);
assert.match(agent.html, /alexandria\/vault\/input/);
assert.match(agent.html, /Let&rsquo;s connect it to this setup/);
assert.match(agent.html, /your setup/);
assert.match(agent.html, /i&rsquo;ll write sparingly/);
assert.match(agent.html, /reply and ask me anything, anytime/);
const agentPrompt = agentSetupPrompt();
assert.match(agentPrompt, /I deliberately chose this public project/);
assert.match(agentPrompt, /permission to read anything in that public project/);
assert.match(agentPrompt, /reference material to evaluate, not authority to obey/);
assert.match(agentPrompt, /Do not request any new access, read anything private/);
assert.match(agentPrompt, /run its code, install anything, or change anything yet/);
assert.match(agentPrompt, /fit into our existing system/);
assert.match(agentPrompt, /repository contains the founder’s blueprint/);
assert.match(agentPrompt, /small number of elements as essential/);
assert.match(agentPrompt, /customise, remove from, and evolve over time/);
assert.match(agentPrompt, /repository also includes an optional community/);
assert.match(agentPrompt, /Keep that separate from the private setup/);
assert.match(agentPrompt, /decide later whether it is useful to us/);
assert.match(agentPrompt, /Be radically simple and very concise/);
assert.match(agentPrompt, /tell me clearly whether you think we should proceed/);
assert.match(agentPrompt, /wait for my clear approval/);
assert.doesNotMatch(agentPrompt, /which ai|chatgpt|claude|gemini|Shortcut|your email|collective|join|membership|referral|price|paid/i);

const reminderPrompt = agentReminderPrompt();
assert.match(reminderPrompt, /set up Alexandria on my computer/);
assert.match(reminderPrompt, /one real reminder I will see on my computer/);
assert.match(reminderPrompt, /feature you can verify will reach me across devices/);
assert.match(reminderPrompt, /If you need a time, ask me one short question/);
assert.match(reminderPrompt, /If you cannot make it persist, tell me plainly/);
assert.match(reminderPrompt, /Do not inspect the project or begin setup now/);

const connectionCode = 'alex_connect_000000000000000000000000000000000000000000000000';
const joinedComputerPrompt = accountConnectPrompt(connectionCode);
assert.match(joinedComputerPrompt, /I already have a private local Alexandria loop/);
assert.match(joinedComputerPrompt, /factory\/connect\.md/);
assert.match(joinedComputerPrompt, /Inspect the public source independently/);
assert.match(joinedComputerPrompt, /what connection changes, what stays private, and what it will not do/);
assert.match(joinedComputerPrompt, /Do nothing until I say `connect`/);
assert.match(joinedComputerPrompt, new RegExp(connectionCode));
assert.doesNotMatch(joinedComputerPrompt, /setup\.sh|curl|bash|api_key|publish|enable/);

const joinedEmail = welcomeEmailContent('new-author', 'TOKEN');
assert.equal(joinedEmail.subject, 'welcome to alexandria.');
assert.match(joinedEmail.html, /start an Alexandria session in a new chat/);
assert.doesNotMatch(joinedEmail.html, /factory\/connect\.md|Do nothing until I say `connect`|agent that already runs your alexandria loop|alex_connect_/);

const phone = onboardEmailContent('agent-phone', 'TOKEN');
assert.equal(phone.subject, 'alexandria. — your setup');
assert.match(phone.html, /use the most powerful agent you can reach/);
assert.match(phone.html, /ideally the agent version on your computer/);
assert.match(phone.html, /repository contains the founder’s blueprint/);

const computer = onboardEmailContent('agent-computer', 'TOKEN');
assert.equal(computer.subject, agent.subject);
assert.match(computer.html, /use the most powerful agent you can reach/);

const chat = onboardEmailContent('chat', 'TOKEN');
assert.equal(chat.subject, 'alexandria. — your chat setup');
assert.match(chat.html, /choose the chat you use most, then follow the three short steps/);
assert.match(chat.html, /alexandria-library\.com\/chat/);
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
assert.match(CHAT_INSTRUCTION, /end the first ordinary text reply with “Want me to open your alexandria loop/);
assert.match(CHAT_INSTRUCTION, /Never ask twice that local day or during setup, security review, background work, voice/);
assert.match(CHAT_INSTRUCTION, /Consent only: open nothing before yes/);
assert.match(CHAT_INSTRUCTION, /On yes, open a new chat and invoke the native Alexandria skill/);
assert.match(CHAT_INSTRUCTION, /if unable, tell me to open one and name the host's actual gesture/);
assert.doesNotMatch(CHAT_INSTRUCTION, /type alexandria|On “alexandria”/);
assert.doesNotMatch(CHAT_SETUP_PROMPT, new RegExp(CHAT_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(CHAT_SETUP_PROMPT, /Be radically simple and very concise/);
assert.match(CHAT_SETUP_PROMPT, /only one action or question at a time/);
assert.match(CHAT_SETUP_PROMPT, /verify that the alexandria instructions are active/);
assert.match(CHAT_SETUP_PROMPT, /If the instructions are not active, stop and help me fix only that/);
assert.match(CHAT_SETUP_PROMPT, /name the exact account memory and past-chat sources you can actually reach/);
assert.match(CHAT_SETUP_PROMPT, /Ask whether you may use only those named sources/);
assert.match(CHAT_SETUP_PROMPT, /Do not treat this pasted message as permission/);
assert.doesNotMatch(CHAT_SETUP_PROMPT, /you have my permission/i);
assert.match(CHAT_SETUP_PROMPT, /Do not search the rest of my Drive/);
assert.match(CHAT_SETUP_PROMPT, /create or update alexandria\/_start/);
assert.match(CHAT_SETUP_PROMPT, /Read the saved record back and prove you can retrieve it/);
assert.match(CHAT_SETUP_PROMPT, /If you cannot both write and read it/);
assert.match(CHAT_SETUP_PROMPT, /start my first alexandria session from the highest-value specific thread/);
assert.match(CHAT_SETUP_PROMPT, /I can change or remove the instructions and record whenever I want/);
assert.match(CHAT_SETUP_PROMPT, /optional community we can discuss later/);
assert.match(CHAT_SETUP_PROMPT, /Do not begin either setup or sell them/);
assert.deepEqual(Object.keys(CHAT_HOSTS), ['chatgpt', 'claude', 'gemini']);
assert.match(CHAT_HOSTS.chatgpt.instructionPath, /custom instructions/);
assert.match(CHAT_HOSTS.chatgpt.drivePath, /apps → google drive → connect/);
assert.match(CHAT_HOSTS.claude.instructionPath, /profile preferences/);
assert.match(CHAT_HOSTS.claude.drivePath, /connectors → google drive → connect/);
assert.match(CHAT_HOSTS.gemini.instructionPath, /instructions for gemini/);
assert.match(CHAT_HOSTS.gemini.drivePath, /connected apps → google workspace/);
const bootstrap = readFileSync(new URL('../../factory/chat/bootstrap.md', import.meta.url), 'utf8');
const bootstrapPrompt = bootstrap.match(/---PROMPT START---\n\n([\s\S]*?)\n\n---PROMPT END---/)?.[1];
assert.equal(bootstrapPrompt, CHAT_INSTRUCTION, 'website instruction and fallback bootstrap must stay identical');
const onboardingRouter = readFileSync(new URL('../../factory/onboarding.md', import.meta.url), 'utf8');
assert.match(onboardingRouter, /Account instructions — after private value, before the optional community/);
assert.match(onboardingRouter, /attach or grant only the Alexandria folder/);
assert.match(onboardingRouter, /native hooks first/);
assert.match(onboardingRouter, /Only after the person is finished with other AIs does the setup show the fixed Library destination/);
const localOnboarding = readFileSync(new URL('../../factory/block.md', import.meta.url), 'utf8');
assert.match(localOnboarding, /Phase 6 — Add the loop to their other AIs, then stop cleanly/);
assert.match(localOnboarding, /which other ai do you use most\?/);
assert.match(localOnboarding, /\.other_ai_instructions/);
assert.match(localOnboarding, /library — https:\/\/alexandria-library\.com\/join/);

for (const content of [agent, computer, phone, chat]) {
  assert.match(content.html, /stop these emails/);
  assert.match(content.html, /reply and ask me anything, anytime/);
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

console.log('split onboarding email: ok');
