'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../components/ThemeToggle';
import PromptBox from '../../components/PromptBox';
import { HeaderAction, HeaderActions, headerActionDotStyle } from '../../components/HeaderActions';
import { SignOutLink } from '../../components/SignOutLink';
import { FETCH_TIMEOUT_MS, FOUNDER_LIBRARY_ID, FOUNDER_STAND_PROMPT, FOUNDER_STAND_URL, librarySignInUrlHere } from '../../lib/config';
import { safeUrl } from '../../lib/url';
import { type TwinVariantSummary } from './types';
import { LIBRARY_LOCATIONS } from '../../../shared/library-locations';

interface ProtocolFile {
  scope: string;
  name: string;
  text: string | null;
  title?: string | null;
  // Owner-authored teaser line. The server returns it only when this exact
  // artifact is listable to the viewer; hidden invite/authors metadata never
  // reaches the browser.
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
  viewer?: {
    signed_in?: boolean;
    is_owner?: boolean;
    capabilities_url?: string;
    membership_active?: boolean;
    membership_status?: string | null;
    membership_source?: string | null;
    membership_verified_at?: string | null;
  };
  twin?: {
    enabled: boolean;
    label: string | null;
    variants?: TwinVariantSummary[];
    online?: boolean;
    signed_in?: boolean;
    context_enabled?: boolean;
    context_scopes?: string[];
    context_preview_url?: string;
  };
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

const DEFAULT_CATEGORIES = ['works', 'projects', 'shadows', 'other'] as const;
type Category = string;
type EditableIdentity = {
  display_name: string;
  location: string;
  contact: string;
  website: string;
  text: string;
  socials: Array<{ label: string; url: string }>;
};

const editFieldStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: 0, borderRadius: 0,
  background: 'transparent', color: 'var(--text-primary)', padding: 0,
  font: 'inherit', lineHeight: 1.45,
};

function categoryOf(file: ProtocolFile): Category {
  return file.category && /^[a-z][a-z0-9-]{0,39}$/.test(file.category) ? file.category : (/^shadow/i.test(file.name) ? 'shadows' : 'works');
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* fall through to the local DOM copy path */ }
  const node = document.createElement('textarea');
  node.value = value;
  node.setAttribute('readonly', '');
  node.style.position = 'fixed';
  node.style.opacity = '0';
  document.body.appendChild(node);
  node.select();
  const copied = document.execCommand('copy');
  node.remove();
  return copied;
}

function protocolFileKey(file: Pick<ProtocolFile, 'scope' | 'name'>): string {
  return `${file.scope}/${file.name}`;
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
  // Offline-attempt feedback — the shake + the transient note (2026-08-02).
  const [doorShake, setDoorShake] = useState(false);
  const [offlineNote, setOfflineNote] = useState(false);
  const [beliCopied, setBeliCopied] = useState(false);
  const [standCopyNote, setStandCopyNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [editFiles, setEditFiles] = useState<ProtocolFile[]>([]);
  const [contextScopes, setContextScopes] = useState<string[]>(['public']);
  const [identity, setIdentity] = useState<EditableIdentity>({
    display_name: '', location: '', contact: '', website: '', text: '', socials: [],
  });
  const [dragged, setDragged] = useState<{ key: string; category: Category } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; after: boolean } | null>(null);
  const pointerDrag = useRef<{ key: string; category: Category; pointerId: number; startY: number; active: boolean } | null>(null);
  const dropTargetRef = useRef<{ key: string; after: boolean } | null>(null);
  // Rotating door placeholder — smart example questions cycle through the ghost
  // text instead of rigid hardcoded chips (founder 2026-07-19). Unhurried cadence
  // + the crossfade in PromptBox so it flows, not snaps (founder 2026-07-20).
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhIdx((i) => i + 1), 5200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    params.then(({ author }) => {
      setAuthorId(author);
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      fetch(`/api/library/${encodeURIComponent(author)}`, { signal: ctrl.signal, credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
        .then((d: AuthorData) => {
          // The server resolves sticky legacy GitHub handles by immutable account
          // id. Keep every link and the visible URL on the current handle too.
          if (d.author.id && d.author.id !== author) {
            setAuthorId(d.author.id);
            router.replace(`/library/${encodeURIComponent(d.author.id)}`);
          }
          setData(d);
          setEditFiles(d.files || []);
          setContextScopes(d.twin?.context_scopes?.length ? d.twin.context_scopes : ['public']);
          setIdentity({
            display_name: d.author.display_name || '',
            location: d.author.location || '',
            contact: d.author.contact || '',
            website: d.author.website || '',
            text: d.author.text || '',
            socials: d.author.socials || [],
          });
          setLoading(false);
        })
        .catch(e => { setError(e.name === 'AbortError' ? 'unreachable' : e.message); setLoading(false); })
        .finally(() => clearTimeout(timeout));
    });
  }, [params, router]);

  // The door's question rides to the chat page, which auto-fires it (?q=).
  // No standing online/offline label anymore (founder, 2026-08-02: "we dont
  // need to say online and offline") — a dead mind answers the ATTEMPT: the
  // door shakes (error physics: 300ms, 4px) and a quiet "offline right now"
  // appears where the status word used to sit, only while it's true.
  const goAskWith = (q: string) => {
    const text = q.trim();
    if (!text || doorGoing) return;
    if (data?.twin?.online !== true) {
      setDoorShake(true);
      setOfflineNote(true);
      return;
    }
    setDoorGoing(true);
    router.push(`/library/${encodeURIComponent(authorId)}/plm?q=${encodeURIComponent(text)}`);
  };
  const goAsk = () => goAskWith(doorQ);
  useEffect(() => {
    if (!doorShake) return;
    const t = setTimeout(() => setDoorShake(false), 420);
    return () => clearTimeout(t);
  }, [doorShake]);
  useEffect(() => {
    if (!offlineNote) return;
    const t = setTimeout(() => setOfflineNote(false), 2600);
    return () => clearTimeout(t);
  }, [offlineNote]);

  const editSubtitles = useMemo(
    () => Object.fromEntries(editFiles.filter((file) => file.subtitle?.trim()).map((file) => [protocolFileKey(file), file.subtitle!.trim()])),
    [editFiles],
  );

  const reorderWithinSection = (category: Category, sourceKey: string, targetKey: string, after = false) => {
    if (sourceKey === targetKey) return;
    setEditFiles((current) => {
      const sectionItems = current.filter((file) => categoryOf(file) === category);
      const source = sectionItems.find((file) => protocolFileKey(file) === sourceKey);
      if (!source) return current;
      const without = sectionItems.filter((file) => protocolFileKey(file) !== sourceKey);
      const targetIndex = without.findIndex((file) => protocolFileKey(file) === targetKey);
      if (targetIndex < 0) return current;
      without.splice(targetIndex + (after ? 1 : 0), 0, source);
      let cursor = 0;
      return current.map((file) => categoryOf(file) === category ? without[cursor++] : file);
    });
  };

  const nudgeWithinSection = (event: KeyboardEvent<HTMLElement>, category: Category, key: string) => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const sectionItems = editFiles.filter((file) => categoryOf(file) === category);
    const index = sectionItems.findIndex((file) => protocolFileKey(file) === key);
    const target = sectionItems[index + (event.key === 'ArrowUp' ? -1 : 1)];
    if (target) reorderWithinSection(category, key, protocolFileKey(target), event.key === 'ArrowDown');
  };

  const setActiveDrop = (value: { key: string; after: boolean } | null) => {
    dropTargetRef.current = value;
    setDropTarget(value);
  };

  const startPointerDrag = (event: ReactPointerEvent<HTMLElement>, category: Category, key: string) => {
    if (event.button !== 0) return;
    pointerDrag.current = { key, category, pointerId: event.pointerId, startY: event.clientY, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const trackPointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.abs(event.clientY - drag.startY) < 5) return;
    if (!drag.active) {
      drag.active = true;
      setDragged({ key: drag.key, category: drag.category });
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-profile-piece]');
    if (!target || target.dataset.category !== drag.category || target.dataset.key === drag.key) {
      setActiveDrop(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    setActiveDrop({ key: target.dataset.key || '', after: event.clientY > rect.top + rect.height / 2 });
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active && dropTargetRef.current) {
      reorderWithinSection(drag.category, drag.key, dropTargetRef.current.key, dropTargetRef.current.after);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerDrag.current = null;
    setDragged(null);
    setActiveDrop(null);
  };

  const saveProfile = async () => {
    if (!data?.viewer?.is_owner || !authorId || saving) return;
    setSaving(true);
    setSaveNote('');
    const socials = identity.socials
      .map((social) => ({ label: social.label.trim(), url: social.url.trim() }))
      .filter((social) => social.label && social.url);
    const profile = data.profile || {};
    const writes: Array<[string, Record<string, unknown>]> = [
      ['profile', { ...identity, socials, order: profile.order || [], hidden: profile.hidden || [], labels: profile.labels || {} }],
      ['file-order', { order: editFiles.map(protocolFileKey) }],
      ['file-subtitles', { subtitles: editSubtitles }],
      ['twin', { context: { scopes: contextScopes } }],
    ];
    try {
      for (const [control, body] of writes) {
        const response = await fetch(`/api/library/${encodeURIComponent(authorId)}/${control}`, {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result?.error || `Could not save ${control}.`);
        }
      }
      setData({
        ...data,
        author: { ...data.author, ...identity, socials },
        files: editFiles,
      });
      setEditing(false);
      setSaveNote('saved');
    } catch (saveError) {
      setSaveNote(saveError instanceof Error ? saveError.message : 'Could not save the profile.');
    } finally {
      setSaving(false);
    }
  };

  const copyFounderStand = async () => {
    const copied = await copyText(FOUNDER_STAND_PROMPT);
    setStandCopyNote(copied ? 'copied — paste into your ai' : 'copy failed — open the stand');
    setTimeout(() => setStandCopyNote(''), 3200);
  };

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
  const files = editing ? editFiles : (data.files || []);
  // The shared profile is a safe router over whatever the Author published, not
  // a required stand architecture. Benjamin's four sections are the useful
  // default; safe custom slugs arrive through owner-authenticated metadata and
  // render with the same restrained component. Empty sections disappear.
  const DEFAULT_WHISPER: Record<string, string> = {
    works: 'what’s been made',
    projects: 'what’s being built',
    shadows: 'what’s being thought',
    other: 'everything else',
  };
  const profile = data.profile || {};
  const validCategory = (value: string) => /^[a-z][a-z0-9-]{0,39}$/.test(value);
  const hiddenCats = new Set((profile.hidden || []).filter(validCategory));
  const byCat = new Map<string, ProtocolFile[]>();
  for (const f of files) {
    const cat = categoryOf(f);
    (byCat.get(cat) || byCat.set(cat, []).get(cat)!).push(f);
  }
  // Author order first, founder defaults second, then newly published custom
  // sections. No new section can silently disappear because settings lagged it.
  const orderPref = (profile.order || []).filter(validCategory);
  const effectiveOrder = [
    ...orderPref,
    ...DEFAULT_CATEGORIES.filter((c) => !orderPref.includes(c)),
    ...Array.from(byCat.keys()).filter((c) => !orderPref.includes(c) && !(DEFAULT_CATEGORIES as readonly string[]).includes(c)),
  ];
  const grouped = effectiveOrder
    .filter((cat) => (byCat.get(cat)?.length || 0) > 0 && !hiddenCats.has(cat))
    .map((cat) => ({
      cat,
      word: (profile.labels?.[cat]?.word || '').trim() || cat,
      whisper: profile.labels?.[cat]?.whisper ?? DEFAULT_WHISPER[cat] ?? '',
      items: byCat.get(cat) as ProtocolFile[],
    }));
  const availableContextScopes = Array.from(new Set([
    'public',
    ...editFiles.map((file) => file.scope),
    ...contextScopes,
  ])).sort((a, b) => a === 'public' ? -1 : b === 'public' ? 1 : a.localeCompare(b));
  const toggleContextScope = (scope: string) => {
    setContextScopes((current) => {
      if (current.includes(scope)) return current.length === 1 ? current : current.filter((candidate) => candidate !== scope);
      return [...current, scope].sort();
    });
  };

  // General account sign-in — lives at the top of the page, not tied to the twin.
  const signedIn = data.viewer?.signed_in === true || data.twin?.signed_in === true;
  const isOwner = data.viewer?.is_owner === true;
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
  const sectionLabelStyle: CSSProperties = {
    color: 'var(--text-ghost)',
    fontSize: '0.9rem',
    letterSpacing: '0.08em',
    margin: '0 0 0.45rem',
  };
  // One head style for all five sections — mind · links · works · projects ·
  // shadows (founder: the five things on the profile). Word underlined (short,
  // not page-wide), whisper italic behind a symmetric middot.
  const sectionHead = (word: string, whisper?: string) => (
    <p className={editing ? 'profile-edit-background' : undefined} style={{ ...sectionLabelStyle, color: 'var(--text-secondary)' }}>
      <span style={{ borderBottom: '1px solid var(--text-ghost)', paddingBottom: '3px' }}>{word}</span>
      {whisper && <>
        <span aria-hidden style={{ color: 'var(--text-ghost)', margin: '0 0.45rem' }}>·</span>
        <span style={{ color: 'var(--text-muted)', letterSpacing: 0, fontStyle: 'italic' }}>{whisper}</span>
      </>}
    </p>
  );
  // Entry row — title left, tier right, on one baseline, with a bottom hairline.
  const fileRow = (file: ProtocolFile) => {
    const fileKey = protocolFileKey(file);
    if (editing) {
      const category = categoryOf(file);
      const target = dropTarget?.key === fileKey ? dropTarget : null;
      return (
        <article
          key={fileKey}
          data-profile-piece
          data-key={fileKey}
          data-category={category}
          className="profile-edit-piece"
          style={{
            borderTop: target && !target.after ? '2px solid var(--accent)' : '2px solid transparent',
            borderBottom: target?.after ? '2px solid var(--accent)' : '2px solid transparent',
            opacity: dragged?.key === fileKey ? 0.35 : 1,
          }}
        >
          <div
            role="button"
            tabIndex={0}
            aria-label={`${file.title || fileDisplayName(file.name)}. Drag to reorder within ${category}.`}
            aria-pressed={dragged?.key === fileKey}
            className="profile-edit-drag"
            onKeyDown={(event) => nudgeWithinSection(event, category, fileKey)}
            onPointerDown={(event) => startPointerDrag(event, category, fileKey)}
            onPointerMove={trackPointerDrag}
            onPointerUp={finishPointerDrag}
            onPointerCancel={finishPointerDrag}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1.25rem' }}
          >
            <span style={{ color: 'var(--text-primary)', fontSize: '1.06rem' }}>{file.title || fileDisplayName(file.name)}</span>
            <span className="profile-edit-background" style={{ color: 'var(--text-muted)', fontSize: '0.88rem', letterSpacing: '0.04em', flex: 'none' }}>{visibilityLabel(file.visibility)}</span>
          </div>
          <textarea
            aria-label={`${file.title || fileDisplayName(file.name)} description`}
            className="profile-edit-field profile-edit-description"
            style={editFieldStyle}
            rows={1}
            value={file.subtitle || ''}
            placeholder="add a description"
            onChange={(event) => setEditFiles((current) => current.map((candidate) => protocolFileKey(candidate) === fileKey ? { ...candidate, subtitle: event.target.value } : candidate))}
            onPointerDown={(event) => event.stopPropagation()}
          />
        </article>
      );
    }
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
      <Link key={`${file.scope}/${file.name}`} href={`/library/${encodeURIComponent(authorId)}/read/${encodeURIComponent(file.name)}?scope=${encodeURIComponent(file.scope)}`}
        className="hover:opacity-60" style={rowStyle}>
        {inner}
      </Link>
    );
  };

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '820px', margin: '0 auto', padding: '6rem 2.5rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <header className={editing ? 'profile-edit-header' : undefined} style={{ margin: '0 0 2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '1.75rem' }}>
            <Link href="/library" aria-label="back to the library" title="library" style={{ color: 'var(--text-muted)', display: 'flex', textDecoration: 'none' }} className="hover:opacity-60">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </Link>
            {isOwner && editing ? (
              <HeaderAction onClick={saveProfile} busy={saving}>
                {saving ? 'saving changes' : 'save changes'}
              </HeaderAction>
            ) : isOwner ? (
              <HeaderActions
                left={<HeaderAction onClick={() => { setSaveNote(''); setEditing(true); }}>edit profile</HeaderAction>}
                right={<SignOutLink />}
              />
            ) : signedIn ? (
              <SignOutLink />
            ) : (
              <HeaderActions
                left={<HeaderAction href={signInUrl}>sign in</HeaderAction>}
                right={<HeaderAction href="/start">join</HeaderAction>}
              />
            )}
          </div>
          {/* The member number rides the name line, baseline-aligned at its
              right — a quiet stamp beside the signature (founder 2026-08-02:
              "maybe the a0 stuff should be on the same line as the name? on
              the right of it"). The identity line below is then purely the
              location · contact pair, uncramped. flex-wrap lets the number
              drop gracefully on narrow screens. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.1rem', flexWrap: 'wrap', margin: '2rem 0 0.35rem' }}>
            {editing ? (
              <input
                aria-label="name"
                className="profile-edit-field profile-edit-name"
                style={editFieldStyle}
                value={identity.display_name}
                placeholder="your name"
                onChange={(event) => setIdentity({ ...identity, display_name: event.target.value })}
              />
            ) : (
              <h1 style={{ color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 500, letterSpacing: '-0.012em', margin: 0 }}>
                {author.display_name || author.id}
              </h1>
            )}
            <span className={editing ? 'profile-edit-background' : undefined} style={{ color: 'var(--text-muted)', fontSize: '0.95rem', letterSpacing: '0.02em', textTransform: 'lowercase' }}>
              {author.alexandria_id}
            </span>
          </div>
          {editing ? (
            <>
              <div className="profile-edit-identity">
                <select aria-label="location" className="profile-edit-field profile-edit-meta profile-edit-location" style={editFieldStyle} value={identity.location} onChange={(event) => setIdentity({ ...identity, location: event.target.value })}>
                  <option value="">choose location</option>
                  {LIBRARY_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
                <span aria-hidden className="profile-edit-dot" style={headerActionDotStyle}>·</span>
                <input aria-label="contact" className="profile-edit-field profile-edit-meta" style={editFieldStyle} value={identity.contact} placeholder="contact" onChange={(event) => setIdentity({ ...identity, contact: event.target.value })} />
              </div>
              <input aria-label="website" inputMode="url" className="profile-edit-field profile-edit-link" style={editFieldStyle} value={identity.website} placeholder="website" onChange={(event) => setIdentity({ ...identity, website: event.target.value })} />
              <div className="profile-edit-links">
                <div className="profile-edit-links-head">
                  <span>links</span>
                  <button type="button" onClick={() => setIdentity({ ...identity, socials: [...identity.socials, { label: '', url: '' }] })}>add link</button>
                </div>
                {identity.socials.map((social, index) => (
                  <div className="profile-edit-social" key={index}>
                    <input
                      aria-label={`link ${index + 1} name`}
                      className="profile-edit-field profile-edit-social-name"
                      style={editFieldStyle}
                      value={social.label}
                      placeholder="name"
                      onChange={(event) => setIdentity({ ...identity, socials: identity.socials.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, label: event.target.value } : candidate) })}
                    />
                    <input
                      aria-label={`link ${index + 1} url`}
                      inputMode="url"
                      className="profile-edit-field profile-edit-social-url"
                      style={editFieldStyle}
                      value={social.url}
                      placeholder="url"
                      onChange={(event) => setIdentity({ ...identity, socials: identity.socials.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, url: event.target.value } : candidate) })}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (author.location && author.location_key) || author.contact ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', letterSpacing: '0.02em', margin: '0.35rem 0 0', textTransform: 'lowercase' }}>
              {author.location && author.location_key && (
                <Link href={`/library?locations=${encodeURIComponent(author.location_key)}`} style={{ color: 'inherit', textDecoration: 'none' }} className="hover:opacity-60">{author.location}</Link>
              )}
              {author.contact && (
                <>
                  {author.location && author.location_key && <span aria-hidden style={headerActionDotStyle}>·</span>}
                  <a href={contactHref(author.contact)}
                    target={author.contact.startsWith('http') ? '_blank' : undefined}
                    rel={author.contact.startsWith('http') ? 'noopener noreferrer' : undefined}
                    style={{ color: 'inherit', textDecoration: 'none' }} className="hover:opacity-60">{contactForm(author.contact)}</a>
                </>
              )}
            </p>
          ) : null}
          {/* No bio — nobody gets a bio (founder 2026-07-19): a line isn't enough to
              sense-check a person; the name, location, and the mind carry it. */}
          {/* Links, slightly underlined so they read as links (founder 2026-07-19).
              Beli has no web page → a click-to-reveal of the copyable handle rather
              than a dead navigation; no extra inline text. */}
          {!editing && routerLinks.length > 0 && (
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
          {editing && data.twin?.context_enabled && (
            <div className="profile-edit-mirror" style={{ margin: '0 0 3.2rem', padding: '1.25rem 0', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>mirror can use</span>
                <a href={`/api/library/${encodeURIComponent(authorId)}/context-preview`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', fontSize: '0.88rem', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                  see the exact context
                </a>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.3rem 0 0.9rem' }}>choose exact Library folders. each folder stands alone.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem 1rem' }}>
                {availableContextScopes.map((scope) => (
                  <label key={scope} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.92rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={contextScopes.includes(scope)} onChange={() => toggleContextScope(scope)} />
                    <span>{scope}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {data.twin?.enabled && (() => {
            // The ask-me door — the clearest thing on the page (a2 § Library V1:
            // the twin is why the link spreads). The question rides to the chat
            // page (?q= auto-fires there); the door itself holds no chat state.
            // The PLM page still carries the quick/deep toggle + invite gate.
            const anyOn = (data.twin.variants || []).some((v) => v.enabled);
            if (!anyOn) return null;
            const first = (author.display_name || author.id).split(' ')[0];
            const projs = grouped.find((g) => g.cat === 'projects')?.items || [];
            const projName = (i: number) => (projs[i] ? (projs[i].title || fileDisplayName(projs[i].name)).toLowerCase() : null);
            const p0 = projName(0);
            const p1 = projName(1);
            const p2 = projName(2);
            // The rotation is the marginal-value showcase (founder, 2026-08-02:
            // "most interesting and unique things that only a plm would
            // actually be able to answer"; second pass same day: "they need to
            // be more interesting questions rather than just things you can
            // literally just click the link for" — so no what's-on-his-x /
            // aesthetic / taste-list questions, the links answer those with a
            // click). Two registers: the concrete anchors (projects by name)
            // and the questions only a mirror of a mind can answer — beliefs
            // against the grain, contradictions, changed positions, what the
            // corpus itself finds surprising. A link may inspire a question
            // only where the mirror adds the THINKING behind the surface
            // (beli → what makes a restaurant worth his time), never its
            // clickable content.
            const linkLabels = new Set(routerLinks.map((l) => l.label));
            const askExamples = [
              p0 ? `what is ${p0}?` : `what is ${first} building?`,
              `what does ${first} believe that most people don’t?`,
              p1 ? `why ${p1}?` : `what matters most to ${first}?`,
              `what’s ${first}’s biggest contradiction?`,
              `what would ${first} push back on?`,
              `what popular idea does ${first} think is just wrong?`,
              p2 ? `what is ${p2}?` : `how does ${first} decide what to work on?`,
              `what’s the most surprising thing in here?`,
              `what keeps ${first} up at night?`,
              ...(linkLabels.has('beli') ? [`what makes a restaurant worth ${first}’s time?`] : []),
              `what’s something ${first} changed positions on?`,
              `how does ${first} think about ai?`,
              `what should i read first?`,
              `what’s ${first}’s philosophy?`,
              'ask anything…',
            ];
            return (
              // The mind is the ONE elevated object on the page (founder: the
              // page read flat — a cold visitor must see what to do without
              // reading). A quiet card lifts the door above everything else;
              // example questions make the first move a single tap.
              <div className={editing ? 'profile-edit-static-block' : undefined} style={{
                // Text inside sits on the PAGE's left edge (one text line for
                // the whole profile); the card's borders protrude symmetrically
                // instead — margin mirrors padding (founder, round nine).
                margin: '0 -1.5rem 3.2rem', padding: '1.6rem 1.5rem 1.4rem',
                border: '1px solid var(--border-light)', borderRadius: '14px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 6px 18px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
                  {sectionHead('mind')}
                  {/* The old standing online/offline word is gone — the note
                      exists only in the moment an offline ask is attempted. */}
                  {offlineNote && (
                    <span className="twin-offline-note" style={{ color: 'var(--text-ghost)', fontStyle: 'italic', fontSize: '0.85rem', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      offline right now
                    </span>
                  )}
                </div>
                <p className="mirror-explainer" style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.55, margin: '0.75rem 0 0', textWrap: 'pretty' }}>
                  a mirror of {first}’s mind, built from what {first} has chosen to share. when it doesn’t know, it says so.
                </p>
                <div className={doorShake ? 'twin-door-shake' : undefined} style={{ margin: '0.9rem -0.98rem 0' }}>
                  <PromptBox value={doorQ} onChange={setDoorQ} onSubmit={goAsk} loading={doorGoing}
                    placeholder={doorQ ? 'ask anything…' : askExamples[phIdx % askExamples.length]} />
                </div>
                {/* The section says mind and the box invites a question. A
                    third explanation only repeats both. */}
              </div>
            );
          })()}
          {/* links now live in the bio (above) as plain hyperlinks — the profile
              body is works / projects / shadows only. */}
          {grouped.length === 0 ? (
            !data.twin?.enabled && (
              isOwner ? (
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', margin: 0 }}>
                  <p style={{ margin: 0 }}>nothing published yet.</p>
                  <button type="button" onClick={copyFounderStand}
                    style={{ border: 0, background: 'none', color: 'var(--accent)', padding: '0.65rem 0 0', font: 'inherit', cursor: 'pointer' }}
                    className="hover:opacity-60">
                    {standCopyNote || 'start with Benjamin’s stand'}
                  </button>
                </div>
              ) : (
                <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', margin: 0 }}>nothing published yet.</p>
              )
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
        {editing && (
          <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '4rem', paddingTop: '1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
            <span role="status" style={{ color: saveNote.startsWith('Could not') ? 'var(--error, #9b2c2c)' : 'var(--text-muted)', fontSize: '0.9rem' }}>{saveNote}</span>
            <HeaderAction onClick={saveProfile} busy={saving} tone="accent">
              {saving ? 'saving changes' : 'save changes'}
            </HeaderAction>
          </div>
        )}
        {/* A slim footer rounds the page off (founder: borders, a place for
            the one CTA — this profile IS the demo; "build your own" is the
            whole pitch). */}
        {!editing && <footer style={{ borderTop: '1px solid var(--border-light)', textAlign: 'center', margin: '4rem 0 0', padding: '1.6rem 0 0' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0 }}>
            {authorId === FOUNDER_LIBRARY_ID ? <>
              want this for yourself?{' '}
              {standCopyNote === 'copy failed — open the stand' ? (
                <a href={FOUNDER_STAND_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="hover:opacity-60">open the stand</a>
              ) : (
                <button type="button" onClick={copyFounderStand} style={{ border: 0, background: 'none', color: 'var(--accent)', padding: 0, font: 'inherit', cursor: 'pointer' }} className="hover:opacity-60">
                  {standCopyNote || 'copy this stand'}
                </button>
              )}
            </> : <>
              want this for yourself?{' '}
              <Link href="/start" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="hover:opacity-60">start your loop</Link>
            </>}
          </p>
          <p style={{ margin: '1.4rem 0 0' }}>
            <Link href="/" style={{ fontStyle: 'italic', color: 'var(--text-ghost)', fontSize: '1rem', letterSpacing: '0.01em', textDecoration: 'none' }} className="hover:opacity-60">
              alexandria<span style={{ fontStyle: 'normal' }}>.</span>
            </Link>
          </p>
        </footer>}
        <style>{`
          .profile-edit-header { margin-bottom: 3.5rem !important; }
          .profile-edit-background { opacity: 0.5; }
          .profile-edit-static-block { opacity: 0.42; pointer-events: none; border-color: transparent !important; box-shadow: none !important; }
          .profile-edit-field { border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 20%, transparent) !important; background: transparent !important; box-shadow: none !important; padding-bottom: 0.16rem !important; transition: border-color 120ms ease, color 120ms ease; }
          .profile-edit-field:hover { border-color: color-mix(in srgb, var(--text-secondary) 62%, transparent) !important; }
          .profile-edit-field:focus { outline: none; border-bottom: 2px solid var(--accent) !important; color: var(--text-primary) !important; }
          .profile-edit-name { width: min(28rem, 68vw) !important; font-size: 2rem !important; font-weight: 500 !important; letter-spacing: -0.012em; }
          .profile-edit-identity { display: flex; align-items: baseline; gap: 0; color: var(--text-muted); }
          .profile-edit-meta { width: min(15rem, 38vw) !important; color: var(--text-muted) !important; font-size: 0.95rem !important; letter-spacing: 0.02em; }
          .profile-edit-link { width: min(28rem, 100%) !important; margin-top: 0.9rem; color: var(--text-muted) !important; font-size: 0.98rem !important; }
          .profile-edit-links { display: grid; gap: 0.65rem; width: min(38rem, 100%); margin-top: 1.4rem; color: var(--text-muted); }
          .profile-edit-links-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.95rem; letter-spacing: 0.02em; }
          .profile-edit-links-head button { border: 0; background: none; padding: 0.2rem 0; color: var(--text-muted); font: inherit; letter-spacing: 0.02em; cursor: pointer; }
          .profile-edit-links-head button:hover { color: var(--accent); }
          .profile-edit-social { display: grid; grid-template-columns: minmax(5.5rem, 0.45fr) minmax(0, 1.55fr); gap: 1.25rem; align-items: baseline; }
          .profile-edit-social-name { color: var(--text-secondary) !important; font-size: 0.95rem !important; }
          .profile-edit-social-url { color: var(--text-muted) !important; font-size: 0.9rem !important; }
          .profile-edit-piece { padding: 0.7rem 0 0.9rem; transition: opacity 120ms ease, border-color 120ms ease; }
          .profile-edit-drag { position: relative; padding-left: 1.25rem; cursor: grab; touch-action: none; user-select: none; }
          .profile-edit-drag::before { content: ''; position: absolute; left: 0.1rem; top: 50%; width: 0.55rem; height: 0.28rem; opacity: 0.48; border-top: 1px solid var(--accent); border-bottom: 1px solid var(--accent); transform: translateY(-50%); }
          .profile-edit-location { cursor: pointer; }
          .profile-edit-drag:active { cursor: grabbing; }
          .profile-edit-drag:focus-visible { outline: 1px solid var(--accent); outline-offset: 5px; }
          .profile-edit-description { field-sizing: content; width: min(38rem, calc(100% - 1.25rem)) !important; min-height: 1.45em; margin: 0.35rem 0 0 1.25rem; border-bottom-color: color-mix(in srgb, var(--text-muted) 12%, transparent) !important; color: var(--text-muted) !important; font-size: 0.92rem !important; resize: none; overflow: hidden; }
          @media (max-width: 560px) {
            .mirror-explainer { max-width: 28rem; }
            .profile-edit-identity { flex-wrap: wrap; }
            .profile-edit-dot { display: none; }
            .profile-edit-meta { width: 100% !important; }
            .profile-edit-social { grid-template-columns: 1fr; gap: 0.45rem; }
          }
          @media (prefers-reduced-motion: reduce) {
            .profile-edit-field, .profile-edit-piece { transition: none; }
          }
        `}</style>
      </main>
    </>
  );
}
