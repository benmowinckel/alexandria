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
assert.match(tokenStore, /60 \* 60 \* 1000/);
assert.doesNotMatch(tokenStore, /api_key TEXT|apiKey/);

const routes = readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
const browserStart = routes.indexOf("app.post('/account/connect/browser'");
const browserEnd = routes.indexOf('// Welcome page peek', browserStart);
const browserHandoff = routes.slice(browserStart, browserEnd);
assert.ok(browserStart > 0 && browserEnd > browserStart);
assert.ok(browserHandoff.indexOf('findByLibrarySessionToken') < browserHandoff.indexOf('createAccountConnectCode'));
assert.ok(browserHandoff.indexOf('resolveMembership') < browserHandoff.indexOf('createAccountConnectCode'));
assert.match(browserHandoff, /return c\.text\(connectionCode\)/);
assert.doesNotMatch(browserHandoff, /generateApiKey|api_key/);

const handoffStart = routes.indexOf("app.post('/account/connect/handoff'");
const handoffEnd = routes.indexOf("app.post('/account/connect/exchange'", handoffStart);
const handoff = routes.slice(handoffStart, handoffEnd);
assert.ok(handoffStart > 0 && handoffEnd > handoffStart);
assert.ok(handoff.indexOf('requireAuth') < handoff.indexOf('createAccountConnectCode'));
assert.ok(handoff.indexOf('resolveMembership') < handoff.indexOf('createAccountConnectCode'));
assert.match(handoff, /return c\.text\(connectionCode\)/);

const oauthStart = routes.indexOf("app.get('/auth/github/callback'");
const oauthEnd = routes.indexOf("app.get('/auth/session/exchange'", oauthStart);
const oauth = routes.slice(oauthStart, oauthEnd);
assert.doesNotMatch(oauth, /generateApiKey\(/, 'GitHub sign-in must not rotate the working key');
assert.match(oauth, /createAccountConnectCode/, 'the first member welcome must carry a one-use code');

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
assert.match(exchange, /connected: true,\s*use_existing_key: true,\s*}\);/);
assert.match(exchange, /connected: true,\s*api_key: apiKey,\s*}\);/);

const connector = readFileSync(new URL('../../factory/scripts/connect-account.sh', import.meta.url), 'utf8');
assert.doesNotMatch(connector, /ALEXANDRIA_SERVER/, 'a hostile environment must not redirect account credentials');
assert.doesNotMatch(connector, /\$SERVER\/alexandria|protocol_status|status_http/);
assert.doesNotMatch(connector, /j\.error|github_login/, 'remote prose and identity must never reach the agent');
assert.match(connector, /\^alex_\[a-f0-9\]\{32\}\$/);
assert.match(connector, /Object\.keys\(j\)\.sort\(\)\.join/);
assert.match(connector, /--max-filesize 4096/);
assert.match(routes, /app\.on\('HEAD', '\/account\/connect\/current'/);

const protocol = readFileSync(new URL('../src/protocol.ts', import.meta.url), 'utf8');
assert.match(protocol, /app\.get\('\/files'/);
assert.match(protocol, /app\.get\('\/file\/:name'/);
assert.match(protocol, /protocol_file_owner_verified/);

const handoffScript = readFileSync(new URL('../../factory/scripts/create-account-handoff.sh', import.meta.url), 'utf8');
assert.match(handoffScript, /\/account\/connect\/handoff/);
assert.match(handoffScript, /Authorization: Bearer \$API_KEY/);
assert.match(handoffScript, /\^alex_connect_\[a-f0-9\]\{48\}\$/);
assert.doesNotMatch(handoffScript, /ALEXANDRIA_SERVER|SERVER_URL/, 'a hostile environment must not redirect the account key');

console.log('account connect server contract: ok');
