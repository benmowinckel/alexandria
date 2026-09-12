/** A quiet, script-free error page when a website connection cannot continue. */
export function renderVisitorConnectionPage({
  site,
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
  const message = error || 'This connection has expired. Start again.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="referrer" content="same-origin">
  <title>alexandria.</title>
  <style>
    :root{color-scheme:light;--paper:#fafafa;--ink:#211e18;--muted:#6f6a63}
    *{box-sizing:border-box}
    body{margin:0;background:var(--paper);color:var(--ink);font:1rem/1.6 Georgia,"Times New Roman",serif;-webkit-font-smoothing:antialiased}
    header{display:flex;align-items:center;padding:28px 32px 0}
    .brand{font-style:italic;font-size:21px;letter-spacing:.005em}
    .brand span{font-style:normal}
    main{width:min(100%,28rem);margin:clamp(3rem,18vh,8rem) auto 3rem;padding:0 1.5rem}
    p{margin:0;color:var(--muted);font-size:1.05rem;line-height:1.65;text-wrap:pretty}
    a{display:inline-block;margin-top:1.25rem;color:var(--ink);text-decoration:underline;text-decoration-color:#c4c0ba;text-underline-offset:3px}
    a:focus-visible{outline:2px solid var(--ink);outline-offset:5px}
  </style>
</head>
<body>
  <header><p class="brand">alexandria<span>.</span></p></header>
  <main>
    <p role="status">${escape(message)}</p>
    ${restart ? `<a href="${restart}">back to ${escape(hostname)}</a>` : ''}
  </main>
</body>
</html>`;
}
