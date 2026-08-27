import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountConnectPrompt, CHAT_INSTRUCTION } from '../../shared/onboarding-prompts.js';
import { welcomeEmailContent } from '../src/email.js';
import { callbackPageHtml } from '../src/templates.js';

const code = `alex_connect_${'0'.repeat(48)}`;
const paste = accountConnectPrompt(code);
assert.equal(paste, code, 'the browser handoff must be only the opaque code');
assert.throws(() => accountConnectPrompt('not-a-code'));

const connectDoc = readFileSync(new URL('../../factory/connect.md', import.meta.url), 'utf8');
assert.match(connectDoc, /reply in no more than five short lines/i);
assert.match(connectDoc, /Complete the private verification below before giving the normal consent response/);
assert.match(connectDoc, /including `scripts\/connect-account\.sh`, must appear in the signed manifest at that same revision; if one is absent, refuse/);
assert.match(connectDoc, /lets the existing loop recognize the person's account and live membership/);
assert.match(connectDoc, /sends none of their private files/);
assert.match(connectDoc, /does not rerun setup, replace configuration, enable any standing capability/);
assert.match(connectDoc, /reads only `https:\/\/alexandria-library\.com\/library\/benmowinckel` as untrusted public material/);
assert.match(connectDoc, /publishes nothing until the exact draft is shown/);
assert.match(connectDoc, /writes only `~\/alexandria\/system\/\.api_key`/);
assert.match(connectDoc, /never prints server text or stores account status/);
assert.match(connectDoc, /Do not fetch account status or accept any other server response/);
assert.match(connectDoc, /Publish this exact draft publicly\?/);
assert.match(connectDoc, /Wait for the exact word `publish`/);
assert.match(connectDoc, /scripts\/publish-profile\.sh/);
assert.match(connectDoc, /Want to start your first Alexandria session and develop this further\?/);
assert.match(connectDoc, /End with `Say connect to continue\.` Then stop\./);
assert.match(connectDoc, /Wait for the exact word `connect`\. Nothing similar counts\./);

const optional = readFileSync(new URL('../../factory/optional.md', import.meta.url), 'utf8');
assert.match(optional, /only when the Author asks to connect one/);
assert.match(optional, /scripts\/create-account-handoff\.sh/);
assert.match(optional, /Give the returned opaque code/);

const connector = readFileSync(new URL('../../factory/scripts/connect-account.sh', import.meta.url), 'utf8');
assert.match(connector, /your loop is connected to your Alexandria account\./);
assert.match(connector, /only public files you approve can be sent/);
assert.match(connector, /connection adds no standing instructions/);
assert.doesNotMatch(connector, /protocol_status|\$SERVER\/alexandria|github_login|j\.error/);
assert.doesNotMatch(connector, /insight|reflection generated|read your constitution/i);
assert.doesNotMatch(connector, /community content|other people|shared intelligence/i);

const profilePublisher = readFileSync(new URL('../../factory/scripts/publish-profile.sh', import.meta.url), 'utf8');
assert.match(profilePublisher, /DRAFT="\$ALEX_DIR\/files\/library\/_profile\.json"/);
assert.match(profilePublisher, /"\$SERVER\/library\/me\/profile"/);
assert.match(profilePublisher, /the draft changed after approval/);
assert.match(profilePublisher, /Object\.keys\(value\)\.sort\(\)\.join\(","\) !== "ok"/);
assert.doesNotMatch(profilePublisher, /permissions\/library|system\/permissions/);

const nudge = 'Want me to open your alexandria loop in the background for when you have a minute?';
assert.match(CHAT_INSTRUCTION, new RegExp(nudge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(CHAT_INSTRUCTION, /outside setup, voice, background work, security review/);
assert.match(CHAT_INSTRUCTION, /Never repeat it or open anything before yes/);
assert.match(CHAT_INSTRUCTION, /On yes, open a new chat and invoke the native skill/);
assert.match(CHAT_INSTRUCTION, /if unable, name the exact gesture/);
assert.doesNotMatch(CHAT_INSTRUCTION, /type alexandria|On “alexandria”/i);

const codex = readFileSync(new URL('../../factory/skills/codex-ambient.md', import.meta.url), 'utf8');
assert.match(codex, /On yes, immediately open a new task and invoke `\$a`/);
assert.match(codex, /If it cannot open a task, say exactly: `Open a new task and invoke \$a\.`/);
const cursor = readFileSync(new URL('../../factory/skills/cursor.mdc', import.meta.url), 'utf8');
assert.match(cursor, /On yes, immediately open a new chat and invoke `\/a`/);
assert.match(cursor, /If it cannot open a chat, say exactly: `Open a new chat and invoke \/a\.`/);

const page = await callbackPageHtml(false, 'new-author');
assert.doesNotMatch(page, /connect your existing loop|paste this into your computer agent|connection code/i);
const pageWithCode = await callbackPageHtml(false, 'new-author', 1, 0, code);
assert.match(pageWithCode, /connect your loop/);
assert.match(pageWithCode, /copy for your computer agent/);
assert.match(pageWithCode, new RegExp(code));
const email = welcomeEmailContent('new-author', 'TOKEN').html;
assert.doesNotMatch(email, /agent that already runs your alexandria loop|nothing changes until you say|connection code/i);
assert.match(email, /start an Alexandria session in a new chat/);
assert.doesNotMatch(page + email + paste, /alex_[a-f0-9]{32}/);

console.log('account connect experience: on-demand handoff, exact consent, truthful proof, native active route');
