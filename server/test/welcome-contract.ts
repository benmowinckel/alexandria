import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callbackPageHtml } from '../src/templates.js';

function main(html: string): string {
  const match = html.match(/<main class="wrap">([\s\S]*?)<\/main>/);
  assert.ok(match, 'welcome page main content missing');
  return match[1];
}

const firstJoin = main(await callbackPageHtml(false, 'new-author'));
assert.match(firstJoin, /invite people to alexandria/);
assert.doesNotMatch(firstJoin, /connect|connection code|computer agent/i);

const fullFirstJoin = await callbackPageHtml(false, 'new-author');
assert.doesNotMatch(fullFirstJoin, /factory\/connect\.md|Do nothing until I say `connect`|your agent will inspect it first|alex_connect_/);

const returning = main(await callbackPageHtml(true, 'returning-author'));
assert.match(returning, /invite people to alexandria/);
assert.doesNotMatch(returning, /connect|connection code|computer agent/i);

const websiteWelcomeRoute = readFileSync('../app/welcome/route.ts', 'utf8');
const authRoutes = readFileSync('src/routes.ts', 'utf8');
assert.match(websiteWelcomeRoute, /Location: '\/library'/);
assert.doesNotMatch(websiteWelcomeRoute, /intent=connect/);
assert.match(websiteWelcomeRoute, /history\.replaceState\(\{\},'', '\/welcome'\)/);
assert.match(authRoutes, /requestedIntent === 'library'/);
assert.doesNotMatch(authRoutes, /requestedIntent === 'connect'|wantsFreshConnection|account\/rotate-key/);
assert.match(authRoutes, /createOAuthState\(clientSecret/);
assert.doesNotMatch(authRoutes, /await kv\.put\(\s*`oauth:\$\{state\}`/);
assert.doesNotMatch(authRoutes, /needsConnection \? await createAccountConnectCode|welcomeHandoffUrl\([^\n]*connectionCode/);
assert.match(authRoutes, /await kv\.delete\(`welcome:\$\{code\}`\)/, 'welcome handoff must remain single-use');

console.log('welcome contract: no connection decision, invite, and quiet Library reload are preserved');
