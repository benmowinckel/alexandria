'use client';

import { useEffect, useRef, useState } from 'react';
import ReaderShell from './ReaderShell';

/**
 * PublicDocReader — the website's public docs (whitepaper markdown, letter PDF)
 * in the SAME reader as the library (ReaderShell). The one difference from a
 * library piece: the "ask" goes to the public **Alexandria guide** (`/api/ask`),
 * NOT anyone's personal twin. The guide already holds both docs + the company
 * context server-side, so the browser sends only the question — no doc payload,
 * no substrate, no personal twin.
 */
export default function PublicDocReader({
  title, mdSrc, pdfSrc, txtSrc,
}: {
  title: string;
  mdSrc?: string;   // markdown to fetch + render (the whitepaper)
  pdfSrc?: string;  // a PDF to embed (the letter)
  txtSrc?: string;  // the PDF's text (for the copy button)
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

  const askFn = async (question: string): Promise<string> => {
    const res = await fetch('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const b = await res.json().catch(() => ({}));
    return (res.ok && b.answer) ? b.answer : (b.error || 'Alexandria could not answer just now.');
  };

  return (
    <ReaderShell
      name={title}
      backHref="/"
      backTitle="alexandria"
      visibility="public"
      status={status}
      pdfUrl={pdfUrl || undefined}
      markdown={pdfUrl ? undefined : markdown}
      artifactText={text}
      downloadBlob={dlBlobRef.current}
      downloadName={title.replace(/\s+/g, '-')}
      downloadExt={pdfSrc ? 'pdf' : 'md'}
      who="Alexandria"
      askPlaceholder={`ask about the ${title}…`}
      askFn={askFn}
    />
  );
}
