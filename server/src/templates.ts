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
const ICON_SHARE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

// ---------------------------------------------------------------------------
// Mini page shell — the branded wrapper for tiny Worker pages (auth errors,
// the unsubscribe confirmation, the API root). Paper/ink in EB Garamond with
// the same dark-mode support as the welcome page, so no edge surface ever
// blasts an off-brand or light-only screen (2026-07-17 edge-page sweep).
// ---------------------------------------------------------------------------

export function miniPageHtml(bodyHtml: string): string {
  const WEBSITE_URL = getWebsiteUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>alexandria.</title>
<link rel="icon" href="${WEBSITE_URL}/favicon.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
<style>
  :root { --paper: #f5f0e8; --ink: #3d3630; --ink-muted: #8a8078; }
  @media (prefers-color-scheme: dark) {
    :root { --paper: #2b2a27; --ink: #ece8e1; --ink-muted: #9b9690; }
  }
  body {
    font-family: 'EB Garamond', Georgia, serif; background: var(--paper);
    color: var(--ink); display: flex; align-items: center; justify-content: center;
    min-height: 100vh; margin: 0; padding: 2rem; text-align: center;
    -webkit-font-smoothing: antialiased;
  }
  .mini { max-width: 420px; }
  .mini p { font-size: 1.05rem; line-height: 1.9; margin: 0 0 1.5rem; }
  .mini .muted { color: var(--ink-muted); }
  .mini a { color: var(--ink); text-decoration: none; border-bottom: 1px dotted var(--ink-muted); padding-bottom: 1px; }
  .mini .mark { font-style: italic; color: var(--ink-muted); margin: 2rem 0 0; }
</style>
</head>
<body>
<div class="mini">
${bodyHtml}
<p class="mark">a.</p>
</div>
</body>
</html>`;
}

// Auth error page — shown when OAuth callback can't complete.
export function authErrorHtml(message: string): string {
  const WEBSITE_URL = getWebsiteUrl();
  return miniPageHtml(`<p class="muted">${message}</p>
<p><a href="${WEBSITE_URL}/join">start again</a></p>`);
}

// ---------------------------------------------------------------------------
// Callback page — the first brand moment after signup
// ---------------------------------------------------------------------------

export async function callbackPageHtml(apiKey: string, githubLogin = '', viaToken = false, authorNumber = 0, _kinCompliant = 0, rotateUrl = ''): Promise<string> {
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
  // The invite link now opens /invite — the self-contained referral landing
  // (founder 2026-07-17: a cold recipient dropped on /start had "no idea what
  // that is"). /invite pitches in one line and forwards the ref to /start,
  // where install → eventual join credits kin (validates ref → existing
  // login, rejects self-referral). Three who join and stay = free for good.
  // The URL is DISPLAYED as well as copied — the visible ref doubles as the
  // member's kin code, so there's no separate code line to explain.
  const inviteUrl = githubLogin ? `${WEBSITE_URL}/invite?ref=${encodeURIComponent(githubLogin)}` : '';
  const inviteDisplay = githubLogin ? `${host}/invite?ref=${githubLogin}` : '';
  // (Kin progress + the Web Share sheet were cut 2026-07-17 — the count is
  // ~always 0 on this page, and two buttons with mixed icons read messy. One
  // visible link, one copy icon.)
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
     palette as CSS vars, a prefers-color-scheme dark default, AND a manual
     toggle (founder 2026-07-17: the toggle on every page) — data-theme on
     <html> overrides the system preference, persisted under the same
     localStorage key the site uses so the choice follows them across. */
  :root {
    --paper: #f5f0e8; --ink: #3d3630; --ink-secondary: #4d4640;
    --ink-muted: #8a8078; --ink-faint: #bbb4aa; --accent: #5B1F47;
    --rule: rgba(61, 54, 48, 0.14); --tip-bg: #3d3630; --tip-fg: #f5f0e8;
  }
  :root[data-theme="dark"] {
    --paper: #2b2a27; --ink: #ece8e1; --ink-secondary: #cdc8c0;
    --ink-muted: #9b9690; --ink-faint: #6b6660; --accent: #9F87C5;
    --rule: rgba(236, 232, 225, 0.14); --tip-bg: #ece8e1; --tip-fg: #2b2a27;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #2b2a27; --ink: #ece8e1; --ink-secondary: #cdc8c0;
      --ink-muted: #9b9690; --ink-faint: #6b6660; --accent: #9F87C5;
      --rule: rgba(236, 232, 225, 0.14); --tip-bg: #ece8e1; --tip-fg: #2b2a27;
    }
  }
  .theme-toggle {
    position: fixed; top: 4px; right: 4px; z-index: 30;
    width: 44px; height: 44px; display: inline-flex;
    align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    color: var(--ink); opacity: 0.3; transition: opacity 0.15s;
  }
  .theme-toggle:hover { opacity: 0.5; }
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
  .line { font-size: 1.05rem; line-height: 1.75; color: var(--ink); margin-bottom: 16px; max-width: 520px; }
  /* The two steps — the /start pattern: faint numerals, the copy action IS
     step 1. Unmistakably the main thing on the page. */
  .steps { margin-top: 4px; width: 100%; }
  .step {
    margin: 0 0 12px; font-size: 1.08rem; line-height: 1.6;
    color: var(--ink); max-width: 520px;
  }
  .step-num { color: var(--ink-faint); }
  .cmd {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em; color: var(--ink);
    background: var(--rule); border-radius: 4px; padding: 1px 6px;
  }
  .step-note {
    margin: 14px 0 0; font-size: 0.85rem; line-height: 1.65;
    color: var(--ink-muted); max-width: 480px; font-style: italic;
  }
  /* The second beats — invite link + phone shortcut, each a small-caps
     question, an answer line, and one quiet note (the site's door idiom). */
  .invite { margin-top: 34px; }
  .invite-q {
    margin: 0 0 8px; font-size: 0.72rem; letter-spacing: 0.12em;
    text-transform: lowercase; font-variant-caps: all-small-caps;
    color: var(--ink-muted); line-height: 1;
  }
  .invite-line { font-size: 0.98rem; line-height: 1.6; color: var(--ink-secondary); max-width: 520px; display: flex; align-items: center; gap: 8px; }
  .invite-line a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--rule); padding-bottom: 1px; transition: border-color 0.15s; }
  .invite-line a:hover { border-bottom-color: var(--ink-muted); }
  .invite-note { margin: 8px 0 0; font-size: 0.85rem; line-height: 1.65; color: var(--ink-muted); max-width: 480px; font-style: italic; }
  /* Share row — the invite link, made immediately actionable: a filled
     share button (native sheet, includes copy) + a copy-link button. Both
     flash a tick. The plain URL sits below for selecting/pasting anywhere. */
  .sharerow { display: flex; gap: 10px; margin: 14px 0 12px; flex-wrap: wrap; }
  .sharebtn {
    display: inline-flex; align-items: center; gap: 7px;
    font-family: 'EB Garamond', Georgia, serif; font-size: 0.95rem;
    padding: 9px 18px; border-radius: 8px; cursor: pointer;
    background: var(--ink); color: var(--paper); border: 1px solid var(--ink);
    transition: opacity 0.15s;
  }
  .sharebtn:hover { opacity: 0.88; }
  .sharebtn.secondary { background: transparent; color: var(--ink); border-color: var(--rule); }
  .sharebtn .icon { display: inline-flex; align-items: center; }
  .sharebtn .icon .icon-check { display: none; }
  .sharebtn.done .icon .icon-copy { display: none; }
  .sharebtn.done .icon .icon-check { display: inline; }
  .invite-link { font-size: 0.82rem; color: var(--ink-muted); margin: 0 0 4px; word-break: break-all; }
  .invite-link a { color: var(--ink-muted); text-decoration: none; border-bottom: 1px dotted var(--ink-faint); }
  /* Fine print — one hairline, everything else. */
  .fineprint {
    margin-top: 36px; padding-top: 26px; max-width: 520px;
    border-top: 1px solid var(--rule);
  }
  .fineprint p { font-size: 0.84rem; line-height: 1.7; color: var(--ink-muted); margin: 0 0 8px; }
  .fineprint p:last-child { margin-bottom: 0; }
  .fineprint a { color: var(--ink-muted); text-decoration: none; border-bottom: 1px dotted var(--ink-faint); transition: color 0.15s, border-color 0.15s; }
  .fineprint a:hover { color: var(--ink); border-bottom-color: var(--ink-muted); }
  .fineprint-solo { font-size: 0.78rem; line-height: 1.7; color: var(--ink-faint); margin-top: 34px; }
  .fineprint-solo a { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--ink-faint); transition: color 0.15s, border-color 0.15s; }
  .fineprint-solo a:hover { color: var(--ink-muted); border-bottom-color: var(--ink-muted); }
  .lostkey { font-size: 0.78rem; line-height: 1.7; color: var(--ink-faint); margin-top: 16px; }
  .lostkey a { color: var(--ink-muted); text-decoration: none; border-bottom: 1px dotted var(--ink-faint); transition: color 0.15s, border-color 0.15s; }
  .lostkey a:hover { color: var(--ink); border-bottom-color: var(--ink-muted); }
  .coda { margin-top: 48px; font-size: 20px; font-style: italic; color: var(--ink); opacity: 0.72; letter-spacing: 0.005em; }
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
<script>
// Apply the saved theme before paint (same key as the site: alexandria-theme).
(function() {
  try {
    var t = localStorage.getItem('alexandria-theme');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
</script>
<button type="button" class="theme-toggle" onclick="toggleTheme()" aria-label="switch theme">
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle id="themeDot" cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1"/></svg>
</button>
<a class="brand-corner" href="${WEBSITE_URL}/">alexandria<span class="brand-dot">.</span></a>
<main class="wrap">
  <p class="eyebrow">your membership</p>
  <h1 class="welcome">${isReturning ? `welcome back.` : `welcome to alexandria.`}</h1>
  ${isReturning ? `<p class="line">call /alexandria in your coding agent.</p>${rotateUrl ? `
  <p class="lostkey">lost your key? <a href="${escapeHtml(rotateUrl)}">generate a new one</a> &mdash; your old key stops working.</p>` : ''}` : `<div class="steps">
    ${curlCmd ? `<p class="step"><span class="step-num">1 &mdash;</span> <button type="button" class="action" onclick="copyCmd(this)" aria-label="copy connect command">copy your connect command <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button></p>
    <p class="step"><span class="step-num">2 &mdash;</span> paste it into your coding agent and hit enter</p>
    <p class="step"><span class="step-num">3 &mdash;</span> from then on: open a new tab, type <code class="cmd">/a</code>, and leave it running &mdash; whenever you&rsquo;ve got a minute</p>
    <p class="step-note">it links your install to your membership &mdash; your thinking stays on your machine.</p>` : `<p class="line">you're in. open a new tab and type <code class="cmd">/a</code> whenever you want to think something through.</p>${rotateUrl ? `
    <p class="lostkey">lost your key? <a href="${escapeHtml(rotateUrl)}">generate a new one</a> &mdash; your old key stops working.</p>` : ''}`}
    ${inviteUrl ? `<div class="invite">
    <p class="invite-q">share your link &mdash; do it now</p>
    <p class="invite-note" style="margin-top: 0;">get three friends on and your membership is free while they stay. share with more than three and you&rsquo;ve got a cushion &mdash; you stay free even if one drops off. so send it wide, right now:</p>
    <div class="sharerow"><button type="button" class="sharebtn" onclick="shareInvite(this)"><span class="icon"><span class="icon-copy">${ICON_SHARE}</span><span class="icon-check">${ICON_CHECK}</span></span> share</button><button type="button" class="sharebtn secondary" onclick="copyInvite(this)"><span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span> copy link</button></div>
    <p class="invite-link"><a href="${inviteUrl}">${inviteDisplay}</a></p>
    </div>` : ''}
    <div class="invite">
    <p class="invite-q">grab your phone &mdash; do this too</p>
    <p class="invite-line"><a href="${SHORTCUT_URL}" target="_blank" rel="noopener noreferrer">add the shortcut</a></p>
    <p class="invite-note">worth it even at your desk. open that link on your phone and tap <em>add</em>. from then on, share anything to it &mdash; an article, a voice note, a thought &mdash; and it lands in your alexandria, picked up automatically the next time you open a <code class="cmd">/a</code>.</p>
    </div>
  </div>
  <div class="fineprint">
    <p>wrong account? <a href="https://github.com/logout" target="_blank" rel="noopener noreferrer">sign out of github</a></p>
  </div>`}
  ${isReturning ? `<p class="fineprint-solo">wrong account? <a href="https://github.com/logout" target="_blank" rel="noopener noreferrer">sign out of github</a></p>` : ''}
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
  // Native share sheet where available (it includes copy-to-clipboard);
  // desktop fallback copies and flashes the check.
  if (navigator.share) { navigator.share({ url: url }).catch(function() {}); return; }
  copyText(url, el);
}
function effectiveTheme() {
  var t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function paintThemeDot() {
  var dot = document.getElementById('themeDot');
  if (!dot) return;
  if (effectiveTheme() === 'dark') { dot.setAttribute('fill', 'currentColor'); dot.removeAttribute('stroke'); }
  else { dot.setAttribute('fill', 'none'); dot.setAttribute('stroke', 'currentColor'); }
}
function toggleTheme() {
  var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('alexandria-theme', next); } catch (e) {}
  paintThemeDot();
}
paintThemeDot();
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
