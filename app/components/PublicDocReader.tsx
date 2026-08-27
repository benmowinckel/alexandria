'use client';

import { useEffect, useState } from 'react';
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
 * the pitch. Inference runs on the device sidecar; the browser sends only this
 * document's Library reference and the Worker supplies the exact authorized
 * public Library slice. The sidecar has no private Author files in reach.
 */
export default function PublicDocReader({
  title, mdSrc, pdfSrc, txtSrc, numbered, plain, askQuestions, askFirst,
  artifactName, artifactScope = 'public', answerInstruction,
}: {
  title: string;
  mdSrc?: string;   // markdown to fetch + render (the whitepaper)
  pdfSrc?: string;  // a PDF to embed (the letter)
  txtSrc?: string;  // the PDF's text (for the copy button)
  numbered?: boolean; // book setting — TOC + hanging numerals + colophon plate
  plain?: boolean;    // with numbered: the plain (ragged-right) variant
  askQuestions?: string[]; // this doc's own suggested questions → the rotation
  askFirst?: boolean;      // open with the mirror pane up (the /features ask page)
  artifactName: string;    // server-authoritative Library artifact; browser never sends bytes
  artifactScope?: string;
  answerInstruction?: string; // surface-specific voice/length guidance, hidden from the reader
}) {
  // The allowance comes from the Author's directory rather than a duplicated
  // client-side limit.
  const [budget, setBudget] = useState<{ remaining: number; limit: number; signedIn: boolean } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [markdown, setMarkdown] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [text, setText] = useState('');
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (pdfSrc) {
          const [pres, tres] = await Promise.all([fetch(pdfSrc), txtSrc ? fetch(txtSrc) : Promise.resolve(null)]);
          const blob = await pres.blob();
          if (!live) return;
          setDownloadBlob(blob);
          setPdfUrl(URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })));
          if (tres && tres.ok) setText((await tres.text()).trim());
          setStatus('ok');
        } else if (mdSrc) {
          const r = await fetch(mdSrc);
          const t = r.ok ? await r.text() : '';
          if (!live) return;
          setDownloadBlob(new Blob([t], { type: 'text/markdown' }));
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
        if (!t) return;
        if (typeof t.remaining === 'number' && typeof t.limit === 'number') {
          setBudget({ remaining: t.remaining, limit: t.limit, signedIn: !!t.signed_in });
        }
      })
      .catch(() => { /* allowance is discovered on the first ask instead */ });
    return () => { live = false; };
  }, []);

  // Ask Benjamin's OWN public context twin (the same mind on his profile), with
  // the doc the reader is on passed as `focus` so the answer is grounded in it.
  // `text` holds the current doc (markdown or the letter's extracted text).
  const askFn = async (question: string, messages: { role: 'user' | 'assistant'; content: string }[]) => {
    const res = await fetch(`/api/library/${FOUNDER_LIBRARY_ID}/ask`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: answerInstruction ? `${question}\n\n${answerInstruction}` : question,
        variant: 'context',
        artifact: { name: artifactName, scope: artifactScope },
        messages,
      }),
    });
    const b = await res.json().catch(() => ({}));
    // The answer carries what it cost: what's left of this reader's allowance,
    // and which mind answered — the live model from the mirror's own health,
    // never a copy of that string kept here.
    if (res.ok && b.answer) {
      return {
        answer: b.answer as string,
        remaining: b.remaining, limit: b.limit, signed_in: b.signed_in,
        variant: b.variant ?? null,
      };
    }
    // Out of questions is its own outcome, not a failure: the shell turns this
    // into the handoff rather than an error line.
    if (b?.handoff) {
      throw Object.assign(new Error(String(b.error || 'You’ve used your questions for today.')),
        { allowanceSpent: true, limit: b.limit, signedIn: !!b.signed_in });
    }
    // THROW on failure — never return the error as if it were the answer. The
    // shell renders a thrown message as a status note, so a mirror that is
    // offline can't be mistaken for a mirror that doesn't know (founder
    // 2026-07-28). The server's own reason is the message.
    throw new Error(b.error || 'couldn’t reach the mirror — it may be offline. your question wasn’t answered.');
  };

  // The empty state keeps only the two quiet conversion doors.
  const intro = (
    <div style={{ color: 'var(--text-muted)', fontSize: '1.02rem', lineHeight: 1.78, textWrap: 'pretty' }}>
      <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: '0.95rem', fontSize: '0.95rem' }}>
        <Link href="/start" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="hover:opacity-70">start your loop</Link>
        <span aria-hidden style={{ color: 'var(--text-ghost)' }}>·</span>
        <Link href={FOUNDER_PROFILE_PATH} style={{ color: 'var(--text-muted)', textDecoration: 'none' }} className="hover:opacity-70">Benjamin’s library</Link>
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
      downloadBlob={downloadBlob}
      downloadName={title.replace(/\s+/g, '-')}
      downloadExt={pdfSrc ? 'pdf' : 'md'}
      who="Benjamin"
      askPlaceholder={'ask the mirror about this…'}
      askQuestions={askQuestions}
      askFn={askFn}
      handoffAuthorId={FOUNDER_LIBRARY_ID}
      initialBudget={budget}
      intro={intro}
      askFirst={askFirst}
      // The whitepaper and the letter: they open on a closed mirror and a long
      // read, so the ask is docked under the document. The mirror-led pages
      // (askFirst) already open with the pane up and need nothing.
      dockedAsk={!askFirst}
      footerCta="start your loop"
      docPage
    />
  );
}
