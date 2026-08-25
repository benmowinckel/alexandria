'use client';

import { useRef, useState } from 'react';

type State = 'idle' | 'loading' | 'copied' | 'ready' | 'error';

async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallback) return false;
    try {
      fallback.focus();
      fallback.select();
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

export default function ConnectClient() {
  const [state, setState] = useState<State>('idle');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);

  const createAndCopy = async () => {
    if (state === 'loading') return;
    setState('loading');
    setError('');

    try {
      const res = await fetch('/api/account/connect', {
        method: 'POST',
        credentials: 'include',
      });
      const text = await res.text();
      if (!res.ok) {
        setError(text || 'something broke. try again.');
        setState('error');
        return;
      }

      setPaste(text);
      // Let React mount the fallback textarea before attempting the legacy
      // selection route. Modern clipboard succeeds directly on the first tap.
      requestAnimationFrame(async () => {
        const copied = await copyText(text, textarea.current);
        setState(copied ? 'copied' : 'ready');
      });
    } catch {
      setError('network hiccup. try again.');
      setState('error');
    }
  };

  const copyAgain = async () => {
    const copied = await copyText(paste, textarea.current);
    setState(copied ? 'copied' : 'ready');
  };

  return (
    <div className="connect-action">
      {!paste ? (
        <button type="button" className="connect-button" onClick={createAndCopy} disabled={state === 'loading'}>
          {state === 'loading' ? 'making the handoff…' : 'copy for your ai'}
        </button>
      ) : (
        <>
          <textarea
            ref={textarea}
            className="connect-paste"
            value={paste}
            readOnly
            aria-label="Alexandria connection text"
          />
          <button type="button" className="connect-button" onClick={copyAgain}>
            {state === 'copied' ? 'copied' : 'copy again'}
          </button>
        </>
      )}

      {state === 'copied' ? (
        <p className="connect-status">paste it into your ai on your computer. the code lasts 24 hours.</p>
      ) : state === 'ready' ? (
        <p className="connect-status">press and hold the text above to copy it.</p>
      ) : null}
      {error ? <p className="connect-error">{error}</p> : null}
    </div>
  );
}
