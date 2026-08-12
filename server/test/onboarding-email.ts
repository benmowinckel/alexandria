import assert from 'node:assert/strict';
import { onboardEmailContent } from '../src/email.js';
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
assert.match(chat.html, /paste this into a chat. to keep it across chats, add it here:/);
assert.match(chat.html, /Settings → Personalization → Custom instructions/);
assert.match(chat.html, /Personal Intelligence → Instructions for Gemini/);
assert.match(chat.html, /Instructions for Claude/);
assert.match(chat.html, /then type a in a new chat/);
assert.doesNotMatch(chat.html, /paste this into a new chat in the app you already use/);
assert.match(chat.html, /I want a private thinking habit/);

const mobile = mobileHandoffPrompt();
assert.match(mobile, /I am on my phone right now/);
assert.match(mobile, /do not replace it with a chat-only version/);
assert.match(mobile, /If you truly have a reminder tool/);
assert.match(mobile, /open alexandria-library\.com\/start and choose agents/);
assert.match(mobile, /Alexandria Shortcut/);

for (const content of [computer, phone, chat]) {
  assert.match(content.html, /stop these emails/);
  assert.match(content.html, /reply if you get stuck/);
}

console.log('onboarding email and mobile handoff: ok');
