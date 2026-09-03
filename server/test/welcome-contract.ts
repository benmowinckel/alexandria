import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callbackPageHtml } from '../src/templates.js';

function main(html: string): string {
  const match = html.match(/<main class="wrap">([\s\S]*?)<\/main>/);
  assert.ok(match, 'welcome page main content missing');
  return match[1];
}

const code = `alex_connect_${'0'.repeat(48)}`;
const firstJoin = main(await callbackPageHtml(false, 'new-author', 1, 0, code));
assert.match(firstJoin, /invite people to alexandria/);
assert.match(firstJoin, /connect your loop/);
assert.match(firstJoin, /copy for your computer agent/);
assert.doesNotMatch(firstJoin, /href="https:\/\/alexandria-library\.com\/connect"/);

const fullFirstJoin = await callbackPageHtml(false, 'new-author', 1, 0, code);
assert.match(fullFirstJoin, new RegExp(code));
assert.match(fullFirstJoin, /i think you’d like this/);
assert.doesNotMatch(fullFirstJoin, /i’m using alexandria|join me/);
assert.doesNotMatch(fullFirstJoin, /factory\/connect\.md|Do nothing until I say `connect`|your agent will inspect it first/);

const returning = main(await callbackPageHtml(true, 'returning-author'));
assert.match(returning, /invite people to alexandria/);
assert.match(returning, /open your library/);

const websiteWelcomeRoute = readFileSync('../app/welcome/route.ts', 'utf8');
const authRoutes = readFileSync('src/routes.ts', 'utf8');
assert.match(websiteWelcomeRoute, /Location: '\/library'/);
assert.doesNotMatch(websiteWelcomeRoute, /intent=connect/);
assert.match(websiteWelcomeRoute, /history\.replaceState\(\{\},'', '\/welcome'\)/);
assert.match(authRoutes, /requestedIntent === 'library'/);
assert.doesNotMatch(authRoutes, /requestedIntent === 'connect'|wantsFreshConnection|account\/rotate-key/);
assert.match(authRoutes, /createOAuthState\(clientSecret/);
assert.doesNotMatch(authRoutes, /await kv\.put\(\s*`oauth:\$\{state\}`/);
assert.match(authRoutes, /needsConnection[\s\S]*createAccountConnectCode/);
assert.match(authRoutes, /welcomeHandoffUrl\([\s\S]*connectionCode/);
assert.match(authRoutes, /await kv\.delete\(`welcome:\$\{code\}`\)/, 'welcome handoff must remain single-use');

const connectPage = readFileSync('../app/connect/page.tsx', 'utf8');
const connectClient = readFileSync('../app/connect/ConnectClient.tsx', 'utf8');
const connectProxy = readFileSync('../app/api/account/connect/route.ts', 'utf8');
assert.match(connectPage, /librarySignInUrl\('\/connect'\)/);
assert.match(connectPage, /membership_active/);
assert.match(connectClient, /\/api\/account\/connect/);
assert.match(connectClient, /the code lasts one hour/);
assert.doesNotMatch(connectClient, /<textarea|setError\(text/);
assert.match(connectProxy, /\/account\/connect\/browser/);
assert.match(connectProxy, /readBoundedText\(upstream, 128\)/);
assert.match(connectProxy, /AbortSignal\.timeout\(10_000\)/);
assert.doesNotMatch(connectProxy, /upstream\.text\(\)/);
assert.doesNotMatch(connectPage + connectClient + connectProxy, /alex_[a-f0-9]{32}/);

console.log('welcome contract: signed-in connection route, invite, and quiet Library reload are preserved');
