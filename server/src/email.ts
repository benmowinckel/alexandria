/** Email primitives — Resend API (hybrid dependency, API-controllable, free 100/day). */

import { installPrompt } from './install-prompt.js';

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
// Inline key/command chip — e.g. /a in running prose.
function emailKbd(text: string): string {
  return `<code style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; background: rgba(61,54,48,0.07); border-radius: 4px; padding: 1px 5px; color: #3d3630;">${text}</code>`;
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
  <p style="margin: 0 0 1.2rem;">${dollars}/month goes straight into the work. i&rsquo;ll send an update every week or so &mdash; reply any time, i read them all.</p>`, unsubscribeUrl);

  return await sendEmail(email, 'thank you.', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

export async function sendFollowerWelcome(email: string, unsubscribeToken?: string): Promise<{ ok: boolean; error?: string }> {
  // Copy verbatim; typography normalised to the house style (curly quotes,
  // em-dashes — design.md) where this one had strayed to straight marks.
  const unsubscribeUrl = unsubscribeToken ? `${SERVER_URL}/email/stop?t=${unsubscribeToken}` : undefined;
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">you&rsquo;re following along. :)</p>
  <p style="margin: 0 0 1.2rem;">i&rsquo;ll send an update every week or so &mdash; and you&rsquo;ll be first when there&rsquo;s something new to try. reply any time.</p>`, unsubscribeUrl);

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
  <p style="margin: 0 0 0.7rem;">paste this into your coding app:</p>
  ${emailCmd(connectCmd)}
  <p style="margin: 0 0 0;">then type ${emailKbd('/a')}.</p>
`
    : `<p style="font-size: 1.15rem; margin: 0 0 1.5rem;">you&rsquo;re in.</p>
  <p style="margin: 0 0 0;">open a new tab and type ${emailKbd('/a')}.</p>
`;
  await sendEmail(email, 'welcome to alexandria.', emailShell(body, unsubscribeUrl),
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

// "you're free" carrot — fired once when a member crosses to KIN_THRESHOLD (3)
// active kin, so membership is now free for good. Celebration + a nudge to keep
// sharing (the more they share, the more the community grows). Not a charge
// email; the crossing itself is detected where kin pricing recalcs run.
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
  <p style="margin: 0 0 0.5rem;">keep sharing &mdash; every extra friend is a cushion:</p>
  ${emailLinkLine(kinLink, kinLink.replace(/^https?:\/\//, ''))}`, unsubscribeUrl);
  return await sendEmail(email, 'alexandria. — you’re free.', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

// Kin-lapse warning — fired once when a member drops BELOW KIN_THRESHOLD active
// kin and the free-for-good discount is removed, so $30/month resumes. The honest
// counterpart to the carrot: the re-charge is never silent. The crossing is
// detected where kin pricing recalcs run. resumeDate = the next charge date.
export async function sendKinLapseWarning(
  email: string,
  githubLogin: string,
  resumeDate: Date | null,
  emailToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  // JOIN door (deliberate — not the /start TRY door the other emails use):
  // "add one more and it's free again" needs the friend to become a MEMBER
  // before $10 resumes, so the link opens the membership page directly.
  const kinLink = `${WEBSITE_URL}/join?ref=${encodeURIComponent(githubLogin)}`;
  const when = resumeDate
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(resumeDate).toLowerCase()
    : null;
  const resumeLine = when ? `it goes back to a dollar a day on ${when}` : `it goes back to a dollar a day at your next renewal`;
  const unsubscribeUrl = emailToken ? `${SERVER_URL}/email/stop?t=${emailToken}` : undefined;
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">heads up &mdash; your free membership paused.</p>
  <p style="margin: 0 0 0.6rem; color: #8a8078;">you dropped below three active friends, so ${resumeLine}. add one back and it&rsquo;s free again:</p>
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
  <p style="margin: 0 0 1.4rem;">a week in &mdash; how&rsquo;s it going? the more you put into it, the more it becomes yours.</p>
  <p style="margin: 0 0 0;">just hit reply and tell me one thing: what&rsquo;s working, or what isn&rsquo;t. you&rsquo;re early enough that it actually changes what i build.</p>`, unsubscribeUrl);
  return await sendEmail(email, 'checking in.', html, { unsubscribeUrl });
}

// --- Mobile onboarding — one requested setup-message delivery ---
// Phones have no terminal, so the email carries the same non-executable agent
// handoff as /start. No reminder, waitlist, shortcut, or completion tracker.

function onboardCmd(): string {
  return installPrompt();
}

export async function sendOnboardCommand(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">paste this into your coding app when you&rsquo;re at your computer:</p>
  ${emailCmd(onboardCmd())}
  <p style="margin: 1.6rem 0 0;">this is the only setup email we&rsquo;ll send.</p>`);
  return await sendEmail(email, 'alexandria. — your setup message', html);
}

// sendMorningBrief / sendMorningNudge removed: morning brief + nudge are now
// fully sovereign on each Author's machine (factory/scripts/brief.py + their
// own SMTP creds + their own launchd schedule). Email-on-behalf-of-users is
// out of scope for the company server — see factory/skills/brief-setup.md.
