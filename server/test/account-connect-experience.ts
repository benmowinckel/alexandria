import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountConnectPrompt, CHAT_INSTRUCTION } from '../../shared/onboarding-prompts.js';
import { welcomeEmailContent } from '../src/email.js';
import { callbackPageHtml } from '../src/templates.js';

const code = `alex_connect_${'0'.repeat(48)}`;
const paste = accountConnectPrompt(code);
const words = paste.trim().split(/\s+/).length;
assert.ok(words <= 150, `joined paste became too long: ${words} words`);
assert.equal((paste.match(/github\.com\//g) || []).length, 1, 'joined paste must point to one public location');
assert.match(paste, /Inspect the public source independently/);
assert.match(paste, /few plain lines/);
assert.match(paste, /what connection changes, what stays private, and what it will not do/);
assert.match(paste, /Do nothing until I say `connect`/);
assert.match(paste, /follow the rest of factory\/connect\.md one action at a time/);
assert.match(paste, /Finish the remaining product setup/);
assert.match(paste, /Never show me a setup checklist/);
assert.doesNotMatch(paste, /setup\.sh|curl|bash|hash|fingerprint|api_key|--run|rm ~\//i);

const connectDoc = readFileSync(new URL('../../factory/connect.md', import.meta.url), 'utf8');
assert.match(connectDoc, /reply in no more than four short lines/i);
assert.match(connectDoc, /Complete the private verification below before giving the normal consent response/);
assert.match(connectDoc, /including `scripts\/connect-account\.sh`, must appear in the signed manifest at that same revision; if one is absent, refuse/);
assert.match(connectDoc, /lets the existing loop recognize the person's account and live membership/);
assert.match(connectDoc, /does not read or send their private files/);
assert.match(connectDoc, /does not rerun setup, replace configuration, enable any optional capability/);
assert.match(connectDoc, /guides the remaining setup one action at a time, with a separate yes for anything optional, then makes one bounded, read-only orientation/);
assert.match(connectDoc, /Finish the full product/);
assert.match(connectDoc, /Phone capture/);
assert.match(connectDoc, /which other ai app do you use most\?/);
assert.match(connectDoc, /temporary phone-anchor line/);
assert.match(connectDoc, /Never display the whole sequence as a checklist/);
assert.match(connectDoc, /Use context already present in the current session, but do not read new private files/);
assert.match(connectDoc, /Your public side/);
assert.match(connectDoc, /Other people's public context/);
assert.match(connectDoc, /The Marketplace, both ways/);
assert.match(connectDoc, /Run this orientation once as part of this handoff/);
assert.match(connectDoc, /End with `Say connect to continue\.` Then stop\./);
assert.match(connectDoc, /Wait for the exact word `connect`\. Nothing similar counts\./);
assert.match(connectDoc, /immediately open it and invoke the exact installed Alexandria start skill—no second consent question/);
assert.match(connectDoc, /Open a new chat and invoke \/a\./);
assert.match(connectDoc, /Open a new task and invoke \$a\./);
assert.match(connectDoc, /Only when no native start skill exists, use the portable floor: `Start an Alexandria session\.`/);
assert.match(connectDoc, /never claim that typing the plain word `alexandria` invokes a skill/i);

const optional = readFileSync(new URL('../../factory/optional.md', import.meta.url), 'utf8');
assert.match(optional, /only when the Author asks to connect one/);
assert.match(optional, /scripts\/create-account-handoff\.sh/);
assert.match(optional, /Do not show or explain the one-use code separately/);

const connector = readFileSync(new URL('../../factory/scripts/connect-account.sh', import.meta.url), 'utf8');
assert.match(connector, /connected to alexandria as \$github_login; active membership verified\./);
assert.match(connector, /existing local loop can now verify your account and membership at session start/);
assert.match(connector, /it stays passive until you start an Alexandria session/);
assert.match(connector, /no private files were read and no optional capability was enabled/);
assert.doesNotMatch(connector, /insight|reflection generated|read your constitution/i);
assert.doesNotMatch(connector, /community content|other people|shared intelligence/i);

const nudge = 'Want me to open your alexandria loop in the background for when you have a minute?';
assert.match(CHAT_INSTRUCTION, new RegExp(nudge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(CHAT_INSTRUCTION, /do not open anything before yes/);
assert.match(CHAT_INSTRUCTION, /immediately open a new chat and invoke its native Alexandria skill—no second question/);
assert.match(CHAT_INSTRUCTION, /If it cannot, say: open a new chat/);
assert.match(CHAT_INSTRUCTION, /actual slash, dollar-sign, or native skill gesture/);
assert.doesNotMatch(CHAT_INSTRUCTION, /type alexandria|On “alexandria”/i);

const codex = readFileSync(new URL('../../factory/skills/codex-ambient.md', import.meta.url), 'utf8');
assert.match(codex, /On yes, immediately open a new task and invoke `\$a`/);
assert.match(codex, /If it cannot open a task, say exactly: `Open a new task and invoke \$a\.`/);
const cursor = readFileSync(new URL('../../factory/skills/cursor.mdc', import.meta.url), 'utf8');
assert.match(cursor, /On yes, immediately open a new chat and invoke `\/a`/);
assert.match(cursor, /If it cannot open a chat, say exactly: `Open a new chat and invoke \/a\.`/);

const page = await callbackPageHtml(code, 'new-author');
assert.match(page, /connect your existing loop/);
assert.match(page, /paste this into your computer agent/);
assert.match(page, /your agent will inspect it first/);
const email = welcomeEmailContent('new-author', 'TOKEN', code).html;
assert.match(email, /agent that already runs your alexandria loop/);
assert.match(email, /nothing changes until you say/);
assert.match(email, new RegExp(code));
assert.doesNotMatch(page + email + paste, /alex_[a-f0-9]{32}/);

console.log('account connect experience: on-demand handoff, exact consent, truthful proof, native active route');
