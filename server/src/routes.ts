/** Alexandria HTTP routes. */

import { randomBytes } from 'crypto';
import type { Hono } from 'hono';
import { logEvent } from './analytics.js';
import { countActiveKin, createCheckoutSession, createPortalSession, getStripe, recalculateKinPricing, resolveActiveSubscription } from './billing.js';
import { authErrorHtml, callbackPageHtml } from './templates.js';
import { getDB, getR2 } from './db.js';
import { loadAccounts, loadAccount, saveAccount, setAuthIndex, deleteAccount, getKV, setEmailTokenIndex, getEmailTokenIndex, getAuthIndex } from './kv.js';
import { hashApiKey, generateToken } from './crypto.js';
import { Account, AccountStore, extractApiKey, extractLibrarySessionToken, findByApiKey, findByLibrarySessionToken, requireAuth } from './auth.js';
import { generateApiKey, getAccounts, getAccountByLogin, requireAdmin } from './accounts.js';
import { sendEmail, sendEmailsBatched, sendWelcomeEmail, sendInstallNudge, FOUNDER_EMAIL } from './email.js';
import { runHealthDigest, runWeekOneCheckIns, runInstallNudges } from './cron.js';
import { publishFeedback } from './marketplace.js';
import { handleGithubPushWebhook } from './marketplace-catalog.js';

/**
 * KV-backed rate limit for destructive/expensive admin endpoints.
 * Global (not per-account) since admin is single-user today; the
 * threat model is "admin key leaks, attacker hammers send-email or
 * delete-data endpoints." Cheap reads (GET /admin/...) and factory
 * markers are unrestricted — they're cheap and called frequently
 * by the scheduled autoloop.
 * Returns true if the request should be blocked.
 */
async function checkAdminRateLimit(endpoint: string, limit = 10, windowSec = 60): Promise<boolean> {
  try {
    const kv = getKV();
    const key = `rate:admin:${endpoint}`;
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= limit) return true;
    await kv.put(key, String(count + 1), { expirationTtl: windowSec });
    return false;
  } catch {
    return false; // don't block on KV failure
  }
}

/** Stripe cancel + KV + D1 + R2 — shared by DELETE /account and admin removal.
 *  Marketplace repo signals/feedback are unchanged (same as self-delete). */
async function purgeAuthorAccount(account: Account, storeKey: string | null, authKeyHash: string | null) {
  if (account.subscription_id) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(account.subscription_id);
    } catch (e) {
      console.error('[account] Stripe subscription cancel failed:', e);
    }
  }
  if (storeKey && authKeyHash) await deleteAccount(storeKey, authKeyHash);
  else if (storeKey) await getKV().delete(`account:${storeKey}`);

  try {
    const db = getDB();
    const login = account.github_login;
    const email = account.email;
    await db.batch([
      db.prepare('DELETE FROM waitlist WHERE email = ?').bind(email),
      db.prepare('DELETE FROM referrals WHERE author_id = ? OR referred_github_login = ?').bind(login, login),
      db.prepare('DELETE FROM access_log WHERE accessor_id = ? OR author_id = ?').bind(login, login),
      db.prepare('DELETE FROM billing_tab WHERE accessor_id = ? OR author_id = ?').bind(login, login),
      db.prepare('DELETE FROM quiz_results WHERE quiz_id IN (SELECT id FROM quizzes WHERE author_id = ?)').bind(login),
      db.prepare('DELETE FROM quizzes WHERE author_id = ?').bind(login),
      db.prepare('DELETE FROM shadows WHERE author_id = ?').bind(login),
      db.prepare('DELETE FROM pulses WHERE author_id = ?').bind(login),
      db.prepare('DELETE FROM works WHERE author_id = ?').bind(login),
      db.prepare('DELETE FROM shadow_tokens WHERE author_id = ?').bind(login),
      db.prepare('DELETE FROM promo_codes WHERE author_id = ?').bind(login),
      db.prepare('DELETE FROM access_codes WHERE author_id = ?').bind(login),
      db.prepare('DELETE FROM authors WHERE id = ?').bind(login),
    ]);
  } catch (e) {
    console.error('[account] D1 cleanup failed:', e);
  }

  try {
    const r2 = getR2();
    const login = account.github_login;
    for (const prefix of [`shadows/${login}/`, `pulses/${login}/`, `quizzes/${login}/`, `works/${login}/`]) {
      let cursor: string | undefined;
      do {
        const listed = await r2.list({ prefix, cursor });
        await Promise.all(listed.objects.map(obj => r2.delete(obj.key)));
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    }
  } catch (e) {
    console.error('[account] R2 cleanup failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Company routes — registered on Hono app
// ---------------------------------------------------------------------------

// Cookie scoped to the registrable domain of the request host — strips
// leading "api." or "www." to land on the apex. Works for any canonical
// the Worker is bound to without code changes.
function deriveCookieDomain(reqUrl: string): string {
  try {
    const apex = new URL(reqUrl).hostname.replace(/^(api|www)\./, '');
    return apex ? `; Domain=.${apex}` : '';
  } catch {
    return '';
  }
}

export function registerRoutes(app: Hono) {
  // Per-request getters. Module-scope `const X = process.env.X || ...`
  // would evaluate before initEnv() populates process.env, silently locking
  // in the fallback string instead of the wrangler.toml [vars] value.
  const getServerUrl = () => process.env.SERVER_URL || 'https://api.alexandria-library.com';
  const getWebsiteUrl = () => process.env.WEBSITE_URL || 'https://alexandria-library.com';

  const sanitizeNextPath = (raw: string | undefined): string => {
    if (!raw) return '';
    try {
      const value = decodeURIComponent(raw).trim();
      if (!value.startsWith('/')) return '';
      if (value.startsWith('//')) return '';
      return value.startsWith('/library/') ? value : '';
    } catch {
      return '';
    }
  };

  // --- Protocol handshake ---

  app.get('/alexandria', async (c) => {
    const key = extractApiKey(c);
    const suppliedAuth = Boolean(c.req.header('authorization') || c.req.query('key'));

    if (!key && suppliedAuth) {
      return c.json({ connected: false, error: 'Invalid API key' }, 401);
    }

    // Unauthenticated: return protocol spec only
    if (!key) {
      return c.json({
        protocol: 'alexandria',
        version: '1.0',
        constants: {
          account: 'Payment relationship that governs the other two',
          file: 'At least one public file on the server, edited monthly',
          call: 'Communication — machine calls server, server responds',
        },
        endpoints: {
          handshake: '/alexandria',
          file: '/file/{name}',
          call: '/call',
          library: '/library/{id}',
          marketplace: '/marketplace',
        },
        marketplace: {
          list: {
            path: '/marketplace',
            response: '{ modules: [{ id, name, description, author_github_login, kind, status }], total, next_cursor }',
            filters: { kind: 'skill|canon|hook|script|template|system|module', author: 'github_login' },
            cache: 'public 5 min; KV-backed 24h with github webhook invalidation on push',
            note: 'module bodies live at raw.githubusercontent.com — fetch source from github',
          },
          usage_history: {
            path: '/marketplace/{module_id}',
            auth: 'required',
            note: 'private Marketplace Signal — usage timestamps + per-call text',
          },
        },
        factory: 'https://github.com/mowinckelb/alexandria/tree/main/factory',
        methodology: 'https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/canon/methodology.md',
      });
    }

    // Authenticated: return full status
    const account = await findByApiKey(key);
    if (!account) {
      return c.json({ connected: false, error: 'Invalid API key' }, 401);
    }

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    // File obligation — ground truth from protocol_files. Scoped to
    // authors-visible files (visibility in {authors, public}); paid/invite
    // files are gated artifacts and don't satisfy the social-tier obligation
    // (the point of the file is that other Authors can see it).
    let fileLastEdit: string | null = null;
    let fileStatus: 'ok' | 'stale' | 'missing' = 'missing';
    try {
      const db = (globalThis as any).__d1 as D1Database | undefined;
      if (db) {
        const file = await db.prepare(
          `SELECT MAX(updated_at) as last_edit FROM protocol_files
             WHERE account_id = ? AND visibility IN ('authors', 'public')`
        ).bind(String(account.github_id)).first<{ last_edit: string | null }>();
        if (file?.last_edit) {
          fileLastEdit = file.last_edit;
          fileStatus = (Date.now() - new Date(file.last_edit).getTime()) < thirtyDays ? 'ok' : 'stale';
        }
      }
    } catch { /* D1 unavailable — degrade gracefully */ }

    const fileDue = fileLastEdit
      ? new Date(new Date(fileLastEdit).getTime() + thirtyDays).toISOString()
      : new Date(new Date(account.created_at).getTime() + thirtyDays).toISOString();

    // Call obligation — ground truth from protocol_calls
    let callLast: string | null = null;
    try {
      const db = (globalThis as any).__d1 as D1Database | undefined;
      if (db) {
        const lastCall = await db.prepare(
          'SELECT MAX(time) as last_time FROM protocol_calls WHERE account_id = ?'
        ).bind(String(account.github_id)).first<{ last_time: string | null }>();
        callLast = lastCall?.last_time || null;
      }
    } catch {}
    const callStatus: 'ok' | 'stale' = callLast && (Date.now() - new Date(callLast).getTime()) < thirtyDays ? 'ok' : 'stale';
    const callDue = callLast
      ? new Date(new Date(callLast).getTime() + thirtyDays).toISOString()
      : new Date(new Date(account.created_at).getTime() + thirtyDays).toISOString();

    // Kin compliance — all three obligations met (account + file + call) in the last 30 days
    let kinData = { count: 0, compliant: 0 };
    try {
      kinData = await countActiveKin(account.github_login);
    } catch { /* D1 unavailable — degrade gracefully */ }
    const kinNeeded = parseInt(process.env.KIN_THRESHOLD || '5', 10);

    return c.json({
      connected: true,
      protocol: 'alexandria',
      version: '1.0',
      account: {
        status: account.subscription_status || 'none',
        created: account.created_at,
        installed: account.installed_at || null,
      },
      obligations: {
        file_due: fileDue,
        file_status: fileStatus,
        file_last_edit: fileLastEdit,
        call_due: callDue,
        call_status: callStatus,
        call_last: callLast,
      },
      kin: {
        count: kinData.count,
        compliant: kinData.compliant,
        needed: kinNeeded,
        status: kinData.compliant >= kinNeeded
          ? 'free'
          : `${Math.max(0, kinNeeded - kinData.compliant)} more needed`,
      },
      factory: 'https://github.com/mowinckelb/alexandria/tree/main/factory',
      endpoints: {
        file: '/file/{name}',
        call: '/call',
        library: '/library/{id}',
        marketplace: '/marketplace',
      },
    });
  });

  // --- Kin code validation (public, called by /signup before OAuth) ---

  app.get('/check-kin', async (c) => {
    const code = (c.req.query('code') || '').trim();
    if (!code) return c.json({ valid: false }, 400);
    const valid = (await getAccountByLogin(code)) !== null;
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ valid });
  });

  // --- GitHub OAuth ---

  app.get('/auth/github', async (c) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return c.text('GitHub OAuth not configured', 500);
    }

    const state = randomBytes(16).toString('hex');
    const kv = getKV();
    // Preserve referral params (and optional post-login redirect) through OAuth round-trip
    const ref = c.req.query('ref') || '';
    const refSource = c.req.query('ref_source') || '';
    const refId = c.req.query('ref_id') || '';
    const next = sanitizeNextPath(c.req.query('next'));
    const intent = c.req.query('intent') === 'library' ? 'library' : '';
    await kv.put(
      `oauth:${state}`,
      JSON.stringify({ valid: true, ref, ref_source: refSource, ref_id: refId, next, intent }),
      { expirationTtl: 600 },
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${getServerUrl()}/auth/github/callback`,
      // Minimal scopes. Author-level signing verification uses GitHub's
      // PUBLIC ssh_signing_keys endpoint (no scope required). setup.sh uses
      // the user's own `gh` CLI to register their signing key (gh CLI has
      // independent auth scopes — `gh auth refresh -s admin:ssh_signing_key`
      // if missing). Don't add scopes here speculatively.
      scope: 'read:user user:email',
      state,
    });

    return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  app.get('/auth/github/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');

    const kv = getKV();
    const stateRaw = state ? await kv.get(`oauth:${state}`) : null;
    if (!stateRaw) {
      return c.html(authErrorHtml('this sign-in link has expired or is no longer valid.'), 400);
    }
    // Parse state — supports both legacy '1' and new JSON format
    let stateData: { ref?: string; ref_source?: string; ref_id?: string; next?: string; intent?: string } = {};
    try { stateData = JSON.parse(stateRaw); } catch { /* legacy format */ }
    await kv.delete(`oauth:${state}`);

    try {
      // Exchange code for GitHub access token
      const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      // Safe JSON parse helper
      const safeJson = async (resp: Response, label: string) => {
        const text = await resp.text();
        try { return JSON.parse(text); }
        catch { throw new Error(`${label} returned non-JSON (${resp.status}): ${text.slice(0, 300)}`); }
      };

      const tokenData = await safeJson(tokenResp, 'Token exchange') as { access_token?: string; error?: string };

      if (!tokenData.access_token) {
        console.error('[oauth] Token exchange returned no access_token:', tokenData.error);
        return c.html(authErrorHtml('github didn\u2019t return a token. try signing in again.'), 400);
      }

      // Fetch user profile
      const userResp = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'Alexandria' },
      });
      const user = await safeJson(userResp, 'User profile') as {
        id: number;
        login: string;
        email?: string;
        name?: string | null;
        blog?: string | null;
        location?: string | null;
        html_url?: string | null;
      };

      // Fetch email if not public
      let email = user.email || '';
      if (!email) {
        const emailResp = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'Alexandria' },
        });
        const emails = await safeJson(emailResp, 'User emails') as Array<{ email: string; primary: boolean }>;
        const primary = emails.find(e => e.primary);
        email = primary?.email || emails[0]?.email || '';
      }

      // Create or update account — direct lookup by github_id key. O(1) for the common case.
      // Fall back to login-indexed lookup for legacy accounts keyed by login (pre-github_id migration).
      const key = `github_${user.id}`;
      let existing = await loadAccount(key) as Account | null;
      if (!existing) {
        const legacy = await getAccountByLogin(user.login);
        if (legacy) existing = legacy.account;
      }

      // Key is shown once on the callback page, then only the hash is stored.
      // New accounts AND returning uninstalled users get a fresh key.
      const isNewAccount = !existing?.api_key_hash;
      const needsKey = isNewAccount || !existing?.installed_at;
      const apiKey = needsKey ? generateApiKey() : '';
      const apiKeyHash = needsKey ? hashApiKey(apiKey) : existing!.api_key_hash;
      const emailToken = existing?.email_token || generateToken();

      const updatedAccount = {
        ...existing,
        github_id: user.id,
        github_login: user.login,
        github_name: user.name || null,
        github_url: user.html_url || `https://github.com/${user.login}`,
        website: user.blog || user.html_url || `https://github.com/${user.login}`,
        location: user.location || null,
        email,
        api_key_hash: apiKeyHash,
        email_token: emailToken,
        created_at: existing?.created_at || new Date().toISOString(),
        last_session: new Date().toISOString(),
      };
      delete updatedAccount.api_key;
      await saveAccount(key, updatedAccount as unknown as Record<string, unknown>);
      if (needsKey) await setAuthIndex(apiKeyHash, key);
      await setEmailTokenIndex(emailToken, key);

      // Browser Library session (for human navigation on /library/*).
      const librarySessionToken = randomBytes(24).toString('hex');
      await kv.put(`library:session:${librarySessionToken}`, JSON.stringify({
        account_key: key,
        github_login: user.login,
      }), { expirationTtl: 30 * 24 * 60 * 60 });
      c.header('Set-Cookie', `alex_library_session=${librarySessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${deriveCookieDomain(c.req.url)}`);

      // Company Library profile. This mirrors GitHub account metadata for
      // discovery; protocol file content still arrives only through /file.
      try {
        const now = new Date().toISOString();
        const githubUrl = user.html_url || `https://github.com/${user.login}`;
        const website = user.blog || githubUrl;
        await getDB().prepare(
          `INSERT INTO authors (id, display_name, website, location, social_links, settings, published_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '{}', ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             display_name = COALESCE(authors.display_name, excluded.display_name),
             website = COALESCE(authors.website, excluded.website),
             location = COALESCE(authors.location, excluded.location),
             social_links = CASE
               WHEN authors.social_links IS NULL OR authors.social_links = '[]' THEN excluded.social_links
               ELSE authors.social_links
             END,
             updated_at = excluded.updated_at`
        ).bind(
          user.login,
          user.name || user.login,
          website,
          user.location || null,
          JSON.stringify([{ platform: 'github', url: githubUrl }]),
          now,
          now
        ).run();
      } catch (e) {
        console.error('[routes] Library profile upsert failed:', e);
      }

      logEvent('prosumer_signup', {
        github_login: user.login,
        returning: isNewAccount ? 'false' : 'true',
      });

      // Track referral — from OAuth state (round-tripped) or query params (direct)
      const ref = stateData.ref || c.req.query('ref');
      const refSource = stateData.ref_source || c.req.query('ref_source');
      const refId = stateData.ref_id || c.req.query('ref_id');
      if (ref && isNewAccount && ref.toLowerCase() !== user.login.toLowerCase()) {
        // Validate ref maps to an existing github_login before inserting — drop dangling rows.
        // Self-referral (ref === own login) is rejected above so users can't credit themselves.
        const refResult = await getAccountByLogin(ref);
        if (!refResult) {
          logEvent('library_signup_referral_invalid', { attempted_ref: ref, source: refSource || 'direct', referred: user.login });
        } else {
          try {
            const db = getDB();
            await db.prepare(
              `INSERT INTO referrals (author_id, source_type, source_id, referred_github_login, created_at) VALUES (?, ?, ?, ?, ?)`
            ).bind(refResult.account.github_login, refSource || 'direct', refId || null, user.login, new Date().toISOString()).run();
            logEvent('library_signup_referral', { author: refResult.account.github_login, source: refSource || 'direct', referred: user.login });
            // New referral may push the kin sender across the threshold — recalc their pricing now
            // so the next invoice (typically days away) reflects the change instead of waiting a full cycle.
            // Fire-and-forget via waitUntil so the OAuth response isn't blocked on Stripe API.
            const refLogin = refResult.account.github_login;
            c.executionCtx.waitUntil(
              recalculateKinPricing(refLogin).catch(e => console.error('[routes] Kin pricing recalc after referral failed:', e))
            );
          } catch (e) {
            console.error('[routes] Referral tracking failed:', e);
          }
        }
      } else if (ref && isNewAccount) {
        logEvent('library_signup_referral_self', { attempted_ref: ref, referred: user.login });
      }

      // Welcome email — no API key, just links to /signup
      if (email && isNewAccount) {
        await sendWelcomeEmail(email, emailToken);
      }

      // Skip Stripe if user already has payment info
      if (updatedAccount.stripe_customer_id) {
        if (stateData.intent === 'library' && stateData.next) {
          return c.redirect(`${getWebsiteUrl()}${stateData.next}`);
        }
        return c.html(await callbackPageHtml(apiKey, user.login));
      }

      // Redirect to Stripe Checkout. For pure Library login intent we skip billing redirect.
      if (stateData.intent !== 'library' && process.env.STRIPE_SECRET_KEY && email) {
        try {
          const checkoutUrl = await createCheckoutSession({
            email,
            githubLogin: user.login,
            stripeCustomerId: updatedAccount.stripe_customer_id,
          });
          if (checkoutUrl) {
            return c.redirect(checkoutUrl);
          }
        } catch (err) {
          console.error('Stripe checkout redirect failed, falling back:', err);
        }
      }

      if (stateData.intent === 'library' && stateData.next) {
        return c.redirect(`${getWebsiteUrl()}${stateData.next}`);
      }
      return c.html(await callbackPageHtml(apiKey, user.login));
    } catch (err: any) {
      console.error('GitHub callback error:', err);
      return c.html(authErrorHtml('something broke signing you in. please try again.'), 500);
    }
  });

  // --- Account management (redirects to Stripe portal) ---

  app.get('/account', async (c) => {
    const auth = await requireAuth(c);
    if (!auth) return c.text('Unauthorized', 401);
    const { account, key } = auth;
    if (!account.stripe_customer_id) {
      return c.text('No billing account found. Complete signup at https://alexandria-library.com/signup', 400);
    }
    try {
      const url = await createPortalSession(account.stripe_customer_id);
      return c.redirect(url);
    } catch (err) {
      // Stale customer ID (test→live transition leaves orphan IDs from
      // setup-mode checkouts). Clear the stale ID from the account record
      // so re-entry creates a fresh portal flow instead of looping the
      // same failing call. Defensive retry in createCheckoutSession then
      // creates a fresh live customer on next /signup.
      const e = err as { type?: string; code?: string };
      if (e?.type === 'StripeInvalidRequestError' && e?.code === 'resource_missing') {
        console.warn(`[account] stale stripe_customer_id ${account.stripe_customer_id} — clearing and redirecting`);
        try {
          const storeKey = await getAuthIndex(hashApiKey(key));
          if (storeKey) {
            const cleaned = { ...account } as Record<string, unknown>;
            delete cleaned.stripe_customer_id;
            delete cleaned.subscription_id;
            delete cleaned.subscription_status;
            await saveAccount(storeKey, cleaned);
          }
        } catch (clearErr) {
          console.error('[account] failed to clear stale customer:', clearErr);
        }
        return c.redirect(`${getWebsiteUrl()}/signup?billing=refresh`);
      }
      console.error('Portal error:', err);
      return c.text('Failed to create billing portal session.', 500);
    }
  });

  // --- Account deletion (GDPR-ready) ---

  app.delete('/account', async (c) => {
    const auth = await requireAuth(c);
    if (!auth) return c.json({ error: 'Unauthorized' }, 401);
    const { key, account } = auth;

    const keyHash = hashApiKey(key);
    let storeKey = await getAuthIndex(keyHash);
    if (!storeKey) {
      // Legacy fallback for accounts created before auth indexing.
      const accounts = await getAccounts();
      storeKey = Object.keys(accounts).find(k => accounts[k].api_key_hash === keyHash) || null;
    }

    await purgeAuthorAccount(account, storeKey, storeKey ? keyHash : null);

    logEvent('account_deleted', { github_login: account.github_login });
    return c.json({ ok: true, deleted: account.github_login });
  });

  // --- Subscription cancel / reactivate (save-screen) ---
  //
  // Cookie OR API-key auth — same surfaces as the website + CLI. The save-screen
  // lives on the website (cookie session); the CLI / scripts can hit these with
  // Authorization: Bearer alex_…. Cancellation always goes through here, never
  // straight to Stripe — the portal configuration has subscription_cancel
  // disabled so the only path to "I want to cancel" is this endpoint + its
  // save-screen UI. Reactivation flips cancel_at_period_end back off while the
  // subscription is still in the grace period (not yet truly canceled).
  //
  // Access_log telemetry: both events written as rows on access_log so cancel
  // rate becomes queryable, not a vibe. Event types: subscription_cancel +
  // subscription_reactivate.
  async function authorFromRequest(c: any): Promise<Account | null> {
    const key = extractApiKey(c);
    if (key) {
      const byKey = await findByApiKey(key);
      if (byKey) return byKey;
    }
    const token = extractLibrarySessionToken(c);
    if (token) {
      const bySession = await findByLibrarySessionToken(token);
      if (bySession) return bySession;
    }
    return null;
  }

  async function logSubscriptionEvent(
    event: 'subscription_cancel' | 'subscription_reactivate',
    authorId: string,
    meta: Record<string, string> = {},
  ): Promise<void> {
    try {
      const db = getDB();
      const metaJson = Object.keys(meta).length ? JSON.stringify(meta) : null;
      await db.prepare(
        `INSERT INTO access_log (event, author_id, accessor_id, artifact_id, tier, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(event, authorId, authorId, null, null, metaJson, new Date().toISOString()).run();
    } catch (e) {
      console.error(`[${event}] access_log insert failed:`, e);
    }
    // Also write to the KV event log so the analytics summary picks it up.
    logEvent(event, { github_login: authorId, ...meta });
  }

  app.post('/account/cancel', async (c) => {
    const account = await authorFromRequest(c);
    if (!account) return c.json({ error: 'Unauthorized' }, 401);

    // resolveActiveSubscription falls back to a Stripe email lookup when the
    // KV record is missing subscription_id (legacy accounts) and auto-heals.
    const sub = await resolveActiveSubscription(account);
    if (!sub) {
      return c.json({ ok: false, error: 'No active subscription' }, 400);
    }

    try {
      const stripe = getStripe();

      // Idempotent: subscription already canceling — return current cancel_at.
      if (sub.cancel_at_period_end) {
        return c.json({ ok: true, cancel_at: sub.cancel_at, idempotent: true });
      }

      const updated = await stripe.subscriptions.update(sub.subscriptionId, {
        cancel_at_period_end: true,
        cancellation_details: { comment: 'cancelled via website save-screen' },
      });

      const periodEnd = updated.cancel_at ?? updated.items?.data?.[0]?.current_period_end ?? null;
      const cancelAtIso = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

      await logSubscriptionEvent('subscription_cancel', account.github_login, {
        subscription_id: sub.subscriptionId,
        ...(cancelAtIso ? { cancel_at: cancelAtIso } : {}),
      });

      return c.json({ ok: true, cancel_at: cancelAtIso });
    } catch (err) {
      console.error('[account/cancel] Stripe update failed:', err);
      const message = err instanceof Error ? err.message : 'cancel_failed';
      return c.json({ ok: false, error: message }, 500);
    }
  });

  app.post('/account/reactivate', async (c) => {
    const account = await authorFromRequest(c);
    if (!account) return c.json({ error: 'Unauthorized' }, 401);

    const sub = await resolveActiveSubscription(account);
    if (!sub) {
      return c.json({ ok: false, error: 'No active subscription' }, 400);
    }

    try {
      const stripe = getStripe();

      // Idempotent: subscription already active and not scheduled for cancellation.
      if (!sub.cancel_at_period_end) {
        return c.json({ ok: true, idempotent: true });
      }

      await stripe.subscriptions.update(sub.subscriptionId, {
        cancel_at_period_end: false,
      });

      await logSubscriptionEvent('subscription_reactivate', account.github_login, {
        subscription_id: sub.subscriptionId,
      });

      return c.json({ ok: true });
    } catch (err) {
      console.error('[account/reactivate] Stripe update failed:', err);
      const message = err instanceof Error ? err.message : 'reactivate_failed';
      return c.json({ ok: false, error: message }, 500);
    }
  });

  // --- Cancel-screen feedback (the mirror loop) ---
  //
  // The /cancel save-screen has a free-text field for "what's missing /
  // what would make you stay." Submissions land here, get persisted in
  // access_log so the founder can query the structured feedback stream
  // (`SELECT meta FROM access_log WHERE event = 'cancel_feedback' ...`),
  // and trigger a notification email to FOUNDER_EMAIL. Mailto on the
  // page was retired in favour of this so the loop closes — Gmail keeps
  // a copy, D1 keeps a structured copy.
  app.post('/account/feedback', async (c) => {
    const account = await authorFromRequest(c);
    if (!account) return c.json({ error: 'Unauthorized' }, 401);

    let body: { message?: string } = {};
    try { body = await c.req.json() as { message?: string }; } catch {}
    const message = String(body.message || '').trim();
    if (!message) return c.json({ ok: false, error: 'empty message' }, 400);
    if (message.length > 10000) return c.json({ ok: false, error: 'message too long' }, 400);

    try {
      const db = getDB();
      await db.prepare(
        `INSERT INTO access_log (event, author_id, accessor_id, artifact_id, tier, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        'cancel_feedback',
        account.github_login,
        account.github_login,
        null,
        null,
        JSON.stringify({ message }),
        new Date().toISOString(),
      ).run();
    } catch (e) {
      console.error('[account/feedback] D1 insert failed:', e);
    }

    try {
      const fromName = account.github_name?.trim() || account.github_login;
      await sendEmail(
        FOUNDER_EMAIL,
        `cancel feedback from ${fromName}`,
        `${message}\n\n---\nfrom: ${fromName} (${account.email})\nsubscription: ${account.subscription_id || 'unknown'}`,
      );
    } catch (e) {
      console.error('[account/feedback] notification email failed:', e);
    }

    logEvent('cancel_feedback', { github_login: account.github_login });

    return c.json({ ok: true });
  });

  // --- Admin: remove another account (KV + D1 + R2; same footprint as DELETE /account) ---

  app.post('/admin/account/remove', async (c) => {
    const auth = await requireAdmin(c);
    if (!auth) return c.json({ error: 'Unauthorized' }, 403);
    if (await checkAdminRateLimit('account-remove', 5, 600)) return c.json({ error: 'Rate limited (5/10min)' }, 429);

    const body = await c.req.json().catch(() => ({}));
    const login = typeof body.login === 'string' ? body.login.trim() : '';
    const adminLogin = process.env.ADMIN_GITHUB_LOGIN || 'mowinckelb';
    if (!login || login.length > 39 || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(login)) {
      return c.json({ error: 'Invalid login' }, 400);
    }
    if (login === adminLogin) return c.json({ error: 'Cannot remove admin account' }, 400);

    const result = await getAccountByLogin(login);
    if (!result) return c.json({ error: 'Account not found' }, 404);

    const victim = result.account;
    const apiKeyHash = typeof victim.api_key_hash === 'string' ? victim.api_key_hash : null;
    await purgeAuthorAccount(victim, result.storeKey, apiKeyHash);

    logEvent('admin_account_removed', { github_login: login });
    return c.json({ ok: true, removed: login });
  });

  // (POST /marketplace/signal removed 2026-05-15 — anonymous machine signal
  //  was a sovereignty-promissory feature: Engines were instructed not to
  //  include Author content, but Authors had to trust the prompt. Replaced
  //  by Author-explicit feedback only via POST /marketplace/feedback.)

  // --- Github webhook — instant marketplace cache invalidation on push ---
  //
  // Configure on the canonical repo and any other founder-owned repo that
  // hosts modules. Other Authors' forks rely on the 24h KV TTL until they
  // configure their own webhook (or until we add per-Author secret support).
  //
  // Validates the X-Hub-Signature-256 HMAC against GITHUB_WEBHOOK_SECRET.
  // Constant-time compare to avoid timing oracles.
  app.post('/github/webhook', async (c) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[github-webhook] GITHUB_WEBHOOK_SECRET unset');
      return c.json({ error: 'webhook not configured' }, 503);
    }
    const sigHeader = c.req.header('x-hub-signature-256') || '';
    const expected = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : '';
    if (!expected) return c.json({ error: 'missing signature' }, 401);

    const rawBody = await c.req.text();
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signed = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
    const got = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('');

    if (expected.length !== got.length) return c.json({ error: 'bad signature' }, 401);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
    if (diff !== 0) return c.json({ error: 'bad signature' }, 401);

    const event = c.req.header('x-github-event') || '';
    if (event === 'ping') return c.json({ ok: true, pong: true });
    if (event !== 'push') return c.json({ ok: true, ignored: event });

    let payload: Parameters<typeof handleGithubPushWebhook>[0];
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ error: 'bad payload' }, 400);
    }
    // Reply fast, bust in the background. Github expects <10s; Cloudflare has
    // a wall-clock budget per request. A push touching many files would burn
    // through both if we awaited every KV delete inline. waitUntil decouples
    // the ack from the work — the bust completes after the 200 returns.
    c.executionCtx.waitUntil((async () => {
      const result = await handleGithubPushWebhook(payload);
      logEvent('github_webhook_push', {
        repo: `${payload?.repository?.owner?.login || ''}/${payload?.repository?.name || ''}`,
        busted: String(result.busted),
      });
    })());
    return c.json({ ok: true });
  });

  // --- User feedback (end-of-session + direct) ---

  app.post('/feedback', async (c) => {
    const auth = await requireAuth(c);
    if (!auth) return c.json({ error: 'Unauthorized' }, 401);
    const { account } = auth;

    const body = await c.req.json().catch(() => ({}));
    const { text, context } = body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return c.json({ error: 'Empty feedback' }, 400);
    }

    const t = new Date().toISOString();
    try {
      await publishFeedback({
        author: account.github_login,
        t,
        text: text.slice(0, 5000),
        context: context?.slice?.(0, 200) || 'direct',
      });

      logEvent('user_feedback', {
        author: account.github_login,
        context: context || 'direct',
        length: String(text.length),
      });
      if (context === 'setup') {
        const statusMatch = text.match(/^status:\s*([a-z0-9_-]+)/m);
        logEvent('setup_report', {
          author: account.github_login,
          status: statusMatch?.[1] || 'unknown',
        });
      }

      return c.json({ ok: true });
    } catch (err) {
      console.error('Feedback relay failed:', err);
      logEvent('user_feedback', { error: 'relay_failed' });
      return c.json({ error: 'relay_failed' }, 502);
    }
  });

  // --- Email preferences (token-based, not raw API key) ---
  // /email/stop is the only remaining unsubscribe — it gates admin/nudge.

  app.on(['GET', 'POST'], '/email/stop', async (c) => {
    const token = c.req.query('t');
    if (!token) return c.text('missing token', 400);
    const stoppedHtml = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 420px; margin: 80px auto; padding: 20px; color: #3d3630; text-align: center;">
  <p style="font-size: 1.1rem; line-height: 1.9;">stopped. we&rsquo;ll be here when you&rsquo;re ready.</p>
  <p style="font-size: 0.85rem; color: #8a8078; margin-top: 1rem;">a.</p>
</div>`;

    const storeKey = await getEmailTokenIndex(token);
    if (storeKey) {
      const acct = await loadAccount(storeKey) as Record<string, any> | null;
      if (acct) {
        acct.engagement_opt_out = true;
        await saveAccount(storeKey, acct);
        return c.html(stoppedHtml);
      }
    }

    const updateResult = await getDB().prepare(
      'UPDATE waitlist SET opted_out_at = ? WHERE unsubscribe_token = ? AND opted_out_at IS NULL'
    ).bind(new Date().toISOString(), token).run();
    const changes = (updateResult as unknown as { meta?: { changes?: number } }).meta?.changes || 0;
    if (changes > 0) return c.html(stoppedHtml);

    const alreadyOut = await getDB().prepare(
      'SELECT 1 FROM waitlist WHERE unsubscribe_token = ? LIMIT 1'
    ).bind(token).first();
    if (alreadyOut) return c.html(stoppedHtml);

    return c.text('not found', 404);
  });

  // One-shot migration runner — applies a specific migration via the
  // worker's D1 binding (bypasses the wrangler OAuth D1-scope gap).
  // Idempotent. Safe to leave in.
  app.post('/admin/migrate-0022', async (c) => {
    if (!await requireAdmin(c)) return c.text('Unauthorized', 403);
    const db = getDB();
    const steps = [
      'ALTER TABLE waitlist ADD COLUMN unsubscribe_token TEXT',
      'ALTER TABLE waitlist ADD COLUMN opted_out_at TEXT',
      'CREATE INDEX IF NOT EXISTS idx_waitlist_unsubscribe_token ON waitlist(unsubscribe_token)',
    ];
    const results: Array<{ sql: string; ok: boolean; error?: string }> = [];
    for (const sql of steps) {
      try {
        await db.exec(sql);
        results.push({ sql, ok: true });
      } catch (e) {
        const msg = String((e as { message?: string })?.message || e);
        const idempotent = msg.includes('duplicate column');
        results.push({ sql, ok: idempotent, error: idempotent ? undefined : msg });
        if (!idempotent) return c.json({ ok: false, results }, 500);
      }
    }
    return c.json({ ok: true, results });
  });

  // Admin: send a one-time email to all uninstalled users
  app.post('/admin/nudge', async (c) => {
    const auth = await requireAdmin(c);
    if (!auth) return c.text('Unauthorized', 403);
    if (await checkAdminRateLimit('nudge', 3, 300)) return c.json({ error: 'Rate limited (sends emails, capped 3/5min)' }, 429);

    const accounts = await loadAccounts<AccountStore>();
    const recipients = Object.values(accounts).filter(acct =>
      !acct.installed_at && acct.email && !acct.engagement_opt_out && acct.github_login !== auth.account.github_login
    );

    const html = (acct: Account) =>
      '<div style="font-family: \'EB Garamond\', Georgia, serif; max-width: 420px; margin: 0 auto; padding: 40px 20px; color: #3d3630; text-align: center;">' +
      '<p style="font-size: 1rem; line-height: 1.9; color: #8a8078; margin: 0 0 1.5rem;">we fixed a setup issue. <a href="' + getWebsiteUrl() + '/signup" style="color: #3d3630;">sign in</a> to get your updated setup command.</p>' +
      '<p style="font-size: 0.72rem; color: #bbb4aa; margin-top: 1.5rem;"><a href="' + getServerUrl() + '/email/stop?t=' + acct.email_token + '" style="color: #8a8078;">stop these emails</a></p>' +
      '</div>';

    const { sent, failed } = await sendEmailsBatched(recipients, acct =>
      sendEmail(acct.email, 'alexandria. — quick fix', html(acct))
    );
    return c.json({ ok: true, sent, failed, total: recipients.length });
  });

  // (Marketplace read/drain endpoints removed — signals + feedback live in
  // the DATA KV namespace under `signal:` and `feedback:` prefixes. Inspect
  // via `wrangler kv:key list --binding=DATA --prefix=signal:`.)

  // Manual digest trigger. Scheduled daily at 09:00 UTC, but that's a 24h feedback
  // loop for any digest-logic change. This shortens it: make changes, curl this,
  // read the email / cron:health_digest KV marker. Admin-only.
  //
  // ?email=true sends the alarm email (default: suppressed, so CI smoke can hammer
  // this every 6h without flooding the inbox). Scheduled-cron path always sends.
  app.post('/admin/cron/health-digest', async (c) => {
    if (!await requireAdmin(c)) return c.text('Unauthorized', 403);
    if (await checkAdminRateLimit('health-digest', 20, 60)) return c.json({ error: 'Rate limited (20/min)' }, 429);
    const sendEmailOnAlarm = c.req.query('email') === 'true';
    await runHealthDigest({ sendEmailOnAlarm });
    const kv = getKV();
    const raw = await kv.get('cron:health_digest');
    return c.json({ ok: true, email_sent: sendEmailOnAlarm, result: raw ? JSON.parse(raw) : null });
  });

  // Manual trigger for week-1 check-in. Same shorter-feedback-loop motivation
  // as health-digest. ?dry=true returns the eligible-recipient count without
  // sending or marking the idempotency flag — safe to hammer for verification.
  app.post('/admin/cron/week-one-checkins', async (c) => {
    if (!await requireAdmin(c)) return c.text('Unauthorized', 403);
    if (await checkAdminRateLimit('week-one-checkins', 10, 60)) return c.json({ error: 'Rate limited (10/min)' }, 429);
    const dry = c.req.query('dry') === 'true';
    const result = await runWeekOneCheckIns({ dry });
    return c.json({ ok: true, ...result });
  });

  // Manual trigger for install nudges. ?dry=true returns eligible-recipient
  // count without sending or stamping the idempotency flag.
  app.post('/admin/cron/install-nudges', async (c) => {
    if (!await requireAdmin(c)) return c.text('Unauthorized', 403);
    if (await checkAdminRateLimit('install-nudges', 10, 60)) return c.json({ error: 'Rate limited (10/min)' }, 429);
    const dry = c.req.query('dry') === 'true';
    const result = await runInstallNudges({ dry });
    return c.json({ ok: true, ...result });
  });

  // Test send — fires one install nudge to the founder, using real template +
  // real email_token (so the unsubscribe link works). Bypasses the cron filter
  // (founder doesn't qualify). Doesn't update any nudge state. For email
  // template visual verification.
  app.post('/admin/test/install-nudge', async (c) => {
    const auth = await requireAdmin(c);
    if (!auth) return c.text('Unauthorized', 403);
    if (await checkAdminRateLimit('test-nudge', 5, 60)) return c.json({ error: 'Rate limited (5/min)' }, 429);
    if (!auth.account.email) return c.text('admin account has no email', 404);
    // Test path: store a short-lived install token with placeholder key so the
    // email's link works (renders the install page) without regenerating the
    // admin's real key. 10-min TTL keeps the KV clean.
    const testToken = generateToken();
    await getKV().put(
      `install:${testToken}`,
      JSON.stringify({ api_key: 'TEST_KEY_NOT_RUNNABLE', github_login: auth.account.github_login }),
      { expirationTtl: 600 },
    );
    const result = await sendInstallNudge(auth.account.email, auth.account.email_token, testToken, auth.account.github_login);
    return c.json({ ok: result.ok, error: result.error, to: auth.account.email, install_url: `${getServerUrl()}/install/${testToken}` });
  });

  // Magic-link install — email nudges link here so the user gets the actual
  // onboarding page (copy buttons + shortcut link), no OAuth needed. Token
  // is generated per-nudge with a 14d TTL; expired tokens fall back to
  // /signup (clean OAuth flow). Redemption is logged so we know whether the
  // email actually drove a click (mirror loop between "nudge sent" and
  // "installed_after_nudge").
  app.get('/install/:token', async (c) => {
    const token = c.req.param('token');
    if (!token) return c.text('missing token', 400);
    const stored = await getKV().get(`install:${token}`);
    if (!stored) {
      logEvent('install_token_expired', { token_prefix: token.slice(0, 8) });
      return c.redirect(`${getWebsiteUrl()}/signup`, 302);
    }
    const { api_key, github_login } = JSON.parse(stored) as { api_key: string; github_login: string };
    logEvent('install_token_redeemed', { author: github_login });
    const html = await callbackPageHtml(api_key, github_login, true);
    return c.html(html);
  });

  // Public preview — renders the onboarding callback HTML with hardcoded dummy
  // values so the page can be shown in demos / screenshotted without OAuth.
  // ?returning=true for the welcome-back variant. No side effects, no real
  // data — keep the values dummy and this stays safe to expose.
  app.get('/preview/onboarding', async (c) => {
    const returning = c.req.query('returning') === 'true';
    const apiKey = returning ? '' : 'sk_test_dummy_for_visual_verification';
    const html = await callbackPageHtml(apiKey, 'mowinckelb');
    return c.html(html);
  });

  // Mirror loop for install nudges — how many of the last 30d signups got a
  // nudge, how many of those installed after it. Tells us if the email is
  // actually converting. If conversion stays low for 2+ weeks, kill or rewrite.
  app.get('/admin/nudge-conversion', async (c) => {
    if (!await requireAdmin(c)) return c.text('Unauthorized', 403);
    const accounts = await loadAccounts<AccountStore>();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    let nudged = 0;
    let converted = 0;
    for (const acct of Object.values(accounts)) {
      if (!acct.created_at) continue;
      if (new Date(acct.created_at).getTime() < thirtyDaysAgo) continue;
      if ((acct.install_nudge_count || 0) === 0) continue;
      nudged++;
      if (acct.installed_after_nudge) converted++;
    }
    return c.json({
      window_days: 30,
      nudged,
      converted,
      conversion_rate: nudged > 0 ? Number((converted / nudged).toFixed(3)) : 0,
    });
  });


  // --- CTO → CEO email channel (any autonomous agent can reach the founder) ---

  app.post('/admin/email', async (c) => {
    if (!await requireAdmin(c)) return c.text('Unauthorized', 403);
    if (await checkAdminRateLimit('admin-email', 10, 60)) return c.json({ error: 'Rate limited (sends emails, capped 10/min)' }, 429);

    const { to, subject, body, unsubscribeUrl } = await c.req.json<{ to?: string; subject: string; body: string; unsubscribeUrl?: string }>();
    if (!subject || !body) return c.text('missing subject or body', 400);

    let recipientEmail: string;
    if (to) {
      const target = await getAccountByLogin(to);
      if (!target?.account.email) return c.text(`no email found for ${to}`, 404);
      recipientEmail = target.account.email;
    } else {
      recipientEmail = FOUNDER_EMAIL;
    }

    const html = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 420px; margin: 0 auto; padding: 40px 20px; color: #3d3630;">
${body.split('\n').map((line: string) => line.trim() ? `<p style="font-size: 1rem; line-height: 1.9; color: #3d3630; margin: 0 0 1rem;">${line}</p>` : '').join('\n')}
</div>`;

    const result = await sendEmail(recipientEmail, `alexandria. — ${subject}`, html, unsubscribeUrl ? { unsubscribeUrl } : undefined);
    if (!result.ok) return c.json({ ok: false, sent_to: recipientEmail, error: result.error }, 502);
    return c.json({ ok: true, sent_to: recipientEmail });
  });

  // --- Patron updates broadcast ---
  // scripts/send-update.mjs renders the markdown letter to email HTML locally,
  // then POSTs it here. Server holds the subscriber list (D1 waitlist, type='follow',
  // not opted_out) and the Resend key. Preview mode sends only to FOUNDER_EMAIL —
  // the verification loop before broadcast.
  app.post('/admin/update/send', async (c) => {
    if (!await requireAdmin(c)) return c.text('Unauthorized', 403);
    if (await checkAdminRateLimit('update-send', 5, 60)) return c.json({ error: 'Rate limited (5/min)' }, 429);

    const { slug, subject, html, preview } = await c.req.json<{
      slug?: string;
      subject?: string;
      html?: string;
      preview?: boolean;
    }>();
    if (!slug || !subject || !html) return c.json({ error: 'missing slug, subject, or html' }, 400);

    const db = (globalThis as any).__d1 as D1Database;
    if (!db) return c.json({ error: 'Database not available.' }, 503);

    if (preview) {
      const result = await sendEmail(FOUNDER_EMAIL, subject, html);
      logEvent('update_preview_sent', { slug });
      return c.json({ ok: result.ok, preview: true, sent_to: FOUNDER_EMAIL, error: result.error });
    }

    const rows = await db
      .prepare(`SELECT email, unsubscribe_token FROM waitlist WHERE type = 'follow' AND opted_out_at IS NULL`)
      .all<{ email: string; unsubscribe_token: string | null }>();
    const recipients = rows.results || [];
    if (recipients.length === 0) {
      return c.json({ ok: true, sent: 0, failed: 0, note: 'no subscribers' });
    }

    const serverUrl = getServerUrl();
    const { sent, failed } = await sendEmailsBatched(recipients, (r) => {
      const unsub = r.unsubscribe_token
        ? `${serverUrl}/email/stop?t=${r.unsubscribe_token}`
        : undefined;
      const personalisedHtml = unsub
        ? html.replace(
            '<!--UNSUBSCRIBE-->',
            `<p style="margin: 1.5rem 0 0; font-size: 0.72rem; color: #bbb4aa;"><a href="${unsub}" style="color: #8a8078;">stop these emails</a></p>`,
          )
        : html.replace('<!--UNSUBSCRIBE-->', '');
      return sendEmail(r.email, subject, personalisedHtml, unsub ? { unsubscribeUrl: unsub } : undefined);
    });

    logEvent('update_broadcast', { slug, sent: String(sent), failed: String(failed), total: String(recipients.length) });
    return c.json({ ok: true, slug, sent, failed, total: recipients.length });
  });

  // Dashboard removed 2026-04-14. JSON API at /analytics/dashboard remains
  // for tests and autonomous triggers. Health digest email includes issue list.
  // The HTML dashboard was a human-in-the-loop on a maximisation game.

  // (Factory autoloop substrate removed 2026-05-15. Was part of the deleted
  //  machine-signal flow. Canon evolution is now founder-as-user: read
  //  feedback via `wrangler kv key list --binding=DATA --remote --prefix=feedback:`,
  //  analyze, edit factory/canon/*.md directly.)
}
