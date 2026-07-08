'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from '../../../components/ThemeToggle';
import PromptBox from '../../../components/PromptBox';

/**
 * The PLM workspace — a chat with an Author's personal language model. Same
 * three-pane shape as the reader, but chat-first: the conversation is the open
 * middle pane, history is a collapsed strip, and the right pane holds whatever
 * piece is being looked at — you (or the mind, by naming it) pull one of the
 * Author's works up and it opens there, exactly like the reader opens a piece.
 */

const SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'by', 'with']);
const TITLE_OVERRIDE: Record<string, string> = { mowinckels: 'mowinckels' };
function displayName(name: string): string {
  if (TITLE_OVERRIDE[name]) return TITLE_OVERRIDE[name];
  return name.split('-').map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

type Msg = { role: 'you' | 'twin'; text: string };
type Convo = { id: string; messages: Msg[] };
type FileMeta = { name: string; visibility?: string; category?: string };
type OpenPiece = { name: string; nice: string; content: string; pdfUrl: string; loading: boolean };

function convoTitle(c: Convo): string {
  const first = c.messages.find((m) => m.role === 'you')?.text.trim();
  if (!first) return 'new conversation';
  return first.length > 34 ? `${first.slice(0, 34)}…` : first;
}

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ChevronIcon = <svg width="20" height="20" {...svgProps}><path d="M15 18l-6-6 6-6" /></svg>;
const PaneIcon = <svg width="19" height="19" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></svg>;

export default function PlmPage({ params }: { params: Promise<{ author: string }> }) {
  const [author, setAuthor] = useState('');
  useEffect(() => { params.then((p) => setAuthor(p.author)); }, [params]);

  const [authorName, setAuthorName] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [open, setOpen] = useState<OpenPiece | null>(null); // the piece shown on the right

  const idRef = useRef(2);
  const [convos, setConvos] = useState<Convo[]>([{ id: '1', messages: [] }]);
  const [activeId, setActiveId] = useState('1');
  const active = useMemo(() => convos.find((c) => c.id === activeId) ?? convos[0], [convos, activeId]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const who = authorName || author;

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
    })();
    return () => { live = false; };
  }, [author]);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, asking]);

  // Open one of the Author's pieces into the right pane (extract PDF text so the
  // chat can be scoped to it), mirroring the reader's load path.
  const openPiece = async (fileName: string) => {
    const nice = displayName(fileName);
    setOpen({ name: fileName, nice, content: '', pdfUrl: '', loading: true });
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(author)}/file/${encodeURIComponent(fileName)}`, { credentials: 'include' });
      if (!res.ok) { setOpen({ name: fileName, nice, content: '', pdfUrl: '', loading: false }); return; }
      const blob = await res.blob();
      const head = await blob.slice(0, 5).text();
      if (head.startsWith('%PDF')) {
        const buf = await blob.arrayBuffer();
        const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        setOpen({ name: fileName, nice, content: '', pdfUrl: url, loading: false });
        try {
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
          let text = '';
          const pages = Math.min(pdf.numPages, 40);
          for (let p = 1; p <= pages && text.length < 120000; p++) {
            const page = await pdf.getPage(p);
            const tc = await page.getTextContent();
            text += tc.items.map((it) => (it as { str?: string }).str ?? '').join(' ') + '\n\n';
          }
          if (text.trim()) setOpen((o) => (o && o.name === fileName ? { ...o, content: text.trim() } : o));
        } catch { /* title-scoped focus fallback */ }
      } else {
        setOpen({ name: fileName, nice, content: await blob.text(), pdfUrl: '', loading: false });
      }
    } catch {
      setOpen({ name: fileName, nice, content: '', pdfUrl: '', loading: false });
    }
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
      // If a piece is open on the right, scope the mind to it; otherwise a general
      // conversation with the mind.
      const focus = open
        ? { name: open.nice, content: open.content || `(The reader is looking at “${open.nice}”${open.pdfUrl ? ' (a PDF)' : ''} by ${who}.)` }
        : undefined;
      const res = await fetch(`/api/library/${encodeURIComponent(author)}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: text, variant: 'context', ...(focus ? { focus } : {}) }),
      });
      const b = await res.json().catch(() => ({}));
      const answer = (res.ok && b.answer) ? b.answer : (b.error || 'the PLM could not answer just now.');
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'twin', text: answer }] } : c)));
    } catch {
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'twin', text: 'could not reach the PLM.' }] } : c)));
    } finally {
      setAsking(false);
    }
  };

  const label = { color: 'var(--text-ghost)', fontSize: '0.72rem', letterSpacing: '0.08em' } as const;
  const iconBtn = { display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--text-ghost)', transition: 'color 0.15s' } as const;

  return (
    <>
      <ThemeToggle />
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-eb-garamond)', background: 'var(--bg-primary)' }}>
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 3.6rem 0.85rem 1.2rem', borderBottom: '1px solid var(--border-light)' }}>
          <Link href={`/library/${encodeURIComponent(author)}`} aria-label="back to the library" title="library"
            style={{ color: 'var(--text-muted)', display: 'flex', textDecoration: 'none' }} className="hover:opacity-60">{ChevronIcon}</Link>
          <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{who}</span>
          <span style={{ ...label }}>personal language model</span>
        </header>

        <main style={{ flex: 1, display: 'flex', minHeight: 0 }} data-log={logOpen ? 'open' : 'closed'}>
          {/* history strip / panel */}
          <button type="button" className="reader-strip strip-history" onClick={() => setLogOpen(true)} aria-label="open history" title="history">{PaneIcon}</button>
          <aside className="reader-log" style={{ flex: 'none', width: '240px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0.7rem 0.9rem 0.5rem' }}>
              <button type="button" onClick={() => setLogOpen(false)} aria-label="collapse history" title="collapse" style={iconBtn} className="hover:opacity-60">{PaneIcon}</button>
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

          {/* chat (middle, the open pane) */}
          <section className="reader-chat" style={{ flex: open ? 'none' : 1, width: open ? '38%' : undefined, minWidth: '340px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div ref={threadRef} style={{ flex: 1, overflow: 'auto', padding: '1.4rem' }}>
              {active && active.messages.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                  chat with {who}’s mind. it can pull up their pieces on the right.
                </p>
              )}
              {active?.messages.map((m, i) => (
                <div key={i} style={{ margin: '0 0 1.1rem' }}>
                  {m.role === 'you'
                    ? <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>{m.text}</p>
                    : <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.9rem', color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.text}</div>}
                </div>
              ))}
              {asking && <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>thinking…</p>}
            </div>
            <div style={{ flex: 'none', padding: '0.9rem 1.2rem', borderTop: '1px solid var(--border-light)' }}>
              <PromptBox value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking} placeholder={`ask ${who} anything…`} />
            </div>
          </section>

          {/* right pane — the piece being looked at, or the pieces to pull up */}
          <article className="plm-right" style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {!open && (
              <div style={{ padding: '2.2rem clamp(1.4rem, 4vw, 3rem)' }}>
                <p style={{ ...label, margin: '0 0 1rem' }}>{who}’s pieces</p>
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
              </div>
            )}
            {open && (
              <>
                <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.85rem 1.4rem', borderBottom: '1px solid var(--border-light)' }}>
                  <button type="button" onClick={() => setOpen(null)} aria-label="back to pieces" title="back" style={iconBtn} className="hover:opacity-60">{ChevronIcon}</button>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.98rem' }}>{open.nice}</span>
                  <Link href={`/library/${encodeURIComponent(author)}/read/${encodeURIComponent(open.name)}`} style={{ ...label, marginLeft: 'auto', textDecoration: 'none' }} className="hover:opacity-60">open in reader →</Link>
                </div>
                <div style={{ flex: 1, overflow: open.pdfUrl ? 'hidden' : 'auto', minHeight: 0 }}>
                  {open.loading && <p style={{ color: 'var(--text-ghost)', padding: '2rem' }}>loading…</p>}
                  {!open.loading && open.pdfUrl && <iframe src={open.pdfUrl} title={open.nice} style={{ width: '100%', height: '100%', border: 'none' }} />}
                  {!open.loading && !open.pdfUrl && (
                    <div className="reader-prose" style={{ padding: '2rem clamp(1.4rem, 4vw, 3rem)' }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{open.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </>
            )}
            {!signedIn && !open && (
              <p style={{ color: 'var(--text-ghost)', fontSize: '0.82rem', padding: '0 clamp(1.4rem, 4vw, 3rem) 2rem' }}>
                sign in for the deeper version of this mind.
              </p>
            )}
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
        .reader-strip:hover { color: var(--text-primary); background: var(--border-light); }

        @media (min-width: 901px) {
          .reader-strip { display: none; }
          .reader-log { display: none; }
          main[data-log="closed"] .strip-history { display: flex; }
          main[data-log="open"] .reader-log { display: flex; }
        }
        /* mobile — chat + right stack; history folds away, strip hidden */
        @media (max-width: 900px) {
          .reader-strip, .reader-log { display: none !important; }
          main { flex-direction: column; }
          .reader-chat { width: 100% !important; flex: 1 1 55% !important; border-right: none !important; border-bottom: 1px solid var(--border-light); }
          .plm-right { flex: 1 1 45% !important; }
        }
      `}</style>
    </>
  );
}
