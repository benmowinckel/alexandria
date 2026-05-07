'use client';

import { useState } from 'react';
import { SERVER_URL } from '../lib/config';

export default function SignupCTA({ urlRef, refSource }: { urlRef?: string; refSource?: string }) {
  const [kinCode, setKinCode] = useState('');
  const ref = kinCode.trim() || urlRef;
  const authParams = [ref && `ref=${encodeURIComponent(ref)}`, refSource && `ref_source=${encodeURIComponent(refSource)}`].filter(Boolean).join('&');
  const authUrl = `${SERVER_URL}/auth/github${authParams ? `?${authParams}` : ''}`;

  return (
    <section className="cta-section">
      <a href={authUrl} className="primary-cta">sign up with github</a>
      <div className="kin-row">
        {urlRef ? (
          <p className="kin-via">via {urlRef}</p>
        ) : (
          <input
            type="text"
            value={kinCode}
            onChange={(e) => setKinCode(e.target.value)}
            placeholder="kin code"
            className="kin-input"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </div>
    </section>
  );
}
