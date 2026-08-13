'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from '../../../components/ThemeToggle';
import PromptBox from '../../../components/PromptBox';
import ActionButton from '../../../components/ActionButton';
import TwinText from '../../../components/TwinText';
import ChatHistoryItem from '../../../components/ChatHistoryItem';
import { PdfView } from '../../../components/ReaderShell';
import { useRotatingPlaceholder, authorExamples, pieceExamples, readingExamples, readingLead } from '../../../lib/useRotatingPlaceholder';
import { librarySignInUrlHere } from '../../../lib/config';
import { composeHandoff, copyToClipboard, fetchHandoffContext, type HandoffAuthor } from '../../../lib/handoff';
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

/** 'note' — the status of a question that never got answered (mirror offline,
 *  timed out, errored). Never rendered as the mirror speaking: an unreachable
 *  mind must not read as a mind that doesn't know (founder 2026-07-28). */
type Msg = { role: 'you' | 'twin' | 'note'; text: string };
type Convo = { id: string; messages: Msg[]; title?: string };
type FileMeta = { name: string; visibility?: string; title?: string | null; category?: string };
type LinkedSurface = { label: string; url: string };
type OpenPiece = { name: string; nice: string; content: string; pdfUrl: string; loading: boolean };

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ChevronIcon = <svg width="20" height="20" {...svgProps}><path d="M15 18l-6-6 6-6" /></svg>;
const PaneLeftIcon = <svg width="17" height="17" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></svg>;
const LinesIcon = <svg width="17" height="17" {...svgProps}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
const PaneRightIcon = <svg width="17" height="17" {...svgProps}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></svg>;
// Handoff — an arrow leaving a box (identical to ReaderShell's: one gesture,
// one glyph, wherever a mind can be carried away).
const HandoffIcon = <svg width="17" height="17" {...svgProps}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>;
const CopyIcon = <svg width="17" height="17" {...svgProps}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const DownloadIcon = <svg width="17" height="17" {...svgProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>;
const ExpandIcon = <svg width="17" height="17" {...svgProps}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /></svg>;
const CompressIcon = <svg width="17" height="17" {...svgProps}><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>;

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
  // Suggested questions the Author's published artifacts carry (the Artifact
  // Loop's `.questions` sidecars, aggregated server-side into twin.questions).
  // Empty until the pipeline emits them → the rotation falls back to generic.
  const [askQuestions, setAskQuestions] = useState<string[]>([]);
  const [variants, setVariants] = useState<TwinVariantSummary[]>([]);
  const [activeVariant, setActiveVariant] = useState<'weights' | 'context'>('context');

  const [leftOpen, setLeftOpen] = useState(false);
  const [midOpen, setMidOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [open, setOpen] = useState<OpenPiece | null>(null);
  const [mtab, setMtab] = useState<'chat' | 'pieces'>('chat'); // mobile
  const [expanded, setExpanded] = useState(false);             // full-screen the open piece

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
  // Arrived from the profile door WITH a question (?q=)? Then never show the
  // first-timer explainer — it would flash for the mind-load window and vanish
  // the instant the question fires, which reads as a glitch (founder 2026-07-18).
  const [cameWithQuestion, setCameWithQuestion] = useState(false);
  const [beliCopied, setBeliCopied] = useState(false);  // pane links: Beli click-to-reveal
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const v = q.get('variant'); if (v === 'weights' || v === 'context') setActiveVariant(v);
      const inv = q.get('invite')?.trim(); if (inv) { setInvite(inv); setInviteDraft(inv); }
      const asked = q.get('q')?.trim(); if (asked) { setPendingQ(asked); setCameWithQuestion(true); }
    } catch { /* */ }
  }, []);

  const who = authorName || author;
  // One public mind; DEPTH is structural per querier (public shadow for anyone,
  // the deeper invite shadow for granted friends — server-side). The header
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
      const tq = dir?.twin?.questions;
      setAskQuestions(Array.isArray(tq) ? tq.filter((q: unknown): q is string => typeof q === 'string') : []);
      const vs: TwinVariantSummary[] = Array.isArray(dir?.twin?.variants) ? dir.twin.variants : [];
      setVariants(vs);
      // Known before the first question, not discovered by hitting the wall.
      if (typeof dir?.twin?.remaining === 'number' && typeof dir?.twin?.limit === 'number') {
        setBudget({ remaining: dir.twin.remaining, limit: dir.twin.limit, signedIn: !!dir.twin.signed_in });
      }
      // Open on a mind the viewer can actually use; fall back to the first
      // unlockable one so a fully-gated twin still lands somewhere.
      const first = vs.find((v) => v.enabled && v.accessible) || vs.find((v) => v.enabled && v.needsInvite);
      if (first) setActiveVariant(first.variant);
    })();
    return () => { live = false; };
  }, [author]);

  // An answer lands at its own top — see ReaderShell. Only your own turn
  // scrolls to the bottom.
  const lastMsgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = threadRef.current;
    if (!box) return;
    const msgs = active?.messages || [];
    const last = msgs[msgs.length - 1];
    const el = lastMsgRef.current;
    if (last && last.role !== 'you' && el) box.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: 'smooth' });
    else box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [active?.messages, asking]);

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

  // Full-screen the open piece: CSS immersive (fills the viewport, works on every
  // device incl. iOS which has no element Fullscreen API) + true browser
  // fullscreen on desktop as a bonus. The request must run in the click's
  // user-gesture, so it lives in the handler, not an effect. Mirrors ReaderShell.
  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      const el = document.documentElement;
      if (next) el.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } catch { /* iOS Safari / denied: the CSS immersive layer still applies */ }
  };
  // Drop out of the immersive layer when the piece closes, or on ESC / leaving
  // native fullscreen (F11 / OS chrome).
  useEffect(() => { if (!open) setExpanded(false); }, [open]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    const onFs = () => { if (!document.fullscreenElement) setExpanded(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs); };
  }, [expanded]);

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
  // Linked surfaces the answer names get an "open …" chip too — the mind
  // routes you OUT to the artifact, not only talks about it (locked platforms
  // can't render in the pane, so these open in a new tab).
  const referencedLinks = (text: string) => {
    const lc = text.toLowerCase();
    return linked.filter((l) => {
      const label = l.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const domain = l.url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
      // Whole-word match on the label so a one-letter label like "x" doesn't match
      // every answer that merely contains the letter x (the 'always open x' bug,
      // founder 2026-07-19). Domain match stays substring (it's specific enough).
      return new RegExp(`(^|[^a-z0-9])${label}([^a-z0-9]|$)`).test(lc) || lc.includes(domain);
    });
  };

  const newChat = () => {
    const id = String(idRef.current++);
    setConvos((cs) => [{ id, messages: [] }, ...cs]);
    setActiveId(id);
    setQuestion('');
  };
  // Rename sets a reader-owned title (empty → derived first-line); delete drops
  // the chat, minting a fresh empty one if it was the last so the pane is never
  // bare. The effect below realigns the active id after a delete.
  const renameChat = (id: string, title: string) =>
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  const deleteChat = (id: string) =>
    setConvos((cs) => {
      const next = cs.filter((c) => c.id !== id);
      return next.length ? next : [{ id: String(idRef.current++), messages: [] }];
    });
  useEffect(() => {
    if (!convos.some((c) => c.id === activeId)) setActiveId(convos[0]?.id ?? '1');
  }, [convos, activeId]);

  // Ghost text rotates through example questions: piece-specific when a work is
  // open in the right pane, otherwise general questions about this Author's
  // mind. Pauses the instant the reader starts typing.
  const askExamples = useMemo(
    () => (open ? pieceExamples(who) : authorExamples(who, askQuestions)),
    [open, who, askQuestions],
  );
  const rotatingPlaceholder = useRotatingPlaceholder(askExamples, !question.trim());
  const readExamples = useMemo(() => readingExamples(who, askQuestions), [who, askQuestions]);
  const readingPlaceholder = useRotatingPlaceholder(readExamples, !question.trim());
  const readingIsQuestion = readingPlaceholder !== readingLead(who);

  // Mid-thought questions QUEUE instead of bouncing (founder, 2026-07-17): the
  // composer stays typable while the mind is answering (typeWhileLoading), the
  // new question lands in the thread immediately, and it fires as soon as the
  // in-flight answer returns — FIFO, conversation order preserved.
  const queueRef = useRef<{ text: string; convoId: string }[]>([]);
  const askingRef = useRef(false);

  // The visitor's allowance and the way out of it. Same contract as the reader:
  // the numbers ride back with the answers, and running out opens the handoff
  // rather than closing the chat (founder 2026-07-29).
  const [budget, setBudget] = useState<{ remaining: number; limit: number; signedIn: boolean } | null>(null);
  const [handoffCtx, setHandoffCtx] = useState<HandoffAuthor | null>(null);
  const spent = budget !== null && budget.remaining <= 0;

  useEffect(() => {
    if (!author || handoffCtx) return;
    let live = true;
    void fetchHandoffContext(author).then((ctx) => {
      if (live && ctx) setHandoffCtx(ctx);
    });
    return () => { live = false; };
  }, [author, handoffCtx]);

  const takeItWithYou = async () => {
    let ctx = handoffCtx;
    if (!ctx && author) {
      ctx = await fetchHandoffContext(author);
      if (ctx) setHandoffCtx(ctx);
    }
    if (!ctx) throw new Error('Handoff context unavailable');
    await copyToClipboard(composeHandoff({
      ctx,
      // On the profile there is no single piece — whatever the reader has open.
      piece: open?.content ? {
        name: open.nice,
        content: open.content,
        url: `${ctx.profile_url}/read/${encodeURIComponent(open.name)}`,
      } : null,
      messages: active?.messages || [],
    }));
  };

  // One line for every failure, and it says offline — a reader has no use for
  // offline-vs-timeout-vs-error, and offline is the true shape of all of them
  // from where they stand (founder 2026-07-28). Never a pronoun for the Author.
  const offlineNote = authorName
    ? `${authorName}’s mirror is offline — your question wasn’t answered. It runs on a personal machine, so it isn’t always up.`
    : 'This mirror is offline — your question wasn’t answered. It runs on a personal machine, so it isn’t always up.';

  const ask = async (textArg?: string) => {
    const text = (textArg ?? question).trim();
    if (!text) return;
    const targetId = activeId;
    setQuestion('');
    setMidOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setMtab('chat');
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
      const failed = !(res.ok && b.answer);
      if (typeof b?.remaining === 'number' && typeof b?.limit === 'number') {
        setBudget({ remaining: b.remaining, limit: b.limit, signedIn: !!b.signed_in });
      }
      setConvos((cs) => cs.map((c) => {
        if (c.id !== targetId) return c;
        // The spent dock carries the limit once. The unanswered question stays
        // last so both copy and handoff preserve exactly where the reader was.
        if (failed && b?.handoff) return c;
        return { ...c, messages: [...c.messages, failed
          ? { role: 'note' as const, text: offlineNote }
          : { role: 'twin' as const, text: b.answer }] };
      }));
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
      setConvos((cs) => cs.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, { role: 'note', text: offlineNote }] } : c)));
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
  const chromeLabel = { ...label, paddingLeft: '0.35rem' } as const;
  const iconBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', width: '2.4rem', height: '2.4rem', border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-ghost)', transition: 'opacity 0.15s' } as const;
  const paneHead = { flex: 'none', display: 'flex', alignItems: 'center', gap: 0, height: '2.4rem', minHeight: '2.4rem', maxHeight: '2.4rem', padding: 0, overflow: 'visible', boxSizing: 'border-box' as const } as const;

  const copyText = (t: string) => copyToClipboard(t);
  // "its my mirror, not me" (founder 2026-07-28) — the paste says so too.
  const copyConvo = () => copyText((active?.messages || [])
    .map((m) => (m.role === 'note' ? `[${m.text}]` : `${m.role === 'you' ? 'You' : `${who}’s mirror`}: ${m.text}`))
    .join('\n\n'));
  const copyPiece = () => copyToClipboard(open?.content || openTextRef.current || '');
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
      <div className="plm-shell" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font-eb-garamond)', background: 'var(--bg-primary)' }}>
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '0.65rem', height: 48, padding: '0 3.2rem 0 0.7rem', borderBottom: 'none' }}>
          <Link href={`/library/${encodeURIComponent(author)}`} aria-label="back to the library" title="library"
            style={{ color: 'var(--text-muted)', display: 'flex', textDecoration: 'none' }} className="hover:opacity-60">{ChevronIcon}</Link>
          {/* No standing online/offline word here either (founder, 2026-08-02:
              "i also dont need to have that online offline thing again in the
              top left") — a failed ask already answers with the offline note
              in-thread; status only exists in the moment it matters. */}
          <span className="doc-title">{who}</span>
        </header>

        <div className="plm-tabs" style={{ display: 'none', flex: 'none', borderBottom: '1px solid var(--border-light)' }}>
          {(['chat', 'pieces'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setMtab(t)}
              style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.7rem',
                color: mtab === t ? 'var(--text-primary)' : 'var(--text-ghost)', borderBottom: mtab === t ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t === 'chat' ? 'mirror' : t}
            </button>
          ))}
        </div>

        <main style={{ flex: 1, display: 'flex', minHeight: 0 }} data-mtab={mtab} data-expanded={expanded ? 'true' : 'false'}
          data-left={leftOpen ? 'open' : 'closed'} data-mid={midOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>

          {/* history — slot 1 */}
          <button type="button" className="reader-strip strip-history hover:opacity-60" style={{ order: 1 }} onClick={() => setLeftOpen(true)} aria-label="open history" title="history">{PaneLeftIcon}</button>
          <aside className="reader-pane pane-history" style={{ order: 1, flex: 'none', width: '240px', flexDirection: 'column', minHeight: 0 }}>
            <div style={paneHead}>
              <button type="button" onClick={() => setLeftOpen(false)} aria-label="collapse history" title="collapse" style={iconBtn} className="hover:opacity-60">{PaneLeftIcon}</button>
              <span style={chromeLabel}>history</span>
              <button type="button" onClick={newChat} aria-label="new conversation" title="new conversation"
                style={{ ...iconBtn, marginLeft: 'auto', fontSize: '1.05rem', lineHeight: 1 }} className="hover:opacity-60">＋</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '0.2rem 0.6rem 1rem' }}>
              {convos.map((c) => (
                <ChatHistoryItem key={c.id} convo={c} active={c.id === activeId}
                  onOpen={setActiveId} onRename={renameChat} onDelete={deleteChat} />
              ))}
            </div>
          </aside>

          {/* chat — slot 2. Opens by default here, so it needs no cue. */}
          <button type="button" className="reader-strip strip-chat hover:opacity-60" style={{ order: 2 }} onClick={() => setMidOpen(true)} aria-label="open the mirror — ask the mind" title="ask the mirror">{LinesIcon}</button>
          <section className="reader-pane pane-chat" style={{ order: 2, flex: '1 1 0', minWidth: '340px', flexDirection: 'column', minHeight: 0 }}>
            <div style={paneHead}>
              <button type="button" onClick={() => setMidOpen(false)} aria-label="collapse the mirror" title="collapse" style={iconBtn} className="chat-collapse hover:opacity-60">{LinesIcon}</button>
              <span className="pane-words">
                <span className="chat-label">mirror</span>
                <span className="pane-div" aria-hidden>·</span>
                <span className="depth-toggle">
                  <button type="button" className={sel === 'public' && !showCode ? 'is-on' : undefined} onClick={() => { setSel('public'); setShowCode(false); }}>public</button>
                  {depth === 'invite' ? (
                    <button type="button" className={sel === 'invite' ? 'is-on' : undefined} onClick={() => setSel('invite')}>invite</button>
                  ) : showCode ? (
                    <input
                      autoFocus
                      value={codeDraft}
                      onChange={(e) => setCodeDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { const code = codeDraft.trim(); if (code) setInvite(code); } if (e.key === 'Escape') { setShowCode(false); setCodeDraft(''); } }}
                      placeholder={'\u2002invite code'}
                      spellCheck={false}
                      autoCapitalize="off"
                      className="depth-code"
                    />
                  ) : (
                    <button type="button" onClick={() => setShowCode(true)}>invite</button>
                  )}
                </span>
              </span>
              {activeVariant === 'weights' && (
                <span className="chat-model" style={{ ...label, marginLeft: '0.45rem' }}>weights</span>
              )}
              <span style={{ marginLeft: 'auto' }} />
              {budget && budget.remaining > 0 && budget.remaining <= 3 && (
                <span style={{ ...label, color: 'var(--text-muted)', paddingRight: '0.15rem' }}>
                  {budget.remaining === 1 ? '1 question left' : `${budget.remaining} questions left`}
                </span>
              )}
              <ActionButton icon={HandoffIcon} onAction={takeItWithYou}
                title="take it with you — copies the mind, the open piece and this conversation for your own AI"
                style={{ ...iconBtn, color: budget && budget.remaining <= 3 ? 'var(--accent)' : undefined }} className="hover:opacity-60" />
              {/* Copy remains available after the allowance is spent. */}
              {(active?.messages.length ?? 0) > 0 && (
                <ActionButton icon={CopyIcon} onAction={copyConvo} title="copy conversation" style={iconBtn} className="hover:opacity-60" />
              )}
            </div>
            <div ref={threadRef} style={{ flex: 1, overflow: 'auto', position: 'relative', padding: '0.4rem 1.4rem 1.4rem' }}>
              {who && (active?.messages.length ?? 0) === 0 && !asking && !cameWithQuestion && (
                // Two beats, no product disclaimer and no competing CTA. The
                // chrome already says mirror; this tells the reader what to do.
                <div style={{ padding: '0.6rem 0 0.2rem', color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.65 }}>
                  <p style={{ margin: '0 0 0.9rem' }}>
                    explore <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{who.split(' ')[0]}’s thinking.</strong>
                  </p>
                  <p style={{ margin: 0 }}>ask anything.</p>
                </div>
              )}
              {active?.messages.map((m, i) => (
                <div key={i} ref={i === (active.messages.length - 1) ? lastMsgRef : undefined} style={{ margin: '0 0 1.1rem' }}>
                  {m.role === 'note'
                    // A status, not the mirror talking: muted rule, no name, no
                    // copy — so an offline mirror never reads as an answer.
                    ? <p style={{ margin: 0, padding: '0.15rem 0 0.15rem 0.9rem', borderLeft: '2px solid var(--border-light)',
                      color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, fontStyle: 'italic', textWrap: 'pretty' }}>{m.text}</p>
                    : m.role === 'you'
                    ? <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>{m.text}</p>
                    : (
                      <>
                        <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.9rem', color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}><TwinText text={m.text} /></div>
                        <div style={{ paddingLeft: '0.9rem' }}>
                          <ActionButton icon={CopyIcon} onAction={() => copyText(m.text)} title="copy" style={{ ...iconBtn, marginTop: '0.45rem', marginRight: '0.5rem', padding: 0 }} className="hover:opacity-60" />
                          {referenced(m.text).map((f) => (
                            <button key={f.name} type="button" onClick={() => void openPiece(f.name)} className="hover:opacity-70"
                              style={{ display: 'inline-flex', alignItems: 'center', marginTop: '0.6rem', marginRight: '0.4rem', border: '1px solid var(--border-light)',
                                color: 'var(--text-muted)', background: 'transparent', borderRadius: 999, fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.28rem 0.75rem', cursor: 'pointer' }}>
                              pull up · {displayName(f.name).toLowerCase()}
                            </button>
                          ))}
                          {referencedLinks(m.text).map((l) => (
                            <button key={l.url} type="button" onClick={() => window.open(l.url, '_blank', 'noopener,noreferrer')} className="hover:opacity-70"
                              style={{ display: 'inline-flex', alignItems: 'center', marginTop: '0.6rem', marginRight: '0.4rem', border: '1px solid var(--border-light)',
                                color: 'var(--text-muted)', background: 'transparent', borderRadius: 999, fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.28rem 0.75rem', cursor: 'pointer' }}>
                              open · {l.label}
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
                        onKeyDown={(e) => { if (e.key === 'Enter') applyInvite(); }} placeholder={'\u2002invite code'} spellCheck={false} autoCapitalize="off"
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
            <div className="ask-dock" style={{ flex: 'none', borderTop: 'none' }}>
              {spent ? (
                // Same as the reader: say the limit once, give its reason, then
                // the immediate way forward. The accent icon above carries the
                // same action without repeating the status.
                <div>
                  <p style={{ margin: '0 0 0.3rem', color: 'var(--text-primary)', fontSize: '0.98rem', lineHeight: 1.5 }}>
                    Out of questions.
                  </p>
                  <p style={{ margin: '0 0 0.85rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.55, textWrap: 'pretty' }}>
                    Answers cost money to run, so everyone gets a few a day.
                  </p>
                  <ActionButton icon={HandoffIcon} label="continue in your own AI" doneLabel="copied — paste it into your AI"
                    onAction={takeItWithYou}
                    title="copies this chat, the open piece and the writing behind it"
                    failedLabel="couldn’t copy — try again"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                      background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderRadius: '999px', padding: '0.4rem 0.85rem',
                      color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}
                    className="hover:opacity-75" />
                </div>
              ) : (
                <PromptBox ref={promptRef} value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking} typeWhileLoading placeholder={rotatingPlaceholder || 'ask anything…'} bare />
              )}
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
          <button type="button" className="reader-strip strip-right hover:opacity-60" style={{ order: 3 }} onClick={() => setRightOpen(true)} aria-label="open the piece pane" title="pieces">{PaneRightIcon}</button>
          <article className="reader-pane pane-piece" style={{ order: 3, flex: '1 1 0', minWidth: 0, flexDirection: 'column', minHeight: 0 }}>
            <div className="piece-head" style={paneHead}>
              {open
                ? <button type="button" onClick={() => setOpen(null)} aria-label="back to pieces" title="back" style={iconBtn} className="hover:opacity-60">{ChevronIcon}</button>
                : <span className="pieces-label" style={{ width: '2.4rem', flex: 'none' }} aria-hidden />}
              {open
                ? <span style={{ ...chromeLabel, color: 'var(--text-primary)', fontSize: '0.98rem', letterSpacing: 0 }}>{open.nice}</span>
                : <span className="pieces-label" style={chromeLabel}>pieces</span>}
              {open && (
                <>
                  <ActionButton icon={CopyIcon} onAction={copyPiece} title="copy text" style={{ ...iconBtn, marginLeft: 'auto' }} className="hover:opacity-60" />
                  <ActionButton icon={DownloadIcon} onAction={downloadPiece} title="download" style={iconBtn} className="hover:opacity-60" />
                  {/* Full-screen the open piece — mobile only (desktop has the 3
                      panes for this). Sits with copy/download. */}
                  <button type="button" onClick={toggleExpand} aria-label={expanded ? 'exit full screen' : 'full screen'} title={expanded ? 'exit full screen' : 'full screen'} style={iconBtn} className="piece-expand hover:opacity-60">{expanded ? CompressIcon : ExpandIcon}</button>
                </>
              )}
              <button type="button" onClick={() => setRightOpen(false)} aria-label="collapse the piece pane" title="collapse" style={{ ...iconBtn, ...(open ? {} : { marginLeft: 'auto' }) }} className="piece-collapse hover:opacity-60">{PaneRightIcon}</button>
            </div>
            <div className={open && !open.loading && !open.pdfUrl && (mtab === 'pieces' || !midOpen) ? 'piece-fade' : undefined}
              style={{ flex: 1, overflow: open?.pdfUrl ? 'hidden' : 'auto', minHeight: 0 }}>
              {!open && (
                // The pieces pane is the Author's readable ARTIFACTS only — works,
                // projects, shadows. Links live in the bio on the profile now, not
                // here (founder, 2026-07-19): the pane is for things the mirror can
                // open beside you; links just take you out. The note says you can
                // still ask the mirror about the linked surfaces — it answers from
                // what the Author has shared, even the ones it can't open itself.
                <>
                  {/* One consistent pane (founder, 2026-08-02: "it should have
                      an elegant maybe italic explanation text, then the title
                      things, then the items"): a single italic explainer covers
                      the whole pane, then every section — links first, then the
                      artifact categories — carries the same label hand and the
                      same rhythm. The old pinned links block (its own border,
                      background, and second explainer) was the inconsistency. */}
                  <div style={{ padding: '1.4rem clamp(1.4rem, 4vw, 3rem)' }}>
                    {files.length === 0 && linked.length === 0 && <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem' }}>nothing to show yet.</p>}
                    {(files.length > 0 || linked.length > 0) && (
                      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.95rem', lineHeight: 1.55, margin: '0 0 1.9rem' }}>
                        ask the mirror about anything here &mdash; or open a piece to read it beside the chat.
                      </p>
                    )}
                    {linked.length > 0 && (
                      <div style={{ margin: '0 0 1.5rem' }}>
                        <p style={{ ...label, margin: '0 0 0.45rem' }}>links</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.3rem 1.15rem', fontSize: '0.98rem' }}>
                          {linked.map((l) => {
                            if (/beliapp\.co/i.test(l.url)) {
                              const handle = l.url.replace(/\/+$/, '').split('/').pop() || '';
                              return (
                                <button key={l.url} type="button" title="beli has no web page — click to copy the username"
                                  onClick={() => { try { navigator.clipboard?.writeText('@' + handle); } catch { /* */ } setBeliCopied(true); setTimeout(() => setBeliCopied(false), 1800); }}
                                  style={{ color: 'var(--text-muted)', textDecoration: 'underline', textDecorationColor: 'var(--border-light)', textUnderlineOffset: '3px', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
                                  className="hover:opacity-60">
                                  {beliCopied ? `@${handle} · copied ✓` : 'beli'}
                                </button>
                              );
                            }
                            return (
                              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="hover:opacity-60"
                                style={{ color: 'var(--text-muted)', textDecoration: 'underline', textDecorationColor: 'var(--border-light)', textUnderlineOffset: '3px' }}>
                                {l.label}
                              </a>
                            );
                          })}
                        </div>
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
                                border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.55rem 0' }}
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
                </>
              )}
              {open && open.loading && <p style={{ color: 'var(--text-ghost)', padding: '2rem' }}>loading…</p>}
              {/* Fit-to-width canvas pages (shared with ReaderShell) — scrolls
                  DOWN like a document, no horizontal pan/slide on mobile, unlike
                  a raw <iframe src=pdf> (founder 2026-07-19). */}
              {open && !open.loading && open.pdfUrl && <PdfView url={open.pdfUrl} />}
              {open && !open.loading && !open.pdfUrl && (
                <div className="reader-prose" style={{ padding: '2rem clamp(1.4rem, 4vw, 3rem)' }}><ReactMarkdown remarkPlugins={[remarkGfm]}>{open.content}</ReactMarkdown></div>
              )}
            </div>
            {open && !open.loading && (mtab === 'pieces' || !midOpen) && (
              <div className="piece-ask">
                <PromptBox bare value={question} onChange={setQuestion} onSubmit={() => void ask()} loading={asking}
                  typeWhileLoading placeholder={readingPlaceholder || 'ask about this piece…'} fillable={readingIsQuestion}
                  ariaLabel="ask about this piece" />
              </div>
            )}
            {open && midOpen && mtab !== 'pieces' && <div className="piece-foot" aria-hidden />}
          </article>
        </main>
        {/* Slim footer to frame the page even with the panes open (founder 2026-07-19). */}
        <footer style={{ flex: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.6rem', padding: '1rem 1.2rem', borderTop: 'none' }}>
          <Link href="/start" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }} className="hover:opacity-60">start your loop</Link>
          <Link href="/" style={{ fontStyle: 'italic', color: 'var(--text-ghost)', fontSize: '0.85rem', textDecoration: 'none' }} className="hover:opacity-60">alexandria<span style={{ fontStyle: 'normal' }}>.</span></Link>
        </footer>
      </div>

      <style>{`
        .reader-prose { color: var(--text-secondary); font-size: 1.05rem; line-height: 1.75; max-width: 42rem; }
        .reader-prose h1, .reader-prose h2, .reader-prose h3 { color: var(--text-primary); font-weight: 500; line-height: 1.25; margin: 2.2rem 0 0.8rem; }
        .reader-prose h1 { font-size: 1.9rem; } .reader-prose h2 { font-size: 1.4rem; } .reader-prose h3 { font-size: 1.15rem; }
        .reader-prose p { margin: 0 0 1.1rem; } .reader-prose a { color: var(--accent); }
        .reader-prose blockquote { border-left: 2px solid var(--border-light); margin: 1.1rem 0; padding-left: 1rem; color: var(--text-muted); font-style: italic; }
        .reader-prose ul, .reader-prose ol { margin: 0 0 1.1rem; padding-left: 1.3rem; } .reader-prose li { margin: 0 0 0.4rem; }
        .reader-prose code { background: var(--bg-secondary); border-radius: 4px; padding: 0.1rem 0.35rem; font-size: 0.9em; }

        /* Collapsed panes are icon-only, no gutter — same grammar as ReaderShell
           so history stays left when the mirror opens, and the piece-collapse
           lives on the piece-head with copy/download. */
        .reader-strip { flex: none; width: 2.4rem; height: 2.4rem; min-height: 2.4rem; max-height: 2.4rem;
          align-self: flex-start; box-sizing: border-box;
          display: flex; align-items: center; justify-content: center; padding: 0;
          border: none; background: none; cursor: pointer; color: var(--text-ghost); }
        .reader-strip svg, .piece-head button svg, .pane-history button svg, .pane-chat button svg { display: block; }
        .reader-strip.strip-right { margin-left: auto; }
        .doc-title { font-style: italic; font-size: 1.05rem; color: var(--text-primary); line-height: 1; }
        .pane-words { display: flex; align-items: baseline; gap: 0; min-width: 0; padding-left: 0.35rem;
          font-size: 0.78rem; letter-spacing: 0.08em; line-height: 1; color: var(--text-ghost); }
        .pane-words .pane-div { letter-spacing: 0; color: var(--text-ghost); padding: 0 0.75rem; }
        .pane-words .chat-label { font-size: inherit; letter-spacing: inherit; line-height: inherit; }
        .depth-toggle { display: flex; align-items: baseline; gap: 0.7rem; }
        .depth-toggle button {
          font-family: inherit; font-size: inherit; letter-spacing: inherit; line-height: inherit;
          border: none; background: none; padding: 0; cursor: pointer; color: inherit;
        }
        .depth-toggle button.is-on {
          color: var(--text-primary);
          text-decoration: underline; text-underline-offset: 0.18em;
          text-decoration-thickness: 1px; text-decoration-color: var(--accent);
        }
        .depth-code { width: 7.5rem; border: none; border-bottom: 1px solid var(--border-light); background: none; outline: none;
          color: var(--text-primary); font-family: inherit; font-size: inherit; letter-spacing: 0.04em; line-height: inherit; padding: 0; }
        .ask-dock { padding: 0.7rem 1.2rem 1rem; }
        .piece-ask { flex: none; width: min(680px, 100% - 2.8rem); margin: 0 auto; padding: 0.55rem 0 1.15rem; }
        .piece-foot { flex: none; height: 0.9rem; }
        .piece-fade { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 2.4rem), transparent);
          mask-image: linear-gradient(to bottom, #000 calc(100% - 2.4rem), transparent); }

        @media (min-width: 901px) {
          .reader-strip { display: none; }
          .reader-pane { display: none; }
          /* Full-screen expand is a mobile-only affordance; desktop uses the 3 panes. */
          .piece-expand { display: none !important; }
          main[data-left="closed"] .strip-history { display: flex; }
          main[data-left="open"] .pane-history { display: flex; }
          main[data-mid="closed"] .strip-chat { display: flex; }
          main[data-mid="open"] .pane-chat { display: flex; }
          main[data-right="closed"] .strip-right { display: flex; }
          main[data-right="open"] .pane-piece { display: flex; }
        }
        @media (max-width: 900px) {
          .reader-strip, .pane-history { display: none !important; }
          /* On mobile the "chat"/"pieces" tabs are the only pane labelling, and
             there are no side-by-side panes to collapse — so the pane-toggle
             icons + duplicate labels drop out (founder 2026-07-19). */
          .chat-collapse, .chat-label, .pane-div, .pieces-label, .piece-collapse { display: none !important; }
          .plm-tabs { display: flex !important; }
          .piece-ask { width: calc(100% - 2.4rem); padding: 0.45rem 0 0.85rem; }
          main { flex-direction: column !important; }
          .pane-chat, .pane-piece { display: none !important; order: 0 !important; width: 100% !important; flex: 1 1 auto !important; min-width: 0 !important; border-right: none !important; }
          main[data-mtab="chat"] .pane-chat { display: flex !important; }
          main[data-mtab="pieces"] .pane-piece { display: flex !important; }
        }

        /* Full screen — the open piece fills the whole viewport on every device;
           the tabs, other pane, and footer drop out. Wins both media queries. */
        main[data-expanded="true"] .pane-piece {
          display: flex !important; position: fixed !important;
          top: 0 !important; left: 0 !important; width: 100vw !important; height: 100dvh !important;
          min-width: 0 !important; z-index: 120; background: var(--bg-primary);
        }
        .plm-shell:has(main[data-expanded="true"]) .plm-tabs,
        .plm-shell:has(main[data-expanded="true"]) > footer { display: none !important; }
      `}</style>
    </>
  );
}
