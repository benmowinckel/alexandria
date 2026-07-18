'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from '../../../components/ThemeToggle';
import PromptBox from '../../../components/PromptBox';
import ActionButton from '../../../components/ActionButton';
import TwinText from '../../../components/TwinText';
import { librarySignInUrlHere } from '../../../lib/config';
import { type TwinVariantSummary } from '../types';

/**
 * The mind — a chat with an Author's personal language model. Three panes, each
 * collapsing on its own (kept in left/middle/right order): history, the chat
 * (open), and the piece pane on the right where a work opens — you, or the mind
 * by naming it, pulls one up and it shows there. It all stays in this one place.
 */

const SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'by', 'with']);
const TITLE_OVERRIDE: Record<string, string> = { mowinckels: 'mowinckels' };
function displayName(name: string): string {
  if (TITLE_OVERRIDE[name]) return TITLE_OVERRIDE[name];
  return name.split('-').map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

type Msg = { role: 'you' | 'twin'; text: string };
type Convo = { id: string; messages: Msg[] };
type FileMeta = { name: string; visibility?: string; title?: string | null; category?: string };
type LinkedSurface = { label: string; url: string };
type OpenPiece = { name: string; nice: string; content: string; pdfUrl: string; loading: boolean };

function convoTitle(c: Convo): string {
  const first = c.messages.find((m) => m.role === 'you')?.text.trim();
  if (!first) return 'Untitled';
  return first.length > 34 ? `${first.slice(0, 34)}…` : first;
}

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ChevronIcon = <svg width="20" height="20" {...svgProps}><path d="M15 18l-6-6 6-6" /></svg>;
const PaneLeftIcon = <svg width="19" height="19" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></svg>;
const LinesIcon = <svg width="19" height="19" {...svgProps}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
const PaneRightIcon = <svg width="19" height="19" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></svg>;
const CopyIcon = <svg width="17" height="17" {...svgProps}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const DownloadIcon = <svg width="17" height="17" {...svgProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>;

export default function PlmPage({ params }: { params: Promise<{ author: string }> }) {
  const [author, setAuthor] = useState('');
  useEffect(() => { params.then((p) => setAuthor(p.author)); }, [params]);

  const [authorName, setAuthorName] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  // Which depth THIS viewer's questions get (server-computed, structural):
  // 'invite' = the deeper mind, else the public one. Surfaced as the
  // public|invite toggle — named like the pieces' own visibility tags;
  // toggling invite without a grant morphs the word into a code field, so
  // the tier is discoverable and codes have a place to go.
  const [depth, setDepth] = useState<'public' | 'paid' | 'invite'>('public');
  // The SELECTED side of the toggle — a real selector, not just an indicator
  // (an invited viewer can switch to public and preview what a stranger
  // gets). Asks at 'public' request that depth; the server only ever honors
  // depth requests downward.
  const [sel, setSel] = useState<'public' | 'invite'>('public');
  const [contact, setContact] = useState('');
  // The declared graph (website + socials) — shown in the pieces pane so it's
  // CLEAR the mind can be asked about the linked surfaces too, not only the
  // published pieces (the links declare the graph; capture fills it).
  const [linked, setLinked] = useState<LinkedSurface[]>([]);
  const [showCode, setShowCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState('');
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [variants, setVariants] = useState<TwinVariantSummary[]>([]);
  const [activeVariant, setActiveVariant] = useState<'weights' | 'context'>('context');

  const [leftOpen, setLeftOpen] = useState(false);
  const [midOpen, setMidOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [open, setOpen] = useState<OpenPiece | null>(null);
  const [mtab, setMtab] = useState<'chat' | 'pieces'>('chat'); // mobile

  const idRef = useRef(2);
  const [convos, setConvos] = useState<Convo[]>([{ id: '1', messages: [] }]);
  const [activeId, setActiveId] = useState('1');
  const active = useMemo(() => convos.find((c) => c.id === activeId) ?? convos[0], [convos, activeId]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<{ focus: () => void } | null>(null);
  const openTextRef = useRef('');                    // extracted text of the open piece (race-safe)
  const openExtractRef = useRef<Promise<void> | null>(null);
  const dlBlobRef = useRef<Blob | null>(null);       // raw bytes of the open piece, for download
  const dlExtRef = useRef('md');

  // Optional deep-link: ?variant=weights|context lands on a mind (quick|deep in
  // the UI), ?invite=CODE seeds the unlock code so an invited link opens deep,
  // ?q=… carries the profile door's question in (auto-fired once, below).
  const [invite, setInvite] = useState('');
  const [inviteDraft, setInviteDraft] = useState('');
  const [pendingQ, setPendingQ] = useState('');
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const v = q.get('variant'); if (v === 'weights' || v === 'context') setActiveVariant(v);
      const inv = q.get('invite')?.trim(); if (inv) { setInvite(inv); setInviteDraft(inv); }
      const asked = q.get('q')?.trim(); if (asked) setPendingQ(asked);
    } catch { /* */ }
  }, []);

  const who = authorName || author;
  // One public mind; DEPTH is structural per querier (public shadow for anyone,
  // the deeper invite shadow for granted friends — server-side). The header
  // shows the sidecar's online state; the public|invite toggle carries depth.
  const [online, setOnline] = useState(false);
  const usable = useMemo(() => variants.filter((v) => v.enabled && (v.accessible || v.needsInvite)), [variants]);
  const activeCfg = useMemo(() => variants.find((v) => v.variant === activeVariant), [variants, activeVariant]);
  // Either mind can be invite-gated (which one is the Author's call). Show the
  // unlock field whenever the mind in view is enabled but this viewer can't reach
  // it yet — the code follows the gate rather than assuming it's always deep.
  const locked = !!activeCfg && activeCfg.enabled && !activeCfg.accessible;
  const applyInvite = () => { const code = inviteDraft.trim(); if (code) setInvite(code); };

  useEffect(() => {
    if (!author) return;
    let live = true;
    (async () => {
      const [dir, sess] = await Promise.all([
        fetch(`/api/library/${encodeURIComponent(author)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/library/session', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      ]);
      if (!live) return;
      setAuthorName(dir?.author?.display_name || '');
      setSignedIn(sess?.signed_in === true);
      setOnline(dir?.twin?.online === true);
      const d = dir?.twin?.depth; if (d === 'public' || d === 'paid' || d === 'invite') { setDepth(d); if (d === 'invite') setSel('invite'); }
      setContact(typeof dir?.author?.contact === 'string' ? dir.author.contact : '');
      const cleanUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
      const site = typeof dir?.author?.website === 'string' && dir.author.website.trim()
        ? [{ label: dir.author.website.replace(/^https?:\/\//i, '').replace(/\/$/, ''), url: cleanUrl(dir.author.website.trim()) }]
        : [];
      const socials = Array.isArray(dir?.author?.socials)
        ? (dir.author.socials as unknown[])
            .map((s) => (s && typeof s === 'object' ? s as Record<string, unknown> : {}))
            .filter((s) => typeof s.label === 'string' && typeof s.url === 'string')
            .map((s) => ({ label: (s.label as string).trim().toLowerCase(), url: cleanUrl((s.url as string).trim()) }))
        : [];
      setLinked([...site, ...socials]);
      setFiles(Array.isArray(dir?.files) ? dir.files : []);
      const vs: TwinVariantSummary[] = Array.isArray(dir?.twin?.variants) ? dir.twin.variants : [];
      setVariants(vs);
      // Open on a mind the viewer can actually use; fall back to the first
      // unlockable one so a fully-gated twin still lands somewhere.
      const first = vs.find((v) => v.enabled && v.accessible) || vs.find((v) => v.enabled && v.needsInvite);
      if (first) setActiveVariant(first.variant);
    })();
    return () => { live = false; };
  }, [author]);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, asking]);

  // The profile door's question (?q=) fires once the mind is loaded, then the
  // param is stripped so refresh/back doesn't re-ask. The chat opens already
  // answering — the door and the room feel like one motion.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!pendingQ || !author || variants.length === 0 || firedRef.current) return;
    firedRef.current = true;
    setPendingQ('');
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('q');
      window.history.replaceState({}, '', u.pathname + u.search + u.hash);
    } catch { /* */ }
    void ask(pendingQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQ, author, variants]);

  // Drop the cursor in the composer whenever the chat pane is visible (this page
  // opens chat-first, and again each time it's re-expanded) so you can just type.
  useEffect(() => {
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 900;
    if (mobile ? mtab !== 'chat' : !midOpen) return;
    const id = requestAnimationFrame(() => promptRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [midOpen, mtab]);

  const openPiece = async (fileName: string) => {
    const nice = files.find((x) => x.name === fileName)?.title || displayName(fileName);
    openTextRef.current = '';
    openExtractRef.current = null;
    setRightOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setMtab('pieces');
    setOpen({ name: fileName, nice, content: '', pdfUrl: '', loading: true });
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(author)}/file/${encodeURIComponent(fileName)}`, { credentials: 'include' });
      if (!res.ok) { setOpen({ name: fileName, nice, content: '', pdfUrl: '', loading: false }); return; }
      const blob = await res.blob();
      dlBlobRef.current = blob;
      const head = await blob.slice(0, 5).text();
      if (head.startsWith('%PDF')) {
        dlExtRef.current = 'pdf';
        const buf = await blob.arrayBuffer();
        const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        setOpen({ name: fileName, nice, content: '', pdfUrl: url, loading: false });
        openExtractRef.current = (async () => {
          try {
            const tr = await fetch(`/api/library/${encodeURIComponent(author)}/file/${encodeURIComponent(fileName)}?format=text`, { credentials: 'include' });
            if (tr.ok) { const t = (await tr.text()).trim(); if (t) { openTextRef.current = t; setOpen((o) => (o && o.name === fileName ? { ...o, content: t } : o)); } }
          } catch { /* title-scoped focus fallback */ }
        })();
      } else {
        dlExtRef.current = 'md';
        setOpen({ name: fileName, nice, content: await blob.text(), pdfUrl: '', loading: false });
      }
    } catch {
      setOpen({ name: fileName, nice, content: '', pdfUrl: '', loading: false });
    }
  };

  const referenced = (text: string) => {
    const lc = text.toLowerCase();
    return files.filter((f) => { const n = displayName(f.name); return n.length >= 5 && lc.includes(n.toLowerCase()) && f.name !== open?.name; });
  };

  const newChat = () => {
    const id = String(idRef.current++);
    setConvos((cs) => [{ id, messages: [] }, ...cs]);
    setActiveId(id);
    setQuestion('');
  };

  // Mid-thought questions QUEUE instead of bouncing (founder, 2026-07-17): the
  // composer stays typable while the mind is answering (typeWhileLoading), the
  // new question lands in the thread immediately, and it fires as soon as the
  // in-flight answer returns — FIFO, conversation order preserved.
  const queueRef = useRef<{ text: string; convoId: string }[]>([]);
  const askingRef = useRef(false);

  const ask = async (textArg?: string) => {
    const text = (textArg ?? question).trim();
    if (!text) return;
    const targetId = activeId;
    setQuestion('');
    setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'you', text }] } : c)));
    if (askingRef.current) { queueRef.current.push({ text, convoId: targetId }); return; }
    await fire(text, targetId);
  };

  const fire = async (text: string, targetId: string): Promise<void> => {
    askingRef.current = true;
    setAsking(true);
    try {
      // If a PDF piece is open and still extracting, wait so the PLM gets its text.
      let fc = open ? (open.content || openTextRef.current) : '';
      if (open && open.pdfUrl && !fc && openExtractRef.current) {
        try { await Promise.race([openExtractRef.current, new Promise((r) => setTimeout(r, 8000))]); } catch { /* */ }
        fc = openTextRef.current;
      }
      const focus = open ? { name: open.nice, content: fc || `(The reader is looking at “${open.nice}”${open.pdfUrl ? ' (a PDF)' : ''} by ${who}.)` } : undefined;
      const res = await fetch(`/api/library/${encodeURIComponent(author)}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question: text,
          variant: activeVariant,
          // The free toggle: an invited viewer asking at 'free' previews the
          // public depth (server honors depth requests downward only).
          ...(depth === 'invite' && sel === 'public' ? { depth: 'public' } : {}),
          ...(invite ? { invite } : {}),
          ...(focus ? { focus } : {}),
        }),
      });
      const b = await res.json().catch(() => ({}));
      const answer = (res.ok && b.answer) ? b.answer : (b.error || 'the mind could not answer just now.');
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'twin', text: answer }] } : c)));
      // A valid code binds a grant server-side — re-read the directory so the
      // unlocked state (variants + depth) reflects it: premium lights up and
      // the code field falls away for the rest of the session.
      if (res.ok && b.answer && invite) {
        fetch(`/api/library/${encodeURIComponent(author)}`, { credentials: 'include' })
          .then((r) => r.json()).then((d) => {
            if (Array.isArray(d?.twin?.variants)) setVariants(d.twin.variants);
            const nd = d?.twin?.depth;
            if (nd === 'public' || nd === 'paid' || nd === 'invite') {
              setDepth(nd);
              if (nd === 'invite') { setShowCode(false); setCodeDraft(''); setSel('invite'); }
            }
          }).catch(() => { /* */ });
      }
    } catch {
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'twin', text: 'could not reach the mind.' }] } : c)));
    } finally {
      const next = queueRef.current.shift();
      if (next) {
        void fire(next.text, next.convoId);
      } else {
        askingRef.current = false;
        setAsking(false);
      }
    }
  };

  const label = { color: 'var(--text-ghost)', fontSize: '0.78rem', letterSpacing: '0.08em' } as const;
  const iconBtn = { display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--text-ghost)', transition: 'color 0.15s' } as const;

  const copyText = (t: string) => { try { void navigator.clipboard?.writeText(t); } catch { /* */ } };
  const copyConvo = () => copyText((active?.messages || []).map((m) => `${m.role === 'you' ? 'You' : who}: ${m.text}`).join('\n\n'));
  const copyPiece = () => { try { void navigator.clipboard?.writeText(open?.content || openTextRef.current || ''); } catch { /* */ } };
  const downloadPiece = () => {
    const blob = dlBlobRef.current;
    if (!blob || !open) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${open.name}.${dlExtRef.current}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <ThemeToggle />
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-eb-garamond)', background: 'var(--bg-primary)' }}>
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 3.6rem 0.85rem 1.2rem', borderBottom: '1px solid var(--border-light)' }}>
          <Link href={`/library/${encodeURIComponent(author)}`} aria-label="back to the library" title="library"
            style={{ color: 'var(--text-muted)', display: 'flex', textDecoration: 'none' }} className="hover:opacity-60">{ChevronIcon}</Link>
          <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{who}</span>
          <span style={{ ...label }}>{online ? 'online' : 'offline'}</span>
        </header>

        <div className="plm-tabs" style={{ display: 'none', flex: 'none', borderBottom: '1px solid var(--border-light)' }}>
          {(['chat', 'pieces'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setMtab(t)}
              style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.7rem',
                color: mtab === t ? 'var(--text-primary)' : 'var(--text-ghost)', borderBottom: mtab === t ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>

        <main style={{ flex: 1, display: 'flex', minHeight: 0 }} data-mtab={mtab}
          data-left={leftOpen ? 'open' : 'closed'} data-mid={midOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>

          {/* history — slot 1 */}
          <button type="button" className="reader-strip strip-history" style={{ order: 1 }} onClick={() => setLeftOpen(true)} aria-label="open history" title="history">{PaneLeftIcon}</button>
          <aside className="reader-pane pane-history" style={{ order: 1, flex: 'none', width: '240px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0.7rem 0.9rem 0.5rem' }}>
              <button type="button" onClick={() => setLeftOpen(false)} aria-label="collapse history" title="collapse" style={iconBtn} className="hover:opacity-60">{PaneLeftIcon}</button>
              <span style={{ ...label, marginLeft: '0.55rem' }}>history</span>
              <button type="button" onClick={newChat} aria-label="new conversation" title="new conversation"
                style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem', lineHeight: 1, padding: 0 }} className="hover:opacity-60">＋</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '0.2rem 0.6rem 1rem' }}>
              {convos.map((c) => (
                <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: '8px',
                    background: c.id === activeId ? 'var(--bg-secondary)' : 'transparent', color: c.id === activeId ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.4, padding: '0.5rem 0.6rem', margin: '0 0 0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  className="hover:opacity-80">{convoTitle(c)}</button>
              ))}
            </div>
          </aside>

          {/* chat — slot 2 */}
          <button type="button" className="reader-strip strip-chat" style={{ order: 2 }} onClick={() => setMidOpen(true)} aria-label="open chat" title="chat">{LinesIcon}</button>
          <section className="reader-pane pane-chat" style={{ order: 2, flex: '1 1 0', minWidth: '340px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.7rem 1rem 0.4rem' }}>
              <button type="button" onClick={() => setMidOpen(false)} aria-label="collapse chat" title="collapse" style={iconBtn} className="hover:opacity-60">{LinesIcon}</button>
              <span style={{ ...label, marginLeft: '-0.45rem' }}>chat</span>
              {/* public | invite — the two DEPTHS of the one mind, named like
                  the pieces' own visibility tags (founder: most queriers are
                  public; the names must carry the model). Your level is
                  underlined. Toggling invite without a grant morphs the word
                  into a code field; a valid code binds on the next question. */}
              <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'baseline', marginLeft: 'auto' }}>
                <button type="button" onClick={() => { setSel('public'); setShowCode(false); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', padding: '0 0 0.15rem',
                    color: sel === 'public' && !showCode ? 'var(--text-primary)' : 'var(--text-ghost)',
                    borderBottom: sel === 'public' && !showCode ? '1px solid var(--accent)' : '1px solid transparent' }}>
                  public
                </button>
                {depth === 'invite' ? (
                  <button type="button" onClick={() => setSel('invite')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', padding: '0 0 0.15rem',
                      color: sel === 'invite' ? 'var(--text-primary)' : 'var(--text-ghost)',
                      borderBottom: sel === 'invite' ? '1px solid var(--accent)' : '1px solid transparent' }}>
                    invite
                  </button>
                ) : showCode ? (
                  <input
                    autoFocus
                    value={codeDraft}
                    onChange={(e) => setCodeDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { const code = codeDraft.trim(); if (code) setInvite(code); } if (e.key === 'Escape') { setShowCode(false); setCodeDraft(''); } }}
                    placeholder="invite code"
                    spellCheck={false}
                    autoCapitalize="off"
                    style={{ width: '7.5rem', border: 'none', borderBottom: '1px solid var(--border-light)', background: 'none', outline: 'none',
                      color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.82rem', padding: '0 0 0.15rem' }}
                  />
                ) : (
                  <button type="button" onClick={() => setShowCode(true)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', padding: '0 0 0.15rem',
                      color: 'var(--text-ghost)', borderBottom: '1px solid transparent' }}>
                    invite
                  </button>
                )}
              </div>
              {(active?.messages.length ?? 0) > 0 && (
                <ActionButton icon={CopyIcon} onAction={copyConvo} title="copy conversation" style={{ ...iconBtn, marginLeft: '0.4rem' }} className="hover:opacity-60" />
              )}
            </div>
            <div ref={threadRef} style={{ flex: 1, overflow: 'auto', padding: '0.4rem 1.4rem 1.4rem' }}>
              {who && (active?.messages.length ?? 0) === 0 && !asking && (
                // The first-timer explainer (founder, round three: "radically
                // simple, super intuitive — people have never seen anything like
                // this"): what this is, how far its reach goes, how the pieces
                // pane relates, and how depth works. Short declarative lines.
                <div style={{ padding: '0.6rem 0 0.2rem', color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.65 }}>
                  <p style={{ margin: '0 0 0.9rem' }}>
                    this is <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{who}</strong>’s mind — a personal language model, speaking from everything published and linked on this profile.
                  </p>
                  <p style={{ margin: '0 0 0.9rem' }}>
                    ask it anything. when it mentions a piece, pull it up and read along.
                  </p>
                  <p style={{ margin: 0 }}>
                    <Link href="/start" style={{ color: 'var(--accent)', textDecoration: 'none' }}>make your own →</Link>
                  </p>
                </div>
              )}
              {active?.messages.map((m, i) => (
                <div key={i} style={{ margin: '0 0 1.1rem' }}>
                  {m.role === 'you'
                    ? <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>{m.text}</p>
                    : (
                      <>
                        <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.9rem', color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}><TwinText text={m.text} /></div>
                        <div style={{ paddingLeft: '0.9rem' }}>
                          <ActionButton icon={CopyIcon} onAction={() => copyText(m.text)} title="copy" style={{ ...iconBtn, marginTop: '0.45rem', marginRight: '0.5rem', padding: 0 }} className="hover:opacity-60" />
                          {referenced(m.text).map((f) => (
                            <button key={f.name} type="button" onClick={() => void openPiece(f.name)} className="hover:opacity-70"
                              style={{ display: 'inline-flex', alignItems: 'center', marginTop: '0.6rem', marginRight: '0.4rem', border: '1px solid var(--border-light)',
                                color: 'var(--accent)', background: 'transparent', borderRadius: 999, fontFamily: 'inherit', fontSize: '0.82rem', padding: '0.28rem 0.7rem', cursor: 'pointer' }}>
                              pull up: {displayName(f.name)}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                </div>
              ))}
              {asking && <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>thinking…</p>}
            </div>
            {locked && (
              <div style={{ flex: 'none', padding: '0.75rem 1.2rem 0', borderTop: '1px solid var(--border-light)' }}>
                {invite ? (
                  <p style={{ color: 'var(--text-ghost)', fontSize: '0.8rem', margin: 0 }}>
                    invite code applied{!signedIn ? <> — <a href={librarySignInUrlHere()} style={{ color: 'var(--text-muted)', textDecoration: 'underline' }} className="hover:opacity-60">sign in</a> to ask with it</> : ''}.{' '}
                    <button type="button" onClick={() => { setInvite(''); setInviteDraft(''); }}
                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '0.8rem', textDecoration: 'underline' }} className="hover:opacity-60">
                      change
                    </button>
                  </p>
                ) : (
                  <>
                    <p style={{ color: 'var(--text-ghost)', fontSize: '0.8rem', margin: '0 0 0.45rem' }}>
                      this mind is invite-only — {!signedIn ? <><a href={librarySignInUrlHere()} style={{ color: 'var(--text-muted)', textDecoration: 'underline' }} className="hover:opacity-60">sign in</a> and enter your code to unlock.</> : 'enter a code to unlock.'}
                    </p>
                    {/* Same physics as the composer below it (radius, 1rem font — also the iOS no-zoom floor). */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input value={inviteDraft} onChange={(e) => setInviteDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyInvite(); }} placeholder="invite code" spellCheck={false} autoCapitalize="off"
                        style={{ flex: 1, minWidth: 0, border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--bg-secondary)', outline: 'none',
                          color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1rem', padding: '0.5rem 0.95rem' }} />
                      <button type="button" onClick={applyInvite} disabled={!inviteDraft.trim()}
                        style={{ flex: 'none', border: '1px solid var(--border-light)', borderRadius: '11px', background: 'transparent',
                          cursor: inviteDraft.trim() ? 'pointer' : 'default', opacity: inviteDraft.trim() ? 1 : 0.5, transition: 'opacity 0.15s',
                          color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '0.95rem', padding: '0.5rem 1rem' }} className="hover:opacity-60">
                        unlock
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div style={{ flex: 'none', padding: '0.9rem 1.2rem 0.7rem', borderTop: locked ? 'none' : '1px solid var(--border-light)' }}>
              <PromptBox ref={promptRef} value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking} typeWhileLoading placeholder="ask anything…" />
              {/* Contextual helper — only while the invite-code field is open:
                  how codes work, the sign-in requirement, and the REQUEST path
                  (the Author never learns someone wanted in unless there's a
                  way to ask). Invisible the rest of the time. */}
              {showCode && depth !== 'invite' && (
                <p style={{ color: 'var(--text-ghost)', fontSize: '0.84rem', margin: '0.5rem 0 0' }}>
                  {!signedIn ? (
                    <>
                      <a href={librarySignInUrlHere()} style={{ color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: '2px' }} className="hover:opacity-60">sign in</a>
                      {' '}to use an invite code — it binds to your account.
                    </>
                  ) : invite ? (
                    <>code set — the invite mind unlocks on your next question.</>
                  ) : (
                    <>enter your code, then ask.</>
                  )}
                  {contact && (
                    <>
                      {' '}no code?{' '}
                      <a
                        href={contact.includes('@') && !contact.startsWith('mailto:')
                          ? `mailto:${contact}?subject=${encodeURIComponent('an invite to your deeper mind')}`
                          : contact}
                        style={{ color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                        className="hover:opacity-60"
                      >
                        ask {(authorName || author).split(' ')[0]} for one
                      </a>
                    </>
                  )}
                </p>
              )}
            </div>
          </section>

          {/* the piece — slot 3 */}
          <button type="button" className="reader-strip strip-right" style={{ order: 3 }} onClick={() => setRightOpen(true)} aria-label="open the piece pane" title="pieces">{PaneRightIcon}</button>
          <article className="reader-pane pane-piece" style={{ order: 3, flex: '1 1 0', minWidth: 0, flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 1.4rem 0.4rem', borderBottom: '1px solid var(--border-light)' }}>
              {open && <button type="button" onClick={() => setOpen(null)} aria-label="back to pieces" title="back" style={iconBtn} className="hover:opacity-60">{ChevronIcon}</button>}
              <span style={{ ...(open ? { color: 'var(--text-primary)', fontSize: '0.98rem' } : label) }}>{open ? open.nice : 'pieces'}</span>
              {open && (
                <>
                  <ActionButton icon={CopyIcon} onAction={copyPiece} title="copy text" style={{ ...iconBtn, marginLeft: 'auto' }} className="hover:opacity-60" />
                  <ActionButton icon={DownloadIcon} onAction={downloadPiece} title="download" style={iconBtn} className="hover:opacity-60" />
                </>
              )}
              <button type="button" onClick={() => setRightOpen(false)} aria-label="collapse the piece pane" title="collapse" style={{ ...iconBtn, ...(open ? {} : { marginLeft: 'auto' }) }} className="hover:opacity-60">{PaneRightIcon}</button>
            </div>
            <div style={{ flex: 1, overflow: open?.pdfUrl ? 'hidden' : 'auto', minHeight: 0 }}>
              {!open && (
                // Everything the mind speaks from, structured like the profile:
                // the published pieces by section, then the LINKED surfaces —
                // so it's clear you can ask about those too, not only the works
                // (founder: the links are the point; the pane shouldn't read as
                // a list of random things).
                <div style={{ padding: '1.4rem clamp(1.4rem, 4vw, 3rem)' }}>
                  {files.length === 0 && linked.length === 0 && <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem' }}>nothing to show yet.</p>}
                  {(files.length > 0 || linked.length > 0) && (
                    <p style={{ color: 'var(--text-ghost)', fontSize: '0.86rem', margin: '0 0 1.2rem' }}>
                      everything this mind speaks from. open a piece and it can discuss it as you read.
                    </p>
                  )}
                  {/* Links FIRST — providing context for the linked surfaces is
                      the primary thing (founder); the published sections follow. */}
                  {linked.length > 0 && (
                    <div style={{ margin: '0 0 1.5rem' }}>
                      <p style={{ ...label, margin: '0 0 0.15rem' }}>links</p>
                      {linked.map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', width: '100%',
                            borderBottom: '1px solid var(--border-light)', textDecoration: 'none', padding: '0.7rem 0' }}
                          className="hover:opacity-60">
                          <span style={{ color: 'var(--text-primary)', fontSize: '1.02rem' }}>{l.label}</span>
                          <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>↗</span>
                        </a>
                      ))}
                      <p style={{ color: 'var(--text-ghost)', fontSize: '0.84rem', margin: '0.5rem 0 0' }}>
                        ask the mind about these — or follow them out.
                      </p>
                    </div>
                  )}
                  {(['works', 'projects', 'shadows'] as const).map((cat) => {
                    const items = files.filter((f) => (f.category || 'shadows') === cat);
                    if (items.length === 0) return null;
                    return (
                      <div key={cat} style={{ margin: '0 0 1.5rem' }}>
                        <p style={{ ...label, margin: '0 0 0.15rem' }}>{cat}</p>
                        {items.map((f) => (
                          <button key={f.name} type="button" onClick={() => void openPiece(f.name)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', width: '100%', textAlign: 'left',
                              border: 'none', borderBottom: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.7rem 0' }}
                            className="hover:opacity-60">
                            <span style={{ color: 'var(--text-primary)', fontSize: '1.02rem' }}>{f.title || displayName(f.name)}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{f.visibility || 'public'}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  {!signedIn && <p style={{ color: 'var(--text-ghost)', fontSize: '0.86rem', marginTop: '1.2rem' }}>sign in for more of this mind.</p>}
                </div>
              )}
              {open && open.loading && <p style={{ color: 'var(--text-ghost)', padding: '2rem' }}>loading…</p>}
              {open && !open.loading && open.pdfUrl && <iframe src={open.pdfUrl} title={open.nice} style={{ width: '100%', height: '100%', border: 'none' }} />}
              {open && !open.loading && !open.pdfUrl && (
                <div className="reader-prose" style={{ padding: '2rem clamp(1.4rem, 4vw, 3rem)' }}><ReactMarkdown remarkPlugins={[remarkGfm]}>{open.content}</ReactMarkdown></div>
              )}
            </div>
          </article>
        </main>
      </div>

      <style>{`
        .reader-prose { color: var(--text-secondary); font-size: 1.05rem; line-height: 1.75; max-width: 42rem; }
        .reader-prose h1, .reader-prose h2, .reader-prose h3 { color: var(--text-primary); font-weight: 500; line-height: 1.25; margin: 2.2rem 0 0.8rem; }
        .reader-prose h1 { font-size: 1.9rem; } .reader-prose h2 { font-size: 1.4rem; } .reader-prose h3 { font-size: 1.15rem; }
        .reader-prose p { margin: 0 0 1.1rem; } .reader-prose a { color: var(--accent); }
        .reader-prose blockquote { border-left: 2px solid var(--border-light); margin: 1.1rem 0; padding-left: 1rem; color: var(--text-muted); font-style: italic; }
        .reader-prose ul, .reader-prose ol { margin: 0 0 1.1rem; padding-left: 1.3rem; } .reader-prose li { margin: 0 0 0.4rem; }
        .reader-prose code { background: var(--bg-secondary); border-radius: 4px; padding: 0.1rem 0.35rem; font-size: 0.9em; }

        .reader-strip { flex: none; width: 46px; display: flex; align-items: flex-start; justify-content: center; padding-top: 0.85rem;
          border: none; border-right: 1px solid var(--border-light); background: var(--bg-secondary); cursor: pointer; color: var(--text-muted); transition: color 0.15s, background 0.15s; }
        .reader-strip.strip-right { border-right: none; border-left: 1px solid var(--border-light); margin-left: auto; }
        .reader-strip:hover { color: var(--text-primary); background: var(--border-light); }

        @media (min-width: 901px) {
          .reader-strip { display: none; }
          .reader-pane { display: none; }
          main[data-left="closed"] .strip-history { display: flex; }
          main[data-left="open"] .pane-history { display: flex; }
          main[data-mid="closed"] .strip-chat { display: flex; }
          main[data-mid="open"] .pane-chat { display: flex; }
          main[data-right="closed"] .strip-right { display: flex; }
          main[data-right="open"] .pane-piece { display: flex; }
        }
        @media (max-width: 900px) {
          .reader-strip, .pane-history { display: none !important; }
          .plm-tabs { display: flex !important; }
          main { flex-direction: column !important; }
          .pane-chat, .pane-piece { display: none !important; order: 0 !important; width: 100% !important; flex: 1 1 auto !important; min-width: 0 !important; border-right: none !important; }
          main[data-mtab="chat"] .pane-chat { display: flex !important; }
          main[data-mtab="pieces"] .pane-piece { display: flex !important; }
        }
      `}</style>
    </>
  );
}
