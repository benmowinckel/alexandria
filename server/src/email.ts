/** Email primitives — Resend API (hybrid dependency, API-controllable, free 100/day). */

export const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || 'mowinckel.b@gmail.com';
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
  const html = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 48px 24px; color: #3d3630; font-size: 1.05rem; line-height: 1.7;">
  <p style="margin: 0 0 1.4rem;">thank you for backing alexandria. :)</p>
  <p style="margin: 0 0 1.4rem;">
    ${dollars}/month goes straight back into the work &mdash; infrastructure, time, the slow build.
  </p>
  <p style="margin: 0 0 1.4rem;">
    every week or so i&rsquo;ll send an email with updates on the project; stories, photos, vlogs, etc. keeping you in the loop both ways &mdash; good and bad.
  </p>
  <p style="margin: 0 0 1.4rem;">
    feel free to reply any time, i&rsquo;ll read them all!<br>
    and if you know anyone else who might want to follow along, send them to <a href="${WEBSITE_URL}" style="color: #3d3630;">alexandria-library.com</a> &mdash; they can stay close, or just follow.
  </p>
  <p style="margin: 0 0 1.8rem;">ok, that&rsquo;s all for now :)</p>
  <p style="margin: 0 0 0.4rem;">Benjamin a. Mowinckel</p>
  <p style="margin: 0; font-style: italic; color: #8a8078;">a.</p>${unsubscribeToken ? `
  <p style="margin: 1.5rem 0 0; font-size: 0.72rem; color: #bbb4aa;"><a href="${SERVER_URL}/email/stop?t=${unsubscribeToken}" style="color: #8a8078;">stop these emails</a></p>` : ''}
</div>`;

  return await sendEmail(email, 'thank you.', html,
    unsubscribeToken ? { unsubscribeUrl: `${SERVER_URL}/email/stop?t=${unsubscribeToken}` } : undefined);
}

export async function sendFollowerWelcome(email: string, unsubscribeToken?: string): Promise<{ ok: boolean; error?: string }> {
  const html = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 48px 24px; color: #3d3630; font-size: 1.05rem; line-height: 1.7;">
  <p style="margin: 0 0 1.4rem;">welcome to alexandria. :)</p>
  <p style="margin: 0 0 1.4rem;">
    every week or so i'll send an email with updates on the project; stories, photos, vlogs, etc. keeping you in the loop with how things are going -- both good and bad!<br>
    when we come out with new products or its available for new users then you will also be the first to know.
  </p>
  <p style="margin: 0 0 1.4rem;">
    feel free to reply whenever you want. i'll read all of them!<br>
    and if there are others you think might want to follow along, send them to <a href="${WEBSITE_URL}" style="color: #3d3630;">alexandria-library.com</a> &mdash; they can join the tribe, or just stay close.
  </p>
  <p style="margin: 0 0 1.8rem;">ok, that's all. bye for now :)</p>
  <p style="margin: 0 0 0.4rem;">Benjamin a. Mowinckel</p>
  <p style="margin: 0; font-style: italic; color: #8a8078;">a.</p>${unsubscribeToken ? `
  <p style="margin: 1.5rem 0 0; font-size: 0.72rem; color: #bbb4aa;"><a href="${SERVER_URL}/email/stop?t=${unsubscribeToken}" style="color: #8a8078;">stop these emails</a></p>` : ''}
</div>`;

  return await sendEmail(email, 'alexandria.', html,
    unsubscribeToken ? { unsubscribeUrl: `${SERVER_URL}/email/stop?t=${unsubscribeToken}` } : undefined);
}

export async function sendWelcomeEmail(email: string, githubLogin: string, emailToken?: string): Promise<void> {
  const websiteHost = WEBSITE_URL.replace(/^https?:\/\//, '');
  const kinLink = `${WEBSITE_URL}/signup?ref=${encodeURIComponent(githubLogin)}`;
  const kinLinkDisplay = `${websiteHost}/signup?ref=${githubLogin}`;
  await sendEmail(email, 'welcome to alexandria.',
    `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 48px 24px; color: #3d3630; text-align: left; line-height: 1.7;">
  <p style="font-size: 1.1rem; margin: 0 0 1.5rem;">welcome to alexandria.</p>
  <p style="font-size: 1rem; color: #8a8078; margin: 0 0 1.5rem;">your data lives on your machine. free with five active kin &mdash; otherwise $10/month after your 30-day trial.</p>
  <p style="font-size: 1rem; color: #8a8078; margin: 0 0 1.75rem;">your kin link: <a href="${kinLink}" style="color: #3d3630;">${kinLinkDisplay}</a> &mdash; send it to ten people, knowing some will not stick.</p>
  <p style="font-size: 0.95rem; margin: 0 0 1.8rem;"><a href="${WEBSITE_URL}/signup" style="color: #3d3630; text-decoration: none;">open alexandria</a></p>
  <p style="margin: 0 0 0.4rem;">Benjamin a. Mowinckel</p>
  <p style="margin: 0; font-style: italic; color: #8a8078;">a.</p>${emailToken ? `
  <p style="margin: 1.5rem 0 0; font-size: 0.72rem; color: #bbb4aa;"><a href="${SERVER_URL}/email/stop?t=${emailToken}" style="color: #8a8078;">stop these emails</a></p>` : ''}
</div>`,
    emailToken ? { unsubscribeUrl: `${SERVER_URL}/email/stop?t=${emailToken}` } : undefined);
}

export async function sendWeekOneCheckIn(
  email: string,
  emailToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const html = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 48px 24px; color: #3d3630; font-size: 1.05rem; line-height: 1.7;">
  <p style="margin: 0 0 1.4rem;">hey :)</p>
  <p style="margin: 0 0 1.4rem;">you signed up to alexandria a week ago &mdash; just dropping in.</p>
  <p style="margin: 0 0 1.4rem;">it's like the gym &mdash; the more you put in, the more you get out. and the unusual part is it molds to you. so anything you want &mdash; say it. anything you don't &mdash; say it. anything confusing &mdash; just ask.</p>
  <p style="margin: 0 0 2.2rem;">what's going well, what's not, what you like, what you don't &mdash; reply to this, or call: <a href="tel:+14155038178" style="color: #3d3630;">+1 (415) 503-8178</a>. you're early, so what you tell me actually shapes this. i read all of it. anything annoying &mdash; i'll cut it. anything missing &mdash; i'll add it.</p>
  <p style="margin: 0 0 1.4rem;">if you want to follow along more closely (and support the work), there's <a href="${WEBSITE_URL}/follow" style="color: #3d3630;">stay close</a>.</p>
  <p style="margin: 0 0 1.8rem;">ok, that's all for now.</p>
  <p style="margin: 0 0 0.4rem;">Benjamin a. Mowinckel</p>
  <p style="margin: 0; font-style: italic; color: #8a8078;">a.</p>
  <p style="margin: 1.5rem 0 0; font-size: 0.72rem; color: #bbb4aa;"><a href="${SERVER_URL}/email/stop?t=${emailToken}" style="color: #8a8078;">stop these emails</a></p>
</div>`;
  return await sendEmail(email, 'checking in.', html, {
    unsubscribeUrl: `${SERVER_URL}/email/stop?t=${emailToken}`,
  });
}

export async function sendInstallNudge(
  email: string,
  emailToken: string,
  installToken: string,
  githubLogin: string,
): Promise<{ ok: boolean; error?: string }> {
  const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337';
  const MECHANICS_URL = `${WEBSITE_URL}/Mechanics.md`;
  const installUrl = `${SERVER_URL}/install/${installToken}`;
  const kinLink = `${WEBSITE_URL}/signup?ref=${encodeURIComponent(githubLogin)}`;
  const html = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 48px 24px; color: #3d3630; font-size: 1.05rem; line-height: 1.7;">
  <p style="margin: 0 0 1.8rem; color: #8a8078;">ready when you are.</p>

  <p style="margin: 0 0 0.7rem;">1. <a href="${installUrl}" style="color: #3d3630;">install</a> &mdash; everything local, nothing sent anywhere</p>
  <p style="margin: 0 0 0.7rem;">2. <a href="${installUrl}" style="color: #3d3630;">begin</a> &mdash; drafts a constitution from your files</p>
  <p style="margin: 0 0 2rem;">3. <a href="${SHORTCUT_URL}" style="color: #3d3630;">shortcut</a> &mdash; save anything worth thinking about</p>

  <p style="margin: 0 0 1.6rem; color: #8a8078; font-size: 0.95rem;">keep adding via the shortcut meanwhile &mdash; what you save becomes your first session.</p>

  <p style="margin: 0 0 0.4rem; font-size: 0.9rem; color: #8a8078;">your kin code: <code style="font-family: ui-monospace, monospace; font-size: 0.85em; padding: 1px 6px; background: rgba(61,54,48,0.05); border-radius: 3px; color: #3d3630;">${githubLogin}</code> &mdash; <a href="${kinLink}" style="color: #8a8078;">invite link</a></p>

  <p style="margin: 1rem 0 1.6rem; font-size: 0.85rem; color: #bbb4aa;">we never see your data &mdash; <a href="${MECHANICS_URL}" style="color: #8a8078;">Mechanics.md</a></p>

  <p style="margin: 0 0 0.4rem;">Benjamin a. Mowinckel</p>
  <p style="margin: 0; font-style: italic; color: #8a8078;">a.</p>
  <p style="margin: 1.5rem 0 0; font-size: 0.72rem; color: #bbb4aa;"><a href="${SERVER_URL}/email/stop?t=${emailToken}" style="color: #8a8078;">stop these emails</a></p>
</div>`;
  return await sendEmail(email, 'alexandria. — finish setup.', html, {
    unsubscribeUrl: `${SERVER_URL}/email/stop?t=${emailToken}`,
  });
}

// sendMorningBrief / sendMorningNudge removed: morning brief + nudge are now
// fully sovereign on each Author's machine (factory/scripts/brief.py + their
// own SMTP creds + their own launchd schedule). Email-on-behalf-of-users is
// out of scope for the company server — see factory/skills/brief-setup.md.
