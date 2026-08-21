import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAccountConnectCode } from '../src/account-connect.js';

const code = `alex_connect_${'0'.repeat(48)}`;
assert.equal(isAccountConnectCode(code), true);
assert.equal(isAccountConnectCode(`alex_connect_${'0'.repeat(47)}`), false);
assert.equal(isAccountConnectCode(`alex_${'0'.repeat(32)}`), false);

const tokenStore = readFileSync(new URL('../src/account-connect.ts', import.meta.url), 'utf8');
assert.match(tokenStore, /DELETE FROM account_connect_codes[\s\S]*RETURNING account_key/);
assert.match(tokenStore, /hashApiKey\(code\)/);
assert.doesNotMatch(tokenStore, /api_key TEXT|apiKey/);

const routes = readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
const handoffStart = routes.indexOf("app.post('/account/connect/handoff'");
const handoffEnd = routes.indexOf("app.post('/account/connect/exchange'", handoffStart);
const handoff = routes.slice(handoffStart, handoffEnd);
assert.ok(handoffStart > 0 && handoffEnd > handoffStart);
assert.ok(handoff.indexOf('requireAuth') < handoff.indexOf('createAccountConnectCode'));
assert.ok(handoff.indexOf('resolveMembership') < handoff.indexOf('createAccountConnectCode'));
assert.match(handoff, /accountConnectPrompt\(connectionCode\)/);

const oauthStart = routes.indexOf("app.get('/auth/github/callback'");
const oauthEnd = routes.indexOf("app.post('/auth/logout'", oauthStart);
const oauth = routes.slice(oauthStart, oauthEnd);
assert.doesNotMatch(oauth, /generateApiKey\(/, 'GitHub sign-in must not rotate the working key');
assert.match(oauth, /createAccountConnectCode/);

const exchangeStart = routes.indexOf("app.post('/account/connect/exchange'");
const exchangeEnd = routes.indexOf('// --- Account management', exchangeStart);
const exchange = routes.slice(exchangeStart, exchangeEnd);
assert.ok(exchangeStart > 0 && exchangeEnd > exchangeStart);
assert.ok(exchange.indexOf('resolveMembership') < exchange.indexOf('consumeAccountConnectCode'));
assert.ok(exchange.indexOf('consumeAccountConnectCode') < exchange.indexOf('generateApiKey'));
assert.match(exchange, /connected_at/);
assert.doesNotMatch(exchange, /installed_at/);
assert.match(exchange, /api_key_hashes: apiKeyHashes/);
assert.doesNotMatch(exchange, /setAuthIndex\(apiKeyHash, accountKey, previousHash\)/);

const connector = readFileSync(new URL('../../factory/scripts/connect-account.sh', import.meta.url), 'utf8');
assert.doesNotMatch(connector, /ALEXANDRIA_SERVER/, 'a hostile environment must not redirect account credentials');
assert.ok(
  connector.indexOf('mv "$new_key" "$KEY_FILE"') < connector.indexOf('status_http=$(curl'),
  'the only returned key must be persisted before a later network check can fail',
);

const handoffScript = readFileSync(new URL('../../factory/scripts/create-account-handoff.sh', import.meta.url), 'utf8');
assert.match(handoffScript, /\/account\/connect\/handoff/);
assert.match(handoffScript, /Authorization: Bearer \$API_KEY/);
assert.doesNotMatch(handoffScript, /ALEXANDRIA_SERVER|SERVER_URL/, 'a hostile environment must not redirect the account key');

console.log('account connect server contract: ok');
