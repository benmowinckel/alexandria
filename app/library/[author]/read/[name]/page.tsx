'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [author, setAuthor] = useState('');
  const [name, setName] = useState('');
  useEffect(() => { params.then((p) => { setAuthor(p.author); setName(p.name); }); }, [params]);

  const [authorName, setAuthorName] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [content, setContent] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [status, setStatus] = useState<'loading' | 'ok' | 'signin' | 'pay' | 'error'>('loading');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const pdfTextRef = useRef('');
  const extractRef = useRef<Promise<void> | null>(null);
  const dlBlobRef = useRef<Blob | null>(null);
  const dlExtRef = useRef('md');

  const nice = useMemo(() => displayName(name), [name]);
  const who = authorName || author;
  const signInUrl = librarySignInUrlHere();

  useEffect(() => {
    if (!author || !name) return;
    let live = true;
    (async () => {
      setStatus('loading');
      try {
        const [dirRes, fileRes] = await Promise.all([
          fetch(`/api/library/${encodeURIComponent(author)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
          fetch(`/api/library/${encodeURIComponent(author)}/file/${encodeURIComponent(name)}`, { credentials: 'include' }),
        ]);
        if (!live) return;
        setAuthorName(dirRes?.author?.display_name || '');
        const f = (dirRes?.files || []).find((x: { name: string }) => x.name === name);
        if (f?.visibility) setVisibility(f.visibility);

        if (fileRes.ok) {
          const blob = await fileRes.blob();
          dlBlobRef.current = blob;
          const head = await blob.slice(0, 5).text();
          if (head.startsWith('%PDF')) {
            dlExtRef.current = 'pdf';
            const buf = await blob.arrayBuffer();
            setPdfUrl(URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })));
            setStatus('ok');
            extractRef.current = (async () => {
              try {
                const tr = await fetch(`/api/library/${encodeURIComponent(author)}/file/${encodeURIComponent(name)}?format=text`, { credentials: 'include' });
                if (tr.ok) { const t = (await tr.text()).trim(); if (t) { pdfTextRef.current = t; if (live) setContent(t); } }
              } catch { /* title-scoped focus fallback */ }
            })();
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

  const askFn = async (text: string): Promise<string> => {
    // Wait for a still-extracting PDF so the mind gets the document, not an empty note.
    let fc = content || pdfTextRef.current;
    if (!fc && pdfUrl && extractRef.current) {
      try { await Promise.race([extractRef.current, new Promise((r) => setTimeout(r, 8000))]); } catch { /* */ }
      fc = pdfTextRef.current;
    }
    const focusText = fc
      || `(The reader is currently viewing “${nice}”${pdfUrl ? ' (a PDF)' : ''}, a published piece by ${who}. Answer about THIS specific piece unless they clearly ask about something else.)`;
    const res = await fetch(`/api/library/${encodeURIComponent(author)}/ask`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ question: text, variant: 'context', focus: { name: nice, content: focusText } }),
    });
    const b = await res.json().catch(() => ({}));
    return (res.ok && b.answer) ? b.answer : (b.error || 'the PLM could not answer just now.');
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
      artifactText={content || pdfTextRef.current}
      downloadBlob={dlBlobRef.current}
      downloadName={name}
      downloadExt={dlExtRef.current}
      signInUrl={signInUrl}
      checkoutUrl={checkoutUrl}
      who={who}
      askFn={askFn}
    />
  );
}
