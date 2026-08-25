/**
 * HTML templates — shared across modules.
 * Callback page HTML for OAuth signup flow.
 */

import { randomBytes } from 'crypto';

function getWebsiteUrl() { return process.env.WEBSITE_URL || 'https://alexandria-library.com'; }

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
  :root { --paper: #f5f0e8; --ink: #3d3630; --ink-muted: #6d655e; }
  @media (prefers-color-scheme: dark) {
    :root { --paper: #2b2a27; --ink: #ece8e1; --ink-muted: #a09b95; }
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

export async function callbackPageHtml(isReturning: boolean, githubLogin = '', authorNumber = 0, _kinCompliant = 0): Promise<string> {
  void authorNumber;
  void _kinCompliant;
  const WEBSITE_URL = getWebsiteUrl();
  // Membership is already complete here. The first action closes the account
  // loop: it opens a first-party page where this signed-in browser can mint a
  // one-use paste for the person's own AI. No connection material is embedded
  // in this HTML. The invite remains the second action.
  // A founding number is assigned server-side but is not the pitch.
  // The invite link now opens /invite — the self-contained referral landing
  // (founder 2026-07-17: a cold recipient dropped on /start had "no idea what
  // that is"). /invite pitches in one line and forwards the ref to /start,
  // where install → eventual join credits kin (validates ref → existing
  // login, rejects self-referral). Three who join and stay = free while they stay.
  const inviteUrl = githubLogin ? `${WEBSITE_URL}/invite?ref=${encodeURIComponent(githubLogin)}` : '';
  // The Web Share sheet puts the invite one tap from a real conversation.
  // Desktop browsers without it fall back to copying the link.
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
    --paper: #f5f0e8; --surface: #ede8df; --surface-edge: #e6e0d6;
    --ink: #3d3630; --ink-muted: #6d655e; --ink-faint: #bbb4aa;
  }
  :root[data-theme="dark"] {
    --paper: #2b2a27; --surface: #333230; --surface-edge: #3b3a37;
    --ink: #ece8e1; --ink-muted: #a09b95; --ink-faint: #6b6660;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #2b2a27; --surface: #333230; --surface-edge: #3b3a37;
      --ink: #ece8e1; --ink-muted: #a09b95; --ink-faint: #6b6660;
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
  .welcome {
    margin: 0 0 30px; max-width: 560px;
    font-style: italic; font-weight: 500;
    font-size: clamp(34px, 2rem + 1.2vw, 46px); line-height: 1.08;
    letter-spacing: -0.015em; color: var(--ink); text-wrap: balance;
  }
  .cta-box {
    display: flex; align-items: center; gap: 16px;
    width: 100%; max-width: 486px; text-align: left;
    margin: 0 0 10px; padding: 17px 20px; border-radius: 10px; cursor: pointer;
    background: var(--surface); color: var(--ink);
    border: 1px solid var(--surface-edge); font-family: inherit;
    font-size: 1.02rem; line-height: 1.35; letter-spacing: 0.005em;
    text-decoration: none; white-space: normal; overflow-wrap: anywhere;
    transition: border-color 0.18s ease, background 0.18s ease, transform 0.12s ease;
  }
  .cta-box:hover { border-color: color-mix(in srgb, var(--ink) 28%, transparent); background: color-mix(in srgb, var(--surface) 75%, var(--ink) 3%); }
  .cta-box:active { transform: scale(0.992); }
  .cta-box:focus-visible { outline: 1px solid currentColor; outline-offset: 8px; }
  .cta-copy { min-width: 0; flex: 1; }
  .cta-label { color: var(--ink); }
  .cta-why { color: var(--ink-muted); }
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
    .welcome { font-size: 34px; }
    .cta-box { font-size: 1rem; }
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
  <h1 class="welcome">${isReturning ? `welcome back.` : `welcome to alexandria.`}</h1>
  <a class="cta-box" href="${WEBSITE_URL}/connect"><span class="cta-copy"><span class="cta-label">connect your ai</span><span class="cta-sep"> &mdash; </span><span class="cta-why">copy the handoff</span></span></a>
  ${inviteUrl
    ? `<button type="button" class="cta-box" onclick="shareInvite(this)"><span class="cta-copy"><span class="cta-label">invite people to alexandria</span><span class="cta-sep"> &mdash; </span><span class="cta-why">share it widely</span></span></button>`
    : ''}
</main>
<script>
function flash(el, label, why) {
  var labelEl = el.querySelector('.cta-label');
  var whyEl = el.querySelector('.cta-why');
  var oldLabel = labelEl ? labelEl.textContent : '';
  var oldWhy = whyEl ? whyEl.textContent : '';
  if (labelEl && label) labelEl.textContent = label;
  if (whyEl && why) whyEl.textContent = why;
  setTimeout(function() {
    if (labelEl) labelEl.textContent = oldLabel;
    if (whyEl) whyEl.textContent = oldWhy;
  }, 2200);
}
function copyText(text, el, label, why) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(function() { flash(el, label, why); }).catch(function() { manualCopy(text, el, label, why); });
  }
  manualCopy(text, el, label, why);
  return Promise.resolve();
}
function manualCopy(text, el, label, why) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    flash(el, label, why);
  } catch (e) {
    window.prompt('copy this:', text);
  }
}
// Share, not copy (founder 2026-07-27): the native sheet puts the link one tap
// from a real conversation — Messages, WhatsApp, wherever they'd actually send
// it — instead of parking it on a clipboard they never paste. Desktop browsers
// without navigator.share fall back to copying the same invitation and link.
function shareInvite(el) {
  var url = ${jsLiteral(inviteUrl)};
  var message = 'i’m using alexandria — join me.';
  if (navigator.share) {
    navigator.share({ title: 'alexandria.', text: message, url: url })
      .then(function() { flash(el, 'shared', 'invite someone else'); })
      .catch(function() {});
    return;
  }
  copyText(message + ' ' + url, el, 'copied', 'send it to someone');
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
// same-origin cookie set that already works for library sign-in. The HTML
// contains no account credentials or connection material.
type WelcomeKV = { put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> };

export async function welcomeHandoffUrl(
  kv: WelcomeKV,
  sessionToken: string,
  githubLogin: string,
  isReturning: boolean,
  authorNumber: number,
  kinCompliant = 0,
): Promise<string> {
  const html = await callbackPageHtml(isReturning, githubLogin, authorNumber, kinCompliant);
  const code = randomBytes(24).toString('hex');
  // handoff:<code> → session token, consumed by /api/auth/session (sets the cookie).
  // welcome:<code> → the rendered page, consumed by the website /welcome peek.
  await kv.put(`handoff:${code}`, sessionToken, { expirationTtl: 300 });
  await kv.put(`welcome:${code}`, html, { expirationTtl: 300 });
  return `${getWebsiteUrl()}/welcome?code=${code}`;
}
