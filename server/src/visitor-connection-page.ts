/** A quiet, script-free consent page for one site's existing reader access. */
export function renderVisitorConnectionPage({
  site,
  readerLogin,
  intent,
  error,
  restartUrl,
}: {
  site: string;
  readerLogin?: string;
  intent?: string;
  error?: string;
  restartUrl?: string;
}): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
  let hostname = 'this website';
  try {
    const destination = new URL(site);
    if (destination.protocol === 'https:' || destination.protocol === 'http:') hostname = destination.hostname;
  } catch { /* An invalid destination must not become markup or a link. */ }
  let restart = '';
  if (restartUrl) {
    try {
      const destination = new URL(restartUrl, 'https://alexandria-library.com');
      if ((destination.protocol === 'https:' || destination.protocol === 'http:')
        && !destination.username && !destination.password) restart = escape(restartUrl);
    } catch { /* Leave an invalid restart link out. */ }
  }
  const canContinue = !!intent && !error;
  const title = `continue to ${hostname}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="referrer" content="same-origin">
  <title>${escape(title)}</title>
  <style>
    :root{color-scheme:light;--paper:#fafafa;--ink:#211e18;--muted:#6f6a63;--action:#57504a}
    *{box-sizing:border-box}
    body{margin:0;padding:clamp(4rem,22vh,12rem) 1.5rem 3rem;background:var(--paper);color:var(--ink);font:1rem/1.6 Georgia,"Times New Roman",serif;-webkit-font-smoothing:antialiased}
    main{width:min(100%,28rem);margin:auto;text-align:center;animation:arrive .4s ease-out both}
    h1{margin:0 0 1.15rem;font-size:clamp(1.45rem,5vw,1.75rem);line-height:1.3;font-weight:400;letter-spacing:-.025em;overflow-wrap:anywhere;text-wrap:balance}
    .explanation{margin:0 auto;max-width:25rem;color:var(--muted);font-size:.98rem;line-height:1.65;text-wrap:pretty}
    .identity{margin:1.2rem 0 0;color:var(--muted);font: .78rem/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-wrap:anywhere}
    form{display:flex;justify-content:center;align-items:center;gap:.45rem;margin:1.65rem 0 0}
    button,.restart{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.65rem 1.45rem;border:0;border-radius:6px;font:.88rem/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;text-decoration:none}
    button[value="allow"],.restart{background:var(--action);color:#fff}
    button[value="deny"]{background:transparent;color:var(--muted);padding-inline:1rem}
    button[value="allow"]:hover,.restart:hover{background:#49433e}
    button[value="deny"]:hover{color:var(--ink)}
    button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--action);outline-offset:5px;border-radius:4px}
    details{max-width:25rem;margin:1.8rem auto 0;color:var(--muted);font:.78rem/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    summary{display:inline-block;padding:.25rem 0;cursor:pointer;list-style:none;text-decoration:underline;text-decoration-color:#c4c0ba;text-underline-offset:3px}
    summary::-webkit-details-marker{display:none}
    details p{margin:.8rem 0 0;text-wrap:pretty}
    .restart{margin-top:1.65rem}
    @keyframes arrive{from{opacity:0}to{opacity:1}}
    @media(prefers-reduced-motion:reduce){main{animation:none}}
    @media(max-width:360px){body{padding-inline:1.15rem}form{gap:.1rem}}
  </style>
</head>
<body>
  <main>
    <h1>${escape(title)}</h1>
    ${canContinue ? `<p class="explanation">Continue with your existing access to this author&rsquo;s mirror.</p>
    ${readerLogin ? `<p class="identity">signed in as <bdi>${escape(readerLogin)}</bdi></p>` : ''}
    <form method="post" action="/connect/authorize">
      <input type="hidden" name="intent" value="${escape(intent!)}">
      <button type="submit" name="decision" value="allow">continue</button>
      <button type="submit" name="decision" value="deny">cancel</button>
    </form>
    <details>
      <summary>about this connection</summary>
      <p>This website can read and ask about this author&rsquo;s shared material using your current access. No private map, publishing, account management or access to other authors.</p>
      <p>Lasts up to eight hours. Signing out of Alexandria ends this connection. Any payment needs your confirmation at checkout.</p>
    </details>` : `<p class="explanation" role="status">${escape(error || 'This connection has expired. Start again.')}</p>
    ${restart ? `<a class="restart" href="${restart}">back to ${escape(hostname)}</a>` : ''}`}
  </main>
</body>
</html>`;
}
