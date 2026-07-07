'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import { librarySignInUrlHere } from '../../../../lib/config';

/**
 * The reader workspace — a slim icon activity bar on the far left (the VS Code /
 * Claude-app pattern), with the panels it toggles stacked next to it:
 *   history · ask · notes  →  then the artifact (the star), dominant on the right.
 *
 * Every piece opens with only the artifact + the rail. Each icon opens/closes
 * its panel independently (active icon carries an accent bar). Notes lives on
 * the left with the others, not off on the right. Chats are in-memory only;
 * close the tab and they're gone.
 */

const SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'by', 'with']);
const TITLE_OVERRIDE: Record<string, string> = { mowinckels: 'mowinckels' };
function displayName(name: string): string {
  if (TITLE_OVERRIDE[name]) return TITLE_OVERRIDE[name];
  return name.split('-')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

type Msg = { role: 'you' | 'twin'; text: string };
type Convo = { id: string; messages: Msg[] };

// A conversation's label is its first question, trimmed — else a placeholder.
function convoTitle(c: Convo): string {
  const first = c.messages.find((m) => m.role === 'you')?.text.trim();
  if (!first) return 'new conversation';
  return first.length > 34 ? `${first.slice(0, 34)}…` : first;
}

// Generic line icons for the activity bar.
const ICON: Record<'history' | 'ask' | 'notes', ReactNode> = {
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" /></>,
  ask: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  notes: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
};

export default function ReaderPage({ params }: { params: Promise<{ author: string; name: string }> }) {
  const [author, setAuthor] = useState('');
  const [name, setName] = useState('');
  useEffect(() => { params.then((p) => { setAuthor(p.author); setName(p.name); }); }, [params]);

  const [authorName, setAuthorName] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [signedIn, setSignedIn] = useState(false);
  const [content, setContent] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [status, setStatus] = useState<'loading' | 'ok' | 'signin' | 'pay' | 'error'>('loading');
  const [checkoutUrl, setCheckoutUrl] = useState('');

  // panels — each toggled from its activity-bar icon; all closed on landing
  const [logOpen, setLogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [tab, setTab] = useState<'piece' | 'ask'>('piece'); // mobile

  // conversations — in-memory only, this session
  const idRef = useRef(2);
  const [convos, setConvos] = useState<Convo[]>([{ id: '1', messages: [] }]);
  const [activeId, setActiveId] = useState('1');
  const active = useMemo(() => convos.find((c) => c.id === activeId) ?? convos[0], [convos, activeId]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // notes (per piece, local)
  const notesKey = author && name ? `alx:notes:${author}:${name}` : '';
  const [notes, setNotes] = useState('');
  useEffect(() => { if (notesKey) { try { setNotes(localStorage.getItem(notesKey) || ''); } catch { /* */ } } }, [notesKey]);
  const saveNotes = (v: string) => { setNotes(v); try { if (notesKey) localStorage.setItem(notesKey, v); } catch { /* */ } };

  const nice = useMemo(() => displayName(name), [name]);
  const who = authorName || author;
  const signInUrl = librarySignInUrlHere();

  // Load author meta + the piece content (gated).
  useEffect(() => {
    if (!author || !name) return;
    let live = true;
    (async () => {
      setStatus('loading');
      try {
        const [dirRes, sessRes, fileRes] = await Promise.all([
          fetch(`/api/library/${encodeURIComponent(author)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
          // Signed-in state needs the cookie → same-origin session proxy, not the
          // credential-less directory (which always reads signed_out cross-origin).
          fetch('/api/library/session', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
          fetch(`/api/library/${encodeURIComponent(author)}/file/${encodeURIComponent(name)}`, { credentials: 'include' }),
        ]);
        if (!live) return;
        setAuthorName(dirRes?.author?.display_name || '');
        setSignedIn(sessRes?.signed_in === true);
        const f = (dirRes?.files || []).find((x: { name: string }) => x.name === name);
        if (f?.visibility) setVisibility(f.visibility);

        if (fileRes.ok) {
          // Some pieces are PDFs (served as octet/markdown) — sniff the bytes and
          // embed the PDF; otherwise it's markdown.
          const blob = await fileRes.blob();
          const head = await blob.slice(0, 5).text();
          if (head.startsWith('%PDF')) {
            setPdfUrl(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })));
          } else {
            setContent(await blob.text());
          }
          setStatus('ok');
        } else if (fileRes.status === 401) {
          setStatus('signin');
        } else if (fileRes.status === 402) {
          const b = await fileRes.json().catch(() => ({}));
          setCheckoutUrl(b?.checkout_url || '');
          setStatus('pay');
        } else {
          setStatus('error');
        }
      } catch {
        if (live) setStatus('error');
      }
    })();
    return () => { live = false; };
  }, [author, name]);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, asking]);

  const newChat = () => {
    const id = String(idRef.current++);
    setConvos((cs) => [{ id, messages: [] }, ...cs]);
    setActiveId(id);
    setQuestion('');
    setChatOpen(true);
  };
  const openChat = (id: string) => {
    setActiveId(id);
    setChatOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setTab('ask');
  };

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || asking) return;
    const targetId = activeId;
    setAsking(true);
    setQuestion('');
    setChatOpen(true);
    setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'you', text }] } : c)));
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setTab('ask');
    try {
      // Always tell the PLM which piece the reader is on, so it answers about
      // THIS document — not the company. Markdown pieces pass their full text;
      // PDFs (no inline text) pass a scoping note naming the piece.
      const focusText = content
        || `(The reader is currently viewing “${nice}”${pdfUrl ? ' (a PDF)' : ''}, a published piece by ${who}. Answer about THIS specific piece unless they clearly ask about something else.)`;
      const res = await fetch(`/api/library/${encodeURIComponent(author)}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question: text,
          variant: 'context',
          focus: { name: nice, content: focusText },
        }),
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

  // Enter sends; Shift+Enter is a newline (standard chat behaviour).
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); }
  };

  const label = { color: 'var(--text-ghost)', fontSize: '0.72rem', letterSpacing: '0.08em' } as const;

  const actIcon = (kind: 'history' | 'ask' | 'notes', open: boolean, toggle: () => void) => (
    <button type="button" className={`actbar-icon${open ? ' active' : ''}`} onClick={toggle} aria-label={kind} aria-pressed={open} title={kind}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[kind]}</svg>
    </button>
  );

  return (
    <>
      <ThemeToggle />
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-eb-garamond)', background: 'var(--bg-primary)' }}>
        {/* top bar — identity + navigation only */}
        <header style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: '1rem', padding: '1rem 3.6rem 1rem 1.4rem', borderBottom: '1px solid var(--border-light)' }}>
          <Link href={`/library/${encodeURIComponent(author)}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }} className="hover:opacity-60">← library</Link>
          <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{nice}</span>
          <span style={{ ...label }}>{visibility}</span>
        </header>

        {/* mobile tabs */}
        <div className="reader-tabs" style={{ display: 'none', flex: 'none', borderBottom: '1px solid var(--border-light)' }}>
          {(['piece', 'ask'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.7rem',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-ghost)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t === 'piece' ? 'read' : 'ask'}
            </button>
          ))}
        </div>

        <main style={{ flex: 1, display: 'flex', minHeight: 0 }}
          data-tab={tab} data-log={logOpen ? 'open' : 'closed'} data-chat={chatOpen ? 'open' : 'closed'} data-notes={notesOpen ? 'open' : 'closed'}>

          {/* activity bar — icons only, always present */}
          <nav className="reader-actbar">
            {actIcon('history', logOpen, () => setLogOpen((v) => !v))}
            {actIcon('ask', chatOpen, () => setChatOpen((v) => !v))}
            {actIcon('notes', notesOpen, () => setNotesOpen((v) => !v))}
          </nav>

          {/* history panel */}
          <aside className="reader-log" style={{ flex: 'none', width: '240px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1rem 1rem 0.7rem' }}>
              <span style={{ ...label }}>history</span>
              <button type="button" onClick={newChat} aria-label="new conversation" title="new conversation"
                style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.15rem', lineHeight: 1, padding: 0 }} className="hover:opacity-60">＋</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '0.2rem 0.6rem 1rem' }}>
              {convos.map((c) => (
                <button key={c.id} type="button" onClick={() => openChat(c.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: '8px',
                    background: c.id === activeId ? 'var(--bg-secondary)' : 'transparent',
                    color: c.id === activeId ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.4, padding: '0.5rem 0.6rem', margin: '0 0 0.15rem',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  className="hover:opacity-80">{convoTitle(c)}</button>
              ))}
            </div>
          </aside>

          {/* the live conversation */}
          <section className="reader-chat" style={{ flex: 'none', width: '34%', minWidth: '340px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={{ flex: 'none', padding: '1rem 1.2rem 0.6rem' }}>
              <span style={{ ...label }}>ask</span>
            </div>
            <div ref={threadRef} style={{ flex: 1, overflow: 'auto', padding: '0.4rem 1.4rem 1.4rem' }}>
              {active && active.messages.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                  ask {who}’s PLM about this piece.
                  {!signedIn && <> <a href={signInUrl} style={{ color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid var(--accent)' }} className="hover:opacity-60">sign in</a> for the deeper version.</>}
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
            <div style={{ flex: 'none', display: 'flex', gap: '0.5rem', alignItems: 'flex-end', padding: '0.9rem 1.2rem', borderTop: '1px solid var(--border-light)' }}>
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={onKey} rows={2} placeholder="ask about this piece…"
                style={{ flex: 1, resize: 'none', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--bg-secondary)', outline: 'none',
                  fontFamily: 'var(--font-eb-garamond)', fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--text-primary)', padding: '0.6rem 0.85rem' }} />
              <button type="button" onClick={() => void ask()} disabled={asking || !question.trim()}
                style={{ border: 'none', borderRadius: '10px', background: 'var(--accent)', color: 'var(--bg-primary)', fontFamily: 'inherit', fontSize: '0.9rem',
                  padding: '0.65rem 1.1rem', cursor: asking || !question.trim() ? 'default' : 'pointer', opacity: asking || !question.trim() ? 0.5 : 1 }}>ask</button>
            </div>
          </section>

          {/* notes — a left panel now, not off on the right */}
          <aside className="reader-notes" style={{ flex: 'none', width: '280px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={{ flex: 'none', padding: '1rem 1.2rem 0.6rem' }}>
              <span style={{ ...label }}>notes</span>
            </div>
            <textarea value={notes} onChange={(e) => saveNotes(e.target.value)} placeholder="your notes on this piece…"
              style={{ flex: 1, resize: 'none', border: 'none', background: 'transparent', outline: 'none', padding: '0.4rem 1.2rem 1.2rem',
                fontFamily: 'var(--font-eb-garamond)', fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-secondary)' }} />
          </aside>

          {/* the piece (dominant) */}
          <article className="reader-piece" style={{ flex: 1, overflow: pdfUrl ? 'hidden' : 'auto', padding: pdfUrl ? 0 : '2.6rem clamp(1.4rem, 5vw, 4rem)', minWidth: 0 }}>
            {status === 'loading' && <p style={{ color: 'var(--text-ghost)' }}>loading…</p>}
            {status === 'signin' && (
              <div style={{ maxWidth: '32rem' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>“{nice}” is open to people {who} has invited. sign in to read it.</p>
                <a href={signInUrl} style={{ display: 'inline-block', marginTop: '1rem', borderRadius: '11px', background: 'var(--accent)', color: 'var(--bg-primary)', padding: '0.6rem 1.25rem', textDecoration: 'none' }}>sign in</a>
              </div>
            )}
            {status === 'pay' && (
              <div style={{ maxWidth: '32rem' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>“{nice}” is a paid piece.</p>
                {checkoutUrl && <a href={checkoutUrl} style={{ display: 'inline-block', marginTop: '1rem', borderRadius: '11px', background: 'var(--accent)', color: 'var(--bg-primary)', padding: '0.6rem 1.25rem', textDecoration: 'none' }}>unlock it</a>}
              </div>
            )}
            {status === 'error' && <p style={{ color: 'var(--text-ghost)' }}>couldn’t load this piece.</p>}
            {status === 'ok' && (pdfUrl
              ? <iframe src={pdfUrl} title={nice} style={{ width: '100%', height: '100%', border: 'none' }} />
              : (
                <div className="reader-prose">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              ))}
          </article>
        </main>
      </div>

      <style>{`
        .reader-prose { color: var(--text-secondary); font-size: 1.05rem; line-height: 1.75; max-width: 42rem; margin: 0 auto; }
        .reader-prose h1, .reader-prose h2, .reader-prose h3 { color: var(--text-primary); font-weight: 500; line-height: 1.25; margin: 2.2rem 0 0.8rem; }
        .reader-prose h1 { font-size: 1.9rem; } .reader-prose h2 { font-size: 1.4rem; } .reader-prose h3 { font-size: 1.15rem; }
        .reader-prose p { margin: 0 0 1.1rem; } .reader-prose a { color: var(--accent); }
        .reader-prose blockquote { border-left: 2px solid var(--border-light); margin: 1.1rem 0; padding-left: 1rem; color: var(--text-muted); font-style: italic; }
        .reader-prose ul, .reader-prose ol { margin: 0 0 1.1rem; padding-left: 1.3rem; } .reader-prose li { margin: 0 0 0.4rem; }
        .reader-prose hr { border: none; border-top: 1px solid var(--border-light); margin: 2.2rem 0; }
        .reader-prose code { background: var(--bg-secondary); border-radius: 4px; padding: 0.1rem 0.35rem; font-size: 0.9em; }

        /* activity bar — the icon rail */
        .reader-actbar { flex: none; width: 48px; display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
          padding: 0.55rem 0; border-right: 1px solid var(--border-light); }
        .actbar-icon { position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          border: none; background: none; cursor: pointer; color: var(--text-ghost); border-radius: 9px;
          transition: color 0.15s, background 0.15s; }
        .actbar-icon:hover { color: var(--text-secondary); background: var(--bg-secondary); }
        .actbar-icon.active { color: var(--text-primary); }
        .actbar-icon.active::before { content: ''; position: absolute; left: -4px; top: 9px; bottom: 9px; width: 2px; border-radius: 2px; background: var(--accent); }

        /* desktop — panels shown by their own state; artifact always leads */
        @media (min-width: 901px) {
          .reader-tabs { display: none !important; }
          .reader-log, .reader-chat, .reader-notes { display: none; }
          main[data-log="open"] .reader-log { display: flex; }
          main[data-chat="open"] .reader-chat { display: flex; }
          main[data-notes="open"] .reader-notes { display: flex; }
        }

        /* mobile — read / ask tabs; the rail + side panels fold away */
        @media (max-width: 900px) {
          .reader-tabs { display: flex !important; }
          .reader-actbar, .reader-log, .reader-notes { display: none !important; }
          .reader-chat, .reader-piece { display: none !important; width: 100% !important; flex: 1 !important; }
          main[data-tab="piece"] .reader-piece { display: block !important; }
          main[data-tab="ask"] .reader-chat { display: flex !important; }
        }
      `}</style>
    </>
  );
}
