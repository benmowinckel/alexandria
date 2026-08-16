import assert from 'node:assert/strict';
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

console.log('welcome contract: new Authors can connect and invite; returning Authors can invite');
