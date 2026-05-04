/**
 * Billing — Stripe subscription management + Library payment
 *
 * Subscription: $10/mo, or free with 5+ active kin. Binary. Slider open above floor.
 * Library: monthly tab billing (micro-transactions settled monthly via Stripe Billing Meters).
 * Non-Author: instant payment via Stripe Checkout.
 * Free during beta — billing infra is ready but not gating.
 */

import Stripe from 'stripe';
import type { Hono } from 'hono';
import { logEvent } from './analytics.js';
import { callbackPageHtml } from './templates.js';
import { hashApiKey } from './crypto.js';
import { requireAuth } from './auth.js';
import { loadAccounts, getKV } from './kv.js';
import { getDB } from './db.js';
import { sendPatronAck } from './email.js';

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
  const products = await stripe.products.list({ limit: 10 });
  let product = products.data.find(p => p.metadata.alexandria === 'examined_life');

  if (!product) {
    product = await stripe.products.create({
      name: 'The Examined Life',
      description: 'Alexandria — Greek philosophy infrastructure. One tier, everything included.',
      metadata: { alexandria: 'examined_life' },
    });
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

export async function countActiveKin(githubLogin: string, preloadedAccounts?: Record<string, any>): Promise<{ count: number; compliant: number }> {
  if (!githubLogin) return { count: 0, compliant: 0 };

  // Find who this user referred (from D1 referrals table)
  const db = getDB();
  const { results } = await db.prepare(
    `SELECT referred_github_login FROM referrals WHERE author_id = ?`
  ).bind(githubLogin).all<{ referred_github_login: string }>();

  if (!results || results.length === 0) return { count: 0, compliant: 0 };

  const kinLogins = results.map(r => r.referred_github_login).filter(Boolean);
  if (kinLogins.length === 0) return { count: 0, compliant: 0 };

  // Compliant kin = meets all three obligations this month:
  // 1. Account exists (they have an account)
  // 2. File edited this month (protocol_files updated in current month)
  // 3. Call made this month (protocol_calls table)
  const accounts = preloadedAccounts || await loadAccounts<Record<string, any>>();
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  // Build login→github_id map for kin that have accounts
  const kinWithAccounts: { login: string; githubId: string }[] = [];
  for (const login of kinLogins) {
    const kinAccount = Object.values(accounts).find((a: any) => a.github_login === login);
    if (!kinAccount) continue; // No account — not compliant
    kinWithAccounts.push({ login, githubId: String((kinAccount as any).github_id) });
  }

  if (kinWithAccounts.length === 0) return { count: kinLogins.length, compliant: 0 };

  const githubIds = kinWithAccounts.map(k => k.githubId);
  const idPlaceholders = githubIds.map(() => '?').join(',');
  const monthStart = currentMonth + '-01';

  // Batch D1 query for file freshness — protocol_files keyed by github_id
  const { results: files } = await db.prepare(
    `SELECT account_id, MAX(updated_at) as last_edit FROM protocol_files WHERE account_id IN (${idPlaceholders}) GROUP BY account_id`
  ).bind(...githubIds).all<{ account_id: string; last_edit: string }>();
  const fileEdits = new Map((files || []).map(f => [f.account_id, f.last_edit]));

  // Batch D1 query for protocol calls — one query for all kin
  const { results: callResults } = await db.prepare(
    `SELECT DISTINCT account_id FROM protocol_calls WHERE account_id IN (${idPlaceholders}) AND time > ?`
  ).bind(...githubIds, monthStart).all<{ account_id: string }>();
  const hasCallSet = new Set((callResults || []).map(r => r.account_id));

  let compliant = 0;
  for (const { githubId } of kinWithAccounts) {
    const hasCall = hasCallSet.has(githubId);
    const lastEdit = fileEdits.get(githubId);
    const hasFile = lastEdit?.startsWith(currentMonth);

    if (hasCall && hasFile) compliant++;
  }

  return { count: kinLogins.length, compliant };
}

async function recalculateKinPricing(githubLogin: string, preloadedAccounts?: Record<string, any>): Promise<void> {
  // Find account by github_login
  const accounts = preloadedAccounts || await loadAccounts<Record<string, any>>();
  const user = Object.values(accounts).find((a: any) => a.github_login === githubLogin) as any;
  if (!user?.subscription_id) return;

  // Author must be compliant themselves (file + call this month) to get kin discount
  const currentMonth = new Date().toISOString().slice(0, 7);
  let authorHasCall = false;
  let authorHasFile = false;
  try {
    const db = getDB();
    const callCheck = await db.prepare(
      `SELECT 1 FROM protocol_calls WHERE account_id = ? AND time > ? LIMIT 1`
    ).bind(String(user.github_id), currentMonth + '-01').first();
    authorHasCall = !!callCheck;
    const file = await db.prepare(
      `SELECT MAX(updated_at) as last_edit FROM protocol_files WHERE account_id = ?`
    ).bind(String(user.github_id)).first<{ last_edit: string | null }>();
    authorHasFile = !!file?.last_edit?.startsWith(currentMonth);
  } catch { /* D1 unavailable — treat as non-compliant */ }
  const authorCompliant = authorHasCall && authorHasFile;

  const kinData = await countActiveKin(githubLogin, accounts);
  const shouldBeFree = authorCompliant && kinData.compliant >= KIN_THRESHOLD;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(user.subscription_id);

  const hasKinDiscount = sub.discounts?.some(d => {
    if (typeof d === 'string') return false;
    const coupon = d.source?.coupon;
    return typeof coupon !== 'string' && coupon?.metadata?.alexandria === 'kin_free';
  });

  if (shouldBeFree && !hasKinDiscount) {
    const couponId = await ensureKinCoupon();
    await stripe.subscriptions.update(user.subscription_id, { discounts: [{ coupon: couponId }] });
    logEvent('kin_pricing_free', { github_login: user.github_login, compliant_kin: String(kinData.compliant) });
  } else if (!shouldBeFree && hasKinDiscount) {
    await stripe.subscriptions.deleteDiscount(user.subscription_id);
    logEvent('kin_pricing_paid', { github_login: user.github_login, compliant_kin: String(kinData.compliant) });
  }
}

/** Recalculate kin pricing for all subscribed users. Called monthly by cron. */
export async function recalculateAllKinPricing(): Promise<void> {
  if (process.env.BETA_MODE === 'true') return; // No billing in beta
  const accounts = await loadAccounts<Record<string, any>>();
  for (const account of Object.values(accounts)) {
    if ((account as any).subscription_id && (account as any).github_login) {
      try {
        await recalculateKinPricing((account as any).github_login, accounts);
      } catch (err) {
        console.error(`[kin] Recalculation failed for ${(account as any).github_login}:`, err);
      }
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

export async function createCheckoutSession(opts: {
  email: string;
  githubLogin: string;
  stripeCustomerId?: string;
}): Promise<string> {
  const stripe = getStripe();
  const SERVER_URL = process.env.SERVER_URL || 'https://mcp.mowinckel.ai';
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://mowinckel.ai';
  const BETA = process.env.BETA_MODE === 'true';

  const customer = opts.stripeCustomerId
    ? { customer: opts.stripeCustomerId }
    : { customer_email: opts.email };

  // No API keys in Stripe metadata — identify accounts by github_login only
  if (BETA) {
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'usd',
      ...customer,
      metadata: { kind: 'author', github_login: opts.githubLogin },
      custom_text: {
        submit: { message: 'free in beta. we\'ll let you know before billing starts.' },
      },
      success_url: `${SERVER_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEBSITE_URL}/signup?billing=cancel`,
    });
    return session.url || '';
  }

  const priceId = await ensurePrice();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...customer,
    subscription_data: {
      description: 'the examined life',
      metadata: { kind: 'author', github_login: opts.githubLogin },
    },
    metadata: { kind: 'author', github_login: opts.githubLogin },
    success_url: `${SERVER_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${WEBSITE_URL}/signup?billing=cancel`,
  });

  return session.url || '';
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
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://mowinckel.ai';
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

export async function createPortalSession(stripeCustomerId: string): Promise<string> {
  const stripe = getStripe();
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://mowinckel.ai';
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${WEBSITE_URL}/signup`,
  });
  return session.url;
}

// ---------------------------------------------------------------------------
// Billing routes
// ---------------------------------------------------------------------------

export type AccountUpdater = (identifier: string, billing: Partial<BillingInfo>) => Promise<void>;

export function registerBillingRoutes(app: Hono, onAccountUpdate: AccountUpdater) {
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://mowinckel.ai';

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

      return c.html(callbackPageHtml(''));
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
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
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

          // Library one-time purchase (non-Author)
          if (session.metadata?.library_purchase === 'true') {
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
          // Recalculate kin pricing ~3 days before billing
          const invoice = event.data.object as Stripe.Invoice;
          const subId = extractSubscriptionId(invoice);
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              const subLogin = sub.metadata?.github_login || sub.metadata?.api_key;
              if (subLogin) {
                await recalculateKinPricing(subLogin);
              }
            } catch (e) {
              console.error('[billing] Kin recalculation failed:', e);
            }
          }
          break;
        }

        case 'invoice.paid': {
          // Send kin nudge receipt after each billing cycle
          const invoice = event.data.object as Stripe.Invoice;
          // Skip Library purchases and non-subscription invoices
          if (invoice.metadata?.library_purchase === 'true') break;
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
                  // Acknowledgment only on first invoice — Stripe handles renewal receipts.
                  if (invoice.billing_reason === 'subscription_create') {
                    const amountDollars = (invoice.amount_paid || 0) / 100;
                    try {
                      const portalUrl = await createPortalSession(customerId);
                      await sendPatronAck(email, amountDollars, portalUrl);
                      logEvent('follow_subscription_ack_sent', { amount: String(amountDollars) });
                    } catch (e) {
                      console.error('[billing] Patron ack email failed:', e);
                    }
                  }
                }
                break;
              }

              const subLogin = sub.metadata?.github_login || sub.metadata?.api_key;
              if (subLogin) {
                // Find account by login (primary) or api_key hash (legacy)
                type BillingAccount = { github_login?: string; api_key_hash?: string; email?: string };
                const accounts = await loadAccounts<Record<string, BillingAccount>>();
                const legacyKeyHash = subLogin.startsWith('alex_') ? hashApiKey(subLogin) : null;
                const user = Object.values(accounts).find((account) => {
                  if (account.github_login === subLogin) return true;
                  if (legacyKeyHash) return account.api_key_hash === legacyKeyHash;
                  return false;
                });
                if (user?.email && user.github_login) {
                  const kinData = await countActiveKin(user.github_login);
                  const amountPaid = (invoice.amount_paid || 0) / 100;
                  const kinNeeded = Math.max(0, KIN_THRESHOLD - kinData.compliant);
                  await sendKinReceiptEmail(user.email, user.github_login, amountPaid, kinData.compliant, kinNeeded);
                  logEvent('kin_receipt_sent', { github_login: user.github_login, compliant_kin: String(kinData.compliant), amount: String(amountPaid) });
                }
              }
            } catch (e) {
              console.error('[billing] Kin receipt email failed:', e);
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
// Kin receipt email — sent after each billing cycle
// ---------------------------------------------------------------------------

async function sendKinReceiptEmail(
  email: string,
  githubLogin: string,
  amountPaid: number,
  activeKin: number,
  kinNeeded: number,
): Promise<void> {
  const WEBSITE_URL = process.env.WEBSITE_URL || 'https://mowinckel.ai';
  const kinLink = `${WEBSITE_URL}/signup?ref=${encodeURIComponent(githubLogin)}`;

  const kinLine = kinNeeded === 0
    ? `<p style="font-size: 1rem; color: #3d3630; margin: 0;">you have ${activeKin} active kin. alexandria is free.</p>`
    : `<p style="font-size: 1rem; color: #3d3630; margin: 0;">you have ${activeKin} active kin. ${kinNeeded} more and it&rsquo;s free.</p>`;

  const amountLine = amountPaid === 0
    ? `<p style="font-size: 1.15rem; color: #3d3630; margin: 0 0 1.5rem;">$0 this month.</p>`
    : `<p style="font-size: 1.15rem; color: #3d3630; margin: 0 0 1.5rem;">$${amountPaid.toFixed(0)} this month.</p>`;

  const html = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 420px; margin: 0 auto; padding: 40px 20px; color: #3d3630; text-align: center;">
  ${amountLine}
  ${kinLine}
  <p style="font-size: 0.85rem; color: #8a8078; margin: 1.5rem 0 0;"><a href="${kinLink}" style="color: #8a8078;">your kin link</a></p>
  <p style="font-size: 0.78rem; color: #bbb4aa; margin-top: 2rem;">the examined life.</p>
</div>`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Alexandria <a@mowinckel.ai>',
        to: email,
        subject: amountPaid === 0 ? 'alexandria. — free this month' : `alexandria. — $${amountPaid.toFixed(0)} this month`,
        html,
      }),
    });
    if (!resp.ok) {
      console.error('[billing] Receipt email Resend error:', resp.status, await resp.text());
    }
  } catch (err) {
    console.error('[billing] Receipt email send failed:', err);
  }
}
