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
  title, mdSrc, pdfSrc, txtSrc, numbered, plain,
}: {
  title: string;
  mdSrc?: string;   // markdown to fetch + render (the whitepaper)
  pdfSrc?: string;  // a PDF to embed (the letter)
  txtSrc?: string;  // the PDF's text (for the copy button)
  numbered?: boolean; // book setting — TOC + hanging numerals + colophon plate
  plain?: boolean;    // with numbered: the plain (ragged-right) variant
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

  // The chat empty-state: name who you're talking to (a live proof of the
  // product), and give the two conversion doors — make your own · his library.
  const intro = (
    <div style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.65 }}>
      <p style={{ margin: '0 0 0.9rem' }}>
        you’re reading this with <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Benjamin</strong> — his
        actual mind, built with alexandria from his own writing. ask it about this piece, about alexandria, or about him.
      </p>
      <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1.1rem' }}>
        <Link href="/start" style={{ color: 'var(--accent)', textDecoration: 'none' }}>make your own →</Link>
        <Link href={FOUNDER_PROFILE_PATH} style={{ color: 'var(--accent)', textDecoration: 'none' }}>his library →</Link>
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
      askFn={askFn}
      intro={intro}
      defaultChatOpen
    />
  );
}
