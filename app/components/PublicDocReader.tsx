'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReaderShell from './ReaderShell';
import { FOUNDER_LIBRARY_ID, FOUNDER_PROFILE_PATH } from '../lib/config';

/**
 * PublicDocReader — the website's public docs (whitepaper markdown, letter PDF)
 * in the SAME reader as the library (ReaderShell). The "ask" talks to the
 * founder's OWN public context twin (`/api/library/{FOUNDER_LIBRARY_ID}/ask`) —
 * the same mind the public reaches on his profile — with the doc being read
 * passed as `focus`. This replaced the old faceless `/api/ask` guide: a reader
 * now talks to Benjamin's actual mind, built with Alexandria, which is itself
 * the pitch. Inference runs on the device sidecar; the twin loads only the
 * public shadow + public product facts (no private substrate in reach).
 */
export default function PublicDocReader({
  title, mdSrc, pdfSrc, txtSrc, numbered, plain, askQuestions, askFirst,
}: {
  title: string;
  mdSrc?: string;   // markdown to fetch + render (the whitepaper)
  pdfSrc?: string;  // a PDF to embed (the letter)
  txtSrc?: string;  // the PDF's text (for the copy button)
  numbered?: boolean; // book setting — TOC + hanging numerals + colophon plate
  plain?: boolean;    // with numbered: the plain (ragged-right) variant
  askQuestions?: string[]; // this doc's own suggested questions → the rotation
  askFirst?: boolean;      // open with the mirror pane up (the /features ask page)
}) {
  // What the mirror is running on, and whether it can answer at all — read from
  // the Author's own directory rather than hard-coded here, so there is exactly
  // one place the model is decided (the sidecar, which pays for it). Fetched once;
  // the Worker caches the health probe for 30s, so this is a cheap JSON GET.
  const [twin, setTwin] = useState<{ online: boolean; model: string | null } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [markdown, setMarkdown] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [text, setText] = useState('');
  const dlBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (pdfSrc) {
          const [pres, tres] = await Promise.all([fetch(pdfSrc), txtSrc ? fetch(txtSrc) : Promise.resolve(null)]);
          const blob = await pres.blob();
          if (!live) return;
          dlBlobRef.current = blob;
          setPdfUrl(URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })));
          if (tres && tres.ok) setText((await tres.text()).trim());
          setStatus('ok');
        } else if (mdSrc) {
          const r = await fetch(mdSrc);
          const t = r.ok ? await r.text() : '';
          if (!live) return;
          dlBlobRef.current = new Blob([t], { type: 'text/markdown' });
          setMarkdown(t); setText(t); setStatus('ok');
        } else {
          setStatus('error');
        }
      } catch {
        if (live) setStatus('error');
      }
    })();
    return () => { live = false; };
  }, [mdSrc, pdfSrc, txtSrc]);

  useEffect(() => {
    let live = true;
    fetch(`/api/library/${FOUNDER_LIBRARY_ID}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        const t = d?.twin;
        if (t) setTwin({ online: !!t.online, model: typeof t.model === 'string' ? t.model : null });
      })
      .catch(() => { /* the note just stays generic */ });
    return () => { live = false; };
  }, []);

  // Ask Benjamin's OWN public context twin (the same mind on his profile), with
  // the doc the reader is on passed as `focus` so the answer is grounded in it.
  // `text` holds the current doc (markdown or the letter's extracted text).
  const askFn = async (question: string): Promise<string> => {
    const res = await fetch(`/api/library/${FOUNDER_LIBRARY_ID}/ask`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        variant: 'context',
        ...(text.trim() ? { focus: { name: title, content: text } } : {}),
      }),
    });
    const b = await res.json().catch(() => ({}));
    if (res.ok && b.answer) return b.answer;
    // THROW on failure — never return the error as if it were the answer. The
    // shell renders a thrown message as a status note, so a mirror that is
    // offline can't be mistaken for a mirror that doesn't know (founder
    // 2026-07-28). The server's own reason is the message.
    throw new Error(b.error || 'couldn’t reach the mirror — it may be offline. your question wasn’t answered.');
  };

  // Name what you're talking to — a MIRROR of his mind, not a twin or a
  // stand-in (canon: "Alexandria builds a mirror, not a clone"; it thinks WITH
  // you, not for you). The framing must read as reflection, never replacement
  // (founder 2026-07-20). Pinned above the thread rather than living in the
  // empty state, so it's still there after the first question — which is
  // exactly when someone who asked from the document arrives here.
  // Saying it's offline BEFORE the reader types beats letting them find out by
  // asking (founder 2026-07-28). Naming the model is the honest version of the
  // whole pitch: rented mechanism, owned mind — so say which mechanism.
  const mirrorNote = (
    <>
      A mirror of Benjamin’s mind — reflected from what he’s written, not a stand-in for him.{' '}
      {twin && !twin.online
        ? <>It’s offline right now — it runs on a personal machine, not a server.</>
        : <>Ask it anything.{twin?.model ? <> Running on {twin.model}.</> : null}</>}
    </>
  );
  // The empty state keeps only the two quiet conversion doors.
  const intro = (
    <div style={{ color: 'var(--text-muted)', fontSize: '1.02rem', lineHeight: 1.78, textWrap: 'pretty' }}>
      <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: '0.95rem', fontSize: '0.95rem' }}>
        <Link href="/start" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="hover:opacity-70">make your own</Link>
        <span aria-hidden style={{ color: 'var(--text-ghost)' }}>·</span>
        <Link href={FOUNDER_PROFILE_PATH} style={{ color: 'var(--text-muted)', textDecoration: 'none' }} className="hover:opacity-70">his library</Link>
      </p>
    </div>
  );

  return (
    <ReaderShell
      name={title}
      backHref="/"
      backTitle="alexandria"
      visibility="public"
      status={status}
      pdfUrl={pdfUrl || undefined}
      markdown={pdfUrl ? undefined : markdown}
      numbered={numbered}
      plain={plain}
      artifactText={text}
      downloadBlob={dlBlobRef.current}
      downloadName={title.replace(/\s+/g, '-')}
      downloadExt={pdfSrc ? 'pdf' : 'md'}
      who="Benjamin"
      askPlaceholder={'ask the mirror about this…'}
      askQuestions={askQuestions}
      askFn={askFn}
      intro={intro}
      mirrorNote={mirrorNote}
      askFirst={askFirst}
      // The whitepaper and the letter: they open on a closed mirror and a long
      // read, so the ask is docked under the document. The mirror-led pages
      // (askFirst) already open with the pane up and need nothing.
      dockedAsk={!askFirst}
      footerCta="close your loop"
    />
  );
}
