import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callbackPageHtml } from '../src/templates.js';

function main(html: string): string {
  const match = html.match(/<main class="wrap">([\s\S]*?)<\/main>/);
  assert.ok(match, 'welcome page main content missing');
  return match[1];
}

const connectionCode = 'alex_connect_000000000000000000000000000000000000000000000000';
const firstJoin = main(await callbackPageHtml(connectionCode, 'new-author'));
assert.match(firstJoin, /<span class="cta-label">connect your existing loop<\/span>/);
assert.match(firstJoin, /<span class="cta-why">paste this into your computer agent<\/span>/);
assert.match(firstJoin, /invite people to alexandria/);
assert.ok(firstJoin.indexOf('connect your existing loop') < firstJoin.indexOf('invite people'), 'connection must be the first joined action');

const fullFirstJoin = await callbackPageHtml(connectionCode, 'new-author');
assert.match(fullFirstJoin, /factory\/connect\.md/);
assert.match(fullFirstJoin, /Do nothing until I say `connect`/);
assert.match(fullFirstJoin, /your agent will inspect it first/);
assert.doesNotMatch(fullFirstJoin, /alex_[a-f0-9]{32}/);
assert.doesNotMatch(fullFirstJoin, /Help me set up the full private, local version/);

const returning = main(await callbackPageHtml('', 'returning-author'));
assert.match(returning, /invite people to alexandria/);
assert.doesNotMatch(returning, /<span class="cta-label">connect your existing loop<\/span>/);

const websiteWelcomeRoute = readFileSync('../app/welcome/route.ts', 'utf8');
const authRoutes = readFileSync('src/routes.ts', 'utf8');
assert.match(websiteWelcomeRoute, /\/auth\/github\?intent=connect/);
assert.match(websiteWelcomeRoute, /history\.replaceState\(\{\},'', '\/welcome'\)/);
assert.match(authRoutes, /requestedIntent === 'library' \|\| requestedIntent === 'connect'/);
assert.match(authRoutes, /needsConnection \|\| wantsFreshConnection/);
assert.match(authRoutes, /await kv\.delete\(`welcome:\$\{code\}`\)/, 'welcome handoff must remain single-use');

console.log('welcome contract: connect, invite, and reload recovery are preserved');
