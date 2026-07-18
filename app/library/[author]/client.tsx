'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../components/ThemeToggle';
import StartJoinCTA from '../../components/StartJoinCTA';
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
  // Group entries into category sections. 'other' is a low-key bucket that is NOT
  // shown here — it holds files not meant for the router (uncategorised/internal).
  const VISIBLE_CATEGORIES = ['works', 'projects', 'shadows'] as const;
  const grouped = VISIBLE_CATEGORIES
    .map((cat) => ({ cat, items: files.filter((f) => (f.category || 'shadows') === cat) }))
    .filter((g) => g.items.length > 0);

  // General account sign-in — lives at the top of the page, not tied to the twin.
  const signedIn = data.twin?.signed_in === true;
  const signInUrl = librarySignInUrlHere();
  // The router — the bio's links out as one first-class block: website leads,
  // socials follow, contact closes. This is the ground-truth pointer set the
  // node resolves onward to (the profile is a router first — a2 § Library V1);
  // the same declared graph is what feeds the twin's linked-surface context.
  const cleanUrl = (u: string) => (u.startsWith('http') ? u : `https://${u}`);
  const routerLinks: { label: string; url: string; external: boolean }[] = [
    ...(author.website ? [{ label: websiteLabel(author.website), url: safeUrl(cleanUrl(author.website)), external: true }] : []),
    ...(author.socials || [])
      .filter((s) => s && s.label && s.url)
      .map((s) => ({ label: s.label.trim().toLowerCase(), url: safeUrl(cleanUrl(s.url)), external: true })),
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
  const profileText = normalizePreviewText(author.text);
  const tagStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid var(--border-light)',
    borderRadius: '999px',
    color: 'var(--text-muted)',
    fontSize: '0.92rem',
    lineHeight: 1,
    padding: '0.32rem 0.58rem',
    textDecoration: 'none',
    textTransform: 'lowercase',
  };

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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', letterSpacing: '0.02em', margin: '0.35rem 0 0' }}>
            {author.alexandria_id}
          </p>
          {profileText && (
            // Rendered lowercase (brand voice — trying it, founder 2026-07-17);
            // the stored text stays as typed, this is presentation only.
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.08rem', lineHeight: 1.6, margin: '0.75rem 0 0', maxWidth: '34rem', textTransform: 'lowercase' }}>
              {profileText}
            </p>
          )}
          {/* Alexandria-native pills — location (filters the directory) and
              contact, side by side in the same form (founder, 2026-07-17). */}
          {(author.location || author.contact) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.9rem' }}>
              {author.location && author.location_key && (
                <Link href={`/library?locations=${encodeURIComponent(author.location_key)}`} style={tagStyle} className="hover:opacity-60">
                  {author.location}
                </Link>
              )}
              {author.contact && (
                <a href={contactHref(author.contact)}
                  target={author.contact.startsWith('http') ? '_blank' : undefined}
                  rel={author.contact.startsWith('http') ? 'noopener noreferrer' : undefined}
                  style={tagStyle} className="hover:opacity-60">
                  {contactForm(author.contact)}
                </a>
              )}
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
                {sectionHead('mind', 'a personal language model')}
                <div style={{ margin: '0.9rem -0.98rem 0' }}>
                  <PromptBox value={doorQ} onChange={setDoorQ} onSubmit={goAsk} loading={doorGoing} placeholder="ask me anything…" />
                </div>
                {/* One tap to the first question — shows what asking looks
                    like better than any explainer could. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.85rem' }}>
                  {['what are you building?', 'what do you believe?', 'where should i start?'].map((q) => (
                    <button key={q} type="button" onClick={() => goAskWith(q)}
                      style={{ ...tagStyle, background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)' }}
                      className="hover:opacity-60">
                      {q}
                    </button>
                  ))}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.5, margin: '1rem 0 0' }}>
                  an ai built from {first}&rsquo;s mind — everything published and linked on this page; it answers as {first} would.
                </p>
                <p style={{ fontSize: '0.92rem', margin: '0.35rem 0 0' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{online ? 'online' : 'offline'}</span>
                  <span aria-hidden style={{ color: 'var(--text-ghost)', margin: '0 0.45rem' }}>·</span>
                  <Link href={`/library/${encodeURIComponent(authorId)}/plm`} style={{ color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: '3px' }} className="hover:opacity-60">
                    open in chat
                  </Link>
                </p>
              </div>
            );
          })()}
          {/* Section two: links — the router out, and the surfaces the mind
              provides context for (founder: links as its own section; the
              primary thing is that the mind speaks for them). */}
          {routerLinks.length > 0 && (
            <div style={{ margin: '0 0 2.6rem' }}>
              {sectionHead('links', 'what this connects to')}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.45rem 0.6rem', marginTop: '0.7rem', fontSize: '1.05rem' }}>
                {routerLinks.map((l, i) => (
                  <span key={l.url} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.6rem' }}>
                    {i > 0 && <span aria-hidden style={{ color: 'var(--text-ghost)' }}>·</span>}
                    <a href={l.url}
                      target={l.external ? '_blank' : undefined}
                      rel={l.external ? 'noopener noreferrer' : undefined}
                      className="hover:opacity-60"
                      style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
                      {l.label}
                    </a>
                  </span>
                ))}
              </div>
            </div>
          )}
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
              {grouped.map(({ cat, items }) => (
                <div key={cat} style={{ marginTop: '2rem' }}>
                  {sectionHead(cat, cat === 'works' ? 'what’s been made' : cat === 'projects' ? 'what’s being built' : 'what’s being thought')}
                  {items.map(fileRow)}
                </div>
              ))}
            </div>
          )}
        </section>
        {/* The "make your own version of these" door — this profile (a mind + a
            library, built with alexandria) IS the demo; the CTA turns it into a
            start. Sits above the quiet wordmark so the page ends on the next step,
            not a link back into the (stranger-empty) directory. */}
        <div style={{ margin: '4.5rem 0 0' }}>
          <StartJoinCTA lead="want a mind and a library like this?" />
        </div>
        <footer style={{ textAlign: 'center', margin: '3rem 0 0' }}>
          <Link href="/library" style={{ fontStyle: 'italic', color: 'var(--text-ghost)', fontSize: '1rem', letterSpacing: '0.01em', textDecoration: 'none' }} className="hover:opacity-60">
            alexandria<span style={{ fontStyle: 'normal' }}>.</span>
          </Link>
        </footer>
      </main>
    </>
  );
}
