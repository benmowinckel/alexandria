'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ReaderShell from '../../../../components/ReaderShell';
import { librarySignInUrlHere } from '../../../../lib/config';

/**
 * Library reader — a thin wrapper over ReaderShell. This owns the LIBRARY
 * specifics: the gated file fetch (with signin/pay states), server-side PDF-text
 * extraction, and the ask that hits the AUTHOR's personal twin with the piece as
 * focus. The UI (the three panes) lives in ReaderShell, shared with the website
 * doc readers so they can never diverge.
 */

const SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'by', 'with']);
const TITLE_OVERRIDE: Record<string, string> = { mowinckels: 'mowinckels' };
function displayName(name: string): string {
  if (TITLE_OVERRIDE[name]) return TITLE_OVERRIDE[name];
  return name.split('-').map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

export default function ReaderPage({ params }: { params: Promise<{ author: string; name: string }> }) {
  const searchParams = useSearchParams();
  const scope = (searchParams.get('scope') || '').trim();
  const [author, setAuthor] = useState('');
  const [name, setName] = useState('');
  useEffect(() => { params.then((p) => { setAuthor(p.author); setName(p.name); }); }, [params]);

  const [authorName, setAuthorName] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [content, setContent] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [status, setStatus] = useState<'loading' | 'ok' | 'signin' | 'pay' | 'error'>('loading');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [questions, setQuestions] = useState<string[] | undefined>(undefined); // this piece's suggested asks → the rotating ghost text
  const [signedIn, setSignedIn] = useState(false);
  // Invite gate — an invite-restricted piece opened signed-out lands on the
  // sign-in wall; the code field there lets an invited reader unlock in place
  // (the profile links every piece here, so this is the ONE place a reader
  // meets the wall — it must carry the code). The applied code seeds from
  // `?invite=` so a share link, and the sign-in round-trip below, carry it
  // through without re-typing.
  const readUrlInvite = () => {
    if (typeof window === 'undefined') return '';
    try { return new URLSearchParams(window.location.search).get('invite')?.trim() || ''; } catch { return ''; }
  };
  const [invite, setInvite] = useState(readUrlInvite);
  const [inviteDraft, setInviteDraft] = useState(readUrlInvite);
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState('');
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const [downloadExt, setDownloadExt] = useState('md');
  const attemptRef = useRef(0);       // guards against a stale fetch clobbering a newer unlock

  const nice = useMemo(() => displayName(name), [name]);
  const who = authorName || author;
  // Recomputed each render, so once a code lands in the URL (submitInvite below)
  // the sign-in link returns the reader here WITH the code — signing in then
  // auto-unlocks on the next load.
  const signInUrl = librarySignInUrlHere();

  // Directory + session — the piece's visibility (does it even need a code?),
  // the author's name, its suggested asks, and whether the viewer is signed in
  // (which tailors the 401 copy). The file fetch below owns the fatal states.
  useEffect(() => {
    if (!author || !name) return;
    let live = true;
    (async () => {
      try {
        const [dir, sess] = await Promise.all([
          fetch(`/api/library/${encodeURIComponent(author)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
          fetch('/api/library/session', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (!live) return;
        setAuthorName(dir?.author?.display_name || '');
        const f = (dir?.files || []).find((x: { name: string; scope?: string }) => x.name === name && (!scope || x.scope === scope));
        if (f?.visibility) setVisibility(f.visibility);
        if (Array.isArray(f?.questions)) setQuestions(f.questions.filter((q: unknown): q is string => typeof q === 'string'));
        setSignedIn(sess?.signed_in === true);
      } catch { /* non-fatal — the file fetch owns the reader's status */ }
    })();
    return () => { live = false; };
  }, [author, name, scope]);

  // Fetch the piece, optionally with an invite code. The single source of the
  // reader's status — called on load (with any seeded code) and on each unlock.
  const attempt = useCallback(async (code: string) => {
    if (!author || !name) return;
    const token = ++attemptRef.current;
    const fresh = () => token === attemptRef.current;     // a newer attempt supersedes this one
    const fileUrl = (extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      if (scope) params.set('scope', scope);
      if (code) params.set('invite', code);
      if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
      const qs = params.toString();
      return `/api/library/${encodeURIComponent(author)}/file/${encodeURIComponent(name)}${qs ? `?${qs}` : ''}`;
    };
    setStatus('loading');
    setInviteErr('');
    try {
      const fileRes = await fetch(fileUrl(), { credentials: 'include' });
      if (!fresh()) return;
      if (fileRes.ok) {
        const blob = await fileRes.blob();
        if (!fresh()) return;
        setDownloadBlob(blob);
        const head = await blob.slice(0, 5).text();
        if (head.startsWith('%PDF')) {
          setDownloadExt('pdf');
          const buf = await blob.arrayBuffer();
          setPdfUrl(URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })));
          setStatus('ok');
          void (async () => {
            try {
              const tr = await fetch(fileUrl({ format: 'text' }), { credentials: 'include' });
              if (tr.ok) { const t = (await tr.text()).trim(); if (t && fresh()) setContent(t); }
            } catch { /* title-scoped focus fallback */ }
          })();
          return;
        }
        setDownloadExt('md');
        setContent(await blob.text());
        setStatus('ok');
        return;
      }
      if (fileRes.status === 401) {
        // Invite files require sign-in (a code binds to an account), so a
        // signed-out reader is sent to sign in with the code preserved; a
        // signed-in reader whose code failed is just told it didn't work.
        setStatus('signin');
        if (code) setInviteErr(signedIn ? 'that code didn’t open this piece.' : 'sign in to use your invite code — it binds to your account.');
        return;
      }
      if (fileRes.status === 402) {
        const b = await fileRes.json().catch(() => ({}));
        setCheckoutUrl(b?.checkout_url || '');
        setStatus('pay');
        return;
      }
      setStatus('error');
    } catch {
      if (fresh()) setStatus('error');
    } finally {
      if (fresh()) setInviting(false);
    }
  }, [author, name, scope, signedIn]);

  // Load once the route resolves, carrying any code seeded from the URL. Kept
  // off `attempt`/`invite` deps so a session resolving (or the error copy
  // changing) doesn't silently refetch — unlocks go through submitInvite.
  useEffect(() => {
    if (!author || !name) return;
    const frame = requestAnimationFrame(() => { void attempt(invite); });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [author, name]);

  const submitInvite = () => {
    const code = inviteDraft.trim();
    if (!code || inviting) return;
    setInviting(true);
    setInvite(code);
    // Reflect the code in the URL so the sign-in round-trip (and a refresh)
    // carries it — librarySignInUrlHere() reads window.location at render time.
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('invite', code);
      window.history.replaceState({}, '', u.pathname + u.search + u.hash);
    } catch { /* */ }
    void attempt(code);
  };

  // The code entry, slotted into ReaderShell's sign-in wall for invite pieces.
  const inviteField = visibility === 'invite' ? (
    <div style={{ marginTop: '1.4rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '22rem' }}>
        <input
          value={inviteDraft}
          onChange={(e) => setInviteDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitInvite(); }}
          // Leading en-space keeps the blinking caret clear of the ghost text.
          placeholder={'\u2002invite code'}
          spellCheck={false}
          autoCapitalize="off"
          style={{ flex: 1, minWidth: 0, border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--bg-secondary)', outline: 'none',
            color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1rem', padding: '0.5rem 0.95rem' }}
        />
        <button type="button" onClick={submitInvite} disabled={!inviteDraft.trim() || inviting}
          style={{ flex: 'none', border: '1px solid var(--border-light)', borderRadius: '11px', background: 'transparent',
            cursor: inviteDraft.trim() && !inviting ? 'pointer' : 'default', opacity: inviteDraft.trim() && !inviting ? 1 : 0.5, transition: 'opacity 0.15s',
            color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '0.95rem', padding: '0.5rem 1rem' }} className="hover:opacity-60">
          {inviting ? '…' : 'unlock'}
        </button>
      </div>
      {inviteErr && <p style={{ color: 'var(--text-whisper)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{inviteErr}</p>}
    </div>
  ) : undefined;

  const askFn = async (text: string, messages: { role: 'user' | 'assistant'; content: string }[]) => {
    const res = await fetch(`/api/library/${encodeURIComponent(author)}/ask`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        question: text,
        variant: 'context',
        artifact: { name, scope: scope || visibility },
        messages,
      }),
    });
    const b = await res.json().catch(() => ({}));
    if (res.ok && b.answer) {
      return { answer: b.answer as string, remaining: b.remaining, limit: b.limit,
               signed_in: b.signed_in, variant: b.variant ?? null };
    }
    // Out of questions → the handoff, not an error.
    if (b?.handoff) {
      throw Object.assign(new Error(String(b.error || 'You’ve used your questions for today.')),
        { allowanceSpent: true, limit: b.limit, signedIn: !!b.signed_in });
    }
    // Throw, don't return: the shell renders a thrown message as a status note
    // rather than as the mirror speaking, so "offline" can't read as "doesn't
    // know" (founder 2026-07-28).
    throw new Error(b.error || 'couldn’t reach the mirror — it may be offline. your question wasn’t answered.');
  };

  return (
    <ReaderShell
      name={nice}
      backHref={`/library/${encodeURIComponent(author)}`}
      backTitle="library"
      visibility={visibility}
      status={status}
      pdfUrl={pdfUrl || undefined}
      markdown={pdfUrl ? undefined : content}
      artifactText={content}
      downloadBlob={downloadBlob}
      downloadName={name}
      downloadExt={downloadExt}
      signInUrl={signInUrl}
      checkoutUrl={checkoutUrl}
      who={who}
      askQuestions={questions}
      askFn={askFn}
      handoffAuthorId={author}
      inviteField={inviteField}
      dockedAsk
    />
  );
}
