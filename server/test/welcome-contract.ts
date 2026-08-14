import assert from 'node:assert/strict';
import { callbackPageHtml } from '../src/templates.js';

function main(html: string): string {
  const match = html.match(/<main class="wrap">([\s\S]*?)<\/main>/);
  assert.ok(match, 'welcome page main content missing');
  return match[1];
}

const firstJoin = main(await callbackPageHtml('TEST-KEY', 'new-author'));
assert.match(firstJoin, /connect your AI to alexandria/);
assert.match(firstJoin, /invite people to alexandria/);

const returning = main(await callbackPageHtml('', 'returning-author'));
assert.match(returning, /invite people to alexandria/);
assert.doesNotMatch(returning, /connect your AI to alexandria/);

console.log('welcome contract: new Authors can connect and invite; returning Authors can invite');
