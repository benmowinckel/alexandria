#!/usr/bin/env node
// Render a patron update from markdown to email HTML and broadcast it
// (or preview to founder only) via the /admin/update/send server endpoint.
//
// Usage:
//   node scripts/send-update.mjs u1            # broadcast to all subscribers
//   node scripts/send-update.mjs u1 --preview  # send only to FOUNDER_EMAIL
//
// Reads admin key from ~/.config/alexandria/admin_key (per CLAUDE.md).
// Aborts if /updates/<slug> 404s — catches "forgot to push markdown" / "Vercel still building".

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CONTENT_DIR = path.join(REPO_ROOT, 'app', 'updates', 'content');
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
const SERVER_URL = process.env.SERVER_URL || 'https://api.alexandria-library.com';
const ADMIN_KEY_PATH = path.join(os.homedir(), '.config', 'alexandria', 'admin_key');

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const slug = args.find((a) => !a.startsWith('--'));

if (!slug) {
  console.error('usage: node scripts/send-update.mjs <slug> [--preview]');
  process.exit(2);
}

const sourceFile = path.join(CONTENT_DIR, `${slug}.md`);
if (!fs.existsSync(sourceFile)) {
  console.error(`✗ no update at ${sourceFile}`);
  process.exit(1);
}

if (!fs.existsSync(ADMIN_KEY_PATH)) {
  console.error(`✗ admin key not found at ${ADMIN_KEY_PATH}`);
  console.error('  see ~/alexandria-inc/private/CLAUDE.md → "Alexandria admin API key" for how to mint one');
  process.exit(1);
}
const adminKey = fs.readFileSync(ADMIN_KEY_PATH, 'utf8').trim();

const raw = fs.readFileSync(sourceFile, 'utf8');
const { data, body } = parseFrontmatter(raw);
const subject = data.subject || slug;
const date = data.date || '';
const youtube = extractYouTubeId(data.youtube);
if (!data.subject) console.warn(`! ${slug}: no subject in frontmatter, falling back to slug`);
if (!data.date) console.warn(`! ${slug}: no date in frontmatter`);
if (data.youtube && !youtube) console.warn(`! ${slug}: youtube field could not be parsed: ${data.youtube}`);

// Build the footer nav from the directory — chronological by date,
// matching the web page's nav order.
const allSlugs = listChronological();
const navHtml = allSlugs
  .map((s) => {
    const href = `${WEBSITE_URL}/updates/${s}`;
    if (s === slug) return `<strong style="color: #3d3630; font-weight: 500;">${escapeHtml(s)}</strong>`;
    return `<a href="${href}" style="color: #8a8078; text-decoration: none;">${escapeHtml(s)}</a>`;
  })
  .join(' <span style="color: #bbb4aa;">·</span> ');

const bodyHtml = markdownToEmailHtml(body.trim());
const permalink = `${WEBSITE_URL}/updates/${slug}`;
const videoHtml = youtube ? renderVideoBlock(youtube, permalink) : '';

const html = `<div style="font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 48px 24px; color: #3d3630; font-size: 1.05rem; line-height: 1.7;">
${date ? `<p style="margin: 0 0 1.6rem; font-size: 0.78rem; color: #bbb4aa; letter-spacing: 0.04em; font-style: italic;">${escapeHtml(slug)} &nbsp;·&nbsp; ${escapeHtml(date)}</p>` : ''}
${videoHtml}
${bodyHtml}
<p style="margin: 2rem 0 0; padding-top: 1.2rem; border-top: 1px solid #e8e2d8; font-size: 0.78rem; color: #8a8078; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; line-height: 2;">${navHtml}</p>
<p style="margin: 0.6rem 0 0; font-size: 0.72rem; color: #bbb4aa;"><a href="${permalink}" style="color: #bbb4aa; text-decoration: none;">read on the web</a></p>
<!--UNSUBSCRIBE-->
</div>`;

// Liveness check — refuse to broadcast if the public page isn't live yet.
// RETRIES with backoff: a Vercel deploy + CDN propagation takes a minute, and a
// single stale edge can 404 even when the page is up. A one-shot check therefore
// silently no-ops the whole send while looking like success (the 2026-06-15 u2
// failure — hours lost). Poll until reliably live; if it never comes up, fail
// LOUDLY. Preview path skips this (founder can preview a draft before pushing).
if (!preview) {
  const ATTEMPTS = 24;        // ~4 min at 10s — generous for Vercel propagation
  const INTERVAL_MS = 10_000;
  let live = false;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    process.stdout.write(`checking ${permalink} (${attempt}/${ATTEMPTS}) ... `);
    let status = 0;
    try { status = (await fetch(permalink, { method: 'HEAD' })).status; } catch { /* network blip — treat as not-live, retry */ }
    if (status === 200) { console.log('live ✓'); live = true; break; }
    console.log(`not live yet (${status || 'no response'})`);
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  if (!live) {
    console.error(`\n❌ NOT SENT — ${permalink} never went live after ~4 min.`);
    console.error('   Confirm the push deployed on Vercel, then re-run. Nothing was broadcast.');
    process.exit(1);
  }
}

process.stdout.write(`${preview ? 'previewing' : 'broadcasting'} ${slug} (subject: "${subject}") ... `);
const res = await fetch(`${SERVER_URL}/admin/update/send`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminKey}`,
  },
  body: JSON.stringify({ slug, subject, html, preview }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok || out.ok === false) {
  console.log('✗');
  console.error(`\n❌ NOT SENT — HTTP ${res.status}: ${JSON.stringify(out)}`);
  process.exit(1);
}
console.log('ok');
console.log(
  preview
    ? `\n✅ PREVIEW sent to ${out.sent_to || 'founder inbox'}.`
    : `\n✅ BROADCAST SENT — ${out.sent} accepted by Resend, ${out.failed} failed (of ${out.total}).`,
);
console.log(JSON.stringify(out, null, 2));

// ---------- helpers ----------

function parseFrontmatter(raw) {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

function listChronological() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const slugs = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, ''));
  const dated = slugs.map((s) => {
    const r = fs.readFileSync(path.join(CONTENT_DIR, `${s}.md`), 'utf8');
    const { data } = parseFrontmatter(r);
    return { slug: s, date: data.date || '' };
  });
  return dated
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slug < b.slug ? -1 : 1))
    .map((d) => d.slug);
}

function extractYouTubeId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = p.exec(s);
    if (m) return m[1];
  }
  return null;
}

// Email-friendly video block — clickable thumbnail (hqdefault exists for every
// video; maxresdefault doesn't for all) with a small play glyph overlay drawn
// in CSS so it survives image-blocking inboxes. Links direct to YouTube
// (clicking thumbnail in email opens YouTube; clicking "watch on the site"
// opens the archive page where the iframe player embeds inline).
function renderVideoBlock(videoId, archiveUrl) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  return `<a href="${watchUrl}" style="display: block; margin: 0 0 1.6rem; text-decoration: none; position: relative; line-height: 0;">
  <img src="${thumb}" alt="watch on youtube" width="432" style="display: block; width: 100%; max-width: 432px; height: auto; border-radius: 2px; border: 1px solid #e8e2d8;">
</a>
<p style="margin: -0.6rem 0 1.6rem; font-size: 0.82rem; color: #8a8078; text-align: center; line-height: 1.4;">
  <a href="${watchUrl}" style="color: #3d3630; text-decoration: none; border-bottom: 1px solid #e8e2d8;">▶ watch on youtube</a>
  &nbsp;·&nbsp;
  <a href="${archiveUrl}" style="color: #8a8078; text-decoration: none;">or on the site</a>
</p>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Minimal markdown → HTML. Supports paragraphs, **bold**, *italic*, _italic_,
// [text](url) links, and `---` horizontal rules. Anything fancier — write raw
// HTML in the markdown source; it passes through unchanged.
function markdownToEmailHtml(md) {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  for (const block of blocks) {
    if (/^---+$/.test(block)) {
      out.push(`<hr style="border: none; border-top: 1px solid #e8e2d8; margin: 1.8rem 0;">`);
      continue;
    }
    // Allow raw HTML passthrough — block starts with <
    if (block.startsWith('<')) {
      out.push(block);
      continue;
    }
    out.push(`<p style="margin: 0 0 1.4rem;">${inline(block)}</p>`);
  }
  return out.join('\n');
}

function inline(text) {
  // Escape first, then re-inject markdown-rendered fragments. Order matters:
  // links before italics so `[a](b)` underscores in URLs aren't mangled.
  let s = escapeHtml(text);
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label, url) => `<a href="${url}" style="color: #3d3630;">${label}</a>`,
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w])\*([^*]+)\*(?=[^\w]|$)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\n/g, '<br>');
  return s;
}
