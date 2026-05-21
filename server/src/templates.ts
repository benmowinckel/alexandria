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

// ---------------------------------------------------------------------------
// Inline SVG icons — small enough to inline, no external deps
// ---------------------------------------------------------------------------

const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_INFO = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
const ICON_EXTERNAL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

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

const BLOCK_URL = 'https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/block.md';
const MECHANICS_URL = 'https://raw.githubusercontent.com/mowinckelb/alexandria/main/public/docs/Mechanics.md';
// Keep in sync with app/shortcut/page.tsx — the iCloud Shortcuts install URL.
const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337';

async function fetchRawText(url: string): Promise<string> {
  try {
    const r = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);
    if (!r.ok) return '';
    return await r.text();
  } catch {
    return '';
  }
}

export async function callbackPageHtml(apiKey: string, githubLogin = ''): Promise<string> {
  const WEBSITE_URL = getWebsiteUrl();
  const isReturning = !apiKey;
  const curlCmd = isReturning ? '' : `curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh | bash -s -- ${apiKey}`;
  const kinCode = githubLogin ? escapeHtml(githubLogin) : '';
  const kinLink = githubLogin ? `${WEBSITE_URL}/signup?ref=${encodeURIComponent(githubLogin)}` : '';
  // Inline block.md + Mechanics.md so copy buttons can run synchronously inside the click handler.
  // Async fetch + clipboard.writeText loses user activation and falls back to opening the raw URL.
  const [blockContent, mechanicsContent] = isReturning
    ? ['', '']
    : await Promise.all([fetchRawText(BLOCK_URL), fetchRawText(MECHANICS_URL)]);
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
  .mechanics { font-size: 0.85rem; line-height: 1.9; color: #bbb4aa; margin-top: 2.5rem; }
  .aside { font-size: 0.85rem; line-height: 1.9; color: #bbb4aa; margin-top: 1.5rem; }
  .mechanics-row { display: block; }
  .mechanics-hint { color: #bbb4aa; }
  .mechanics .action { color: #8a8078; }
  .kin { font-size: 0.9rem; line-height: 1.9; color: #8a8078; margin-top: 2rem; }
  .kin-row { display: block; }
  .kin code { color: #3d3630; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.85em; padding: 1px 6px; background: rgba(61,54,48,0.05); border-radius: 3px; }
  .kin .action { color: #3d3630; }
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
  <h1 class="welcome">${isReturning ? `welcome back.` : `welcome to alexandria.`}</h1>
  ${isReturning ? `<p class="line welcome-back">call /alexandria in your coding agent.</p>` : `<div class="steps">
    <p class="line"><button type="button" class="action" onclick="copyCmd(this)" aria-label="copy install command">1. install <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button> &mdash; everything local, nothing sent anywhere <button type="button" class="info" onclick="toggleTip(this)" aria-label="what this does">${ICON_INFO}<span class="tooltip">paste into your coding agent. creates ~/alexandria/, installs hooks and the /a skill, configures cursor / claude code / codex. under 10 seconds.</span></button></p>
    <p class="line"><button type="button" class="action" onclick="copyBlock(this)" aria-label="copy begin block">2. begin <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button> &mdash; drafts a constitution from your files <button type="button" class="info" onclick="toggleTip(this)" aria-label="what this does">${ICON_INFO}<span class="tooltip">paste into a new chat. also syncs from your existing ai memory (claude, chatgpt) and loads your notepad with accretion fragments from the web. takes up to an hour.</span></button></p>
    <p class="line"><a class="action" href="${SHORTCUT_URL}" target="_blank" rel="noopener">3. shortcut <span class="icon">${ICON_EXTERNAL}</span></a> &mdash; save anything worth thinking about <button type="button" class="info" onclick="toggleTip(this)" aria-label="what this does">${ICON_INFO}<span class="tooltip">anything you don't capture, you lose. saved fragments get processed and woven into your context &mdash; surfaced by the engine when relevant, or asked about directly.</span></button></p>
  </div>
  <p class="aside">no agent on hand? add the shortcut and start saving &mdash; what you save becomes your first session, we'll email the rest.</p>`}
  ${kinCode ? `<div class="kin">
    <span class="kin-row">your kin code: <button type="button" class="action" onclick="copyKinCode(this)" aria-label="copy kin code"><code>${kinCode}</code> <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button></span>
    <span class="kin-row"><button type="button" class="action" onclick="copyKinLink(this)" aria-label="copy invite link">copy invite link <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button> <button type="button" class="info" onclick="toggleTip(this)" aria-label="how kin works">${ICON_INFO}<span class="tooltip">share the link or just the code. when five kin become active, alexandria is free.</span></button></span>
  </div>` : ''}
  ${isReturning ? '' : `<div class="mechanics">
    <span class="mechanics-row">we never see your data &mdash; <button type="button" class="action" onclick="copyMechanics(this)" aria-label="copy Mechanics.md">Mechanics.md <span class="icon"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></span></button></span>
    <span class="mechanics-row mechanics-hint">paste into your ai chat to verify.</span>
  </div>`}
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
function copyRemote(url, el) {
  return fetch(url).then(function(r) {
    if (!r.ok) throw new Error('fetch ' + r.status);
    return r.text();
  }).then(function(text) { return copyText(text, el); }).catch(function() {
    window.open(url, '_blank', 'noopener');
  });
}
function copyCmd(el) { copyText(${JSON.stringify(curlCmd)}, el); }
function copyBlock(el) {
  var t = ${JSON.stringify(blockContent)};
  if (t) copyText(t, el); else copyRemote(${JSON.stringify(BLOCK_URL)}, el);
}
function copyMechanics(el) {
  var t = ${JSON.stringify(mechanicsContent)};
  if (t) copyText(t, el); else copyRemote(${JSON.stringify(MECHANICS_URL)}, el);
}
function copyKinCode(el) { copyText(${JSON.stringify(githubLogin)}, el); }
function copyKinLink(el) { copyText(${JSON.stringify(kinLink)}, el); }
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
