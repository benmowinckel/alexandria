'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from './ThemeToggle';
import PromptBox from './PromptBox';
import ActionButton from './ActionButton';

/**
 * ReaderShell — the reader UI, extracted so the library route AND the public
 * website docs (whitepaper, letter) render the SAME code. Three panes, each
 * collapsing on its own to an in-place strip (history / chat / piece; never
 * reorder). The owner (a thin wrapper) fetches the artifact and supplies:
 *   • what to show (status, markdown | pdfUrl, artifactText for copy, download blob)
 *   • how to ask (askFn — the wrapper points it at the right twin: a Library
 *     author's personal twin, or the public Alexandria guide)
 * So the chrome can never diverge between surfaces — change it here, all readers
 * change. Chats are in-memory only.
 */

type Msg = { role: 'you' | 'twin'; text: string };
type Convo = { id: string; messages: Msg[] };
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

export type ReaderShellProps = {
  name: string;                                   // display title
  backHref: string;                               // chevron destination
  backTitle: string;                              // chevron tooltip ("library" / "alexandria")
  visibility?: string;                            // header tag
  status: 'loading' | 'ok' | 'signin' | 'pay' | 'error';
  pdfUrl?: string;                                // set → render as PDF
  markdown?: string;                              // set → render as markdown
  artifactText?: string;                          // text for the copy button
  downloadBlob?: Blob | null;
  downloadName?: string;                          // filename base
  downloadExt?: string;                           // 'pdf' | 'md'
  signInUrl?: string;
  checkoutUrl?: string;
  who?: string;                                   // whose piece (signin/pay copy)
  askPlaceholder?: string;
  askFn: (question: string) => Promise<string>;   // the twin call (wrapper decides which)
};

export default function ReaderShell({
  name, backHref, backTitle, visibility = 'public', status, pdfUrl, markdown,
  artifactText = '', downloadBlob, downloadName = 'document', downloadExt = 'md',
  signInUrl = '', checkoutUrl = '', who = '', askPlaceholder = 'ask about this piece…', askFn,
}: ReaderShellProps) {
  const [leftOpen, setLeftOpen] = useState(false);   // history
  const [midOpen, setMidOpen] = useState(false);     // chat
  const [rightOpen, setRightOpen] = useState(true);  // the piece
  const [tab, setTab] = useState<'piece' | 'ask'>('piece'); // mobile

  const idRef = useRef(2);
  const [convos, setConvos] = useState<Convo[]>([{ id: '1', messages: [] }]);
  const [activeId, setActiveId] = useState('1');
  const active = useMemo(() => convos.find((c) => c.id === activeId) ?? convos[0], [convos, activeId]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<{ focus: () => void } | null>(null);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, asking]);

  // When the chat pane becomes visible (expand it on desktop, or switch to the
  // ask tab on mobile), drop the cursor in the composer so you can type at once.
  useEffect(() => {
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 900;
    if (mobile ? tab !== 'ask' : !midOpen) return;
    const id = requestAnimationFrame(() => promptRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [midOpen, tab]);

  const newChat = () => {
    const id = String(idRef.current++);
    setConvos((cs) => [{ id, messages: [] }, ...cs]);
    setActiveId(id);
    setQuestion('');
    setMidOpen(true);
  };
  const openChat = (id: string) => {
    setActiveId(id);
    setMidOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setTab('ask');
  };

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;
    const targetId = activeId;
    setAsking(true);
    setQuestion('');
    setMidOpen(true);
    setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'you', text }] } : c)));
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setTab('ask');
    try {
      const answer = await askFn(text);
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'twin', text: answer }] } : c)));
    } catch {
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'twin', text: 'could not reach the PLM.' }] } : c)));
    } finally {
      setAsking(false);
    }
  };

  const label = { color: 'var(--text-ghost)', fontSize: '0.72rem', letterSpacing: '0.08em' } as const;
  const iconBtn = { display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--text-ghost)', transition: 'color 0.15s' } as const;

  const copyText = (t: string) => { try { void navigator.clipboard?.writeText(t); } catch { /* */ } };
  const copyArtifact = () => copyText(artifactText || '');
  const copyConvo = () => copyText((active?.messages || []).map((m) => `${m.role === 'you' ? 'You' : (who || 'PLM')}: ${m.text}`).join('\n\n'));
  const downloadArtifact = () => {
    if (!downloadBlob) return;
    const url = URL.createObjectURL(downloadBlob);
    const a = document.createElement('a');
    a.href = url; a.download = `${downloadName}.${downloadExt}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <ThemeToggle />
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-eb-garamond)', background: 'var(--bg-primary)' }}>
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 3.6rem 0.85rem 1.2rem', borderBottom: '1px solid var(--border-light)' }}>
          <Link href={backHref} aria-label={`back to ${backTitle}`} title={backTitle}
            style={{ color: 'var(--text-muted)', display: 'flex', textDecoration: 'none' }} className="hover:opacity-60">{ChevronIcon}</Link>
          <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{name}</span>
          <span style={{ ...label }}>{visibility}</span>
        </header>

        <div className="reader-tabs" style={{ display: 'none', flex: 'none', borderBottom: '1px solid var(--border-light)' }}>
          {(['piece', 'ask'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.7rem',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-ghost)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t === 'piece' ? 'read' : 'ask'}
            </button>
          ))}
        </div>

        <main style={{ flex: 1, display: 'flex', minHeight: 0 }} data-tab={tab}
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
                <button key={c.id} type="button" onClick={() => openChat(c.id)}
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
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0.7rem 1rem 0.4rem' }}>
              <button type="button" onClick={() => setMidOpen(false)} aria-label="collapse chat" title="collapse" style={iconBtn} className="hover:opacity-60">{LinesIcon}</button>
              {(active?.messages.length ?? 0) > 0 && (
                <ActionButton icon={CopyIcon} onAction={copyConvo} title="copy conversation" style={{ ...iconBtn, marginLeft: 'auto' }} className="hover:opacity-60" />
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
                        <ActionButton icon={CopyIcon} onAction={() => copyText(m.text)} title="copy" style={{ ...iconBtn, marginTop: '0.4rem', padding: 0 }} className="hover:opacity-60" />
                      </div>
                    )}
                </div>
              ))}
              {asking && <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>thinking…</p>}
            </div>
            <div style={{ flex: 'none', padding: '0.9rem 1.2rem', borderTop: '1px solid var(--border-light)' }}>
              <PromptBox ref={promptRef} value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking} placeholder={askPlaceholder} />
            </div>
          </section>

          {/* the piece — slot 3 */}
          <button type="button" className="reader-strip strip-right" style={{ order: 3 }} onClick={() => setRightOpen(true)} aria-label="open the piece" title="piece">{PaneRightIcon}</button>
          <article className="reader-pane pane-piece" style={{ order: 3, flex: '1 1 0', minWidth: 0, flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.7rem 1rem 0.4rem', borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ ...label, marginRight: 'auto' }}>{name}</span>
              {status === 'ok' && (
                <>
                  <ActionButton icon={CopyIcon} onAction={copyArtifact} title="copy text" style={iconBtn} className="hover:opacity-60" />
                  {downloadBlob && <ActionButton icon={DownloadIcon} onAction={downloadArtifact} title="download" style={iconBtn} className="hover:opacity-60" />}
                </>
              )}
              <button type="button" onClick={() => setRightOpen(false)} aria-label="collapse the piece" title="collapse" style={iconBtn} className="hover:opacity-60">{PaneRightIcon}</button>
            </div>
            <div style={{ flex: 1, overflow: pdfUrl ? 'hidden' : 'auto', minHeight: 0, padding: pdfUrl ? 0 : '2.2rem clamp(1.4rem, 5vw, 4rem)' }}>
              {status === 'loading' && <p style={{ color: 'var(--text-ghost)' }}>loading…</p>}
              {status === 'signin' && (
                <div style={{ maxWidth: '32rem' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>“{name}” is open to people {who} has invited. sign in to read it.</p>
                  {signInUrl && <a href={signInUrl} style={{ display: 'inline-block', marginTop: '1rem', borderRadius: '11px', background: 'var(--accent)', color: 'var(--bg-primary)', padding: '0.6rem 1.25rem', textDecoration: 'none' }}>sign in</a>}
                </div>
              )}
              {status === 'pay' && (
                <div style={{ maxWidth: '32rem' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>“{name}” is a paid piece.</p>
                  {checkoutUrl && <a href={checkoutUrl} style={{ display: 'inline-block', marginTop: '1rem', borderRadius: '11px', background: 'var(--accent)', color: 'var(--bg-primary)', padding: '0.6rem 1.25rem', textDecoration: 'none' }}>unlock it</a>}
                </div>
              )}
              {status === 'error' && <p style={{ color: 'var(--text-ghost)' }}>couldn’t load this piece.</p>}
              {status === 'ok' && (pdfUrl
                ? <iframe src={pdfUrl} title={name} style={{ width: '100%', height: '100%', border: 'none' }} />
                : <div className="reader-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown || ''}</ReactMarkdown></div>)}
            </div>
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

        .reader-strip { flex: none; width: 46px; display: flex; align-items: flex-start; justify-content: center; padding-top: 0.85rem;
          border: none; border-right: 1px solid var(--border-light); background: var(--bg-secondary); cursor: pointer; color: var(--text-muted); transition: color 0.15s, background 0.15s; }
        .reader-strip.strip-right { border-right: none; border-left: 1px solid var(--border-light); margin-left: auto; }
        .reader-strip:hover { color: var(--text-primary); background: var(--border-light); }

        @media (min-width: 901px) {
          .reader-tabs { display: none !important; }
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
          .reader-tabs { display: flex !important; }
          main { flex-direction: column !important; }
          .pane-chat, .pane-piece { display: none !important; width: 100% !important; flex: 1 1 auto !important; min-width: 0 !important; order: 0 !important; }
          main[data-tab="piece"] .pane-piece { display: flex !important; }
          main[data-tab="ask"] .pane-chat { display: flex !important; }
        }
      `}</style>
    </>
  );
}
