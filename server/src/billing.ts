/**
 * Billing — Stripe subscription management + Library payment
 *
 * Subscription: $10/mo, or free with 5+ active kin. Binary. Slider open above floor.
 * Library: monthly tab billing (micro-transactions settled monthly via Stripe Billing Meters).
 * Non-Author: instant payment via Stripe Checkout.
 */

import Stripe from 'stripe';
import type { Hono } from 'hono';
import { logEvent } from './analytics.js';
import { callbackPageHtml } from './templates.js';
import { requireAuth } from './auth.js';
import { loadAccounts, getKV } from './kv.js';
import { getAccountByLogin, updateAccountBilling } from './accounts.js';
import type { Account } from './auth.js';
import { getDB } from './db.js';
import { sendEmail } from './email.js';
import { safeEqual } from './crypto.js';

// ---------------------------------------------------------------------------
// Stripe client — lazy init (needs env to be populated)
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Secret fingerprint — non-reversible identifier for triage logs. SHA-256
// over the secret, truncated to 8 hex chars. Stable across calls with the
// same secret (so log readers can tell "same bound secret each time" from
// "different secret each time" without ever seeing the secret itself).
// Exported for unit testing the log-leak attack surface.
// ---------------------------------------------------------------------------

export async function secretFingerprint(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex.slice(0, 8)} (len=${secret.length})`;
}

// ---------------------------------------------------------------------------
// Single source of truth for which Stripe events the webhook handler below
// processes. cron.ts:runHealthDigest calls syncStripeWebhookEvents on every
// daily tick — drift between this list and the live webhook's enabled_events
// gets auto-corrected, with a stroll alarm so it's visible in the digest.
// When adding a `case` to the switch, add the event here too.
// ---------------------------------------------------------------------------

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.upcoming',
  'invoice.paid',
  'invoice.payment_failed',
  'setup_intent.setup_failed',
  'payment_intent.payment_failed',
  'checkout.session.expired',
] as const;

/**
 * Diff this server's HANDLED_EVENTS against the live Stripe webhook's
 * enabled_events. Drift detected → auto-update the webhook. Called from
 * runHealthDigest. Closes the loop on the failure mode where a new `case`
 * lands in the webhook switch but the live webhook subscription is never
 * updated, silently dropping that event class. Found 2026-05-10 after the
 * SetupIntent / PaymentIntent / expiry-failure cases drifted for ~5 days.
 */
export async function syncStripeWebhookEvents(
  escalate: (urgency: 'sprint' | 'stroll', reason: string) => void,
): Promise<void> {
  try {
    const stripe = getStripe();
    const canonicalUrl = `${process.env.SERVER_URL || ''}/billing/webhook`;
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const ours = endpoints.data.find(e => e.url === canonicalUrl && e.livemode);

    if (!ours) {
      escalate('sprint', `No live Stripe webhook at ${canonicalUrl} — manual create required`);
      return;
    }

    const subscribed = new Set<string>(ours.enabled_events);
    const expected = new Set<string>(HANDLED_EVENTS);
    const missing = [...expected].filter(e => !subscribed.has(e));
    const extra = [...subscribed].filter(e => !expected.has(e));

    if (missing.length === 0 && extra.length === 0) return;

    try {
      await stripe.webhookEndpoints.update(ours.id, {
        enabled_events: [...HANDLED_EVENTS] as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
      });
      const parts: string[] = [];
      if (missing.length > 0) parts.push(`+${missing.join(',')}`);
      if (extra.length > 0) parts.push(`-${extra.join(',')}`);
      escalate('stroll', `Stripe webhook drift auto-corrected: ${parts.join(' ')}`);
    } catch (e) {
      escalate('sprint', `Stripe webhook drift detected, auto-fix failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } catch (e) {
    escalate('stroll', `Stripe webhook sync threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Invoice → subscription ID extraction (Stripe nests this differently by event)
// ---------------------------------------------------------------------------

function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subDetails = invoice.parent?.subscription_details;
  if (typeof subDetails?.subscription === 'string') return subDetails.subscription;
  if (subDetails?.subscription?.id) return subDetails.subscription.id;
  // Legacy: older Stripe API versions put subscription directly on the invoice
  if (typeof (invoice as any).subscription === 'string') return (invoice as any).subscription;
  return null;
}

// ---------------------------------------------------------------------------
// Price ID — one price, $10/month. Free with 5+ active kin (coupon).
// ---------------------------------------------------------------------------

const KIN_THRESHOLD = parseInt(process.env.KIN_THRESHOLD || '5', 10);
const KIN_WINDOW_MS = 30 * 86400 * 1000; // rolling 30-day activity window

let _priceId: string | null = null;
let _couponId: string | null = null;

type BillingTabLedgerRow = {
  accessorId: string;
  authorId: string;
  artifactType: string;
  artifactId: string;
  amountCents: number;
  alexandriaCutCents: number;
  authorCutCents: number;
  month: string;
  settled: 0 | 1;
  createdAt: string;
};

async function insertBillingTabLedgerRow(db: D1Database, row: BillingTabLedgerRow): Promise<void> {
  await db.prepare(
    `INSERT INTO billing_tab (accessor_id, author_id, artifact_type, artifact_id, amount_cents, alexandria_cut_cents, author_cut_cents, month, settled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.accessorId,
    row.authorId,
    row.artifactType,
    row.artifactId,
    row.amountCents,
    row.alexandriaCutCents,
    row.authorCutCents,
    row.month,
    row.settled,
    row.createdAt,
  ).run();
}

async function shouldProcessStripeEvent(eventId: string): Promise<boolean> {
  // Primary dedupe path: atomic D1 insert-or-ignore.
  try {
    const db = getDB();
    const now = new Date().toISOString();
    const result = await db.prepare(
      `INSERT OR IGNORE INTO stripe_webhook_events (id, processed_at) VALUES (?, ?)`
    ).bind(eventId, now).run();
    const inserted = ((result as unknown as { meta?: { changes?: number } }).meta?.changes || 0) > 0;
    if (!inserted) return false;

    // Keep dedupe table bounded.
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare(`DELETE FROM stripe_webhook_events WHERE processed_at < ?`).bind(cutoff).run();
    return true;
  } catch (e) {
    console.warn('[billing] D1 webhook dedupe unavailable, falling back to KV:', e);
  }

  // Fallback dedupe path: KV marker.
  try {
    const kv = getKV();
    const eventKey = `stripe:event:${eventId}`;
    const alreadyProcessed = await kv.get(eventKey);
    if (alreadyProcessed) return false;
    await kv.put(eventKey, '1', { expirationTtl: 86400 }); // 24h TTL
  } catch (e) {
    console.warn('[billing] KV dedupe unavailable, proceeding without dedupe:', e);
  }

  return true;
}

async function ensurePrice(): Promise<string> {
  if (_priceId) return _priceId;

  const stripe = getStripe();
  const productCopy = {
    name: 'The Examined Life',
    description: 'a tribe of humans who put their minds into writing, so ai thinks with them, not for them. free with five friends who join through you and stay active. otherwise $10 a month.',
  };

  const products = await stripe.products.list({ limit: 10 });
  let product = products.data.find(p => p.metadata.alexandria === 'examined_life');

  if (!product) {
    product = await stripe.products.create({
      ...productCopy,
      metadata: { alexandria: 'examined_life' },
    });
  } else if (product.name !== productCopy.name || product.description !== productCopy.description) {
    // Description drifts when edited in Stripe dashboard; this code is the source of truth.
    product = await stripe.products.update(product.id, productCopy);
  }

  const prices = await stripe.prices.list({ product: product.id, limit: 10 });
  let price = prices.data.find(p => p.metadata.tier === 'standard' && p.active);

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: 1000,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { tier: 'standard' },
    });
  }

  _priceId = price.id;
  return _priceId;
}

async function ensureKinCoupon(): Promise<string> {
  if (_couponId) return _couponId;

  const stripe = getStripe();
  const coupons = await stripe.coupons.list({ limit: 20 });
  let coupon = coupons.data.find(c => c.metadata?.alexandria === 'kin_free' && c.valid);

  if (!coupon) {
    coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'forever',
      name: 'Active Kin — Free',
      metadata: { alexandria: 'kin_free' },
    });
  }

  _couponId = coupon.id;
  return _couponId;
}

// ---------------------------------------------------------------------------
// Kin — count active kin for a user, recalculate subscription
// ---------------------------------------------------------------------------

export async function countActiveKin(githubLogin: string): Promise<{ count: number; compliant: number }> {
  if (!githubLogin) return { count: 0, compliant: 0 };

  // Find who this user referred (from D1 referrals table)
  const db = getDB();
  const { results } = await db.prepare(
    `SELECT referred_github_login FROM referrals WHERE author_id = ?`
  ).bind(githubLogin).all<{ referred_github_login: string }>();

  if (!results || results.length === 0) return { count: 0, compliant: 0 };

  const kinLogins = results.map(r => r.referred_github_login).filter(Boolean);
  if (kinLogins.length === 0) return { count: 0, compliant: 0 };

  // Compliant kin = meets all three obligations within the rolling window:
  // 1. Account exists
  // 2. File edited (protocol_files.updated_at within window)
  // 3. Call made (protocol_calls.time within window)
  // Rolling, not calendar-month — no cliff at midnight on the 1st where every
  // kin must reactivate before the next invoice fires a few days later.
  const cutoff = new Date(Date.now() - KIN_WINDOW_MS).toISOString();

  // Resolve each kin's account in parallel via the login index (O(1) per lookup, no full-account scan)
  const kinResults = await Promise.all(kinLogins.map(login => getAccountByLogin(login)));
  const kinWithAccounts: { login: string; githubId: string }[] = [];
  for (let i = 0; i < kinLogins.length; i++) {
    const r = kinResults[i];
    if (!r) continue; // No account — not compliant
    kinWithAccounts.push({ login: kinLogins[i], githubId: String(r.account.github_id) });
  }

  if (kinWithAccounts.length === 0) return { count: kinLogins.length, compliant: 0 };

  const githubIds = kinWithAccounts.map(k => k.githubId);
  const idPlaceholders = githubIds.map(() => '?').join(',');

  // Batch D1 query for file freshness — protocol_files keyed by github_id
  const { results: files } = await db.prepare(
    `SELECT account_id, MAX(updated_at) as last_edit FROM protocol_files WHERE account_id IN (${idPlaceholders}) GROUP BY account_id`
  ).bind(...githubIds).all<{ account_id: string; last_edit: string }>();
  const fileEdits = new Map((files || []).map(f => [f.account_id, f.last_edit]));

  // Batch D1 query for protocol calls — one query for all kin
  const { results: callResults } = await db.prepare(
    `SELECT DISTINCT account_id FROM protocol_calls WHERE account_id IN (${idPlaceholders}) AND time > ?`
  ).bind(...githubIds, cutoff).all<{ account_id: string }>();
  const hasCallSet = new Set((callResults || []).map(r => r.account_id));

  let compliant = 0;
  for (const { githubId } of kinWithAccounts) {
    const hasCall = hasCallSet.has(githubId);
    const lastEdit = fileEdits.get(githubId);
    const hasFile = !!lastEdit && lastEdit > cutoff;

    if (hasCall && hasFile) compliant++;
  }

  return { count: kinLogins.length, compliant };
}

export interface KinPricingState {
  email: string | undefined;
  subscriptionId: string;
  authorHasCall: boolean;
  authorHasFile: boolean;
  kinCompliant: number;
  kinNeeded: number;
  nowHasDiscount: boolean;
}

export async function recalculateKinPricing(githubLogin: string): Promise<KinPricingState | null> {
  // Find account by github_login (O(1) via index)
  const result = await getAccountByLogin(githubLogin);
  const user = result?.account as any;
  if (!user?.subscription_id) return null;

  // Author must be compliant themselves (file + call within rolling window) to get kin discount.
  // D1 errors propagate — silently treating "no data" as "non-compliant" would quietly revoke
  // discounts when the database hiccups; let the caller's try/catch keep state unchanged instead.
  const cutoff = new Date(Date.now() - KIN_WINDOW_MS).toISOString();
  const db = getDB();
  const callCheck = await db.prepare(
    `SELECT 1 FROM protocol_calls WHERE account_id = ? AND time > ? LIMIT 1`
  ).bind(String(user.github_id), cutoff).first();
  const authorHasCall = !!callCheck;
  const file = await db.prepare(
    `SELECT MAX(updated_at) as last_edit FROM protocol_files WHERE account_id = ?`
  ).bind(String(user.github_id)).first<{ last_edit: string | null }>();
  const authorHasFile = !!file?.last_edit && file.last_edit > cutoff;
  const authorCompliant = authorHasCall && authorHasFile;

  const kinData = await countActiveKin(githubLogin);
  const shouldBeFree = authorCompliant && kinData.compliant >= KIN_THRESHOLD;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(user.subscription_id);

  const hadDiscount = sub.discounts?.some(d => {
    if (typeof d === 'string') return false;
    const coupon = d.source?.coupon;
    return typeof coupon !== 'string' && coupon?.metadata?.alexandria === 'kin_free';
  }) ?? false;

  let nowHasDiscount = hadDiscount;

  if (shouldBeFree && !hadDiscount) {
    const couponId = await ensureKinCoupon();
    await stripe.subscriptions.update(user.subscription_id, { discounts: [{ coupon: couponId }] });
    nowHasDiscount = true;
    logEvent('kin_pricing_free', { github_login: user.github_login, compliant_kin: String(kinData.compliant) });
  } else if (!shouldBeFree && hadDiscount) {
    await stripe.subscriptions.update(user.subscription_id, { discounts: [] });
    nowHasDiscount = false;
    logEvent('kin_pricing_paid', { github_login: user.github_login, compliant_kin: String(kinData.compliant) });
  }

  return {
    email: user.email,
    subscriptionId: user.subscription_id,
    authorHasCall,
    authorHasFile,
    kinCompliant: kinData.compliant,
    kinNeeded: Math.max(0, KIN_THRESHOLD - kinData.compliant),
    nowHasDiscount,
  };
}

/**
 * Send the pre-bill warning email if the user is about to be charged and we
 * haven't already warned them for this billing cycle. Idempotent on
 * (subscription, due-date) — webhook and cron paths both call this safely.
 */
async function maybeWarnAboutBill(
  state: KinPricingState,
  githubLogin: string,
  amountDollars: number,
  dueAt: Date,
): Promise<void> {
  if (!state.email || state.nowHasDiscount) return;

  const idempotencyKey = `kin:warning:${state.subscriptionId}:${dueAt.toISOString().slice(0, 10)}`;
  const kv = getKV();
  if (await kv.get(idempotencyKey)) return;

  await sendPreBillWarningEmail(state.email, githubLogin, state, amountDollars, dueAt);
  await kv.put(idempotencyKey, '1', { expirationTtl: 60 * 86400 }); // 60d, longer than any cycle
  logEvent('kin_prebill_warning_sent', { github_login: githubLogin, amount: String(amountDollars) });
}

/**
 * Recalculate kin pricing for all subscribed users + fire pre-bill warnings 7
 * days before each renewal. Runs daily; idempotency key in maybeWarnAboutBill
 * makes the 7-day window collapse to a single send per cycle. Independent of
 * Stripe's account-level invoice.upcoming lead time setting.
 */
export async function recalculateAllKinPricing(): Promise<void> {
  const accounts = await loadAccounts<Record<string, any>>();
  const sevenDaysFromNow = Date.now() + 7 * 86400 * 1000;
  // $10 unit price — matches ensurePrice(). Hardcoded to avoid an extra Stripe
  // call per user per day; update here if pricing changes.
  const billDollars = 10;

  for (const account of Object.values(accounts)) {
    const a = account as any;
    if (!a.subscription_id || !a.github_login) continue;
    try {
      const state = await recalculateKinPricing(a.github_login);
      if (state && a.current_period_end) {
        const dueAt = new Date(a.current_period_end);
        const dueMs = dueAt.getTime();
        if (dueMs > Date.now() && dueMs <= sevenDaysFromNow) {
          await maybeWarnAboutBill(state, a.github_login, billDollars, dueAt);
        }
      }
    } catch (err) {
      console.error(`[kin] Recalculation failed for ${a.github_login}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Billing types
// ---------------------------------------------------------------------------

export interface BillingInfo {
  stripe_customer_id?: string;
  subscription_status?: string;
  subscription_id?: string;
  current_period_end?: string;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * True for Stripe errors thrown when a referenced customer/subscription/price
 * doesn't exist on the API key's mode — the canonical signal that a stored
 * test-mode ID is being used against live (or vice-versa). Retrying without
 * the stale reference lets the call recover by creating a fresh resource.
 */
function isResourceMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { type?: string; code?: string };
  return e.type === 'StripeInvalidRequestError' && e.code === 'resource_missing';
}

export async function createCheckoutSession(opts: {
  email: string;
  githubLogin: string;
  stripeCustomerId?: string;
}): Promise<string> {
  const stripe = getStripe();
  const SERVER_URL = process.env.SERVER_URL || 'https://api.alexandria-library.com';
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';

  // First attempt uses the stored customer if any; if Stripe rejects it as
  // missing (test→live transition leaves stale IDs behind), retry once with
  // email-only so the next checkout creates a fresh customer in the active
  // mode. New subscription_id will land in the account on webhook completion.
  const buildParams = (useStored: boolean) => {
    const customer = useStored && opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId }
      : { customer_email: opts.email };
    return {
      mode: 'subscription' as const,
      line_items: [{ price: '', quantity: 1 }],
      ...customer,
      subscription_data: {
        description: 'the examined life',
        metadata: { kind: 'author', github_login: opts.githubLogin },
        trial_period_days: 30,
      },
      metadata: { kind: 'author', github_login: opts.githubLogin },
      custom_text: {
        submit: { message: 'free if five friends join through you and stay active. otherwise $10/month after the 30-day trial.' },
      },
      success_url: `${SERVER_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEBSITE_URL}/signup?billing=cancel`,
    };
  };

  const tryCreate = async (useStored: boolean): Promise<string> => {
    const params = buildParams(useStored);
    const priceId = await ensurePrice();
    (params as { line_items: { price: string; quantity: number }[] }).line_items = [{ price: priceId, quantity: 1 }];
    const session = await stripe.checkout.sessions.create(params as Parameters<typeof stripe.checkout.sessions.create>[0]);
    return session.url || '';
  };

  try {
    return await tryCreate(true);
  } catch (err) {
    if (isResourceMissing(err) && opts.stripeCustomerId) {
      console.warn(`[billing] stale customer ${opts.stripeCustomerId} for ${opts.githubLogin} — retrying without`);
      return await tryCreate(false);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Patron checkout — Door 2 "follow along" subscription. No GitHub auth.
// Stripe is source of truth; D1 patron_subscriptions is a thin index.
// ---------------------------------------------------------------------------

export async function createPatronCheckoutSession(opts: {
  email: string;
  amountCents: number;
}): Promise<string> {
  const stripe = getStripe();
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: opts.email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'Alexandria — follow along' },
        unit_amount: opts.amountCents,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    metadata: { kind: 'patron', follow_email: opts.email },
    subscription_data: {
      metadata: { kind: 'patron', follow_email: opts.email },
    },
    success_url: `${WEBSITE_URL}/follow?thanks=1`,
    cancel_url: `${WEBSITE_URL}/follow`,
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

async function upsertPatronSubscription(row: {
  subscriptionId: string;
  customerId: string;
  email: string;
  status: string;
}): Promise<void> {
  const db = getDB();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO patron_subscriptions (stripe_subscription_id, stripe_customer_id, email, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       email = excluded.email,
       status = excluded.status,
       updated_at = excluded.updated_at`
  ).bind(row.subscriptionId, row.customerId, row.email.toLowerCase(), row.status, now, now).run();
}

/** Reconcile patron subscriptions from Stripe (source of truth) into D1 (index). */
export async function reconcilePatronSubscriptions(): Promise<{ drift: number; checked: number }> {
  const stripe = getStripe();
  const db = getDB();

  const stripeMap = new Map<string, { customerId: string; email: string; status: string }>();
  let cursor: string | undefined;
  do {
    const page: Stripe.ApiSearchResult<Stripe.Subscription> = await stripe.subscriptions.search({
      query: `metadata['kind']:'patron'`,
      limit: 100,
      ...(cursor ? { page: cursor } : {}),
    });
    for (const sub of page.data) {
      const email = (sub.metadata?.follow_email || '').toLowerCase();
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      stripeMap.set(sub.id, { customerId, email, status: sub.status });
    }
    cursor = page.has_more ? page.next_page ?? undefined : undefined;
  } while (cursor);

  const { results } = await db.prepare(
    `SELECT stripe_subscription_id, stripe_customer_id, email, status FROM patron_subscriptions`
  ).all<{ stripe_subscription_id: string; stripe_customer_id: string; email: string; status: string }>();
  const localMap = new Map((results || []).map(r => [r.stripe_subscription_id, r]));

  let drift = 0;

  for (const [subId, sub] of stripeMap) {
    const local = localMap.get(subId);
    if (!local
        || local.status !== sub.status
        || local.email !== sub.email
        || local.stripe_customer_id !== sub.customerId) {
      await upsertPatronSubscription({ subscriptionId: subId, ...sub });
      drift++;
    }
  }

  for (const [subId, local] of localMap) {
    if (!stripeMap.has(subId) && local.status !== 'canceled') {
      await db.prepare(
        `UPDATE patron_subscriptions SET status = ?, updated_at = ? WHERE stripe_subscription_id = ?`
      ).bind('canceled', new Date().toISOString(), subId).run();
      drift++;
    }
  }

  if (drift > 0) {
    logEvent('patron_reconcile_drift', { count: String(drift), checked: String(stripeMap.size) });
  }
  return { drift, checked: stripeMap.size };
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

// KV key for the cached Stripe billing-portal configuration ID. The
// configuration disables subscription_cancel + subscription_update so users
// cannot bypass the save-screen by going straight to the Stripe portal. This
// is structural — the only path to cancellation is POST /account/cancel.
const PORTAL_CONFIG_KV_KEY = 'stripe_portal_config_id';

/**
 * Return the portal configuration ID that disables Stripe-side cancellation.
 * Cached in KV so we don't recreate it on every portal session. If the cached
 * ID is missing or invalid (e.g. Stripe-side deleted) the next portal call
 * will repopulate it.
 *
 * Save-screen invariant: cancellation only happens via POST /account/cancel.
 * The portal stays useful for payment method + invoice + email updates.
 */
async function ensurePortalConfigurationId(): Promise<string> {
  const kv = getKV();
  const cached = await kv.get(PORTAL_CONFIG_KV_KEY);
  if (cached) return cached;

  const stripe = getStripe();
  const config = await stripe.billingPortal.configurations.create({
    features: {
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email'] },
    },
    business_profile: { headline: 'Manage your billing' },
  });
  await kv.put(PORTAL_CONFIG_KV_KEY, config.id);
  return config.id;
}

export async function createPortalSession(stripeCustomerId: string): Promise<string> {
  const stripe = getStripe();
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
  const configuration = await ensurePortalConfigurationId();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${WEBSITE_URL}/signup`,
    configuration,
  });
  return session.url;
}

// ---------------------------------------------------------------------------
// Subscription resolution (cached + Stripe fallback with auto-heal)
// ---------------------------------------------------------------------------

export interface ResolvedSubscription {
  customerId: string;
  subscriptionId: string;
  status: string;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  current_period_end: string | null;
  /** True when the cached subscription_id was missing/stale and the
   *  account was healed from a Stripe email lookup on this call. */
  healed: boolean;
}

function shapeResolvedSubscription(sub: Stripe.Subscription, healed: boolean): ResolvedSubscription {
  const periodEndUnix = sub.cancel_at ?? sub.items?.data?.[0]?.current_period_end ?? null;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const periodEndIso = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;
  return {
    customerId,
    subscriptionId: sub.id,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    cancel_at: sub.cancel_at_period_end ? periodEndIso : null,
    current_period_end: periodEndIso,
    healed,
  };
}

async function healAccount(account: Account, sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const periodEndUnix = sub.items?.data?.[0]?.current_period_end ?? null;
  try {
    await updateAccountBilling(account.github_login, {
      stripe_customer_id: customerId,
      subscription_id: sub.id,
      subscription_status: sub.status,
      ...(periodEndUnix ? { current_period_end: new Date(periodEndUnix * 1000).toISOString() } : {}),
    });
    logEvent('subscription_account_healed', {
      github_login: account.github_login,
      subscription_id: sub.id,
    });
  } catch (e) {
    console.warn(`[billing] auto-heal failed for ${account.github_login}:`, e);
  }
}

// Subscription statuses we'll surface for cancel/reactivate. Excludes
// terminal states only — past_due / unpaid / paused users still need a
// way to cancel (their card may have failed; they shouldn't be trapped).
const MANAGEABLE_STATUSES: Stripe.Subscription.Status[] = [
  'active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete',
];

export function subMatchesAccount(sub: Stripe.Subscription, account: Account): boolean {
  if (!MANAGEABLE_STATUSES.includes(sub.status)) return false;
  const md = sub.metadata || {};
  if (md.github_login && md.github_login === account.github_login) return true;
  // Constant-time compare — md.api_key is attacker-controllable (Stripe sub
  // metadata). Plain === would leak account.api_key prefix byte-by-byte via
  // timing oracle. See server/src/crypto.ts: safeEqual.
  if (md.api_key && account.api_key && safeEqual(md.api_key, account.api_key)) return true;
  if (md.follow_email && account.email && md.follow_email.toLowerCase() === account.email.toLowerCase()) return true;
  return false;
}

/**
 * Resolve an account's active subscription from Stripe.
 *
 * Source of truth is Stripe; KV `subscription_id` is the derivative cache.
 * Multi-path resolution — first match wins, then KV auto-heals so the next
 * call takes the fast path. As legacy/drifted accounts are touched they
 * self-heal; the scaffolding falls away on its own.
 *
 *   1. Cached `account.subscription_id` (fast path)
 *   2. Stripe sweep — recent subs filtered by metadata:
 *        - sub.metadata.github_login === account.github_login (current author convention)
 *        - sub.metadata.api_key === account.api_key (legacy author convention)
 *        - sub.metadata.follow_email === account.email (patron / Door 2)
 *   3. Customer.list by email → first active/trialing sub on those customers
 *
 * Returns null when no active/trialing subscription exists.
 */
export async function resolveActiveSubscription(account: Account): Promise<ResolvedSubscription | null> {
  const stripe = getStripe();

  // 1. Fast path — cached subscription_id is valid.
  if (account.subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(account.subscription_id);
      return shapeResolvedSubscription(sub, false);
    } catch (e) {
      console.warn(
        `[billing] cached subscription_id ${account.subscription_id} not in Stripe — falling back to metadata sweep:`,
        e,
      );
    }
  }

  // 2. Metadata sweep — robust to email mismatch + legacy + patron variants.
  try {
    const recent = await stripe.subscriptions.list({ status: 'all', limit: 100 });
    const matched = recent.data.find((s) => subMatchesAccount(s, account));
    if (matched) {
      await healAccount(account, matched);
      return shapeResolvedSubscription(matched, true);
    }
  } catch (e) {
    console.error(`[billing] metadata sweep failed for ${account.github_login}:`, e);
  }

  // 3. Email-based customer lookup — fallback when no metadata identifier hit.
  if (!account.email) return null;
  try {
    const customers = await stripe.customers.list({ email: account.email, limit: 5 });
    for (const customer of customers.data) {
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 10,
      });
      const active = subs.data.find((s) => MANAGEABLE_STATUSES.includes(s.status));
      if (active) {
        await healAccount(account, active);
        return shapeResolvedSubscription(active, true);
      }
    }
  } catch (e) {
    console.error(`[billing] customer email lookup for ${account.email} failed:`, e);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Billing routes
// ---------------------------------------------------------------------------

export type AccountUpdater = (identifier: string, billing: Partial<BillingInfo>) => Promise<void>;

export function registerBillingRoutes(app: Hono, onAccountUpdate: AccountUpdater) {
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';

  // Success page
  app.get('/billing/success', async (c) => {
    const sessionId = c.req.query('session_id');
    if (!sessionId) {
      return c.redirect(`${WEBSITE_URL}/signup`);
    }

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const login = session.metadata?.github_login || '';

      if (!login) {
        return c.redirect(`${WEBSITE_URL}/signup`);
      }

      let customerId = session.customer as string | null;
      if (!customerId && session.setup_intent) {
        try {
          const intentId = typeof session.setup_intent === 'string'
            ? session.setup_intent : session.setup_intent;
          const intent = await stripe.setupIntents.retrieve(intentId as string);
          customerId = intent.customer as string | null;
        } catch { /* proceed without customer ID */ }
      }

      const billingUpdate: Partial<BillingInfo> = {
        ...(customerId ? { stripe_customer_id: customerId } : {}),
        ...(session.subscription
          ? { subscription_id: session.subscription as string, subscription_status: 'active' }
          : { subscription_status: 'beta' }),
      };
      await onAccountUpdate(login, billingUpdate);
      logEvent('billing_checkout_completed', { mode: session.mode || 'unknown' });

      return c.html(await callbackPageHtml(''));
    } catch (err) {
      console.error('Billing success page error:', err);
      return c.redirect(`${WEBSITE_URL}/signup`);
    }
  });

  // Portal — requires API key auth, uses account's own Stripe customer ID
  app.post('/billing/portal', async (c) => {
    const auth = await requireAuth(c);
    if (!auth) return c.json({ error: 'Unauthorized' }, 401);
    if (!auth.account.stripe_customer_id) return c.json({ error: 'No billing account' }, 400);

    try {
      const url = await createPortalSession(auth.account.stripe_customer_id);
      return c.json({ url });
    } catch (err) {
      console.error('Portal error:', err);
      return c.json({ error: 'Failed to create portal session' }, 500);
    }
  });

  // Webhook — raw body for signature verification
  app.post('/billing/webhook', async (c) => {
    const stripe = getStripe();
    const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
    const sig = c.req.header('stripe-signature') || '';

    // Get raw body for signature verification
    const rawBody = await c.req.text();

    let event: Stripe.Event;
    try {
      if (!WEBHOOK_SECRET || !sig) {
        console.error('Webhook rejected — STRIPE_WEBHOOK_SECRET or signature missing');
        return c.text('Webhook not configured', 500);
      }
      // Workers' V8 isolate runs subtle.crypto async-only. Stripe's sync
      // constructEvent throws "SubtleCryptoProvider cannot be used in a
      // synchronous context." Use constructEventAsync instead.
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      // Surface enough info to triage signature drift without exposing the
      // secret. A non-reversible SHA-256 fingerprint distinguishes "wrong
      // secret bound" from "secret matches but body was modified mid-flight"
      // — across rotations the hash changes, across the same secret it's
      // stable. The raw secret (or any slice of it) never touches the log.
      const fp = WEBHOOK_SECRET ? await secretFingerprint(WEBHOOK_SECRET) : '<unset>';
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[webhook] signature mismatch — bound=${fp}`);
      console.error(`[webhook] sig_header=${sig}`);
      console.error(`[webhook] body_len=${rawBody.length} body_head=${JSON.stringify(rawBody.slice(0, 80))}`);
      console.error(`[webhook] body_tail=${JSON.stringify(rawBody.slice(-30))}`);
      console.error(`[webhook] err=${errMsg}`);
      return c.text('Invalid signature', 400);
    }

    // Idempotency — skip already-processed events
    const shouldProcess = await shouldProcessStripeEvent(event.id);
    if (!shouldProcess) {
      return c.json({ received: true, deduplicated: true });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;

          // Patron — Door 2 follow-along subscription
          if (session.metadata?.kind === 'patron') {
            const email = (session.metadata?.follow_email || session.customer_email || '').toLowerCase();
            const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
            const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || '';
            if (email && customerId && subscriptionId) {
              await upsertPatronSubscription({ subscriptionId, customerId, email, status: 'active' });
              logEvent('follow_subscription_paid', { amount_cents: String(session.amount_total || 0) });
            } else {
              console.error('[billing] Patron checkout completed with missing fields:', { email, customerId, subscriptionId });
            }
            break;
          }

          // Library one-time purchase (non-Author).
          // Accept either kind='library' (new convention) or library_purchase='true' (legacy).
          if (session.metadata?.kind === 'library' || session.metadata?.library_purchase === 'true') {
            const amountCents = session.amount_total || 0;
            const authorId = session.metadata?.author_id || '';
            const artifactType = session.metadata?.artifact_type || 'shadow';
            const artifactId = session.metadata?.artifact_id || '';
            const accessorId = session.metadata?.github_login || session.customer_email || 'anonymous';
            const cutRate = parseFloat(process.env.LIBRARY_CUT_PERCENT || '50') / 100;
            const alexandriaCut = Math.round(amountCents * cutRate);
            const authorCut = amountCents - alexandriaCut;
            const createdAt = new Date().toISOString();
            const month = createdAt.slice(0, 7);

            try {
              await insertBillingTabLedgerRow(getDB(), {
                accessorId,
                authorId,
                artifactType,
                artifactId,
                amountCents,
                alexandriaCutCents: alexandriaCut,
                authorCutCents: authorCut,
                month,
                settled: 1,
                createdAt,
              });
            } catch (e) {
              console.error('[billing] Library purchase tab entry failed:', e);
            }

            // Store access grant in KV (TTL 30 days)
            try {
              await getKV().put(`library:access:${session.id}`, JSON.stringify({
                author_id: authorId,
                artifact_type: artifactType,
                artifact_id: session.metadata?.artifact_id || '',
                granted_at: new Date().toISOString(),
              }), { expirationTtl: 30 * 24 * 60 * 60 });
            } catch (e) {
              console.error('[billing] Library access grant failed:', e);
            }

            logEvent('library_purchase', { author: authorId, artifact_type: artifactType, amount_cents: String(amountCents) });
            break;
          }

          // Regular subscription checkout — identify by github_login, never api_key
          const ghLogin = session.metadata?.github_login;
          if (ghLogin && session.customer && session.subscription) {
            await onAccountUpdate(ghLogin, {
              stripe_customer_id: session.customer as string,
              subscription_id: session.subscription as string,
              subscription_status: 'active',
            });
            logEvent('billing_subscription_created', { github_login: ghLogin });
          }
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;

          if (sub.metadata?.kind === 'patron') {
            const email = (sub.metadata?.follow_email || '').toLowerCase();
            if (email && customerId) {
              await upsertPatronSubscription({
                subscriptionId: sub.id,
                customerId,
                email,
                status: sub.status,
              });
            }
            logEvent('follow_subscription_updated', { status: sub.status });
            break;
          }

          // Use github_login from metadata (primary), fall back to api_key for legacy subscriptions
          const subLogin = sub.metadata?.github_login || sub.metadata?.api_key;
          if (subLogin) {
            const periodEnd = sub.items?.data?.[0]?.current_period_end;
            await onAccountUpdate(subLogin, {
              subscription_status: sub.status,
              ...(periodEnd ? { current_period_end: new Date(periodEnd * 1000).toISOString() } : {}),
            });
          }
          logEvent('billing_subscription_updated', {
            status: sub.status,
            customer: customerId,
          });
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;

          if (sub.metadata?.kind === 'patron') {
            const email = (sub.metadata?.follow_email || '').toLowerCase();
            const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || '';
            if (email && customerId) {
              await upsertPatronSubscription({
                subscriptionId: sub.id,
                customerId,
                email,
                status: 'canceled',
              });
            }
            logEvent('follow_subscription_canceled', {});
            break;
          }

          const subLogin = sub.metadata?.github_login || sub.metadata?.api_key;
          if (subLogin) {
            await onAccountUpdate(subLogin, { subscription_status: 'canceled' });
          }
          logEvent('billing_subscription_canceled', {
            customer: sub.customer as string,
          });
          break;
        }

        case 'invoice.upcoming': {
          // Recalculate kin pricing whenever Stripe pre-renders the next invoice,
          // and let maybeWarnAboutBill decide whether to send the warning email.
          // The daily cron also fires this 7 days out; idempotency keeps it to
          // one email per cycle no matter which path runs first.
          const invoice = event.data.object as Stripe.Invoice;
          const subId = extractSubscriptionId(invoice);
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              const subLogin = sub.metadata?.github_login || sub.metadata?.api_key;
              if (subLogin) {
                const state = await recalculateKinPricing(subLogin);
                if (state && (invoice.amount_due || 0) > 0) {
                  const dueAt = invoice.next_payment_attempt
                    ? new Date(invoice.next_payment_attempt * 1000)
                    : null;
                  if (dueAt) {
                    await maybeWarnAboutBill(state, subLogin, (invoice.amount_due || 0) / 100, dueAt);
                  }
                }
              }
            } catch (e) {
              console.error('[billing] Kin recalculation failed:', e);
            }
          }
          break;
        }

        case 'invoice.paid': {
          // State upsert only — Stripe sends the receipt itself.
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.metadata?.kind === 'library' || invoice.metadata?.library_purchase === 'true') break;
          const subId = extractSubscriptionId(invoice);
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              if (sub.metadata?.kind === 'patron') {
                const email = (sub.metadata?.follow_email || invoice.customer_email || '').toLowerCase();
                const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || '';
                if (email && customerId) {
                  await upsertPatronSubscription({
                    subscriptionId: sub.id,
                    customerId,
                    email,
                    status: sub.status,
                  });
                }
              }
            } catch (e) {
              console.error('[billing] invoice.paid handler failed:', e);
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const subId = extractSubscriptionId(invoice);
          let paymentFailHandled = false;
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);

              if (sub.metadata?.kind === 'patron') {
                const email = (sub.metadata?.follow_email || '').toLowerCase();
                const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || '';
                if (email && customerId) {
                  await upsertPatronSubscription({
                    subscriptionId: sub.id,
                    customerId,
                    email,
                    status: sub.status,
                  });
                  paymentFailHandled = true;
                }
                logEvent('follow_subscription_payment_failed', { status: sub.status });
                break;
              }

              const subLogin = sub.metadata?.github_login || sub.metadata?.api_key;
              if (subLogin) {
                await onAccountUpdate(subLogin, { subscription_status: 'past_due' });
                paymentFailHandled = true;
              }
            } catch (subErr) {
              console.error('[billing] Subscription lookup failed during payment_failed:', subErr);
            }
          }
          if (!paymentFailHandled) {
            console.error(`[billing] Payment failed but could not update account — customer: ${invoice.customer}, sub: ${subId || 'unknown'}`);
          }
          logEvent('billing_payment_failed', {
            customer: invoice.customer as string,
            handled: paymentFailHandled ? 'true' : 'false',
          });
          break;
        }

        // SetupIntent failures — author signup (BETA setup mode + non-BETA trial
        // mode both run a SetupIntent before any charge). Stripe-hosted Checkout
        // surfaces these to the user via the UI; we log them so failure modes
        // (issuer declines, SCA timeouts, wallet quirks) are visible server-side
        // instead of silent. Triggered by ayo@kaizenlab.co Apple Pay abandonment
        // 2026-05-10 — Stripe never received an Intent so nothing was logged.
        case 'setup_intent.setup_failed': {
          const intent = event.data.object as Stripe.SetupIntent;
          const err = intent.last_setup_error;
          logEvent('billing_setup_failed', {
            intent_id: intent.id,
            code: err?.code || 'unknown',
            decline_code: err?.decline_code || '',
            type: err?.type || '',
            payment_method_type: err?.payment_method?.type || '',
            customer: typeof intent.customer === 'string' ? intent.customer : intent.customer?.id || '',
          });
          break;
        }

        // PaymentIntent failures — library one-time purchases. Same rationale.
        case 'payment_intent.payment_failed': {
          const intent = event.data.object as Stripe.PaymentIntent;
          const err = intent.last_payment_error;
          logEvent('billing_payment_intent_failed', {
            intent_id: intent.id,
            code: err?.code || 'unknown',
            decline_code: err?.decline_code || '',
            type: err?.type || '',
            payment_method_type: err?.payment_method?.type || '',
            amount_cents: String(intent.amount || 0),
          });
          break;
        }

        // Session expired — user opened Checkout but never completed. Useful
        // conversion-loss signal; emits ~24h after creation if no completion.
        case 'checkout.session.expired': {
          const session = event.data.object as Stripe.Checkout.Session;
          logEvent('billing_checkout_expired', {
            session_id: session.id,
            kind: session.metadata?.kind || 'unknown',
            mode: session.mode || 'unknown',
            email: session.customer_email || '',
          });
          break;
        }
      }
    } catch (err) {
      console.error('Webhook handler error:', err);
      return c.text('Webhook handler failed', 500);
    }

    return c.json({ received: true });
  });
}

// ---------------------------------------------------------------------------
// Library — monthly tab settlement (called from cron)
// ---------------------------------------------------------------------------

export async function settleMonthlyTabs(): Promise<void> {
  try {
    const db = getDB();

    // Settle previous month
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

    const { results } = await db.prepare(
      `SELECT accessor_id, SUM(amount_cents) as total_cents
       FROM billing_tab WHERE month = ? AND settled = 0
       GROUP BY accessor_id`
    ).bind(lastMonth).all<{ accessor_id: string; total_cents: number }>();

    if (!results || results.length === 0) return;

    // For each accessor, look up their Stripe customer ID and report usage
    const accounts = await loadAccounts<Record<string, any>>();

    for (const tab of results) {
      // Find account by github_login
      const account = Object.values(accounts).find((a: any) => a.github_login === tab.accessor_id);
      if (!account || !(account as any).stripe_customer_id) {
        console.warn(`[billing] Cannot settle tab for ${tab.accessor_id} — no Stripe customer`);
        continue;
      }

      try {
        // Create an invoice item on their next invoice
        const stripe = getStripe();
        await stripe.invoiceItems.create({
          customer: (account as any).stripe_customer_id,
          amount: tab.total_cents,
          currency: 'usd',
          description: `Library access — ${lastMonth}`,
        });

        // Mark as settled
        await db.prepare(
          `UPDATE billing_tab SET settled = 1 WHERE accessor_id = ? AND month = ? AND settled = 0`
        ).bind(tab.accessor_id, lastMonth).run();

        logEvent('billing_tab_settled', { accessor: tab.accessor_id, month: lastMonth, amount_cents: String(tab.total_cents) });
      } catch (e) {
        console.error(`[billing] Settlement failed for ${tab.accessor_id}:`, e);
      }
    }
  } catch (e) {
    console.error('[billing] settleMonthlyTabs error:', e);
  }
}

// ---------------------------------------------------------------------------
// Pre-bill warning — fired from invoice.upcoming when the user is about to be
// charged. Lead time lets them recover the discount instead of being surprised.
// ---------------------------------------------------------------------------

async function sendPreBillWarningEmail(
  email: string,
  githubLogin: string,
  state: KinPricingState,
  amountDollars: number,
  dueAt: Date | null,
): Promise<void> {
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
  const kinLink = `${WEBSITE_URL}/signup?ref=${encodeURIComponent(githubLogin)}`;

  // Warning fires only when not-free, so at least one of (kinShort, authorQuiet) is true.
  const kinShort = state.kinNeeded > 0;
  const authorQuiet = !state.authorHasFile || !state.authorHasCall;
  // "you're nearly there" / "just N more" only when actually nearly there —
  // saying it at 0/5 reads as gaslighting.
  const nearlyThere = state.kinCompliant >= 3;
  const just = nearlyThere ? 'just ' : '';

  let affirmationLine: string;
  let actionLine: string | null = null;
  if (kinShort && authorQuiet) {
    affirmationLine = `${state.kinCompliant} active kin, ${just}${state.kinNeeded} more &mdash; plus a quick file edit or /a from you &mdash; and it&rsquo;s free.`;
    actionLine = 'send your link to a couple friends.';
  } else if (kinShort) {
    affirmationLine = nearlyThere
      ? `you&rsquo;re nearly there. ${state.kinCompliant} active kin, just ${state.kinNeeded} more and it&rsquo;s free.`
      : `${state.kinCompliant} active kin, ${state.kinNeeded} more and it&rsquo;s free.`;
    actionLine = 'send your link to a couple friends.';
  } else {
    affirmationLine = `${state.kinCompliant} active kin already. one quick file edit or /a from you and it&rsquo;s free.`;
  }

  const dateStr = dueAt
    ? dueAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null;
  const billLine = dateStr
    ? `$${amountDollars.toFixed(0)} on ${dateStr} otherwise.`
    : `$${amountDollars.toFixed(0)} otherwise.`;

  const html = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 420px; margin: 0 auto; padding: 40px 20px; color: #3d3630; text-align: center;">
  <p style="font-size: 1.15rem; color: #3d3630; margin: 0 0 1.5rem;">${affirmationLine}</p>
  ${actionLine ? `<p style="font-size: 1rem; color: #3d3630; margin: 0 0 1.5rem;">${actionLine}</p>` : ''}
  <p style="font-size: 0.9rem; color: #8a8078; margin: 0 0 2rem;">${billLine}</p>
  <p style="font-size: 0.85rem; color: #8a8078; margin: 0;"><a href="${kinLink}" style="color: #8a8078;">your kin link</a></p>
  <p style="font-size: 0.78rem; color: #bbb4aa; margin-top: 2rem;">the examined life.</p>
</div>`;

  const result = await sendEmail(email, 'alexandria. — heads up', html);
  if (!result.ok) {
    logEvent('kin_prebill_warning_failed', { reason: result.error || 'unknown' });
  }
}
