'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from '../../../components/ThemeToggle';
import PromptBox from '../../../components/PromptBox';
import ActionButton from '../../../components/ActionButton';

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
type FileMeta = { name: string; visibility?: string };
type Variant = { variant: 'weights' | 'context'; enabled: boolean; accessible: boolean; needsInvite?: boolean };
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
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
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
  const openTextRef = useRef('');                    // extracted text of the open piece (race-safe)
  const openExtractRef = useRef<Promise<void> | null>(null);
  const dlBlobRef = useRef<Blob | null>(null);       // raw bytes of the open piece, for download
  const dlExtRef = useRef('md');

  // Land on the mind named in ?variant=&tier= (the profile links each one here).
  const [tier, setTier] = useState('public');
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const v = q.get('variant'); if (v === 'weights' || v === 'context') setActiveVariant(v);
      const t = q.get('tier'); if (t) setTier(t);
    } catch { /* */ }
  }, []);

  const who = authorName || author;
  const mindLabel = activeVariant === 'weights' ? 'personal' : (tier === 'invite' ? 'friends' : 'everyone');
  const usable = useMemo(() => variants.filter((v) => v.enabled && (v.accessible || v.needsInvite)), [variants]);

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
      setFiles(Array.isArray(dir?.files) ? dir.files : []);
      const vs: Variant[] = Array.isArray(dir?.twin?.variants) ? dir.twin.variants : [];
      setVariants(vs);
      const first = vs.find((v) => v.enabled && (v.accessible || v.needsInvite));
      if (first) setActiveVariant(first.variant);
    })();
    return () => { live = false; };
  }, [author]);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, asking]);

  const openPiece = async (fileName: string) => {
    const nice = displayName(fileName);
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

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;
    const targetId = activeId;
    setAsking(true);
    setQuestion('');
    setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'you', text }] } : c)));
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
        body: JSON.stringify({ question: text, variant: activeVariant, ...(focus ? { focus } : {}) }),
      });
      const b = await res.json().catch(() => ({}));
      const answer = (res.ok && b.answer) ? b.answer : (b.error || 'the mind could not answer just now.');
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'twin', text: answer }] } : c)));
    } catch {
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'twin', text: 'could not reach the mind.' }] } : c)));
    } finally {
      setAsking(false);
    }
  };

  const label = { color: 'var(--text-ghost)', fontSize: '0.72rem', letterSpacing: '0.08em' } as const;
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
          <span style={{ ...label }}>{mindLabel}</span>
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
              {usable.length > 1 && (
                <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'baseline', marginLeft: 'auto' }}>
                  {usable.map((v) => (
                    <button key={v.variant} type="button" onClick={() => setActiveVariant(v.variant)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', padding: '0 0 0.15rem',
                        color: activeVariant === v.variant ? 'var(--text-primary)' : 'var(--text-ghost)',
                        borderBottom: activeVariant === v.variant ? '1px solid var(--accent)' : '1px solid transparent' }}>
                      {v.variant === 'weights' ? 'quick' : 'deep'}{v.needsInvite && !v.accessible ? ' · invite' : ''}
                    </button>
                  ))}
                </div>
              )}
              {(active?.messages.length ?? 0) > 0 && (
                <ActionButton icon={CopyIcon} onAction={copyConvo} title="copy conversation" style={{ ...iconBtn, marginLeft: usable.length > 1 ? '0.4rem' : 'auto' }} className="hover:opacity-60" />
              )}
            </div>
            <div ref={threadRef} style={{ flex: 1, overflow: 'auto', padding: '0.4rem 1.4rem 1.4rem' }}>
              {active?.messages.map((m, i) => (
                <div key={i} style={{ margin: '0 0 1.1rem' }}>
                  {m.role === 'you'
                    ? <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>{m.text}</p>
                    : (
                      <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.9rem' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                        <ActionButton icon={CopyIcon} onAction={() => copyText(m.text)} title="copy" style={{ ...iconBtn, marginTop: '0.4rem', marginRight: '0.5rem', padding: 0 }} className="hover:opacity-60" />
                        {referenced(m.text).map((f) => (
                          <button key={f.name} type="button" onClick={() => void openPiece(f.name)} className="hover:opacity-70"
                            style={{ display: 'inline-flex', alignItems: 'center', marginTop: '0.6rem', marginRight: '0.4rem', border: '1px solid var(--border-light)',
                              color: 'var(--accent)', background: 'transparent', borderRadius: 999, fontFamily: 'inherit', fontSize: '0.82rem', padding: '0.28rem 0.7rem', cursor: 'pointer' }}>
                            pull up: {displayName(f.name)}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              ))}
              {asking && <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>thinking…</p>}
            </div>
            <div style={{ flex: 'none', padding: '0.9rem 1.2rem', borderTop: '1px solid var(--border-light)' }}>
              <PromptBox value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking} placeholder="ask anything…" />
            </div>
          </section>

          {/* the piece — slot 3 */}
          <button type="button" className="reader-strip strip-right" style={{ order: 3 }} onClick={() => setRightOpen(true)} aria-label="open the piece pane" title="pieces">{PaneRightIcon}</button>
          <article className="reader-pane pane-piece" style={{ order: 3, flex: '1 1 0', minWidth: 0, flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 1.4rem 0.4rem', borderBottom: '1px solid var(--border-light)' }}>
              {open && <button type="button" onClick={() => setOpen(null)} aria-label="back to pieces" title="back" style={iconBtn} className="hover:opacity-60">{ChevronIcon}</button>}
              <span style={{ ...(open ? { color: 'var(--text-primary)', fontSize: '0.98rem' } : label) }}>{open ? open.nice : `${who}’s pieces`}</span>
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
                <div style={{ padding: '1.4rem clamp(1.4rem, 4vw, 3rem)' }}>
                  {files.length === 0 && <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem' }}>nothing to show yet.</p>}
                  {files.map((f) => (
                    <button key={f.name} type="button" onClick={() => void openPiece(f.name)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', width: '100%', textAlign: 'left',
                        border: 'none', borderBottom: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.7rem 0' }}
                      className="hover:opacity-60">
                      <span style={{ color: 'var(--text-primary)', fontSize: '0.98rem' }}>{displayName(f.name)}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{f.visibility || 'public'}</span>
                    </button>
                  ))}
                  {!signedIn && <p style={{ color: 'var(--text-ghost)', fontSize: '0.82rem', marginTop: '1.6rem' }}>sign in for the deeper version of this mind.</p>}
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
