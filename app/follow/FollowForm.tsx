'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SERVER_URL } from '../lib/config';
import { ThemeToggle } from '../components/ThemeToggle';
import { ArrowIcon } from '../join/DoorIcons';

const AMOUNT_MIN = 0;
const AMOUNT_MAX = 200;
const AMOUNT_DEFAULT = 0;

// /follow — the third door, on the radically-simple law (founder 2026-07-25):
// hero, one email box (the /join grammar — input inside the box, arrow on type),
// one optional slider stripped to its mechanic. No eyebrow, no lede, no coda,
// no tier labels, no drag arrows. The box label carries the money state: it says
// "follow along" at $0 and "support $X/mo" once the slider moves, so the one
// action is always self-describing. Slider itself is the founder's 2026-07-15 call.
export default function FollowForm({ initialDone }: { initialDone: boolean }) {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(AMOUNT_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [doneKind, setDoneKind] = useState<null | 'free' | 'paid'>(
    initialDone ? 'paid' : null,
  );
  const done = doneKind !== null;
  const isHonorary = amount > 0;

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, amount }),
      });
      const body = await res.json().catch(() => ({} as { url?: string; error?: string }));
      if (!res.ok) { setError(body.error || 'could not sign up'); return; }
      if (body.url) { window.location.href = body.url; return; }
      setDoneKind('free');
    } catch {
      setError('could not sign up');
    } finally {
      setLoading(false);
    }
  };

  const brand = (
    <header className="primer-header">
      <Link href="/" className="primer-brand">
        alexandria<span className="primer-brand-dot">.</span>
      </Link>
    </header>
  );

  if (done) {
    const paid = doneKind === 'paid';
    return (
      <div className="primer-page">
        <ThemeToggle />
        {brand}
        <main className="primer-main">
          <h1 className="follow-hero">{paid ? 'Thank you.' : 'You’re in.'}</h1>
          <p className="follow-note">a note’s on its way — reply any time.</p>
        </main>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="primer-page">
      <ThemeToggle />
      {brand}

      <main className="primer-main">
        <h1 className="follow-hero">Follow along as we build.</h1>

        <form className="door-btn act-box act-email" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} onClick={() => document.getElementById('follow-email')?.focus()}>
          <input
            id="follow-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
            placeholder="your email"
            autoComplete="email"
            spellCheck={false}
            aria-label="email"
          />
          {!email.trim() && (
            <span className="act-why act-email-why">
              {isHonorary ? `— support $${amount}/mo` : '— follow along'}
            </span>
          )}
          {email.trim() && (
            <button type="submit" className="join-door-go" aria-label={isHonorary ? 'support' : 'follow'} disabled={loading}>
              <ArrowIcon />
            </button>
          )}
        </form>
        {error ? <p className="follow-error">{error}</p> : null}

        <div className="follow-support">
          <div className="follow-amount">
            {amount === 0
              ? <span className="follow-amount-free"><em>free</em> — or slide to back it</span>
              : <><span className="follow-amount-value">${amount}</span><span className="follow-amount-unit">/ month — checkout next, cancel anytime</span></>}
          </div>
          <input
            type="range"
            min={AMOUNT_MIN}
            max={AMOUNT_MAX}
            step={5}
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value, 10))}
            className="slider"
            aria-label="monthly support amount"
            style={{ ['--fill' as string]: `${(amount / AMOUNT_MAX) * 100}%` }}
          />
        </div>
      </main>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .primer-page {
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    background-image:
      radial-gradient(ellipse 120% 80% at 30% 20%, rgba(91, 31, 71, 0.025) 0%, transparent 60%),
      radial-gradient(ellipse 100% 70% at 70% 80%, rgba(74, 50, 30, 0.020) 0%, transparent 60%);
    animation: primerFadeIn 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  @keyframes primerFadeIn {
    0% { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .primer-header { padding: 28px 32px 0; }
  .primer-brand {
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-style: italic; font-weight: 400; font-size: 21px;
    color: var(--text-primary); text-decoration: none;
    letter-spacing: 0.005em; transition: opacity 220ms ease;
    display: inline-block; padding: 10px 8px; margin: -10px -8px;
  }
  .primer-brand:hover { opacity: 0.6; }
  .primer-brand-dot { font-style: normal; }

  .primer-main {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: flex-start; justify-content: center;
    max-width: 540px; margin: 0 auto; padding: 3rem 40px 6rem; width: 100%;
    text-align: left;
  }

  .follow-hero {
    margin: 0 0 26px; max-width: 500px;
    font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
    font-style: italic; font-weight: 500;
    font-size: clamp(27px, 1.5rem + 1.4vw, 34px); line-height: 1.22;
    letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
    font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1, "swsh" 1;
  }
  .follow-note {
    margin: 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 15px; line-height: 1.6; color: var(--text-muted);
  }

  /* The one action — the /join box grammar exactly. */
  .door-btn {
    display: block; width: 100%; max-width: 486px; text-align: left;
    background: var(--bg-secondary);
    border: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.14)); border-radius: 10px;
    padding: 17px 20px; cursor: pointer;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 17px; letter-spacing: 0.01em; color: var(--text-primary);
    transition: border-color 220ms, transform 120ms;
  }
  .door-btn:hover { border-color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
  .act-email { display: flex; align-items: center; gap: 0.32em; cursor: text; }
  .act-email input {
    flex: none; field-sizing: content; width: auto; min-width: 0; background: transparent;
    border: none; outline: none;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 17px; letter-spacing: 0.01em; color: var(--text-primary); padding: 0;
  }
  .act-email input:not(:placeholder-shown) { flex: 1; field-sizing: normal; }
  .act-email input::placeholder { color: var(--text-primary); }
  .act-why { color: var(--text-muted, rgba(26, 19, 24, 0.55)); }
  .act-email-why { flex: none; font-size: 17px; }
  .join-door-go {
    display: inline-flex; align-items: center; margin-left: auto; flex: none;
    padding: 0; background: none; border: none; color: var(--text-muted);
    cursor: pointer; transition: color 200ms;
  }
  .join-door-go:hover { color: var(--text-primary); }
  .join-door-go:disabled { opacity: 0.4; cursor: default; }

  .follow-error {
    margin: 12px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 13px; font-style: italic; color: var(--text-muted);
  }

  /* Optional support — the slider, stripped to its mechanic. */
  .follow-support {
    margin: 34px 0 0; padding-top: 26px; width: 100%; max-width: 486px;
    border-top: 1px solid var(--bg-tertiary, rgba(61, 54, 48, 0.12));
  }
  .follow-amount {
    display: flex; align-items: baseline; gap: 9px; margin: 0 0 16px; min-height: 26px;
  }
  .follow-amount-free {
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 15px; line-height: 1; letter-spacing: 0.01em;
    color: var(--text-muted, rgba(61, 54, 48, 0.62));
  }
  .follow-amount-free :global(em) { font-style: italic; color: var(--text-primary); }
  .follow-amount-value {
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 26px; line-height: 1; letter-spacing: -0.015em; color: var(--text-primary);
    font-variant-numeric: lining-nums;
  }
  .follow-amount-unit {
    font-size: 12.5px; font-style: italic; color: var(--text-muted); letter-spacing: 0.02em;
  }
  .slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; max-width: 486px; height: 1px;
    background: linear-gradient(
      to right,
      var(--text-primary) 0%,
      var(--text-primary) var(--fill, 0%),
      var(--text-muted, rgba(61, 54, 48, 0.3)) var(--fill, 0%),
      var(--text-muted, rgba(61, 54, 48, 0.3)) 100%
    );
    outline: none; cursor: pointer; margin: 4px 0 2px;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
    background: var(--text-primary); cursor: grab; transition: transform 160ms ease;
  }
  .slider::-webkit-slider-thumb:hover { transform: scale(1.18); }
  .slider::-webkit-slider-thumb:active { cursor: grabbing; }
  .slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--text-primary); border: none; cursor: grab;
  }

  @media (max-width: 640px) {
    .primer-main { padding: 2rem 24px 4rem; }
    .follow-hero { font-size: 25px; }
  }
`;
