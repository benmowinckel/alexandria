/** Email primitives — Resend API (hybrid dependency, API-controllable, free 100/day). */

export const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || 'benmowinckel@gmail.com';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
const SERVER_URL = process.env.SERVER_URL || 'https://api.alexandria-library.com';
const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337';

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
function emailCta(label: string, url: string): string {
  return `<p style="margin: 0 0 1.6rem;"><a href="${url}" style="display: inline-block; background: #3d3630; color: #f5f0e8; font-size: 1rem; letter-spacing: 0.01em; text-decoration: none; padding: 11px 26px; border-radius: 9px;">${label}</a></p>`;
}
// The command to paste — the action, as a monospace card.
function emailCmd(cmd: string): string {
  return `<p style="margin: 0 0 1.4rem; background: rgba(61,54,48,0.06); border-radius: 8px; padding: 14px 16px; word-break: break-all;"><code style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; color: #3d3630;">${cmd}</code></p>`;
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
  const html = emailShell(`<p style="margin: 0 0 1.4rem;">thank you for backing alexandria. :)</p>
  <p style="margin: 0 0 1.4rem;">${dollars}/month goes straight back into the work &mdash; infrastructure, time, the slow build.</p>
  <p style="margin: 0 0 1.4rem;">every week or so i&rsquo;ll send you an update &mdash; stories, photos, vlogs, the good and the bad. reply any time; i read them all.</p>
  <p style="margin: 0 0 1.8rem;">know someone else who&rsquo;d want in? send them to <a href="${WEBSITE_URL}" style="color: #3d3630;">alexandria-library.com</a>.</p>`, unsubscribeUrl);

  return await sendEmail(email, 'thank you.', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

export async function sendFollowerWelcome(email: string, unsubscribeToken?: string): Promise<{ ok: boolean; error?: string }> {
  // Copy verbatim; typography normalised to the house style (curly quotes,
  // em-dashes — design.md) where this one had strayed to straight marks.
  const unsubscribeUrl = unsubscribeToken ? `${SERVER_URL}/email/stop?t=${unsubscribeToken}` : undefined;
  const html = emailShell(`<p style="margin: 0 0 1.4rem;">welcome to alexandria. :)</p>
  <p style="margin: 0 0 1.4rem;">every week or so i&rsquo;ll send you an update &mdash; stories, photos, vlogs, the good and the bad. and when there&rsquo;s something new to try, you&rsquo;ll be first to know.</p>
  <p style="margin: 0 0 1.4rem;">reply any time; i read them all.</p>
  <p style="margin: 0 0 1.8rem;">know someone else who&rsquo;d want in? send them to <a href="${WEBSITE_URL}" style="color: #3d3630;">alexandria-library.com</a> &mdash; they can try it free, or just follow along.</p>`, unsubscribeUrl);

  return await sendEmail(email, 'alexandria.', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

export async function sendWelcomeEmail(email: string, githubLogin: string, emailToken?: string, apiKey?: string): Promise<void> {
  const websiteHost = WEBSITE_URL.replace(/^https?:\/\//, '');
  // Invite link opens /invite — the self-contained referral landing (who sent
  // you, what it is, one action). It forwards the ref to /start, so kin
  // attribution through install → eventual join is intact.
  const kinLink = `${WEBSITE_URL}/invite?ref=${encodeURIComponent(githubLogin)}`;
  const kinLinkDisplay = `${websiteHost}/invite?ref=${githubLogin}`;
  // Connect command — carry it in the email body so a user who finishes GitHub
  // OAuth but abandons Stripe is never stranded without their key. Same command
  // the founding-member page shows; re-running setup.sh with the key is
  // idempotent (installs + links, or just links if already installed). Only
  // included when we actually minted a key for this sign-in (new / uninstalled).
  // Branded form: /a is a 307 to the raw setup.sh on GitHub — the L in -fsSL
  // (--location) follows it, so the redirect MUST stay paired with -fsSL.
  const connectCmd = apiKey
    ? `curl -fsSL alexandria-library.com/a | bash -s -- ${apiKey}`
    : '';
  const unsubscribeUrl = emailToken ? `${SERVER_URL}/email/stop?t=${emailToken}` : undefined;
  const body = connectCmd
    ? `<p style="font-size: 1.15rem; margin: 0 0 1.5rem;">welcome to alexandria &mdash; you&rsquo;re in.</p>
  <p style="margin: 0 0 0.7rem;">one thing to finish: paste this into your coding agent (claude code, cursor, codex, factory &mdash; or any ai agent with a terminal) and hit enter.</p>
  ${emailCmd(connectCmd)}
  <p style="margin: 0 0 0.7rem; color: #8a8078;">unsure about running it? right instinct &mdash; tell your agent to review it before running it. the full audit is at <a href="https://alexandria-library.com/mechanics" style="color: #8a8078;">alexandria-library.com/mechanics</a>.</p>
  <p style="margin: 0 0 1.6rem;">then open a new tab, type ${emailKbd('/a')}, and leave it running &mdash; whenever you&rsquo;ve got a minute.</p>
  <p style="margin: 0 0 0.5rem; color: #8a8078;">your invite link &mdash; send it to a few people now. three who join keeps your membership free while they stay:</p>
  ${emailLinkLine(kinLink, kinLinkDisplay)}`
    : `<p style="font-size: 1.15rem; margin: 0 0 1.5rem;">welcome to alexandria &mdash; you&rsquo;re in.</p>
  <p style="margin: 0 0 1.6rem;">open a new tab, type ${emailKbd('/a')}, and leave it running &mdash; whenever you&rsquo;ve got a minute.</p>
  <p style="margin: 0 0 0.5rem; color: #8a8078;">your invite link &mdash; send it to a few people now. three who join keeps your membership free while they stay:</p>
  ${emailLinkLine(kinLink, kinLinkDisplay)}`;
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
  const html = emailShell(`<p style="font-size: 1.15rem; margin: 0 0 1.4rem;">you&rsquo;re free.</p>
  <p style="margin: 0 0 1.4rem; color: #8a8078;">three friends joined through you &mdash; so your membership is free while they stay members. no $10 for you. thank you for building the community.</p>
  <p style="margin: 0 0 0.5rem;">keep sending it. every extra friend is a cushion &mdash; you stay free even if one drops off, and every one after that just grows the tribe:</p>
  ${emailLinkLine(kinLink, kinLink.replace(/^https?:\/\//, ''))}`, unsubscribeUrl);
  return await sendEmail(email, 'alexandria. — you’re free.', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

// Kin-lapse warning — fired once when a member drops BELOW KIN_THRESHOLD active
// kin and the free-for-good discount is removed, so $10/month resumes. The honest
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
  const resumeLine = when ? `$10/month resumes on ${when}` : `$10/month resumes at your next renewal`;
  const unsubscribeUrl = emailToken ? `${SERVER_URL}/email/stop?t=${emailToken}` : undefined;
  const html = emailShell(`<p style="margin: 0 0 1.4rem;">heads up &mdash; your free membership paused.</p>
  <p style="margin: 0 0 0.6rem; color: #8a8078;">you dropped below three active friends, so ${resumeLine}. add one more and it&rsquo;s free again:</p>
  ${emailLinkLine(kinLink, kinLink.replace(/^https?:\/\//, ''))}
  <p style="margin: 0 0 1.8rem; color: #8a8078; font-size: 0.95rem;">can&rsquo;t find anyone and can&rsquo;t pay right now? just reply and i&rsquo;ll waive it.</p>`, unsubscribeUrl);
  return await sendEmail(email, 'alexandria. — back to $10', html,
    unsubscribeUrl ? { unsubscribeUrl } : undefined);
}

export async function sendWeekOneCheckIn(
  email: string,
  emailToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const unsubscribeUrl = `${SERVER_URL}/email/stop?t=${emailToken}`;
  const html = emailShell(`<p style="margin: 0 0 1.4rem;">hey :)</p>
  <p style="margin: 0 0 1.4rem;">you signed up a week ago &mdash; just checking in.</p>
  <p style="margin: 0 0 1.4rem;">it&rsquo;s like the gym: the more you put in, the more you get out &mdash; and it molds to you. so tell it what you want, what you don&rsquo;t, what&rsquo;s confusing.</p>
  <p style="margin: 0 0 1.6rem;">and tell me: what&rsquo;s working, what isn&rsquo;t? you&rsquo;re early, so what you say actually shapes what i build &mdash; i read all of it. reply here, email <a href="mailto:${FOUNDER_EMAIL}" style="color: #3d3630;">${FOUNDER_EMAIL}</a>, or call <a href="tel:+14155038178" style="color: #3d3630;">+1 (415) 503-8178</a>.</p>
  <p style="margin: 0 0 1.8rem; color: #8a8078;">want to follow along more closely (and support the work)? <a href="${WEBSITE_URL}/follow" style="color: #3d3630;">here</a>.</p>`, unsubscribeUrl);
  return await sendEmail(email, 'checking in.', html, { unsubscribeUrl });
}

export async function sendInstallNudge(
  email: string,
  emailToken: string,
  installToken: string,
  githubLogin: string,
): Promise<{ ok: boolean; error?: string }> {
  void githubLogin; // referral link cut from this email — see below
  const installUrl = `${SERVER_URL}/install/${installToken}`;
  const unsubscribeUrl = `${SERVER_URL}/email/stop?t=${emailToken}`;
  // One job: get them installed. The referral link + "how your data stays
  // yours" mechanics link were cut (founder 2026-07-18) — they distract from
  // the single action; the referral ask comes later, once they're in.
  const html = emailShell(`<p style="margin: 0 0 1.2rem; color: #8a8078;">ready when you are.</p>
  <p style="margin: 0 0 1.2rem;">one thing left: open your install page and run the one line in your coding agent (claude code, cursor, codex, factory &mdash; or any ai agent with a terminal). everything stays on your machine.</p>
  ${emailCta('open your install page', installUrl)}
  <p style="margin: 0 0 1.8rem; color: #8a8078; font-size: 0.95rem;">on your phone? <a href="${SHORTCUT_URL}" style="color: #8a8078;">add the shortcut</a> and start saving things now &mdash; they&rsquo;re waiting the next time you type ${emailKbd('/a')}.</p>`, unsubscribeUrl);
  return await sendEmail(email, 'alexandria. — finish setup.', html, { unsubscribeUrl });
}

// --- Mobile onboarding — command delivery + follow-ups ---
// The mobile /start flow captures an email and delivers the install command
// for later (phones have no terminal). The command carries the install token
// in its path (alexandria-library.com/a/TOKEN) so the setup-script fetch
// marks the capture as installed — the public web command stays tokenless.

function onboardCmd(installToken: string, ref?: string): string {
  // `-s -- --ref <login>` forwards the referrer into setup.sh (it parses --ref
  // and bakes system/.referrer), so a command emailed off a /start?ref visit
  // keeps kin attribution. ref is sanitised to [A-Za-z0-9-] at capture
  // (POST /onboard), so it's shell- and HTML-safe to interpolate here.
  return `curl -fsSL alexandria-library.com/a/${installToken} | bash${ref ? ` -s -- --ref ${ref}` : ''}`;
}

export async function sendOnboardCommand(
  email: string,
  installToken: string,
  unsubscribeToken: string,
  ref?: string,
): Promise<{ ok: boolean; error?: string }> {
  const unsubscribeUrl = `${SERVER_URL}/email/stop?t=${unsubscribeToken}`;
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">here it is. when you&rsquo;re at your computer, paste this into your coding agent (claude code, cursor, codex, factory &mdash; or any ai agent with a terminal):</p>
  ${emailCmd(onboardCmd(installToken, ref))}
  <p style="margin: 0 0 0.7rem; color: #8a8078;">unsure about running it? right instinct &mdash; tell your agent to review it before running it. the full audit is at <a href="https://alexandria-library.com/mechanics" style="color: #8a8078;">alexandria-library.com/mechanics</a>.</p>
  <p style="margin: 0 0 1.6rem; color: #8a8078;">it picks up everything you&rsquo;ve been saving. then open a new tab and type ${emailKbd('/a')}.</p>
  <p style="margin: 0 0 1.8rem;">on your phone until then? <a href="${SHORTCUT_URL}" style="color: #3d3630;">add the shortcut</a> &mdash; save anything, anywhere.</p>`, unsubscribeUrl);
  return await sendEmail(email, 'alexandria. — your install command', html, { unsubscribeUrl });
}

export async function sendOnboardFollowup(
  email: string,
  installToken: string,
  unsubscribeToken: string,
  nth: number,
  ref?: string,
): Promise<{ ok: boolean; error?: string }> {
  const first = nth <= 1;
  const unsubscribeUrl = `${SERVER_URL}/email/stop?t=${unsubscribeToken}`;
  const html = emailShell(`<p style="margin: 0 0 1.2rem;">${first
    ? 'still here when you are &mdash; paste this into your coding agent when you&rsquo;re back at your computer:'
    : 'last one from me. the command:'}</p>
  ${emailCmd(onboardCmd(installToken, ref))}
  <p style="margin: 0 0 1.8rem; color: #8a8078;">${first
    ? 'everything you&rsquo;ve saved on your phone gets picked up the moment you run it.'
    : 'no rush &mdash; it&rsquo;ll keep. everything you&rsquo;ve saved stays yours.'}</p>`, unsubscribeUrl);
  return await sendEmail(
    email,
    first ? 'alexandria. — ready when you are' : 'alexandria. — last nudge',
    html,
    { unsubscribeUrl },
  );
}

// sendMorningBrief / sendMorningNudge removed: morning brief + nudge are now
// fully sovereign on each Author's machine (factory/scripts/brief.py + their
// own SMTP creds + their own launchd schedule). Email-on-behalf-of-users is
// out of scope for the company server — see factory/skills/brief-setup.md.
