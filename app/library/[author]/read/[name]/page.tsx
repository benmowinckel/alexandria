'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import { SERVER_URL } from '../../../../lib/config';

/**
 * The reader workspace — three panels: the piece (right, dominant), the twin
 * (middle, handed the piece as `focus` so it can discuss it), and notes/history
 * (left, collapsed by default). Read a work, then interrogate the mind about it.
 */

function displayName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type Msg = { role: 'you' | 'twin'; text: string };

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

  // panels
  const [notesOpen, setNotesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [tab, setTab] = useState<'piece' | 'ask' | 'notes'>('piece'); // mobile

  // chat
  const [history, setHistory] = useState<Msg[]>([]);
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
  const signInUrl = `${SERVER_URL}/auth/github?intent=library&next=${typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : ''}`;

  // Load author meta + the piece content (gated).
  useEffect(() => {
    if (!author || !name) return;
    let live = true;
    (async () => {
      setStatus('loading');
      try {
        const [dirRes, fileRes] = await Promise.all([
          fetch(`${SERVER_URL}/library/${encodeURIComponent(author)}`).then((r) => r.json()).catch(() => ({})),
          fetch(`${SERVER_URL}/library/${encodeURIComponent(author)}/file/${encodeURIComponent(name)}`, { credentials: 'include' }),
        ]);
        if (!live) return;
        setAuthorName(dirRes?.author?.display_name || '');
        setSignedIn(dirRes?.twin?.signed_in === true);
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

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [history, asking]);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || asking) return;
    setAsking(true);
    setQuestion('');
    setHistory((h) => [...h, { role: 'you', text }]);
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setTab('ask');
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(author)}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question: text,
          variant: 'context',
          focus: content ? { name: nice, content } : undefined,
        }),
      });
      const b = await res.json().catch(() => ({}));
      const answer = (res.ok && b.answer) ? b.answer : (b.error || 'the twin could not answer just now.');
      setHistory((h) => [...h, { role: 'twin', text: answer }]);
    } catch {
      setHistory((h) => [...h, { role: 'twin', text: 'could not reach the twin.' }]);
    } finally {
      setAsking(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void ask(); }
  };

  const label = { color: 'var(--text-ghost)', fontSize: '0.72rem', letterSpacing: '0.08em' } as const;
  const toggleBtn = (active: boolean) => ({
    border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem',
    color: active ? 'var(--text-primary)' : 'var(--text-ghost)', padding: '0.2rem 0',
  } as const);

  return (
    <>
      <ThemeToggle />
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-eb-garamond)', background: 'var(--bg-primary)' }}>
        {/* top bar */}
        <header style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: '1rem', padding: '1rem 1.4rem', borderBottom: '1px solid var(--border-light)' }}>
          <Link href={`/library/${encodeURIComponent(author)}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }} className="hover:opacity-60">← library</Link>
          <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{nice}</span>
          <span style={{ ...label }}>{visibility}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.1rem' }} className="reader-toggles">
            <button type="button" style={toggleBtn(notesOpen)} onClick={() => setNotesOpen((v) => !v)}>notes</button>
            <button type="button" style={toggleBtn(chatOpen)} onClick={() => setChatOpen((v) => !v)}>ask</button>
          </div>
        </header>

        {/* mobile tabs */}
        <div className="reader-tabs" style={{ display: 'none', flex: 'none', borderBottom: '1px solid var(--border-light)' }}>
          {(['piece', 'ask', 'notes'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.7rem',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-ghost)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>

        <main style={{ flex: 1, display: 'flex', minHeight: 0 }} data-tab={tab}>
          {/* notes (left, collapsed by default) */}
          {notesOpen && (
            <aside className="reader-notes" style={{ flex: 'none', width: '280px', borderRight: '1px solid var(--border-light)', padding: '1.2rem', overflow: 'auto' }}>
              <p style={{ ...label, margin: '0 0 0.7rem' }}>notes</p>
              <textarea value={notes} onChange={(e) => saveNotes(e.target.value)} placeholder="your notes on this piece…"
                style={{ width: '100%', minHeight: '60vh', resize: 'none', border: 'none', background: 'transparent', outline: 'none',
                  fontFamily: 'var(--font-eb-garamond)', fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-secondary)' }} />
            </aside>
          )}

          {/* the twin (middle) */}
          {chatOpen && (
            <section className="reader-chat" style={{ flex: 'none', width: '38%', minWidth: '340px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
              <div ref={threadRef} style={{ flex: 1, overflow: 'auto', padding: '1.4rem' }}>
                {history.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                    ask {who}’s twin about this piece.
                    {!signedIn && <> <a href={signInUrl} style={{ color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid var(--accent)' }} className="hover:opacity-60">sign in</a> for the deeper version.</>}
                  </p>
                )}
                {history.map((m, i) => (
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
          )}

          {/* the piece (right, dominant) */}
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
        @media (max-width: 900px) {
          .reader-toggles { display: none !important; }
          .reader-tabs { display: flex !important; }
          .reader-notes, .reader-chat, .reader-piece { display: none !important; width: 100% !important; flex: 1 !important; }
          [data-tab="piece"] .reader-piece { display: block !important; }
          [data-tab="ask"] .reader-chat { display: flex !important; }
          [data-tab="notes"] .reader-notes { display: block !important; }
        }
      `}</style>
    </>
  );
}
