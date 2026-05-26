import fs from 'node:fs';
import path from 'node:path';

export type UpdateMeta = {
  slug: string;
  subject: string;
  date: string;
  youtube?: string;
};

export type Update = UpdateMeta & {
  body: string;
};

export function extractYouTubeId(input: string | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
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

const CONTENT_DIR = path.join(process.cwd(), 'app', 'updates', 'content');

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string> = {};
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

function listSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, ''));
}

export function loadAllUpdates(): UpdateMeta[] {
  const slugs = listSlugs();
  const items: UpdateMeta[] = [];
  for (const slug of slugs) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, `${slug}.md`), 'utf8');
    const { data } = parseFrontmatter(raw);
    const youtube = extractYouTubeId(data.youtube);
    items.push({
      slug,
      subject: data.subject || slug,
      date: data.date || '',
      ...(youtube ? { youtube } : {}),
    });
  }
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? 1 : -1));
}

export function loadUpdate(slug: string): Update | null {
  const file = path.join(CONTENT_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const youtube = extractYouTubeId(data.youtube);
  return {
    slug,
    subject: data.subject || slug,
    date: data.date || '',
    ...(youtube ? { youtube } : {}),
    body: body.trim(),
  };
}
