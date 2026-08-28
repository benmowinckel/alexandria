const base = (process.env.SITE_URL || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');

const publicRoutes = [
  '/', '/start', '/chat', '/join', '/whitepaper', '/features',
  '/letter', '/library', '/marketplace', '/follow', '/questions', '/updates',
  '/mechanics', '/privacy', '/terms',
];

const serverHeadingRoutes = new Set([
  '/', '/start', '/chat', '/join', '/library', '/marketplace', '/follow',
  '/updates', '/privacy', '/terms',
]);

function attrs(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)=(?:"([^"]*)"|'([^']*)')/g)]
      .map((m) => [m[1], m[2] ?? m[3] ?? '']),
  );
}

function meta(html, key, value) {
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (a[key] === value) return a.content || '';
  }
  return '';
}

function link(html, rel) {
  for (const match of html.matchAll(/<link\s+[^>]*>/gi)) {
    const a = attrs(match[0]);
    if ((a.rel || '').split(/\s+/).includes(rel)) return a.href || '';
  }
  return '';
}

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

for (const route of publicRoutes) {
  const response = await fetch(`${base}${route}`);
  assert(response.ok, `${route}: HTTP ${response.status}`);
  const html = await response.text();
  const title = /<title>([^<]+)<\/title>/i.exec(html)?.[1] || '';
  const description = meta(html, 'name', 'description');
  const canonical = link(html, 'canonical');
  const ogImage = meta(html, 'property', 'og:image');
  const twitterImage = meta(html, 'name', 'twitter:image');
  const resolvedPath = new URL(response.url).pathname;
  const expectedCanonical = resolvedPath === '/' ? 'https://alexandria-library.com' : `https://alexandria-library.com${resolvedPath}`;

  assert(title, `${route}: missing title`);
  assert(description, `${route}: missing description`);
  assert(canonical === expectedCanonical, `${route}: canonical is ${canonical || 'missing'}`);
  assert(ogImage, `${route}: missing og:image`);
  assert(twitterImage, `${route}: missing twitter:image`);
  if (serverHeadingRoutes.has(route)) {
    assert(/<h1(?:\s|>)/i.test(html), `${route}: missing server-rendered h1`);
  }
}

for (const route of ['/ask', '/plainly']) {
  const response = await fetch(`${base}${route}`);
  assert(response.ok, `${route}: HTTP ${response.status}`);
  assert(new URL(response.url).pathname === '/start', `${route}: must resolve to /start`);
}

for (const route of ['/memo', '/pitch', '/demo']) {
  const response = await fetch(`${base}${route}`);
  assert(response.ok, `${route}: HTTP ${response.status}`);
  const robots = meta(await response.text(), 'name', 'robots');
  assert(robots.includes('noindex'), `${route}: missing noindex`);
}

for (const asset of [
  '/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/favicon.ico',
  '/icon.svg', '/favicon-16.png', '/favicon-32.png', '/favicon-64.png',
  '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png',
  '/icon-maskable.png', '/opengraph-image',
]) {
  const response = await fetch(`${base}${asset}`);
  assert(response.ok, `${asset}: HTTP ${response.status}`);
  if (asset === '/sitemap.xml') {
    assert(!(await response.text()).includes('<lastmod>'), '/sitemap.xml: contains invented last-modified dates');
  }
}

console.log(`metadata clean: ${publicRoutes.length} pages + private routes + public assets`);
