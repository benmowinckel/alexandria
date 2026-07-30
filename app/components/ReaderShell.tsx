'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from './ThemeToggle';
import PromptBox from './PromptBox';
import ActionButton from './ActionButton';
import TwinText from './TwinText';
import ChatHistoryItem from './ChatHistoryItem';
import { useRotatingPlaceholder, pieceExamples, readingExamples, readingLead } from '../lib/useRotatingPlaceholder';
import { composeHandoff, fetchHandoffContext, type HandoffAuthor } from '../lib/handoff';
import {
  processNumbered, TocBlock,
  MD_COMPONENTS, MD_COMPONENTS_NUMBERED, MD_COMPONENTS_NUMBERED_PRE, MD_COMPONENTS_ABSTRACT,
} from './MarkdownDoc';

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

/** 'note' is the reader-visible status of a question that never got answered
 *  — offline, timed out, errored. It is NOT a 'twin' message: rendering a
 *  failure as the mirror speaking makes an unreachable mind look like a mind
 *  that doesn't know (founder 2026-07-28, seen in production). */
type Msg = { role: 'you' | 'twin' | 'note'; text: string };

/** What an answer came back with, beyond the answer. */
export type AskResult = {
  answer: string;
  remaining?: number;
  limit?: number;
  model?: string | null;
  variant?: string | null;
  signed_in?: boolean;
};
type Convo = { id: string; messages: Msg[]; title?: string };

/** The one breakpoint, shared by the JS that has to know it and mirrored by
 *  the media queries below — the panes become tabs here. */
const PANES_MIN = 901;
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < PANES_MIN;

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ChevronIcon = <svg width="20" height="20" {...svgProps}><path d="M15 18l-6-6 6-6" /></svg>;
const PaneLeftIcon = <svg width="19" height="19" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></svg>;
const LinesIcon = <svg width="19" height="19" {...svgProps}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
const PaneRightIcon = <svg width="19" height="19" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></svg>;
// Handoff — an arrow leaving a box. Deliberately not a copy or download glyph:
// this is the conversation going somewhere else to be continued, not a file.
const HandoffIcon = <svg width="17" height="17" {...svgProps}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>;
const CopyIcon = <svg width="17" height="17" {...svgProps}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const DownloadIcon = <svg width="17" height="17" {...svgProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>;
const ExpandIcon = <svg width="17" height="17" {...svgProps}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /></svg>;
const CompressIcon = <svg width="17" height="17" {...svgProps}><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>;
// Share — the node graph, deliberately NOT the box+up-arrow (that reads as
// "upload" beside the box+down-arrow download icon). Shares the artifact's
// canonical URL so the recipient lands back inside Alexandria, not a loose file.
const ShareIcon = <svg width="17" height="17" {...svgProps}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>;

/**
 * PdfView — renders a PDF as fit-to-width canvas pages stacked vertically, so it
 * scrolls DOWN like a document on every device. Replaces `<iframe src=pdf>`,
 * which on iOS Safari shows a zoomed, pan-in-all-directions, first-page-only
 * preview (the letter bug). Re-renders on width change (pane resize / rotate).
 */
export function PdfView({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState(false);
  const widthRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el || !url) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let doc: any = null;
    const renderAll = async (w: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfjs: any = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';  // served statically (reliable in Next)
      if (!doc) {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        doc = await pdfjs.getDocument({ data: bytes }).promise;
      }
      if (cancelled || !ref.current) return;
      const colW = Math.min(Math.max(w - 24, 200), 820);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ref.current.innerHTML = '';
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (colW / base.width) * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.cssText = `width:${colW}px;height:auto;display:block;margin:0 auto 14px;box-shadow:0 1px 8px rgba(40,30,20,0.12)`;
        const ctx = canvas.getContext('2d');
        if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled && ref.current) ref.current.appendChild(canvas);
      }
    };
    (async () => { try { widthRef.current = el.clientWidth; await renderAll(el.clientWidth || 800); } catch { if (!cancelled) setErr(true); } })();
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - widthRef.current) < 40) return;
      widthRef.current = w;
      clearTimeout(t); t = setTimeout(() => { renderAll(w).catch(() => setErr(true)); }, 200);
    });
    ro.observe(el);
    return () => { cancelled = true; ro.disconnect(); clearTimeout(t); };
  }, [url]);
  return (
    <div ref={ref} style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-secondary)', padding: '16px 12px' }}>
      {err && <p style={{ color: 'var(--text-ghost)', textAlign: 'center', paddingTop: '2rem' }}>couldn’t render the PDF.</p>}
    </div>
  );
}

export type ReaderShellProps = {
  name: string;                                   // display title
  backHref: string;                               // chevron destination
  backTitle: string;                              // chevron tooltip ("library" / "alexandria")
  visibility?: string;                            // header tag
  status: 'loading' | 'ok' | 'signin' | 'pay' | 'error';
  pdfUrl?: string;                                // set → render as PDF
  markdown?: string;                              // set → render as markdown
  /** Book setting for long-form docs (the whitepaper). Runs the markdown
   *  through MarkdownDoc's numbered pipeline — strips the `## contents.`
   *  stub and injects the real TOC, hangs part/chapter numerals in the
   *  margin, and splits everything after `<!-- colophon -->` into its own
   *  end plate. Without it those sentinels render literally (a bare
   *  "contents." heading, a visible HTML comment over the signature). */
  numbered?: boolean;
  /** With `numbered`: the plain variant of the book setting (ragged-right,
   *  no per-section initials) — the whitepaper's approved register. */
  plain?: boolean;
  artifactText?: string;                          // text for the copy button
  downloadBlob?: Blob | null;
  downloadName?: string;                          // filename base
  downloadExt?: string;                           // 'pdf' | 'md'
  signInUrl?: string;
  checkoutUrl?: string;
  who?: string;                                   // whose piece (signin/pay copy)
  askPlaceholder?: string;
  /** Suggested questions this piece carries (the Artifact Loop's `.questions`
   *  sidecar) — they lead the rotating ghost text so the prompts are true to
   *  the piece and answerable from the same context. Falls back to generic. */
  askQuestions?: string[];
  /** The twin call (the wrapper decides which mind). Returning the richer shape
   *  lets the reader see what answered and what's left of their allowance; a
   *  bare string still works. Throw with `allowanceSpent` to trigger the handoff. */
  askFn: (question: string) => Promise<string | AskResult>;
  /** Whose mind this is — enables the handoff (their public shadow + works).
   *  Without it the reader can still take the piece and the conversation. */
  handoffAuthorId?: string;
  /** What this reader has left before they've asked anything. Without it the
   *  allowance is only discoverable by hitting it. */
  initialBudget?: { remaining: number; limit: number; signedIn: boolean } | null;
  intro?: React.ReactNode;                        // chat empty-state (who you're talking to + CTAs)
  /** One plain line naming what the mirror is, pinned above the thread so it
   *  survives the first question — see the render. Keep it to a sentence. */
  mirrorNote?: React.ReactNode;
  askFirst?: boolean;                             // open with the ask pane up (mirror-led pages)
  /** Dock the composer under the piece while the mirror is collapsed — the
   *  whitepaper and the letter only. They're the two surfaces that open on a
   *  closed mirror and a long read, so the ask has to be present without a
   *  label. Everywhere else already carries it: the mirror-led pages open
   *  with the pane up, and the Library reader opens on a chosen artifact
   *  (founder 2026-07-27). */
  dockedAsk?: boolean;
  footerCta?: string;                             // surface-fitting foot label (SiteFooter doctrine)
  /** Library-only: the invite-code entry, slotted under the sign-in CTA when an
   *  invite-gated piece is opened signed-out. The wrapper owns the field + the
   *  unlock submit; the shell just gives it a home on the sign-in wall so a
   *  reader always has a place to put their code. Website doc readers (always
   *  public) never reach the signin state, so they never pass this. */
  inviteField?: React.ReactNode;
};

export default function ReaderShell({
  name, backHref, backTitle, visibility = 'public', status, pdfUrl, markdown,
  numbered = false, plain = false,
  artifactText = '', downloadBlob, downloadName = 'document', downloadExt = 'md',
  signInUrl = '', checkoutUrl = '', who = '', askPlaceholder = 'ask about this piece…', askQuestions, askFn,
  intro, mirrorNote, inviteField, askFirst = false, dockedAsk = false, footerCta = 'build your own',
  handoffAuthorId, initialBudget = null,
}: ReaderShellProps) {
  const book = useMemo(
    () => (numbered && markdown ? processNumbered(markdown) : null),
    [numbered, markdown]
  );
  const [leftOpen, setLeftOpen] = useState(false);   // history
  const [midOpen, setMidOpen] = useState(askFirst);  // chat (askFirst pages open on it)
  const [rightOpen, setRightOpen] = useState(true);  // the piece
  const [tab, setTab] = useState<'piece' | 'ask'>(askFirst ? 'ask' : 'piece'); // mobile
  const [expanded, setExpanded] = useState(false);   // full-screen the piece

  // Full-screen the doc: CSS immersive (fills the viewport, works on every
  // device incl. iOS which has no element Fullscreen API) + true browser
  // fullscreen on desktop as a bonus. The request must run in the click's
  // user-gesture, so it lives in the handler, not an effect.
  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      const el = document.documentElement;
      if (next) el.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } catch { /* iOS Safari / denied: the CSS immersive layer still applies */ }
  };
  // Keep the two in sync: ESC or leaving native fullscreen (F11/OS chrome)
  // drops us out of the immersive layer too.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    const onFs = () => { if (!document.fullscreenElement) setExpanded(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs); };
  }, [expanded]);

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
    const mobile = isNarrow();
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
    if (isNarrow()) setTab('ask');
  };
  // Rename sets a title the reader owns; an empty name falls back to the
  // derived first-line. Delete drops the chat, minting a fresh empty one if it
  // was the last so the pane is never bare.
  const renameChat = (id: string, title: string) =>
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  const deleteChat = (id: string) =>
    setConvos((cs) => {
      const next = cs.filter((c) => c.id !== id);
      return next.length ? next : [{ id: String(idRef.current++), messages: [] }];
    });
  // Keep the active id valid after a delete (the render already falls back to
  // convos[0], this just realigns the highlight).
  useEffect(() => {
    if (!convos.some((c) => c.id === activeId)) setActiveId(convos[0]?.id ?? '1');
  }, [convos, activeId]);

  // The composer's ghost text rotates through example questions about the piece
  // in view; it pauses the moment the reader starts typing.
  const askExamples = useMemo(() => pieceExamples(who, askQuestions), [who, askQuestions]);
  const rotatingPlaceholder = useRotatingPlaceholder(askExamples, !question.trim());
  // The docked line runs its own cycle, led once by what this is — see
  // readingExamples. Its own hook so opening the pane doesn't inherit the
  // framing line into the chat composer, which already has the intro.
  const readExamples = useMemo(() => readingExamples(who, askQuestions), [who, askQuestions]);
  const readingPlaceholder = useRotatingPlaceholder(readExamples, !question.trim());
  // Every line in that rotation is a question you can take with tab — except
  // the lead, which describes the mirror rather than asking it anything.
  const readingIsQuestion = readingPlaceholder !== readingLead(who);

  // One line for every failure, and it says offline. The server distinguishes
  // offline from timeout from upstream error and keeps that in `reason` for us,
  // but a reader has no use for the taxonomy — "an error occurred" doesn't tell
  // them whether to come back. Offline is the true shape of all of them from
  // where they stand (founder 2026-07-28: "just say its offline. even if it is
  // an error"). Never a pronoun for the Author: a mirror belongs to anyone.
  const offlineNote = who
    ? `${who}’s mirror is offline — your question wasn’t answered. It runs on a personal machine, so it isn’t always up.`
    : 'This mirror is offline — your question wasn’t answered. It runs on a personal machine, so it isn’t always up.';

  // What's left of this reader's allowance, and what has been answering. Both
  // come back with the answers themselves — no extra request, and no number the
  // client could be wrong about.
  const [budget, setBudget] = useState<{ remaining: number; limit: number; signedIn: boolean } | null>(initialBudget);
  useEffect(() => { if (initialBudget) setBudget((b) => b ?? initialBudget); }, [initialBudget]);
  const [answeredBy, setAnsweredBy] = useState<{ model: string | null; variant: string | null } | null>(null);
  const [handoffCtx, setHandoffCtx] = useState<HandoffAuthor | null>(null);
  const spent = budget !== null && budget.remaining <= 0;

  // The Author's public half of the handoff, fetched once and only when it's
  // first wanted — most readers never reach for it.
  const loadHandoff = async (): Promise<HandoffAuthor | null> => {
    if (handoffCtx || !handoffAuthorId) return handoffCtx;
    const ctx = await fetchHandoffContext(handoffAuthorId);
    if (ctx) setHandoffCtx(ctx);
    return ctx;
  };

  // Everything the reader needs to carry on somewhere else, on the clipboard.
  const takeItWithYou = async () => {
    const ctx = await loadHandoff();
    copyText(composeHandoff({
      ctx,
      piece: artifactText ? { name, content: artifactText } : null,
      messages: active?.messages || [],
      model: answeredBy?.model,
      variant: answeredBy?.variant,
    }));
  };

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;
    const targetId = activeId;
    setAsking(true);
    setQuestion('');
    setMidOpen(true);
    setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'you', text }] } : c)));
    if (isNarrow()) setTab('ask');
    const add = (m: Msg) => setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, m] } : c)));
    try {
      const res = await askFn(text);
      const out: AskResult = typeof res === 'string' ? { answer: res } : res;
      add({ role: 'twin', text: out.answer });
      if (typeof out.remaining === 'number' && typeof out.limit === 'number') {
        setBudget({ remaining: out.remaining, limit: out.limit, signedIn: !!out.signed_in });
      }
      if (out.model) setAnsweredBy({ model: out.model, variant: out.variant ?? null });
    } catch (e) {
      // Out of questions is not a failure — it's the handoff moment. The mirror
      // says so in its own voice and the door is already on screen.
      const err = e as { allowanceSpent?: boolean; message?: string; limit?: number; signedIn?: boolean };
      if (err?.allowanceSpent) {
        setBudget({ remaining: 0, limit: err.limit ?? 0, signedIn: !!err.signedIn });
        add({ role: 'note', text: err.message || 'You’ve used your questions for today — take the conversation with you.' });
      } else {
        add({ role: 'note', text: offlineNote });
      }
    } finally {
      setAsking(false);
    }
  };

  const label = { color: 'var(--text-ghost)', fontSize: '0.72rem', letterSpacing: '0.08em' } as const;
  const iconBtn = { display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--text-ghost)', transition: 'color 0.15s' } as const;
  // One header grammar for all three panes: faint label left, icons right,
  // collapse always last. Identical metrics so the three border-bottoms
  // fuse into a single continuous rule across the reader — one line, not
  // three (founder 2026-07-25: consistent little headers, no line clutter).
  const paneHead = { flex: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.7rem 1rem 0.4rem', minHeight: '2.4rem', boxSizing: 'border-box', borderBottom: '1px solid var(--border-light)' } as const;

  const copyText = (t: string) => { try { void navigator.clipboard?.writeText(t); } catch { /* */ } };
  const copyArtifact = () => copyText(artifactText || '');
  // The mirror speaks as the mirror in a paste too — never as the Author
  // themself (founder 2026-07-28: "its my mirror, not me"). Notes carry no
  // speaker at all; nobody said them.
  const speaker = who ? `${who}’s mirror` : 'the mirror';
  const copyConvo = () => copyText((active?.messages || [])
    .map((m) => (m.role === 'note' ? `[${m.text}]` : `${m.role === 'you' ? 'You' : speaker}: ${m.text}`))
    .join('\n\n'));
  const downloadArtifact = () => {
    if (!downloadBlob) return;
    const url = URL.createObjectURL(downloadBlob);
    const a = document.createElement('a');
    a.href = url; a.download = `${downloadName}.${downloadExt}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Share the canonical artifact URL — keeps the recipient inside Alexandria
  // (they open the reader, can ask the mind, then download the file themselves
  // if they want the object). Native share sheet on mobile; copy-link fallback
  // on desktop (the ActionButton tick confirms the copy). A cancelled share
  // (AbortError) must NOT silently copy — only a real failure falls back.
  const shareArtifact = () => {
    if (typeof window === 'undefined') return;
    const url = window.location.origin + window.location.pathname;
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      void nav.share({ title: name, url }).catch((err: unknown) => {
        if (!(err instanceof Error) || err.name !== 'AbortError') copyText(url);
      });
    } else {
      copyText(url);
    }
  };

  return (
    <>
      {/* Full screen strips all surrounding chrome (footer, panes, strips) so the
          piece owns the viewport — the theme toggle is chrome too, and it lives in
          the same top-right corner as the piece's own controls. Hiding it while
          expanded keeps that corner clear so the shrink control stays clickable
          (it used to sit under the fixed toggle) — the toggle returns on exit. */}
      {!expanded && <ThemeToggle />}
      <div className="reader-shell" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-eb-garamond)', background: 'var(--bg-primary)' }}>
        <header style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: '0.9rem', padding: '0.85rem 3.6rem 0.85rem 1.2rem', borderBottom: '1px solid var(--border-light)' }}>
          <Link href={backHref} aria-label={`back to ${backTitle}`} title={backTitle}
            style={{ color: 'var(--text-muted)', display: 'flex', alignSelf: 'center', textDecoration: 'none' }} className="hover:opacity-60">{ChevronIcon}</Link>
          <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{name}</span>
          <span style={{ ...label }}>{visibility}</span>
        </header>

        <div className="reader-tabs" style={{ display: 'none', flex: 'none', borderBottom: '1px solid var(--border-light)' }}>
          {(['ask', 'piece'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.7rem',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-ghost)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t === 'piece' ? 'read' : 'ask the mirror'}
            </button>
          ))}
        </div>

        <main style={{ flex: 1, display: 'flex', minHeight: 0 }} data-tab={tab} data-expanded={expanded ? 'true' : 'false'}
          data-left={leftOpen ? 'open' : 'closed'} data-mid={midOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>

          {/* history — slot 1 */}
          <button type="button" className="reader-strip strip-history" style={{ order: 1 }} onClick={() => setLeftOpen(true)} aria-label="open history" title="history">{PaneLeftIcon}</button>
          <aside className="reader-pane pane-history" style={{ order: 1, flex: 'none', width: '240px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={paneHead}>
              <button type="button" onClick={() => setLeftOpen(false)} aria-label="collapse history" title="collapse" style={iconBtn} className="hover:opacity-60">{PaneLeftIcon}</button>
              <span style={label}>history</span>
              <button type="button" onClick={newChat} aria-label="new conversation" title="new conversation"
                style={{ ...iconBtn, marginLeft: 'auto', fontSize: '1.05rem', lineHeight: 1 }} className="hover:opacity-60">＋</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '0.2rem 0.6rem 1rem' }}>
              {convos.map((c) => (
                <ChatHistoryItem key={c.id} convo={c} active={c.id === activeId}
                  onOpen={openChat} onRename={renameChat} onDelete={deleteChat} />
              ))}
            </div>
          </aside>

          {/* chat — slot 2. The strip carries a faint accent wash so the eye
              knows which of the three matters; the words that explain it are
              the whisper in the piece header, which fades on its own. */}
          <button type="button" className="reader-strip strip-chat" style={{ order: 2 }} onClick={() => setMidOpen(true)} aria-label="open the mirror — ask about this piece" title="ask the mirror about this">{LinesIcon}</button>
          <section className="reader-pane pane-chat" style={{ order: 2, flex: '1 1 0', minWidth: '340px', flexDirection: 'column', borderRight: '1px solid var(--border-light)', minHeight: 0 }}>
            <div style={paneHead}>
              <button type="button" onClick={() => setMidOpen(false)} aria-label="collapse the mirror" title="collapse" style={iconBtn} className="chat-collapse hover:opacity-60">{LinesIcon}</button>
              {/* Not "ask benjamin" — the product is a MIRROR of a mind,
                  never a twin or stand-in (canon; founder 2026-07-25:
                  "this is so key. its the mirror"). One universal label. */}
              <span style={label}>the mirror</span>
              {/* What's left, shown only once it's worth knowing. A counter that
                  sits there from question one reads as a meter running down;
                  silence until the last few reads as room to think, and then as
                  a heads-up. The handoff is always offered — a reader may want
                  their own model long before they run out. */}
              {budget && budget.remaining <= 3 && (
                <>
                  <span aria-hidden style={{ ...label, margin: '0 0.15rem', color: 'var(--text-ghost)' }}>·</span>
                  <span style={{ ...label, color: spent ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {spent ? 'out of questions' : `${budget.remaining} left`}
                  </span>
                </>
              )}
              <ActionButton icon={HandoffIcon} onAction={() => void takeItWithYou()}
                title="take it with you — copies the mind, the piece and this conversation for your own ai"
                style={{ ...iconBtn, marginLeft: 'auto', color: spent ? 'var(--accent)' : undefined }} className="hover:opacity-60" />
              {(active?.messages.length ?? 0) > 0 && (
                <ActionButton icon={CopyIcon} onAction={copyConvo} title="copy conversation" style={iconBtn} className="hover:opacity-60" />
              )}
            </div>
            {/* What you're talking to, said once and KEPT. It used to live in the
                empty state, so asking from the document — which opens this pane
                mid-question — erased the only explanation at the exact moment a
                first-timer needed it (founder 2026-07-28, from production). It
                sits above the thread now: outside the scroll, never scrolled
                away, one quiet line. */}
            {mirrorNote && (
              <p className="mirror-note">{mirrorNote}</p>
            )}
            <div ref={threadRef} style={{ flex: 1, overflow: 'auto', padding: '0.4rem 1.4rem 1.4rem' }}>
              {intro && (active?.messages.length ?? 0) === 0 && !asking && (
                <div style={{ padding: '0.6rem 0 0.2rem' }}>{intro}</div>
              )}
              {active?.messages.map((m, i) => (
                <div key={i} style={{ margin: '0 0 1.1rem' }}>
                  {m.role === 'note'
                    // Not the mirror talking: no accent rule, no copy button,
                    // no name — a plain status about what happened to the
                    // question, so offline never reads as "I don't know".
                    ? <p className="mirror-status">{m.text}</p>
                    : m.role === 'you'
                    ? <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>{m.text}</p>
                    : (
                      <>
                        <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.9rem', color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}><TwinText text={m.text} /></div>
                        <ActionButton icon={CopyIcon} onAction={() => copyText(m.text)} title="copy" style={{ ...iconBtn, marginTop: '0.45rem', marginLeft: '0.9rem', padding: 0 }} className="hover:opacity-60" />
                      </>
                    )}
                </div>
              ))}
              {asking && <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>thinking…</p>}
            </div>
            <div style={{ flex: 'none', padding: '0.9rem 1.2rem', borderTop: '1px solid var(--border-light)' }}>
              {spent ? (
                // A dead input the reader can still type into is a trap, and a
                // bare button is a shrug — at the one moment someone is stuck,
                // say what the thing does and what to do with it. Two plain
                // sentences, one button, one alternative (founder 2026-07-29).
                <div>
                  {/* What, why, then the two ways forward. The why matters —
                      a cap with no reason reads as arbitrary — but it isn't
                      about any one Author or an exact number, so it says
                      neither. And someone who just asked their way through a
                      day's allowance has already shown the interest: the second
                      door is the product itself (founder 2026-07-29). */}
                  <p style={{ margin: '0 0 0.3rem', color: 'var(--text-primary)', fontSize: '0.98rem', lineHeight: 1.5 }}>
                    You’re out of questions for now.
                  </p>
                  <p style={{ margin: '0 0 0.85rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.55, textWrap: 'pretty' }}>
                    Answers cost money to run, so everyone gets a few a day. You don’t have to wait —
                    take the conversation to your own ai and keep going there.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
                    <ActionButton icon={HandoffIcon} label="continue in your own ai" doneLabel="copied — paste it into your ai"
                      onAction={() => void takeItWithYou()}
                      title="copies this chat, the piece and the writing behind it — paste it into ChatGPT, Claude, or whatever you use"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                        background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderRadius: '999px', padding: '0.4rem 0.85rem',
                        color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}
                      className="hover:opacity-75" />
                  </div>
                  <p style={{ margin: '0.85rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.55, textWrap: 'pretty' }}>
                    Or stop asking about it and try it — <Link href="/start" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="hover:opacity-70">make your own mirror</Link>.
                    It’s free, and it’s the fastest way to see what this is.
                  </p>
                </div>
              ) : (
                <PromptBox ref={promptRef} value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking} placeholder={rotatingPlaceholder || askPlaceholder} />
              )}
            </div>
          </section>

          {/* the piece — slot 3 */}
          <button type="button" className="reader-strip strip-right" style={{ order: 3 }} onClick={() => setRightOpen(true)} aria-label="open the piece" title="read">{PaneRightIcon}</button>
          <article className="reader-pane pane-piece" style={{ order: 3, flex: '1 1 0', minWidth: 0, flexDirection: 'column', minHeight: 0 }}>
            <div className="piece-head" style={paneHead}>
              <span style={{ ...label, marginRight: 'auto' }}>{name}</span>
              {status === 'ok' && (
                <>
                  <ActionButton icon={CopyIcon} onAction={copyArtifact} title="copy text" style={iconBtn} className="hover:opacity-60" />
                  {downloadBlob && <ActionButton icon={DownloadIcon} onAction={downloadArtifact} title="download" style={iconBtn} className="hover:opacity-60" />}
                  <ActionButton icon={ShareIcon} onAction={shareArtifact} title="share link" style={iconBtn} className="hover:opacity-60" />
                  <button type="button" onClick={toggleExpand} aria-label={expanded ? 'exit full screen' : 'full screen'} title={expanded ? 'exit full screen' : 'full screen'} style={iconBtn} className="hover:opacity-60">{expanded ? CompressIcon : ExpandIcon}</button>
                </>
              )}
              <button type="button" onClick={() => setRightOpen(false)} aria-label="collapse the piece" title="collapse" style={iconBtn} className="piece-collapse hover:opacity-60">{PaneRightIcon}</button>
            </div>
            {/* With the ask docked below, the text fades out as it reaches it
                rather than being sliced mid-line by the scroll edge — the
                separation is a dissolve, not another rule. */}
            <div className={dockedAsk && !midOpen && !pdfUrl ? 'piece-fade' : undefined}
              style={{ flex: 1, overflow: pdfUrl ? 'hidden' : 'auto', minHeight: 0, padding: pdfUrl ? 0 : '2.2rem clamp(1.4rem, 5vw, 4rem)' }}>
              {status === 'loading' && <p style={{ color: 'var(--text-ghost)' }}>loading…</p>}
              {status === 'signin' && (
                <div style={{ maxWidth: '32rem' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>
                    {visibility === 'invite'
                      ? <>“{name}” is open to people {who} has invited. sign in to read it, or enter your invite code.</>
                      : visibility === 'paid'
                        ? <>“{name}” is a paid piece. sign in to unlock it.</>
                        : <>“{name}” is open to Authors. sign in to read it.</>}
                  </p>
                  {signInUrl && <a href={signInUrl} style={{ display: 'inline-block', marginTop: '1rem', borderRadius: '11px', background: 'var(--accent)', color: 'var(--bg-primary)', padding: '0.6rem 1.25rem', textDecoration: 'none' }}>sign in</a>}
                  {inviteField}
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
                ? <PdfView url={pdfUrl} />
                : book ? (
                  <>
                    {/* The book setting (the whitepaper) — same pipeline and classes
                        as MarkdownDoc's numbered mode, so the genesis CSS applies
                        unchanged inside the pane. The colophon sits OUTSIDE the
                        article div: the signature's :last-child styling depends on
                        the sign-off being the article's final paragraph. */}
                    <div className={`reader-book mdoc-article pdoc pdoc-longform pdoc-numbered${plain ? ' pdoc-plain' : ''}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS_NUMBERED_PRE}>
                        {book.pre}
                      </ReactMarkdown>
                      {book.frontispiece && (
                        <section className="pdoc-frontispiece" aria-label="In brief">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{book.frontispiece}</ReactMarkdown>
                        </section>
                      )}
                      {book.abstract && (
                        <section className="pdoc-abstract" aria-label="Abstract">
                          <p className="pdoc-abstract-label">abstract.</p>
                          <div className="pdoc-abstract-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS_ABSTRACT}>{book.abstract}</ReactMarkdown>
                          </div>
                        </section>
                      )}
                      {book.toc.length > 0 && <TocBlock entries={book.toc} />}
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS_NUMBERED}>
                        {book.post}
                      </ReactMarkdown>
                    </div>
                    {book.colophon && (
                      <section className="reader-book pdoc pdoc-colophon" aria-label="Begin">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{book.colophon}</ReactMarkdown>
                      </section>
                    )}
                  </>
                )
                : <div className="reader-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown || ''}</ReactMarkdown></div>)}
            </div>
            {/* The ask, docked under the document, while the mirror is closed.
                Not a label about the mirror — the mirror itself, one line of it,
                sitting under the text the way a question would. Nothing to teach
                and nothing to dismiss: a line with a question already in it is
                its own instruction, and it stays the tool on the hundredth visit
                (founder 2026-07-27 — the labels and the fading whisper both read
                as onboarding). Bare: no box, no button, no rule above it — one
                hairline under the words, the same width as the text column, so
                it reads as the next line of the page. Typing here opens the pane
                with the answer, so it doubles as the way in. */}
            {dockedAsk && status === 'ok' && !midOpen && (
              <div className="piece-ask">
                <PromptBox bare value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking}
                  placeholder={readingPlaceholder || askPlaceholder} fillable={readingIsQuestion}
                  ariaLabel="ask about this piece" />
              </div>
            )}
          </article>
        </main>
        {/* Slim footer to frame the reader even with the panes open — the one
            CTA (build your own) + the wordmark home, matching the profile and
            PLM three-pane pages (founder 2026-07-19). Drops out in full screen. */}
        <footer style={{ flex: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.6rem', padding: '1rem 1.2rem', borderTop: '1px solid var(--border-light)' }}>
          <Link href="/start" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }} className="hover:opacity-60">{footerCta}</Link>
          <Link href="/" style={{ fontStyle: 'italic', color: 'var(--text-ghost)', fontSize: '0.85rem', textDecoration: 'none' }} className="hover:opacity-60">alexandria<span style={{ fontStyle: 'normal' }}>.</span></Link>
        </footer>
      </div>

      <style>{`
        .reader-book { max-width: 680px; margin: 0 auto; }
        .reader-prose { color: var(--text-secondary); font-size: 1.05rem; line-height: 1.75; max-width: 42rem; margin: 0 auto; text-wrap: pretty; }
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

        /* The docked ask — held to the text column, separated by space rather
           than a rule (the footer's line already closes the page). */
        /* The pinned line above the thread, and the status of a question that
           never got answered — both quieter than anything either party said. */
        .mirror-note { flex: none; margin: 0; padding: 0.6rem 1.4rem 0.75rem; color: var(--text-ghost);
          font-size: 0.86rem; line-height: 1.5; font-style: italic; text-wrap: pretty; }
        .mirror-status { margin: 0; padding: 0.15rem 0 0.15rem 0.9rem; border-left: 2px solid var(--border-light);
          color: var(--text-ghost); font-size: 0.9rem; line-height: 1.6; font-style: italic; text-wrap: pretty; }

        .piece-ask { flex: none; width: min(680px, 100% - 2.8rem); margin: 0 auto; padding: 0.55rem 0 1.15rem; }
        .piece-fade { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 2.4rem), transparent);
          mask-image: linear-gradient(to bottom, #000 calc(100% - 2.4rem), transparent); }

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
          .chat-collapse, .piece-collapse { display: none !important; }
          .reader-tabs { display: flex !important; }
          /* Mobile keeps the docked ask too — same model, one thumb away: the
             tab is for going to the conversation, this is for asking without
             leaving the page you're reading. Type size is NOT reduced here —
             iOS zooms the whole page when a focused input is under 16px, and
             1.05rem clears it. The line fits instead by rotating shorter
             questions (readingExamples' compact set). */
          .piece-ask { width: calc(100% - 2.4rem); padding: 0.45rem 0 0.85rem; }
          main { flex-direction: column !important; }
          .pane-chat, .pane-piece { display: none !important; width: 100% !important; flex: 1 1 auto !important; min-width: 0 !important; order: 0 !important; }
          main[data-tab="piece"] .pane-piece { display: flex !important; }
          main[data-tab="ask"] .pane-chat { display: flex !important; }
        }

        /* Full screen — the piece fills the whole viewport on every device; the
           other panes, strips, and tabs drop out. Wins both media queries. */
        main[data-expanded="true"] .pane-piece {
          display: flex !important; position: fixed !important;
          top: 0 !important; left: 0 !important; width: 100vw !important; height: 100dvh !important;
          min-width: 0 !important; z-index: 120; background: var(--bg-primary);
        }
        main[data-expanded="true"] .reader-strip,
        main[data-expanded="true"] .pane-history,
        main[data-expanded="true"] .pane-chat,
        /* Full screen is pure reading — and the mirror pane it would answer
           into is hidden here, so the composer goes with it. */
        main[data-expanded="true"] .piece-ask,
        main[data-expanded="true"] .piece-collapse { display: none !important; }
        .reader-shell:has(main[data-expanded="true"]) > footer { display: none !important; }
      `}</style>
    </>
  );
}
