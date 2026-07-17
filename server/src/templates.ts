/**
 * HTML templates — shared across modules.
 * Callback page HTML for OAuth signup flow.
 */

import { randomBytes } from 'crypto';

function getWebsiteUrl() { return process.env.WEBSITE_URL || 'https://alexandria-library.com'; }

// The iCloud capture shortcut — same constant the emails + website use
// (email.ts, app/lib/config.ts). Save anything from your phone; it becomes
// a session. Surfaced as a subtle link on the founding-member page.
const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337';

// How many active kin make membership free for good. Mirrors billing.ts's
// KIN_THRESHOLD (same env var); the page reads it to show the progress line.
function getKinThreshold(): number { return parseInt(process.env.KIN_THRESHOLD || '3', 10); }

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// JSON-encode a string for safe interpolation inside a `<script>` block.
// JSON.stringify escapes quotes/backslashes/U+2028/U+2029 but does not escape
// `</`. A value containing `</script>` would break out of the inline-script
// context. Defense-in-depth: even server-fetched content (factory/block.md,
// Mechanics.md) flows through here, so a repo compromise can't pop the
// callback page.
function jsLiteral(value: string): string {
  return JSON.stringify(value).replace(/<\/(script|style)/gi, '<\\/$1');
}

// ---------------------------------------------------------------------------
// Inline SVG icons — small enough to inline, no external deps
// ---------------------------------------------------------------------------

const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_INFO = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
const ICON_SHARE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

// ---------------------------------------------------------------------------
// Auth error page — shown when OAuth callback can't complete
// ---------------------------------------------------------------------------

export function authErrorHtml(message: string): string {
  const WEBSITE_URL = getWebsiteUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>alexandria.</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400&display=swap" rel="stylesheet">
</head>
<body style="font-family:'EB Garamond',Georgia,serif;background:#f5f0e8;color:#3d3630;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;text-align:center">
<div style="max-width:420px">
<p style="font-size:1.05rem;line-height:1.9;color:#8a8078;margin:0 0 1.5rem">${message}</p>
<p style="font-size:1.05rem;line-height:1.9;margin:0"><a href="${WEBSITE_URL}/signup" style="color:#3d3630;text-decoration:none">start again</a></p>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Callback page — the first brand moment after signup
// ---------------------------------------------------------------------------

export async function callbackPageHtml(apiKey: string, githubLogin = '', viaToken = false, authorNumber = 0, kinCompliant = 0, rotateUrl = ''): Promise<string> {
  const WEBSITE_URL = getWebsiteUrl();
  const host = WEBSITE_URL.replace(/^https?:\/\//, '');
  // The founding-member page (Strava-for-thought, ground truth e1cd27f). You've
  // just JOINED the community — the local tool was already free. The page leads
  // with belonging (you're in), then the two actions: the connect command (links
  // your local install so you can publish + be seen) and your invite link (carries
  // your code; three friends through it = free for good). A founding number IS
  // assigned server-side, but it is NOT the pitch — nobody cares which number they
  // are, so the page doesn't headline it.
  // `isReturning` is the bare re-login fallback — nothing minted, not a fresh join.
  // `rotateUrl` (set only for returning INSTALLED members, minted per-OAuth by
  // the callback) renders the low-key lost-key escape hatch below.
  const isReturning = !apiKey && authorNumber <= 0;
  // The connect command is copy-paste, matching /start. (A claude-cli:// deep link was tried
  // and removed 2026-06-24: it auto-ran the script and felt like a terminal hijack — copy-paste
  // is calmer and universal across Claude Code / Cursor / Codex / Factory.) Same command whether
  // they installed keyless first (it links the account) or join from the web first (it installs +
  // links) — re-running setup.sh with the key is idempotent. Branded form: /a is
  // a 307 to the raw setup.sh; the L in -fsSL (--location) follows it — keep it.
  const curlCmd = apiKey ? `curl -fsSL alexandria-library.com/a | bash -s -- ${apiKey}` : '';
  // The invite link carries the member's code (their github login) through the TRY
  // door (/start — the free tool), not the paid /join door: the ask on this page is
  // "send it to friends", and /start forwards the ref through install → eventual
  // join, where the server credits kin (validates ref → existing login, rejects
  // self-referral). Three who join and stay = free for good, same as before.
  const inviteUrl = githubLogin ? `${WEBSITE_URL}/start?ref=${encodeURIComponent(githubLogin)}` : '';
  const inviteDisplay = githubLogin ? `${host}/start?ref=${githubLogin}` : '';
  // Kin progress — let the member SEE where they stand toward free-for-good.
  // Membership, not usage: count is the compliant (member-status) kin count
  // the server already has (countActiveKin at the call site). At/over the
  // threshold shows the done state; short of it shows how many remain.
  const kinThreshold = getKinThreshold();
  const kinDone = kinCompliant >= kinThreshold;
  const kinRemaining = Math.max(0, kinThreshold - kinCompliant);
  const kinProgressLine = kinDone
    ? `you&rsquo;re free for good &mdash; three friends joined through you.`
    : `${kinCompliant} of ${kinThreshold} friends joined &mdash; ${kinRemaining} more and it&rsquo;s free for good.`;
  // Warm, brief share text for the Web Share API sheet (native share on
  // mobile; clipboard-copy fallback on desktop). Brand voice, lowercase.
  const shareText = 'alexandria — a tribe of people who put their minds into writing, so ai thinks with them, not for them. join me.';
  // Inline Mechanics.md so its copy button runs synchronously inside the click handler.
  // Async fetch + clipboard.writeText loses user activation and falls back to opening the raw URL.
  // (block.md is no longer copied here — the agent reads the locally-cached .block after install
  // and continues into the constitution draft itself; see factory/setup.sh tail.)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>alexandria.</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="icon" href="${WEBSITE_URL}/favicon.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400&display=swap" rel="stylesheet">
<style>
  /* Themed to match the site (/start · /join · /follow): the same cream/ink
     palette as CSS vars, PLUS a dark override so a dark-mode member doesn't
     get a bright page straight after signup. Standalone Worker page, so the
     theme rides prefers-color-scheme (no toggle available here). */
  :root {
    --paper: #f5f0e8; --ink: #3d3630; --ink-secondary: #4d4640;
    --ink-muted: #8a8078; --ink-faint: #bbb4aa; --accent: #5B1F47;
    --rule: rgba(61, 54, 48, 0.14); --tip-bg: #3d3630; --tip-fg: #f5f0e8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #2b2a27; --ink: #ece8e1; --ink-secondary: #cdc8c0;
      --ink-muted: #9b9690; --ink-faint: #6b6660; --accent: #9F87C5;
      --rule: rgba(236, 232, 225, 0.14); --tip-bg: #ece8e1; --tip-fg: #2b2a27;
    }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'EB Garamond', Georgia, 'Times New Roman', serif;
    background: var(--paper);
    color: var(--ink);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    -webkit-font-smoothing: antialiased;
    background-image:
      radial-gradient(ellipse 120% 80% at 30% 20%, rgba(91, 31, 71, 0.025) 0%, transparent 60%),
      radial-gradient(ellipse 100% 70% at 70% 80%, rgba(74, 50, 30, 0.020) 0%, transparent 60%);
  }
  /* Flush-left editorial column, vertically centred — the shared spine. */
  .wrap {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: flex-start; justify-content: center;
    max-width: 620px; margin: 0 auto; padding: 5rem 40px 6rem; width: 100%;
    text-align: left;
  }
  .eyebrow {
    margin: 0 0 18px; font-size: 11.5px; letter-spacing: 0.3em;
    text-transform: lowercase; font-variant-caps: all-small-caps;
    color: var(--accent); line-height: 1;
  }
  .welcome {
    margin: 0 0 26px; max-width: 560px;
    font-style: italic; font-weight: 400;
    font-size: clamp(28px, 1.6rem + 1.6vw, 38px); line-height: 1.2;
    letter-spacing: -0.01em; color: var(--ink); text-wrap: balance;
  }
  .line { font-size: 1.05rem; line-height: 1.75; color: var(--ink-secondary); margin-bottom: 16px; max-width: 520px; }
  .deal { font-size: 0.9rem; line-height: 1.75; color: var(--ink-muted); margin-top: 34px; padding-top: 26px; border-top: 1px solid var(--rule); max-width: 520px; }
  .deal .free { color: var(--ink); }
  .kin-progress { font-size: 0.92rem; line-height: 1.75; color: var(--ink-muted); margin-top: 14px; max-width: 520px; }
  .shortcut { font-size: 0.82rem; line-height: 1.7; color: var(--ink-faint); margin-top: 30px; }
  .shortcut a { color: var(--ink-muted); text-decoration: none; border-bottom: 1px dotted var(--ink-faint); transition: color 0.15s, border-color 0.15s; }
  .shortcut a:hover { color: var(--ink); border-bottom-color: var(--ink-muted); }
  .welcome-back { color: var(--ink-secondary); }
  .lostkey { font-size: 0.78rem; line-height: 1.7; color: var(--ink-faint); margin-top: 16px; }
  .lostkey a { color: var(--ink-muted); text-decoration: none; border-bottom: 1px dotted var(--ink-faint); transition: color 0.15s, border-color 0.15s; }
  .lostkey a:hover { color: var(--ink); border-bottom-color: var(--ink-muted); }
  .signout { font-size: 0.78rem; line-height: 1.7; color: var(--ink-faint); margin-top: 34px; }
  .signout a { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--ink-faint); transition: color 0.15s, border-color 0.15s; }
  .signout a:hover { color: var(--ink-muted); border-bottom-color: var(--ink-muted); }
  .coda { margin-top: 48px; font-size: 20px; font-style: italic; color: var(--ink); opacity: 0.72; letter-spacing: 0.005em; }
  .steps { margin-top: 4px; width: 100%; }
  .action {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    vertical-align: baseline;
    gap: 6px;
    text-decoration: none;
    transition: opacity 0.15s;
  }
  .action:hover { opacity: 0.6; }
  .action:focus-visible { outline: 1px dotted var(--ink-muted); outline-offset: 3px; border-radius: 2px; }
  .action .icon { display: inline-flex; align-items: center; color: var(--ink-faint); transition: color 0.15s; }
  .action:hover .icon { color: var(--ink); }
  .action.done .icon { color: var(--ink); }
  .action .icon .icon-check { display: none; }
  .action.done .icon .icon-copy { display: none; }
  .action.done .icon .icon-check { display: inline; }
  .info {
    background: none;
    border: none;
    padding: 0;
    display: inline-flex;
    align-items: center;
    color: var(--ink-faint);
    cursor: pointer;
    transition: color 0.15s;
    vertical-align: middle;
    margin-left: 4px;
    position: relative;
  }
  .info:hover, .info:focus-visible { color: var(--ink-muted); outline: none; }
  .tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    left: -8px;
    background: var(--tip-bg);
    color: var(--tip-fg);
    font-size: 0.78rem;
    line-height: 1.6;
    padding: 10px 14px;
    border-radius: 6px;
    width: 260px;
    max-width: calc(100vw - 4rem);
    text-align: left;
    z-index: 10;
  }
  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 14px;
    border: 6px solid transparent;
    border-top-color: var(--tip-bg);
  }
  .info.active .tooltip { display: block; }
  .brand-corner {
    position: fixed;
    top: 28px;
    left: clamp(24px, 6vw, 40px);
    font-size: 21px;
    font-style: italic;
    font-weight: 400;
    color: var(--ink);
    text-decoration: none;
    letter-spacing: 0.005em;
    transition: opacity 0.15s;
    z-index: 20;
  }
  .brand-corner .brand-dot { font-style: normal; }
  .brand-corner:hover { opacity: 0.6; }
  @media (max-width: 640px) {
    .wrap { padding: 4rem 24px 4rem; }
    .brand-corner { top: 22px; left: 22px; font-size: 19px; }
    .welcome { font-size: 26px; }
    .coda { font-size: 18px; margin-top: 40px; }
  }
</style>
</head>
<body>
<a class="brand-corner" href="${WEBSITE_URL}/">alexandria<span class="brand-dot">.</span></a>
<main class="wrap">
  <p class="eyebrow">the community</p>
  <h1 class="welcome">${isReturning ? `welcome back.` : `welcome to alexandria.`}</h1>
  ${isReturning ? `<p class="line welcome-back">call /alexandria in your coding agent.</p>${rotateUrl ? `
  <p class="lostkey">lost your key? <a href="${escapeHtml(rotateUrl)}">generate a new one</a> &mdash; your old key stops working.</p>` : ''}` : `<div class="steps">
    ${curlCmd ? `<p class="line"><button type="button" class="action" onclick="copyCmd(this)" aria-label="copy connect command">copy your connect command <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button> &mdash; paste it into your coding agent (claude code, cursor, codex&hellip;) and hit enter. <button type="button" class="info" onclick="toggleTip(this)" aria-label="what this does">${ICON_INFO}<span class="tooltip">links your install to your membership so you can publish to the library. your thinking stays on your machine &mdash; only what you publish is ever sent.</span></button></p>` : `<p class="line">you're in. call /alexandria in your coding agent.</p>${rotateUrl ? `
    <p class="lostkey">lost your key? <a href="${escapeHtml(rotateUrl)}">generate a new one</a> &mdash; your old key stops working.</p>` : ''}`}
    ${inviteUrl ? `<p class="line"><button type="button" class="action" onclick="copyInvite(this)" aria-label="copy your invite link">copy your invite link <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button> <button type="button" class="action" onclick="shareInvite(this)" aria-label="share your invite link">share <span class="icon"><span class="icon-copy">${ICON_SHARE}</span><span class="icon-check">${ICON_CHECK}</span></span></button> &mdash; send it to everyone worth it &mdash; most won&rsquo;t act, and the three who do make yours free. <button type="button" class="info" onclick="toggleTip(this)" aria-label="what this does">${ICON_INFO}<span class="tooltip">${escapeHtml(inviteDisplay)} &mdash; it carries your code. three who join and stay, and your membership is free for good.</span></button></p>
    <p class="kin-progress">${kinProgressLine}</p>` : ''}
  </div>
  <p class="shortcut">on your phone? <a href="${SHORTCUT_URL}" target="_blank" rel="noopener noreferrer">add the shortcut</a> &mdash; capture anything, anywhere.</p>
  <p class="deal"><span class="free">first month free</span>, then $10/month &mdash; or free for good with three friends, or just email if that&rsquo;s a stretch. you&rsquo;re joining the community, not paying for the tool.</p>`}
  <p class="signout">wrong account? <a href="https://github.com/logout" target="_blank" rel="noopener noreferrer">sign out of github</a></p>
  <p class="coda">keep thinking.</p>
</main>
<script>
function flash(el) {
  el.classList.add('done');
  setTimeout(function() { el.classList.remove('done'); }, 2000);
}
function copyText(text, el) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(function() { flash(el); }).catch(function() { manualCopy(text, el); });
  }
  manualCopy(text, el);
  return Promise.resolve();
}
function manualCopy(text, el) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    flash(el);
  } catch (e) {
    window.prompt('copy this:', text);
  }
}
function copyCmd(el) { copyText(${jsLiteral(curlCmd)}, el); }
function copyInvite(el) { copyText(${jsLiteral(inviteUrl)}, el); }
function shareInvite(el) {
  var url = ${jsLiteral(inviteUrl)};
  var text = ${jsLiteral(shareText)};
  // Web Share API on mobile (one tap → native share sheet). navigator.share
  // must be called synchronously inside the click to keep user activation.
  if (navigator.share) {
    navigator.share({ url: url, text: text }).catch(function() {});
    return;
  }
  // Desktop fallback — no share sheet, so copy the link and flash the check.
  copyText(url, el);
}
function toggleTip(el) {
  var wasActive = el.classList.contains('active');
  document.querySelectorAll('.info.active').forEach(function(e) { e.classList.remove('active'); });
  if (!wasActive) el.classList.add('active');
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('.info')) {
    document.querySelectorAll('.info.active').forEach(function(el) { el.classList.remove('active'); });
  }
});
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Welcome handoff — serve the founding-member page FIRST-PARTY on the website.
// ---------------------------------------------------------------------------

// The founding-member page (above) is rendered by the Worker on the api
// subdomain, so a session cookie set alongside it lands at the tail of the
// cross-site OAuth redirect and Safari drops it (WebKit #196375). To keep the
// page but set the cookie where every browser honours it, we hand the whole
// thing to the website: this stores the rendered page + the session token under
// a one-time code and returns a /welcome URL. The website peeks the page, serves
// it first-party, and its script POSTs the code to /api/auth/session — the exact
// same-origin cookie set that already works for library sign-in. Single-use,
// short TTL; the api-key only ever sits in KV briefly, never in a browser URL.
type WelcomeKV = { put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> };

export async function welcomeHandoffUrl(
  kv: WelcomeKV,
  sessionToken: string,
  apiKey: string,
  githubLogin: string,
  viaToken: boolean,
  authorNumber: number,
  kinCompliant = 0,
  rotateUrl = '',
): Promise<string> {
  const html = await callbackPageHtml(apiKey, githubLogin, viaToken, authorNumber, kinCompliant, rotateUrl);
  const code = randomBytes(24).toString('hex');
  // handoff:<code> → session token, consumed by /api/auth/session (sets the cookie).
  // welcome:<code> → the rendered page, consumed by the website /welcome peek.
  await kv.put(`handoff:${code}`, sessionToken, { expirationTtl: 300 });
  await kv.put(`welcome:${code}`, html, { expirationTtl: 300 });
  return `${getWebsiteUrl()}/welcome?code=${code}`;
}
