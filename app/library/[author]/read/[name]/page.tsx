'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import PromptBox from '../../../../components/PromptBox';
import { librarySignInUrlHere } from '../../../../lib/config';

/**
 * The reader workspace — the artifact is the star. Two side panels (history +
 * chat) each collapse independently to a wide, clearly-pressable strip carrying
 * its own icon (a pane icon for history, three lines for chat); press to open,
 * press again to close. The top-right three-pane icon toggles both at once. No
 * notes. Chats are in-memory only; close the tab, they're gone.
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

function convoTitle(c: Convo): string {
  const first = c.messages.find((m) => m.role === 'you')?.text.trim();
  if (!first) return 'new conversation';
  return first.length > 34 ? `${first.slice(0, 34)}…` : first;
}

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ChevronIcon = <svg width="20" height="20" {...svgProps}><path d="M15 18l-6-6 6-6" /></svg>;
const PaneIcon = <svg width="19" height="19" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></svg>;
const LinesIcon = <svg width="19" height="19" {...svgProps}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
const ThreePaneIcon = <svg width="18" height="18" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="20" /></svg>;

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

  // Two independent panels; both collapsed on landing → just the artifact + strips.
  const [logOpen, setLogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [tab, setTab] = useState<'piece' | 'ask'>('piece'); // mobile

  const idRef = useRef(2);
  const [convos, setConvos] = useState<Convo[]>([{ id: '1', messages: [] }]);
  const [activeId, setActiveId] = useState('1');
  const active = useMemo(() => convos.find((c) => c.id === activeId) ?? convos[0], [convos, activeId]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const nice = useMemo(() => displayName(name), [name]);
  const who = authorName || author;
  const signInUrl = librarySignInUrlHere();

  useEffect(() => {
    if (!author || !name) return;
    let live = true;
    (async () => {
      setStatus('loading');
      try {
        const [dirRes, sessRes, fileRes] = await Promise.all([
          fetch(`/api/library/${encodeURIComponent(author)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
          fetch('/api/library/session', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
          fetch(`/api/library/${encodeURIComponent(author)}/file/${encodeURIComponent(name)}`, { credentials: 'include' }),
        ]);
        if (!live) return;
        setAuthorName(dirRes?.author?.display_name || '');
        setSignedIn(sessRes?.signed_in === true);
        const f = (dirRes?.files || []).find((x: { name: string }) => x.name === name);
        if (f?.visibility) setVisibility(f.visibility);

        if (fileRes.ok) {
          const blob = await fileRes.blob();
          const head = await blob.slice(0, 5).text();
          if (head.startsWith('%PDF')) {
            const buf = await blob.arrayBuffer();
            setPdfUrl(URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })));
            setStatus('ok');
            // Extract the PDF's text so the PLM receives the actual document, not
            // just its title. Same-origin worker (public/) — no CDN, no CSP issue.
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
              if (live && text.trim()) setContent(text.trim());
            } catch { /* leave content empty → focus falls back to a title-scoped note */ }
            return;
          }
          setContent(await blob.text());
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

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;
    const targetId = activeId;
    setAsking(true);
    setQuestion('');
    setChatOpen(true);
    setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'you', text }] } : c)));
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setTab('ask');
    try {
      // Always tell the PLM which piece the reader is on. Markdown pieces pass
      // their full text; PDFs pass the text extracted on load (or a title note).
      const focusText = content
        || `(The reader is currently viewing “${nice}”${pdfUrl ? ' (a PDF)' : ''}, a published piece by ${who}. Answer about THIS specific piece unless they clearly ask about something else.)`;
      const res = await fetch(`/api/library/${encodeURIComponent(author)}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: text, variant: 'context', focus: { name: nice, content: focusText } }),
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
  const bothOpen = logOpen && chatOpen;

  return (
    <>
      <ThemeToggle />
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-eb-garamond)', background: 'var(--bg-primary)' }}>
        {/* top bar */}
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 3.6rem 0.85rem 1.2rem', borderBottom: '1px solid var(--border-light)' }}>
          <Link href={`/library/${encodeURIComponent(author)}`} aria-label="back to the library" title="library"
            style={{ color: 'var(--text-muted)', display: 'flex', textDecoration: 'none' }} className="hover:opacity-60">{ChevronIcon}</Link>
          <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{nice}</span>
          <span style={{ ...label }}>{visibility}</span>
          <button type="button" className="panes-toggle" onClick={() => { const open = !bothOpen; setLogOpen(open); setChatOpen(open); }}
            aria-label="toggle panels" aria-pressed={logOpen || chatOpen} title="panels"
            style={{ ...iconBtn, marginLeft: 'auto', color: (logOpen || chatOpen) ? 'var(--text-primary)' : 'var(--text-ghost)' }}>{ThreePaneIcon}</button>
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

        <main style={{ flex: 1, display: 'flex', minHeight: 0 }} data-tab={tab} data-log={logOpen ? 'open' : 'closed'} data-chat={chatOpen ? 'open' : 'closed'}>
          {/* collapsed strips — wide, clearly pressable, each carrying its own icon */}
          <button type="button" className="reader-strip strip-history" onClick={() => setLogOpen(true)} aria-label="open history" title="history">{PaneIcon}</button>
          <button type="button" className="reader-strip strip-chat" onClick={() => setChatOpen(true)} aria-label="open chat" title="chat">{LinesIcon}</button>

          {/* history (left) */}
          <aside className="reader-log" style={{ flex: 'none', width: '240px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0.7rem 0.9rem 0.5rem' }}>
              <button type="button" onClick={() => setLogOpen(false)} aria-label="collapse history" title="collapse" style={iconBtn} className="hover:opacity-60">{PaneIcon}</button>
              <button type="button" onClick={newChat} aria-label="new conversation" title="new conversation"
                style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem', lineHeight: 1, padding: 0 }} className="hover:opacity-60">＋</button>
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

          {/* chat (middle) */}
          <section className="reader-chat" style={{ flex: 'none', width: '34%', minWidth: '340px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0.7rem 1rem 0.4rem' }}>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="collapse chat" title="collapse" style={iconBtn} className="hover:opacity-60">{LinesIcon}</button>
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
            <div style={{ flex: 'none', padding: '0.9rem 1.2rem', borderTop: '1px solid var(--border-light)' }}>
              <PromptBox value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking} placeholder="ask about this piece…" />
            </div>
          </section>

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

        /* collapsed strips — wide enough to press, icon near the top */
        .reader-strip { flex: none; width: 46px; display: flex; align-items: flex-start; justify-content: center; padding-top: 0.85rem;
          border: none; border-right: 1px solid var(--border-light); background: var(--bg-secondary); cursor: pointer;
          color: var(--text-muted); transition: color 0.15s, background 0.15s; }
        .reader-strip:hover { color: var(--text-primary); background: var(--border-light); }

        /* desktop — each panel shown by its own state; collapsed → its strip */
        @media (min-width: 901px) {
          .reader-tabs { display: none !important; }
          .reader-strip { display: none; }
          .reader-log, .reader-chat { display: none; }
          main[data-log="closed"] .strip-history { display: flex; }
          main[data-log="open"] .reader-log { display: flex; }
          main[data-chat="closed"] .strip-chat { display: flex; }
          main[data-chat="open"] .reader-chat { display: flex; }
        }

        /* mobile — read / ask tabs; strips + history fold away */
        @media (max-width: 900px) {
          .panes-toggle, .reader-strip, .reader-log { display: none !important; }
          .reader-tabs { display: flex !important; }
          .reader-chat, .reader-piece { display: none !important; width: 100% !important; flex: 1 !important; }
          main[data-tab="piece"] .reader-piece { display: block !important; }
          main[data-tab="ask"] .reader-chat { display: flex !important; }
        }
      `}</style>
    </>
  );
}
