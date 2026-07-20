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
  title, mdSrc, pdfSrc, txtSrc, numbered, plain, askQuestions,
}: {
  title: string;
  mdSrc?: string;   // markdown to fetch + render (the whitepaper)
  pdfSrc?: string;  // a PDF to embed (the letter)
  txtSrc?: string;  // the PDF's text (for the copy button)
  numbered?: boolean; // book setting — TOC + hanging numerals + colophon plate
  plain?: boolean;    // with numbered: the plain (ragged-right) variant
  askQuestions?: string[]; // this doc's own suggested questions → the rotation
}) {
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
    return (res.ok && b.answer) ? b.answer : (b.error || 'the mind could not answer just now.');
  };

  // The chat empty-state: name what you're talking to — a MIRROR of his mind,
  // not a twin or a stand-in (canon: "Alexandria builds a mirror, not a clone";
  // it thinks WITH you, not for you). The framing must read as reflection, never
  // replacement (founder 2026-07-20). Then the two quiet conversion doors.
  // Sentence-cased and spaced for the reader's serif register; no arrows.
  const intro = (
    <div style={{ color: 'var(--text-muted)', fontSize: '1.02rem', lineHeight: 1.78, textWrap: 'pretty' }}>
      <p style={{ margin: '0 0 1.5rem', textWrap: 'pretty' }}>
        You’re reading this alongside a mirror of{' '}
        <span style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>Benjamin</span>’s
        {' '}mind — the founder of alexandria. His own thinking, reflected from what he’s
        written, not a stand-in for him. Ask it about this piece, about alexandria, or about him.
      </p>
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
      askPlaceholder={'ask benjamin about this…'}
      askQuestions={askQuestions}
      askFn={askFn}
      intro={intro}
    />
  );
}
