'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../components/ThemeToggle';
import PromptBox from '../../components/PromptBox';
import { FETCH_TIMEOUT_MS, SERVER_URL, librarySignInUrlHere } from '../../lib/config';
import { safeUrl } from '../../lib/url';
import { type TwinVariantSummary } from './types';

interface ProtocolFile {
  name: string;
  text: string | null;
  title?: string | null;
  // Always-public teaser line; used as the subtitle when set. Gated files
  // (invite/authors) have their `text` blurb suppressed server-side, so this is
  // the only subtitle source for them.
  subtitle?: string | null;
  visibility: string;
  category?: string;
  updated_at: string;
  url: string;
}

interface AuthorData {
  author: {
    id: string;
    account_id: string | null;
    alexandria_id: string;
    display_name: string | null;
    location: string | null;
    location_key: string | null;
    contact: string | null;
    website: string | null;
    socials: { label: string; url: string }[] | null;
    text: string | null;
  };
  twin?: { enabled: boolean; label: string | null; variants?: TwinVariantSummary[]; online?: boolean; signed_in?: boolean };
  files?: ProtocolFile[];
  // Optional per-Author profile config — reorder/subset the emergent sections
  // and rename a section's word + whisper. Absent → defaults. The profile is a
  // router over whatever the Author published, not a fixed template.
  profile?: {
    order?: string[];
    hidden?: string[];
    labels?: Record<string, { word?: string; whisper?: string }>;
  };
}

function normalizePreviewText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\uFFFD/g, '-');
}

// Small words stay lowercase (unless first): "Droplets of Grace". Overrides let an
// Author style a name their own way (e.g. lowercase brand "mowinckels").
const SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'by', 'with']);
const TITLE_OVERRIDE: Record<string, string> = { mowinckels: 'mowinckels' };
function fileDisplayName(name: string): string {
  if (TITLE_OVERRIDE[name]) return TITLE_OVERRIDE[name];
  return name.split('-')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function visibilityLabel(value: string): string {
  if (value === 'public') return 'public';
  if (value === 'paid') return 'paid';
  if (value === 'invite') return 'invite';
  return 'authors';
}

function contactHref(contact: string): string {
  return contact.includes('@') && !contact.startsWith('mailto:') ? `mailto:${contact}` : safeUrl(contact);
}

function websiteHref(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return safeUrl(/^https?:\/\//i.test(t) ? t : `https://${t}`);
}

// The FORM of contact (capitalised, to match the location pill), not the raw value.
function contactForm(contact: string): string {
  const c = contact.trim();
  if (c.includes('@') && !/^https?:\/\//i.test(c)) return 'Email';
  if (/^https?:\/\//i.test(c) || /\.[a-z]{2,}(\/|$)/i.test(c)) return 'Website';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function websiteLabel(raw: string): string {
  const href = websiteHref(raw);
  return href.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

const websiteUrlLineStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  marginTop: '0.4rem',
  color: 'var(--text-muted)',
  textDecoration: 'none',
  wordBreak: 'break-all',
  lineHeight: 1.45,
};

function WebsiteUrlLine({ website, style }: { website: string; style?: CSSProperties }) {
  const href = websiteHref(website);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...websiteUrlLineStyle, ...style }}
      className="hover:opacity-60"
    >
      {websiteLabel(website)}
    </a>
  );
}

export default function AuthorPageClient({ params }: { params: Promise<{ author: string }> }) {
  const router = useRouter();
  const [authorId, setAuthorId] = useState('');
  const [data, setData] = useState<AuthorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The ask-me door — the question typed here rides to the chat page, which
  // auto-fires it (?q=). The door owns no chat state; the chat is the room.
  const [doorQ, setDoorQ] = useState('');
  const [doorGoing, setDoorGoing] = useState(false);
  const [beliCopied, setBeliCopied] = useState(false);
  // Rotating door placeholder — smart example questions cycle through the ghost
  // text instead of rigid hardcoded chips (founder 2026-07-19).
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhIdx((i) => i + 1), 3600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    params.then(({ author }) => {
      setAuthorId(author);
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      fetch(`/api/library/${encodeURIComponent(author)}`, { signal: ctrl.signal, credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
        .then(d => { setData(d); setLoading(false); })
        .catch(e => { setError(e.name === 'AbortError' ? 'unreachable' : e.message); setLoading(false); })
        .finally(() => clearTimeout(timeout));
    });
  }, [params]);

  const openProtocolFile = async (file: ProtocolFile) => {
    if (file.visibility === 'public') {
      window.open(`${SERVER_URL}/library/${encodeURIComponent(authorId)}/file/${encodeURIComponent(file.name)}`, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.href = `/library/${encodeURIComponent(authorId)}/open/${encodeURIComponent(file.name)}`;
  };

  // The door's question rides to the chat page, which auto-fires it (?q=).
  const goAskWith = (q: string) => {
    const text = q.trim();
    if (!text || doorGoing) return;
    setDoorGoing(true);
    router.push(`/library/${encodeURIComponent(authorId)}/plm?q=${encodeURIComponent(text)}`);
  };
  const goAsk = () => goAskWith(doorQ);

  if (loading) return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>...</p>
    </main>
  );

  if (error || !data) return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{error === 'unreachable' ? 'could not reach Alexandria.' : 'this Author has nothing published yet.'}</p>
      <p style={{ marginTop: '2rem' }}><Link href="/library" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.95rem' }}>library</Link></p>
    </main>
  );

  const { author } = data;
  const files = data.files || [];
  // The profile is a set of sections, each just hosted text + links — every one
  // rides the existing publish mechanism (a public file the Author names), so
  // there is no backend for any of them. `works` / `projects` / `other` are open
  // text sections rendered inline with clickable URLs; `other` is the freeform
  // catch-all (invisible until the Author publishes it). Everything else is a
  // The profile is a ROUTER over whatever the Author published — emergent, not a
  // fixed template. Visible sections = the categories that actually have files,
  // in the Author's order (or the default works → projects → shadows → other).
  // `other` shows when filled and hides when empty (a2 § Library V1), same as
  // every other section. The 4-category vocabulary is fixed; everything about how
  // the sections render is Author-controllable via the optional profile config.
  const CATEGORY_VOCAB = ['works', 'projects', 'shadows', 'other'] as const;
  const DEFAULT_WHISPER: Record<string, string> = {
    works: 'what’s been made',
    projects: 'what’s being built',
    shadows: 'what’s being thought',
    other: 'everything else',
  };
  const profile = data.profile || {};
  const hiddenCats = new Set((profile.hidden || []).filter((c) => (CATEGORY_VOCAB as readonly string[]).includes(c)));
  const byCat = new Map<string, ProtocolFile[]>();
  for (const f of files) {
    const cat = (CATEGORY_VOCAB as readonly string[]).includes(f.category || '') ? (f.category as string) : 'shadows';
    (byCat.get(cat) || byCat.set(cat, []).get(cat)!).push(f);
  }
  // Author order first (valid entries only), then any remaining categories in the
  // default order — so a newly-published section never silently disappears.
  const orderPref = (profile.order || []).filter((c) => (CATEGORY_VOCAB as readonly string[]).includes(c));
  const effectiveOrder = [...orderPref, ...CATEGORY_VOCAB.filter((c) => !orderPref.includes(c))];
  const grouped = effectiveOrder
    .filter((cat) => (byCat.get(cat)?.length || 0) > 0 && !hiddenCats.has(cat))
    .map((cat) => ({
      cat,
      word: (profile.labels?.[cat]?.word || '').trim() || cat,
      whisper: profile.labels?.[cat]?.whisper ?? DEFAULT_WHISPER[cat] ?? '',
      items: byCat.get(cat) as ProtocolFile[],
    }));

  // General account sign-in — lives at the top of the page, not tied to the twin.
  const signedIn = data.twin?.signed_in === true;
  const signInUrl = librarySignInUrlHere();
  // The router — the bio's links out as one first-class block: website leads,
  // socials follow, contact closes. This is the ground-truth pointer set the
  // node resolves onward to (the profile is a router first — a2 § Library V1);
  // the same declared graph is what feeds the twin's linked-surface context.
  const cleanUrl = (u: string) => (u.startsWith('http') ? u : `https://${u}`);
  // Each link carries a whisper of what it IS to this person (founder: the
  // links stack like everything else, with subtitles — personal projects /
  // audience / network). Defaults by platform; unknown platforms go bare.
  const linkWhisper = (label: string): string | null => {
    const l = label.toLowerCase();
    if (l === 'x' || l.includes('twitter')) return 'personal audience';
    if (l.includes('linkedin')) return 'personal network';
    if (l.includes('instagram')) return 'personal aesthetic';
    if (l.includes('github')) return 'personal code';
    if (l.includes('substack') || l.includes('medium')) return 'personal writing';
    if (l.includes('youtube')) return 'personal channel';
    if (l.includes('beli')) return 'personal taste';
    if (l.includes('strava')) return 'personal training';
    if (l.includes('goodreads')) return 'personal reading';
    if (l.includes('pinterest')) return 'personal inspiration';
    if (l.includes('vsco')) return 'personal photography';
    return null;
  };
  const routerLinks: { label: string; url: string; sub: string | null; external: boolean }[] = [
    ...(author.website ? [{ label: websiteLabel(author.website), url: safeUrl(cleanUrl(author.website)), sub: 'personal projects', external: true }] : []),
    ...(author.socials || [])
      .filter((s) => s && s.label && s.url)
      .map((s) => ({ label: s.label.trim().toLowerCase(), url: safeUrl(cleanUrl(s.url)), sub: linkWhisper(s.label), external: true })),
  ];
  const renderLinkedText = (text: string) =>
    text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a
          key={i}
          href={safeUrl(part)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-60"
          style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}
        >
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  const sectionLabelStyle: CSSProperties = {
    color: 'var(--text-ghost)',
    fontSize: '0.9rem',
    letterSpacing: '0.08em',
    margin: '0 0 0.45rem',
  };
  // One head style for all five sections — mind · links · works · projects ·
  // shadows (founder: the five things on the profile). Word underlined (short,
  // not page-wide), whisper italic behind a symmetric middot.
  const sectionHead = (word: string, whisper: string) => (
    <p style={{ ...sectionLabelStyle, color: 'var(--text-secondary)' }}>
      <span style={{ borderBottom: '1px solid var(--text-ghost)', paddingBottom: '3px' }}>{word}</span>
      <span aria-hidden style={{ color: 'var(--text-ghost)', margin: '0 0.45rem' }}>·</span>
      <span style={{ color: 'var(--text-muted)', letterSpacing: 0, fontStyle: 'italic' }}>{whisper}</span>
    </p>
  );
  const textSection = (label: string, file: ProtocolFile | null) =>
    file ? (
      <div key={label} style={{ borderTop: '1px solid var(--border-light)', marginTop: '1.6rem', paddingTop: '1.1rem' }}>
        <p style={sectionLabelStyle}>{label}</p>
        <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {renderLinkedText(normalizePreviewText(file.text) || '')}
        </div>
      </div>
    ) : null;

  // Entry row — title left, tier right, on one baseline, with a bottom hairline.
  const fileRow = (file: ProtocolFile) => {
    // Explicit always-public teaser wins; else fall back to the first line of
    // the (public-only) text blurb. Gated files rely entirely on the teaser.
    const rawPreview = (file.subtitle && file.subtitle.trim()) || normalizePreviewText(file.text) || '';
    const firstLine = rawPreview.split('\n')[0].trim();
    const preview = firstLine.length > 110 ? `${firstLine.slice(0, 110).trimEnd()}…` : firstLine;
    const rowStyle: CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: '1.25rem',
      width: '100%',
      padding: '0.55rem 0',
      // No hairline per item (founder, round three: "too many lines") — the
      // one zone divider above carries the structure; whitespace does the rest.
      border: 'none',
      background: 'none',
      color: 'inherit',
      textDecoration: 'none',
      fontFamily: 'inherit',
      textAlign: 'left',
      cursor: 'pointer',
      transition: 'opacity 0.15s',
    };
    const inner = (
      <>
        <span style={{ minWidth: 0 }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '1.06rem' }}>{file.title || fileDisplayName(file.name)}</span>
          {preview && (
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.45, marginTop: '0.2rem' }}>
              {preview}
            </span>
          )}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem', letterSpacing: '0.04em', flex: 'none', whiteSpace: 'nowrap' }}>
          {visibilityLabel(file.visibility)}
        </span>
      </>
    );

    // Every entry opens the 3-panel reader (piece + twin + notes); it handles the
    // gate itself (public reads free, invite/paid prompt sign-in).
    return (
      <Link key={file.name} href={`/library/${encodeURIComponent(authorId)}/read/${encodeURIComponent(file.name)}`}
        className="hover:opacity-60" style={rowStyle}>
        {inner}
      </Link>
    );
  };

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '820px', margin: '0 auto', padding: '6rem 2.5rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <header style={{ margin: '0 0 2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Link href="/library" aria-label="back to the library" title="library" style={{ color: 'var(--text-muted)', display: 'flex', textDecoration: 'none' }} className="hover:opacity-60">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </Link>
            {!signedIn && (
              <a href={signInUrl} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }} className="hover:opacity-60">
                sign in
              </a>
            )}
          </div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 500, letterSpacing: '-0.012em', margin: '2rem 0 0.35rem' }}>
            {author.display_name || author.id}
          </h1>
          {/* Identity line — number · location · contact on one plain line, same
              style as the member number; cleaner than pills (founder 2026-07-19). */}
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', letterSpacing: '0.02em', margin: '0.35rem 0 0', textTransform: 'lowercase' }}>
            {author.alexandria_id}
            {author.location && author.location_key && (
              <>{' '}<span style={{ color: 'var(--text-ghost)' }}>·</span>{' '}
                <Link href={`/library?locations=${encodeURIComponent(author.location_key)}`} style={{ color: 'inherit', textDecoration: 'none' }} className="hover:opacity-60">{author.location}</Link></>
            )}
            {author.contact && (
              <>{' '}<span style={{ color: 'var(--text-ghost)' }}>·</span>{' '}
                <a href={contactHref(author.contact)}
                  target={author.contact.startsWith('http') ? '_blank' : undefined}
                  rel={author.contact.startsWith('http') ? 'noopener noreferrer' : undefined}
                  style={{ color: 'inherit', textDecoration: 'none' }} className="hover:opacity-60">{contactForm(author.contact)}</a></>
            )}
          </p>
          {/* No bio — nobody gets a bio (founder 2026-07-19): a line isn't enough to
              sense-check a person; the name, location, and the mind carry it. */}
          {/* Links, slightly underlined so they read as links (founder 2026-07-19).
              Beli has no web page → a click-to-reveal of the copyable handle rather
              than a dead navigation; no extra inline text. */}
          {routerLinks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.3rem 1.15rem', marginTop: '0.85rem', fontSize: '0.98rem' }}>
              {routerLinks.map((l) => {
                const linkStyle: CSSProperties = { color: 'var(--text-muted)', textDecoration: 'underline', textDecorationColor: 'var(--border-light)', textUnderlineOffset: '3px' };
                if (/beliapp\.co/i.test(l.url)) {
                  const handle = l.url.replace(/\/+$/, '').split('/').pop() || '';
                  return (
                    <button key={l.url} type="button" title="beli has no web page — click to copy the username"
                      onClick={() => { try { navigator.clipboard?.writeText('@' + handle); } catch { /* */ } setBeliCopied(true); setTimeout(() => setBeliCopied(false), 1800); }}
                      style={{ ...linkStyle, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
                      className="hover:opacity-60">
                      {beliCopied ? `@${handle} · copied ✓` : 'beli'}
                    </button>
                  );
                }
                return (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="hover:opacity-60" style={linkStyle}>
                    {l.label}
                  </a>
                );
              })}
            </div>
          )}
        </header>

        <section>
          {data.twin?.enabled && (() => {
            // The ask-me door — the clearest thing on the page (a2 § Library V1:
            // the twin is why the link spreads). The question rides to the chat
            // page (?q= auto-fires there); the door itself holds no chat state.
            // The PLM page still carries the quick/deep toggle + invite gate.
            const anyOn = (data.twin.variants || []).some((v) => v.enabled);
            if (!anyOn) return null;
            const online = data.twin.online === true;
            const first = (author.display_name || author.id).split(' ')[0];
            const projs = grouped.find((g) => g.cat === 'projects')?.items || [];
            const p0 = projs[0] ? (projs[0].title || fileDisplayName(projs[0].name)).toLowerCase() : null;
            const p1 = projs[1] ? (projs[1].title || fileDisplayName(projs[1].name)).toLowerCase() : null;
            const askExamples = [
              p0 ? `what is ${p0}?` : `what is ${first} building?`,
              `what does ${first} believe?`,
              `what’s ${first} like?`,
              `how does ${first} think about ai?`,
              p1 ? `why ${p1}?` : `what matters most to ${first}?`,
              `what should i read first?`,
              routerLinks.some((l) => l.label === 'x') ? `what’s on ${first}’s x?` : 'where should i start?',
              `what’s ${first}’s philosophy?`,
              `what would ${first} push back on?`,
              'ask anything…',
            ];
            return (
              // The mind is the ONE elevated object on the page (founder: the
              // page read flat — a cold visitor must see what to do without
              // reading). A quiet card lifts the door above everything else;
              // example questions make the first move a single tap.
              <div style={{
                // Text inside sits on the PAGE's left edge (one text line for
                // the whole profile); the card's borders protrude symmetrically
                // instead — margin mirrors padding (founder, round nine).
                margin: '0 -1.5rem 3.2rem', padding: '1.6rem 1.5rem 1.4rem',
                border: '1px solid var(--border-light)', borderRadius: '14px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 6px 18px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
                  {sectionHead('mind', 'a personal language model')}
                  {/* Status as pure typography — accent when live, ghost when
                      not. No dot geometry to misalign (founder, round 13). */}
                  <span style={{ color: online ? 'var(--accent)' : 'var(--text-ghost)', fontSize: '0.85rem', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {online ? 'online' : 'offline'}
                  </span>
                </div>
                <div style={{ margin: '0.9rem -0.98rem 0' }}>
                  <PromptBox value={doorQ} onChange={setDoorQ} onSubmit={goAsk} loading={doorGoing}
                    placeholder={doorQ ? 'ask anything…' : askExamples[phIdx % askExamples.length]} />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0.8rem 0 0' }}>
                  a mirror of {first}&rsquo;s published mind — ask it anything; it answers from what they&rsquo;ve written, and says so plainly where it can&rsquo;t.
                </p>
              </div>
            );
          })()}
          {/* links now live in the bio (above) as plain hyperlinks — the profile
              body is works / projects / shadows only. */}
          {grouped.length === 0 ? (
            !data.twin?.enabled && (
              <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', margin: 0 }}>
                nothing published yet.
              </p>
            )
          ) : (
            // The library zone — one hairline breaks it from mind + links
            // above; the three content sections follow, vertically tight,
            // items lineless. Whispers person-free and parallel.
            <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '0.4rem' }}>
              {grouped.map(({ cat, word, whisper, items }) => (
                <div key={cat} style={{ marginTop: '2.6rem' }}>
                  {sectionHead(word, whisper)}
                  {items.map(fileRow)}
                </div>
              ))}
            </div>
          )}
        </section>
        {/* A slim footer rounds the page off (founder: borders, a place for
            the one CTA — this profile IS the demo; "build your own" is the
            whole pitch). */}
        <footer style={{ borderTop: '1px solid var(--border-light)', textAlign: 'center', margin: '4rem 0 0', padding: '1.6rem 0 0' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0 }}>
            want this for yourself?{' '}
            <Link href="/start" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="hover:opacity-60">build your own</Link>
          </p>
          <p style={{ margin: '1.4rem 0 0' }}>
            <Link href="/library" style={{ fontStyle: 'italic', color: 'var(--text-ghost)', fontSize: '1rem', letterSpacing: '0.01em', textDecoration: 'none' }} className="hover:opacity-60">
              alexandria<span style={{ fontStyle: 'normal' }}>.</span>
            </Link>
          </p>
        </footer>
      </main>
    </>
  );
}
