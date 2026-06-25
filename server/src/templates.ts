/**
 * HTML templates — shared across modules.
 * Callback page HTML for OAuth signup flow.
 */

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
// Inline SVG icons — small enough to inline, no external deps
// ---------------------------------------------------------------------------

const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_INFO = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

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

export async function callbackPageHtml(apiKey: string, githubLogin = '', viaToken = false, authorNumber = 0): Promise<string> {
  const WEBSITE_URL = getWebsiteUrl();
  const host = WEBSITE_URL.replace(/^https?:\/\//, '');
  // The founding-member page (Strava-for-thought, ground truth e1cd27f). You've
  // just JOINED the collective — the local tool was already free. So the page
  // shows three things: your number (alexandrian #N), the connect command (links
  // your local install to the collective so you can publish + be seen), and your
  // invite link (carries your code; three friends through it = free for good).
  // `isReturning` is the bare re-login fallback — nothing minted, no number yet.
  const isReturning = !apiKey && authorNumber <= 0;
  const numberLabel = authorNumber > 0 ? `alexandrian #${authorNumber}` : '';
  // The connect command is copy-paste, matching /start. (A claude-cli:// deep link was tried
  // and removed 2026-06-24: it auto-ran the script and felt like a terminal hijack — copy-paste
  // is calmer and universal across Claude Code / Cursor / Codex / Factory.) Same command whether
  // they installed keyless first (it links the account) or join from the web first (it installs +
  // links) — re-running setup.sh with the key is idempotent.
  const curlCmd = apiKey ? `curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh | bash -s -- ${apiKey}` : '';
  // The invite link carries the member's code (their github login). A friend who opens it is
  // pre-credited as kin (server validates ref → existing login, rejects self-referral).
  const inviteUrl = githubLogin ? `${WEBSITE_URL}/join?ref=${encodeURIComponent(githubLogin)}` : '';
  const inviteDisplay = githubLogin ? `${host}/join?ref=${githubLogin}` : '';
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
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'EB Garamond', Georgia, 'Times New Roman', serif;
    background: #f5f0e8;
    color: #3d3630;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }
  .container { max-width: 420px; text-align: center; }
  .welcome { font-size: 1.5rem; font-weight: 400; line-height: 1.4; }
  .line { font-size: 1.1rem; line-height: 1.9; }
  .deal { font-size: 0.9rem; line-height: 1.8; color: #8a8078; margin-top: 2rem; }
  .deal .free { color: #3d3630; }
  .welcome-back { color: #8a8078; margin-top: 1.5rem; }
  .signout { font-size: 0.78rem; line-height: 1.7; color: #bbb4aa; margin-top: 2.5rem; }
  .signout a { color: inherit; text-decoration: none; border-bottom: 1px dotted #bbb4aa; transition: color 0.15s, border-color 0.15s; }
  .signout a:hover { color: #8a8078; border-bottom-color: #8a8078; }
  .steps { margin-top: 2.5rem; }
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
  .action:focus-visible { outline: 1px dotted #8a8078; outline-offset: 3px; border-radius: 2px; }
  .action .icon { display: inline-flex; align-items: center; color: #bbb4aa; transition: color 0.15s; }
  .action:hover .icon { color: #3d3630; }
  .action.done .icon { color: #3d3630; }
  .action .icon .icon-check { display: none; }
  .action.done .icon .icon-copy { display: none; }
  .action.done .icon .icon-check { display: inline; }
  .info {
    background: none;
    border: none;
    padding: 0;
    display: inline-flex;
    align-items: center;
    color: #bbb4aa;
    cursor: pointer;
    transition: color 0.15s;
    vertical-align: middle;
    margin-left: 4px;
    position: relative;
  }
  .info:hover, .info:focus-visible { color: #8a8078; outline: none; }
  .tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    right: -8px;
    background: #3d3630;
    color: #f5f0e8;
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
    right: 14px;
    border: 6px solid transparent;
    border-top-color: #3d3630;
  }
  .info.active .tooltip { display: block; }
  .brand-corner {
    position: fixed;
    top: 1.25rem;
    left: 1.5rem;
    font-size: 1.05rem;
    font-weight: 400;
    color: #3d3630;
    text-decoration: none;
    letter-spacing: -0.02em;
    transition: opacity 0.15s;
    z-index: 20;
  }
  .brand-corner:hover { opacity: 0.6; }
</style>
</head>
<body>
${isReturning ? `<a class="brand-corner" href="${WEBSITE_URL}/">alexandria.</a>` : ''}
<div class="container">
  <h1 class="welcome">${isReturning ? `welcome back.` : (numberLabel ? `welcome, ${numberLabel}.` : `welcome to alexandria.`)}</h1>
  ${isReturning ? `<p class="line welcome-back">call /alexandria in your coding agent.</p>` : `<div class="steps">
    ${curlCmd ? `<p class="line"><button type="button" class="action" onclick="copyCmd(this)" aria-label="copy connect command">copy your connect command <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button> &mdash; paste it into your coding agent (claude code, cursor, codex&hellip;) and hit enter. <button type="button" class="info" onclick="toggleTip(this)" aria-label="what this does">${ICON_INFO}<span class="tooltip">links your install to your membership so you can publish to the library. your thinking stays on your machine &mdash; only what you publish is ever sent.</span></button></p>` : `<p class="line">you're in. call /alexandria in your coding agent.</p>`}
    ${inviteUrl ? `<p class="line"><button type="button" class="action" onclick="copyInvite(this)" aria-label="copy your invite link">copy your invite link <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button> &mdash; send it to the people you want thinking for themselves too. <button type="button" class="info" onclick="toggleTip(this)" aria-label="what this does">${ICON_INFO}<span class="tooltip">${escapeHtml(inviteDisplay)} &mdash; it carries your code. three who join and stay, and your membership is free for good.</span></button></p>` : ''}
  </div>
  <p class="deal"><span class="free">first month free</span>, then $10/month &mdash; or free for good with three friends, or just email if that&rsquo;s a stretch. you&rsquo;re joining the collective, not paying for the tool.</p>`}
  <p class="signout">wrong account? <a href="https://github.com/logout" target="_blank" rel="noopener noreferrer">sign out of github</a></p>
</div>
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
