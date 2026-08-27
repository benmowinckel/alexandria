'use client';

import { useState } from 'react';

type State = 'idle' | 'loading' | 'copied' | 'error';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const fallback = document.createElement('textarea');
      fallback.value = text;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(fallback);
      return copied;
    } catch {
      return false;
    }
  }
}

export default function ConnectClient() {
  const [state, setState] = useState<State>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

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
        setError('couldn’t make a code. try again.');
        setState('error');
        return;
      }
      if (!/^alex_connect_[a-f0-9]{48}$/.test(text)) {
        setError('the code was invalid. try again.');
        setState('error');
        return;
      }

      setCode(text);
      const copied = await copyText(text);
      setState(copied ? 'copied' : 'error');
      if (!copied) setError('copy failed. press the button and try again.');
    } catch {
      setError('network hiccup. try again.');
      setState('error');
    }
  };

  const copyAgain = async () => {
    const copied = await copyText(code);
    setState(copied ? 'copied' : 'error');
    setError(copied ? '' : 'copy failed. try again.');
  };

  return (
    <div className="connect-action">
      {!code ? (
        <button type="button" className="connect-button" onClick={createAndCopy} disabled={state === 'loading'}>
          {state === 'loading' ? 'making the code…' : 'copy for your computer agent'}
        </button>
      ) : (
        <button type="button" className="connect-button" onClick={copyAgain}>
          {state === 'copied' ? 'copied' : 'copy again'}
        </button>
      )}

      {state === 'copied' ? (
        <p className="connect-status">paste it into your computer agent. the code lasts one hour.</p>
      ) : null}
      {error ? <p className="connect-error">{error}</p> : null}
    </div>
  );
}
