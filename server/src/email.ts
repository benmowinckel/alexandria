/** Email primitives — Resend API (hybrid dependency, API-controllable, free 100/day). */

import { installPrompt } from './install-prompt.js';
import { chatInstallPrompt, CHAT_INSTRUCTION_PATHS } from './chat-prompt.js';

export const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || 'benmowinckel@gmail.com';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
const SERVER_URL = process.env.SERVER_URL || 'https://api.alexandria-library.com';

/**
 * Run up to `concurrency` email sends in parallel, draining the task list in
 * batches. Keeps us comfortably under Resend's 2 req/s free-tier limit while
 * not being so serialised that cron jobs wall-clock forever at scale.
 */
export async function sendEmailsBatched<T>(
  tasks: T[],
  sendOne: (task: T) => Promise<{ ok: boolean; error?: string }>,
  concurrency = 5,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(sendOne));
    for (const r of results) { if (r.ok) sent++; else failed++; }
  }
  return { sent, failed };
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*/gi, '\n\n')
    .replace(/<a [^>]*href="(https?:[^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2: $1')
    .replace(/<a [^>]*href="(?:tel|mailto):[^"]+"[^>]*>([^<]*)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/ +/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Shared email shell — the one branded wrapper every user-facing email rides
 * (2026-07-17 funnel-consistency sweep). Two jobs: (1) brand — every email is
 * the same paper-cream card in EB Garamond the website is, with the founder's
 * signature block and the quiet unsubscribe footer in one place instead of
 * nine hand-copied variants; (2) dark-mode safety — the emails used to set
 * dark ink with NO background, so dark-mode mail clients (Apple Mail keeps
 * custom text colors while darkening the canvas) could render them
 * near-invisible. An EXPLICIT paper background pins the contrast in every
 * client. Copy stays each sender's own; this is chrome only.
 */
function emailShell(inner: string, unsubscribeUrl?: string): string {
  return `<div style="background: #f5f0e8; margin: 0; padding: 24px 12px;">
  <div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 36px 24px; color: #3d3630; font-size: 1.05rem; line-height: 1.7;">
  ${inner}
  <p style="margin: 0 0 0.4rem;">Benjamin a. Mowinckel</p>
  <p style="margin: 0; font-style: italic; color: #8a8078;">a.</p>${unsubscribeUrl ? `
  <p style="margin: 1.5rem 0 0; font-size: 0.72rem; color: #bbb4aa;"><a href="${unsubscribeUrl}" style="color: #8a8078;">stop these emails</a></p>` : ''}
  </div>
</div>`;
}

// --- Action primitives (form-as-content: the ONE thing to do is a structural
// element, not buried in prose — the email version of the pages' clear CTAs). ---

// A filled pill link — the primary action for URL-based asks.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The non-executable setup message to paste — the action, as a monospace card.
function emailCmd(message: string): string {
  return `<pre style="white-space: pre-wrap; margin: 0 0 1.4rem; background: rgba(61,54,48,0.06); border-radius: 8px; padding: 14px 16px; overflow-wrap: anywhere;"><code style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; color: #3d3630;">${escapeHtml(message)}</code></pre>`;
}
// A shareable link on its own line (their invite link — a thing to copy, not click).
function emailLinkLine(url: string, display: string): string {
  return `<p style="margin: 0 0 1.8rem; word-break: break-all;"><a href="${url}" style="color: #3d3630;">${display}</a></p>`;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts?: { unsubscribeUrl?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = {
      from: 'Alexandria <a@alexandria-library.com>',
      reply_to: 'a@alexandria-library.com',
      to,
      subject,
      html,
      text: htmlToText(html),
      ...(opts?.unsubscribeUrl ? {
        headers: {
          'List-Unsubscribe': `<${opts.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      } : {}),
    };
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const error = `Resend ${resp.status}: ${await resp.text()}`;
      console.error(error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    const error = `Email send failed: ${err}`;
    console.error(error);
    return { ok: false, error };
  }
}

export async function sendPatronWelcome(
  email: string,
  amountCents: number,
  unsubscribeToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  const dollars = amountCents % 100 === 0
    ? `$${Math.round(amountCents / 100)}`
    : `$${(amountCents / 100).toFixed(2)}`;
  const unsubscribeUrl = unsubscribeToken ? `${SERVER_URL}/email/stop?t=${unsubscribeToken}` : undefined;
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">thank you for backing alexandria. :)</p>
  <p style="margin: 0 0 1.2rem;">${dollars}/month goes straight into the work. reply any time.</p>`, unsubscribeUrl);

  return await sendEmail(email, 'thank you.', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

export async function sendFollowerWelcome(email: string, unsubscribeToken?: string): Promise<{ ok: boolean; error?: string }> {
  const unsubscribeUrl = unsubscribeToken ? `${SERVER_URL}/email/stop?t=${unsubscribeToken}` : undefined;
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">you&rsquo;re following along. :)</p>
  <p style="margin: 0 0 1.2rem;">you&rsquo;ll be first when there&rsquo;s something new to try. reply any time.</p>`, unsubscribeUrl);

  return await sendEmail(email, 'alexandria.', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

export async function sendWelcomeEmail(email: string, githubLogin: string, emailToken?: string, apiKey?: string): Promise<void> {
  void githubLogin;
  // Connect message — carry it in the email body so a user who finishes GitHub
  // OAuth but abandons Stripe is never stranded without their key. Same command
  // the founding-member page shows; re-running setup.sh with the key is
  // idempotent (installs + links, or just links if already installed). Only
  // included when we actually minted a key for this sign-in (new / uninstalled).
  // It is deliberately non-executable: an existing install uses its local
  // verifier; a first install independently authenticates one exact commit.
  const connectCmd = apiKey
    ? installPrompt({ apiKey })
    : '';
  const unsubscribeUrl = emailToken ? `${SERVER_URL}/email/stop?t=${emailToken}` : undefined;
  const body = connectCmd
    ? `<p style="font-size: 1.15rem; margin: 0 0 1.5rem;">you&rsquo;re in.</p>
  <p style="margin: 0 0 0.7rem;">paste this into the agent on your computer.</p>
  ${emailCmd(connectCmd)}
  <p style="margin: 0 0 0;">it will connect your account and tell you how to start.</p>
`
    : `<p style="font-size: 1.15rem; margin: 0 0 1.5rem;">you&rsquo;re in.</p>
  <p style="margin: 0 0 0;">open the ai you already use and start an Alexandria session.</p>
`;
  await sendEmail(email, 'welcome to alexandria.', emailShell(body, unsubscribeUrl),
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

// "you're free" carrot — fired once when a member crosses to KIN_THRESHOLD (3)
// active kin. Membership is free while those friends stay. Celebration + a
// nudge to keep sharing. Not a charge email; the crossing is detected where
// kin pricing recalcs run.
export async function sendKinFreeUnlocked(
  email: string,
  githubLogin: string,
  emailToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  // /invite — the referral landing; forwards the ref to /start for kin
  // attribution ("every one after just grows the tribe").
  const kinLink = `${WEBSITE_URL}/invite?ref=${encodeURIComponent(githubLogin)}`;
  const unsubscribeUrl = emailToken ? `${SERVER_URL}/email/stop?t=${emailToken}` : undefined;
  const html = emailShell(`<p style="font-size: 1.15rem; margin: 0 0 1.2rem;">you&rsquo;re free.</p>
  <p style="margin: 0 0 1.2rem; color: #8a8078;">three friends joined through you &mdash; so your membership is free while they stay. thank you.</p>
  <p style="margin: 0 0 0.5rem;">keep sharing &mdash; every extra friend is a cushion.</p>
  ${emailLinkLine(kinLink, kinLink.replace(/^https?:\/\//, ''))}`, unsubscribeUrl);
  return await sendEmail(email, 'alexandria. — you’re free.', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

// Kin-lapse warning — fired once when a member drops BELOW KIN_THRESHOLD active
// kin and the discount is removed, so a dollar a day resumes. The honest
// counterpart to the carrot: the re-charge is never silent. The crossing is
// detected where kin pricing recalcs run. resumeDate = the next charge date.
export async function sendKinLapseWarning(
  email: string,
  githubLogin: string,
  resumeDate: Date | null,
  emailToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  // Every referral starts with the free loop. The ref survives /invite → /start
  // and is recovered when the person later joins; a referrer's bill never gets
  // to make a stranger's first experience worse.
  const kinLink = `${WEBSITE_URL}/invite?ref=${encodeURIComponent(githubLogin)}`;
  const when = resumeDate
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(resumeDate).toLowerCase()
    : null;
  const resumeLine = when ? `it goes back to a dollar a day on ${when}` : `it goes back to a dollar a day at your next renewal`;
  const unsubscribeUrl = emailToken ? `${SERVER_URL}/email/stop?t=${emailToken}` : undefined;
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">heads up &mdash; your free membership paused.</p>
  <p style="margin: 0 0 0.6rem; color: #8a8078;">you dropped below three active friends, so ${resumeLine}. add one back and it&rsquo;s free again.</p>
  ${emailLinkLine(kinLink, kinLink.replace(/^https?:\/\//, ''))}
  <p style="margin: 0 0 0; color: #8a8078; font-size: 0.95rem;">don&rsquo;t want to pay right now? just reply and i&rsquo;ll waive it.</p>`, unsubscribeUrl);
  return await sendEmail(email, 'alexandria. — back to a dollar a day', html,  // subject unchanged
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

export async function sendWeekOneCheckIn(
  email: string,
  emailToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const unsubscribeUrl = `${SERVER_URL}/email/stop?t=${emailToken}`;
  const html = emailShell(`<p style="margin: 0 0 1.4rem;">hey :)</p>
  <p style="margin: 0 0 1.4rem;">a week in &mdash; how&rsquo;s it going?</p>
  <p style="margin: 0 0 0;">just hit reply and tell me what&rsquo;s working, or what isn&rsquo;t. you&rsquo;re early enough that it actually changes what i build.</p>`, unsubscribeUrl);
  return await sendEmail(email, 'checking in.', html, { unsubscribeUrl });
}

// --- Start onboarding ---
// The email is both a recovery copy of the handoff and the durable human
// relationship. Private files and install state remain outside the server.

export type OnboardingMode = 'agent-computer' | 'agent-phone' | 'chat';

function onboardCmd(mode: OnboardingMode): string {
  return mode === 'chat' ? chatInstallPrompt() : installPrompt();
}

export function onboardEmailContent(mode: OnboardingMode, emailToken: string): { subject: string; html: string } {
  const unsubscribeUrl = `${SERVER_URL}/email/stop?t=${emailToken}`;
  const copy = mode === 'chat'
    ? {
        subject: 'alexandria. — your chat setup',
        lead: 'paste this into a chat, then type a.',
      }
    : mode === 'agent-phone'
      ? {
          subject: 'alexandria. — continue at your computer',
          lead: 'when you are at your computer, open the agent you use there and paste this.',
        }
      : {
          subject: 'alexandria. — your computer setup',
          lead: 'here is the setup for the agent on your computer. if you already pasted it, keep this as your backup.',
        };
  const paths = mode === 'chat'
    ? `<p style="margin: 0.8rem 0 0; color: #8a8078; font-size: 0.95rem;">${CHAT_INSTRUCTION_PATHS.map((row) => `${row.host} — ${row.path}`).join('<br />')}</p>
  <p style="margin: 0.8rem 0 0; color: #8a8078; font-size: 0.95rem;">those settings make it last across chats.</p>`
    : '';
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">${copy.lead}</p>
  ${emailCmd(onboardCmd(mode))}
  ${paths}
  <p style="margin: 1.6rem 0 0;">reply if you get stuck.</p>`, unsubscribeUrl);
  return { subject: copy.subject, html };
}

export async function sendOnboardCommand(
  email: string,
  emailToken: string,
  mode: OnboardingMode = 'agent-computer',
): Promise<{ ok: boolean; error?: string }> {
  const unsubscribeUrl = `${SERVER_URL}/email/stop?t=${emailToken}`;
  const content = onboardEmailContent(mode, emailToken);
  return await sendEmail(email, content.subject, content.html, { unsubscribeUrl });
}

export function preBillWarningContent(opts: {
  githubLogin: string;
  kinCompliant: number;
  kinNeeded: number;
  amountDollars: number;
  dueAt: Date | null;
  emailToken?: string;
}): { subject: string; html: string; unsubscribeUrl?: string } {
  const kinLink = `${WEBSITE_URL}/invite?ref=${encodeURIComponent(opts.githubLogin)}`;
  const unsubscribeUrl = opts.emailToken ? `${SERVER_URL}/email/stop?t=${opts.emailToken}` : undefined;
  const nearlyThere = opts.kinNeeded === 1;
  const friendWord = opts.kinCompliant === 1 ? 'friend' : 'friends';
  const kinLine = nearlyThere
    ? `you&rsquo;re nearly there. ${opts.kinCompliant} active ${friendWord}, just 1 more and it&rsquo;s free.`
    : `${opts.kinCompliant} active ${friendWord}, ${opts.kinNeeded} more and it&rsquo;s free.`;
  const actionLine = opts.kinNeeded === 1
    ? 'send your link to one more friend.'
    : opts.kinNeeded === 2
      ? 'send your link to a couple friends.'
      : 'send your link to a few friends.';
  const when = opts.dueAt
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(opts.dueAt).toLowerCase()
    : null;
  const billLine = when
    ? `$${opts.amountDollars.toFixed(0)} on ${when} otherwise.`
    : `$${opts.amountDollars.toFixed(0)} otherwise.`;
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">${kinLine}</p>
  <p style="margin: 0 0 0.6rem;">${actionLine}</p>
  ${emailLinkLine(kinLink, kinLink.replace(/^https?:\/\//, ''))}
  <p style="margin: 0 0 1.2rem; color: #8a8078;">${billLine}</p>
  <p style="margin: 0 0 0; color: #8a8078; font-size: 0.95rem;">don&rsquo;t want to pay right now? just reply and i&rsquo;ll waive it.</p>`, unsubscribeUrl);
  return { subject: 'alexandria. — heads up', html, unsubscribeUrl };
}

export async function sendPreBillWarning(
  email: string,
  githubLogin: string,
  opts: {
    kinCompliant: number;
    kinNeeded: number;
    amountDollars: number;
    dueAt: Date | null;
    emailToken?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const content = preBillWarningContent({ githubLogin, ...opts });
  return await sendEmail(
    email,
    content.subject,
    content.html,
    content.unsubscribeUrl ? { unsubscribeUrl: content.unsubscribeUrl } : undefined,
  );
}

export function setupFixNudgeContent(emailToken: string): { subject: string; html: string; unsubscribeUrl: string } {
  const unsubscribeUrl = `${SERVER_URL}/email/stop?t=${emailToken}`;
  const joinUrl = `${WEBSITE_URL}/join`;
  const html = emailShell(`<p style="margin: 0 0 0;">i fixed a setup issue. <a href="${joinUrl}" style="color: #3d3630;">sign in</a> and you&rsquo;ll get the updated line.</p>`, unsubscribeUrl);
  return { subject: 'alexandria. — quick fix', html, unsubscribeUrl };
}

// sendMorningBrief / sendMorningNudge removed: morning brief + nudge are now
// fully sovereign on each Author's machine (factory/scripts/brief.py + their
// own SMTP creds + their own launchd schedule). Email-on-behalf-of-users is
// out of scope for the company server — see factory/skills/brief-setup.md.
