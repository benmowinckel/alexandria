/** Independent publishers ask only for a current permission decision. Content
 * stays on the publisher's host; membership never substitutes for an exact
 * invite/paid grant. No model call, R2 read, or content proxy belongs here. */
import { type Hono } from 'hono';
import { type Account } from './auth.js';
import { getAccountByLogin } from './accounts.js';
import { resolveMembership } from './billing.js';
import { generateId, getDB } from './db.js';
import { authorizeFileRead } from './file-access.js';
import { normalizeLibraryScope, visibilityForScope } from './library-scopes.js';
import { grantState, hasGrantForScope } from './grants.js';

export function registerConnectorAccess(app: Hono): void {
  app.get('/connect/access/:author', async c => {
    c.header('Cache-Control', 'private, no-store');
    const author = c.req.param('author');
    const rawScope = c.req.query('scope');
    const scope = normalizeLibraryScope(rawScope, 'public');
    if (!rawScope || !scope || rawScope !== scope || !/^[a-z0-9][a-z0-9-]{0,38}$/.test(author)) return c.json({ error: 'An exact Author and scope are required.' }, 400);
    const publisher = await getAccountByLogin(author);
    if (!publisher) return c.json({ error: 'Author not found.' }, 404);
    const reader = c.get('connectorViewer') as Account | undefined;
    const visibility = visibilityForScope(scope)!;
    // Membership buys the operated access service. Exact invite/purchase grants
    // remain separate and survive cancellation as records, but cannot keep the
    // shared service running after the publisher's membership expires. Normal
    // delegated requests already checked this in the visitor middleware.
    if (reader && visibility !== 'public' && c.get('connectorPublisherId') !== String(publisher.account.github_id)) {
      const connection = await resolveMembership(publisher.account);
      if (!connection.available) return c.json({ allowed: false, author, scope, reason: 'connection_unavailable' }, 503);
      if (!connection.active) return c.json({ allowed: false, author, scope, reason: 'connection_inactive' }, 402);
    }
    const membership = reader && visibility === 'authors' ? await resolveMembership(reader) : null;
    if (membership?.available === false) return c.json({ allowed: false, author, scope, reason: 'membership_unavailable' }, 503);
    const invite = c.req.query('invite')?.trim() || c.req.query('token')?.trim();
    if (reader && visibility === 'invite' && invite) {
      if (invite.length > 256) return c.json({ allowed: false, author, scope, reason: 'invalid_invite' }, 400);
      // The same account-bound grant used by hosted reads. A code is a way to
      // establish an exact grant, never a bearer substitute for reader identity
      // or a way to undo an owner's revocation. Keep validation and insertion
      // atomic so code revocation cannot race a lookup followed by an insert.
      if (await grantState(author, reader.github_id, scope) === 'none') {
        await getDB().prepare(
          `INSERT INTO access_grants
             (id, author_id, account_github_id, scope, source_type, source_id, code_id, created_at)
           SELECT ?, author_id, ?, scope, 'invite', id, id, ? FROM access_codes
             WHERE author_id = ? AND scope = ? AND code = ? AND revoked_at IS NULL
           ON CONFLICT(author_id, account_github_id, scope) DO NOTHING`,
        ).bind(generateId(), String(reader.github_id), new Date().toISOString(), author, scope, invite).run();
      }
    }
    // Re-read the stored grant; attempting redemption does not itself confer access.
    const granted = !!reader && (visibility === 'invite' || visibility === 'paid') && await hasGrantForScope(author, reader.github_id, scope);
    const decision = authorizeFileRead({
      visibility,
      authorGithubId: publisher.account.github_id,
      accessorGithubId: reader?.github_id ?? null,
      context: { allowOwner: false, subscriberValid: membership?.active === true, inviteValid: granted, purchaseValid: granted },
    });
    return c.json({ allowed: decision.allowed, author, scope, reason: decision.reason }, decision.allowed ? 200 : decision.status);
  });
}
