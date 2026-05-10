'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_URL } from '../lib/config';

// In-app browsers on iOS (Instagram/Facebook/LinkedIn/etc) silently break
// Apple Pay — sheet fails to authorize, no SetupIntent reaches Stripe, user
// drops off. UA detection catches the highest-baseline-rate cases and prompts
// open-in-Safari. Conservative — false positives are tolerable (user can
// ignore the hint), false negatives lose conversions.
const WEBVIEW_PATTERN = /Instagram|FBAN|FBAV|FB_IAB|FB4A|TwitterAndroid|LinkedInApp|Snapchat|musical_ly|BytedanceWebview|TikTok\/|Pinterest\/|MicroMessenger|Line\//i;

const ICON_CHECK = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ICON_X = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

type KinStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export default function SignupCTA({ urlRef, refSource }: { urlRef?: string; refSource?: string }) {
  const [kinCode, setKinCode] = useState('');
  const [kinStatus, setKinStatus] = useState<KinStatus>('idle');
  const [inWebview, setInWebview] = useState(false);
  const checkSeq = useRef(0);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && WEBVIEW_PATTERN.test(navigator.userAgent)) {
      setInWebview(true);
    }
  }, []);

  const checkKin = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) { setKinStatus('idle'); return; }
    setKinStatus('checking');
    const seq = ++checkSeq.current;
    try {
      const res = await fetch(`${SERVER_URL}/check-kin?code=${encodeURIComponent(trimmed)}`);
      if (seq !== checkSeq.current) return; // a newer check superseded this one
      if (!res.ok) { setKinStatus('idle'); return; }
      const data = await res.json() as { valid?: boolean };
      setKinStatus(data.valid ? 'valid' : 'invalid');
    } catch {
      if (seq === checkSeq.current) setKinStatus('idle');
    }
  }, []);

  // Debounced auto-check while typing. Sets 'checking' immediately on every keystroke
  // so a stale ✓/✗ from the previous code doesn't linger while the user types more.
  useEffect(() => {
    if (!kinCode.trim()) { setKinStatus('idle'); return; }
    setKinStatus('checking');
    const t = setTimeout(() => checkKin(kinCode), 350);
    return () => clearTimeout(t);
  }, [kinCode, checkKin]);

  // Include ref unless we explicitly know it's invalid; server callback gate is the actual loop-closer.
  const ref = urlRef || (kinStatus !== 'invalid' && kinCode.trim() ? kinCode.trim() : '');
  const authParams = [ref && `ref=${encodeURIComponent(ref)}`, refSource && `ref_source=${encodeURIComponent(refSource)}`].filter(Boolean).join('&');
  const authUrl = `${SERVER_URL}/auth/github${authParams ? `?${authParams}` : ''}`;

  // Form submit (Enter) just triggers an immediate check — useful for impatient users
  // who don't want to wait the 350ms debounce. Never navigates; the GitHub button is the only nav.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkKin(kinCode);
  };

  const clearKin = () => {
    setKinCode('');
    setKinStatus('idle');
  };

  return (
    <section className="cta-section">
      {inWebview && (
        <p className="webview-notice">
          in-app browsers may break apple pay &mdash; open in safari for full payment options.
        </p>
      )}
      <a href={authUrl} className="primary-cta">sign up with github</a>
      <form onSubmit={handleSubmit} className="kin-form">
        {urlRef ? (
          <p className="kin-via">via {urlRef}</p>
        ) : (
          <>
            <input
              type="text"
              value={kinCode}
              onChange={(e) => setKinCode(e.target.value)}
              placeholder="kin code"
              className="kin-input"
              autoComplete="off"
              spellCheck={false}
              aria-label="kin code"
            />
            {kinStatus === 'valid' && (
              <span className="kin-status valid" aria-hidden>{ICON_CHECK}</span>
            )}
            {kinStatus === 'invalid' && (
              <button type="button" onClick={clearKin} className="kin-status invalid" aria-label="clear kin code">
                {ICON_X}
              </button>
            )}
          </>
        )}
      </form>
      <span className="sr-only" aria-live="polite">
        {kinStatus === 'valid' ? `kin code confirmed: ${kinCode.trim()}` : kinStatus === 'invalid' ? 'kin code not found' : ''}
      </span>
      {kinStatus === 'valid' && !urlRef && <p className="kin-feedback valid">confirmed via {kinCode.trim()}.</p>}
      {kinStatus === 'invalid' && <p className="kin-feedback invalid">not a kin we know &mdash; double-check the code, or proceed without it.</p>}
    </section>
  );
}
