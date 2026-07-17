'use client';

import { useState, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { SERVER_URL } from '../lib/config';
import { ThemeToggle } from '../components/ThemeToggle';

const AMOUNT_MIN = 0;
const AMOUNT_MAX = 200;
// Opens on free (2026-07-15, warm-lead P0.6a): the homepage ghost CTA promises
// "just your email", so this page must open as an email capture, not a $ anchor.
// The pay-what-you-want slider stays — the optional second beat below the email.
const AMOUNT_DEFAULT = 0;

// /follow — the third door, rebuilt onto the /start + /join skeleton (founder
// 2026-07-17): the flush-left editorial spine, the CSS-var theme (so dark mode
// works), the ThemeToggle, the brand header, the coda. This is the low-friction
// COMPANY door — no GitHub, no tool needed — for someone who likes the mission
// and wants to follow along, with an optional pay-what-you-want slider to back
// it. Distinct from /join (founding member, $10, the community) and /start (the
// free tool). Copy is the founder's, kept; only the structure and style change.
export default function FollowForm({ initialDone }: { initialDone: boolean }) {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(AMOUNT_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [doneKind, setDoneKind] = useState<null | 'free' | 'paid'>(
    initialDone ? 'paid' : null,
  );
  const done = doneKind !== null;
  const sliderRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hintLeft, setHintLeft] = useState<number | null>(null);

  // Keep the "drag" hint centred under the slider thumb as it moves.
  useLayoutEffect(() => {
    const slider = sliderRef.current;
    const wrap = wrapRef.current;
    if (!slider || !wrap) return;
    const update = () => {
      const sr = slider.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const ratio = (amount - AMOUNT_MIN) / (AMOUNT_MAX - AMOUNT_MIN);
      const THUMB = 16;
      const thumbCenterInSlider = THUMB / 2 + ratio * (sr.width - THUMB);
      setHintLeft(sr.left - wr.left + thumbCenterInSlider);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [amount]);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setShakeKey((k) => k + 1);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, amount }),
      });
      const body = await res.json().catch(() => ({} as { url?: string; error?: string; ok?: boolean }));
      if (!res.ok) {
        setError(body.error || 'could not sign up');
        return;
      }
      if (body.url) {
        window.location.href = body.url;
        return;
      }
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
          <p className="primer-eyebrow">{paid ? 'thank you' : 'you’re following along'}</p>
          <h1 className="follow-hero">
            {paid ? 'Thank you for backing alexandria.' : 'You’re in.'}
          </h1>
          <p className="follow-lede">
            {paid
              ? 'A note’s on its way — reply any time.'
              : 'A note’s on its way to your inbox — we’ll keep you posted as we build.'}
          </p>
          <p className="primer-coda"><em>keep thinking.</em></p>
        </main>
        <style>{styles}</style>
      </div>
    );
  }

  const isHonorary = amount > 0;

  return (
    <div className="primer-page">
      <ThemeToggle />
      {brand}

      <main className="primer-main">
        <p className="primer-eyebrow">follow along</p>
        <h1 className="follow-hero">Not ready for the tool? Follow along as we build.</h1>
        <p className="follow-lede">
          Leave your email &mdash; we&rsquo;ll keep you posted, and you can back
          the project if you want to.
        </p>

        {/* Primary action — the email. Underline field to match /join's doors. */}
        <div className="follow-field">
          <input
            key={shakeKey}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            data-follow-shake={shakeKey > 0 ? 'on' : 'off'}
            placeholder="your email"
            autoComplete="email"
            spellCheck={false}
            aria-label="email"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="follow-cta"
          >
            {loading ? '…' : 'follow'}
          </button>
        </div>
        {error ? <p className="follow-error">{error}</p> : null}

        {/* Optional support — clearly secondary, below the action. Free by
            default; the slider is there only if they want to chip in. */}
        <div className="follow-support">
          <p className="follow-support-q">want to back us? it&rsquo;s free either way &mdash; drag if you&rsquo;d like to chip in.</p>
          <div className="follow-amount">
            {amount === 0 ? (
              <span className="follow-amount-free"><em>free</em></span>
            ) : (
              <>
                <span className="follow-amount-value">${amount}</span>
                <span className="follow-amount-unit">/ month</span>
              </>
            )}
          </div>
          <div className="slider-wrap" ref={wrapRef}>
            <input
              ref={sliderRef}
              type="range"
              min={AMOUNT_MIN}
              max={AMOUNT_MAX}
              step={5}
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value, 10))}
              className="slider"
              aria-label="monthly amount"
              style={{ ['--fill' as string]: `${(amount / AMOUNT_MAX) * 100}%` }}
            />
            <p
              className="slider-hint"
              aria-hidden
              style={{
                left: hintLeft == null ? '50%' : `${hintLeft}px`,
                visibility: hintLeft == null ? 'hidden' : 'visible',
                ['--lfade' as string]: amount <= AMOUNT_MIN ? '0' : '1',
                ['--rfade' as string]: amount >= AMOUNT_MAX ? '0' : '1',
              }}
            >
              <span className="hint-arrow hint-l">←</span>
              <em>drag</em>
              <span className="hint-arrow hint-r">→</span>
            </p>
          </div>
          <div className="tier-row" aria-live="polite">
            <span className={`tier ${isHonorary ? 'is-dim' : 'is-on'}`}>
              <em>follower of alexandria.</em>
            </span>
            <span className={`tier tier-right ${isHonorary ? 'is-on' : 'is-dim'}`}>
              <em>honorary alexandrian.</em>
            </span>
          </div>
        </div>

        {/* The other two doors — a quiet cross-link so /follow doesn't read as a
            dead end or a rival to /join. */}
        <p className="follow-next">
          Or: <Link href="/start">get the free tool</Link> &middot;{' '}
          <Link href="/join">join the community</Link>.
        </p>

        <p className="primer-coda"><em>keep thinking.</em></p>
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

  /* Flush-left editorial column, vertically centred — the /start + /join spine. */
  .primer-main {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: flex-start; justify-content: center;
    max-width: 620px; margin: 0 auto; padding: 3rem 40px 6rem; width: 100%;
    text-align: left;
  }

  .primer-eyebrow {
    margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-weight: 500; font-size: 11.5px; letter-spacing: 0.3em;
    text-transform: lowercase; font-variant-caps: all-small-caps;
    font-feature-settings: "smcp" 1, "kern" 1;
    color: var(--accent); line-height: 1;
  }

  /* Hero in EB Garamond (the calligraphic italic), matching /join. */
  .follow-hero {
    margin: 0 0 22px; max-width: 560px;
    font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
    font-style: italic; font-weight: 500;
    font-size: clamp(27px, 1.5rem + 1.4vw, 34px); line-height: 1.22;
    letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
    font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1, "swsh" 1;
  }

  .follow-lede {
    margin: 0 0 30px; max-width: 500px;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 16px; line-height: 1.6; color: var(--text-secondary);
    text-wrap: pretty;
  }

  /* Email — the primary action. Underline field + inline follow button, in the
     same editorial idiom as /join's doors. */
  .follow-field {
    display: flex; align-items: baseline; gap: 14px;
    width: 100%; max-width: 460px;
  }
  .follow-field input {
    flex: 1; min-width: 0; height: 40px; padding: 0 2px;
    font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 18px;
    color: var(--text-primary); background: transparent;
    border: none; border-bottom: 1px solid var(--text-muted, rgba(61, 54, 48, 0.32));
    border-radius: 0; outline: none; transition: border-color 200ms;
  }
  .follow-field input::placeholder { color: var(--text-muted, rgba(61, 54, 48, 0.42)); font-style: italic; }
  .follow-field input:focus { border-bottom-color: var(--text-secondary, rgba(61, 54, 48, 0.7)); }
  .follow-field input[data-follow-shake="on"] { animation: followShake 320ms ease-in-out; }
  @keyframes followShake {
    0%, 100% { transform: translateX(0); }
    25%      { transform: translateX(-3px); border-bottom-color: #b3261e; }
    75%      { transform: translateX(3px);  border-bottom-color: #b3261e; }
  }
  .follow-cta {
    flex-shrink: 0; align-self: center;
    padding: 11px 24px; border-radius: 9px;
    background: var(--text-primary); color: var(--bg-primary);
    font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 16px;
    letter-spacing: 0.01em; border: none; cursor: pointer;
    transition: opacity 200ms, transform 120ms;
  }
  .follow-cta:hover:not(:disabled) { opacity: 0.88; }
  .follow-cta:active { transform: scale(0.98); }
  .follow-cta:disabled { opacity: 0.4; cursor: default; }
  .follow-error {
    margin: 12px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 13px; font-style: italic; color: var(--text-muted);
  }

  /* Optional support — a quiet block beneath the email, clearly secondary. */
  .follow-support {
    margin: 40px 0 0; padding-top: 28px; width: 100%; max-width: 500px;
    border-top: 1px solid var(--bg-tertiary, rgba(61, 54, 48, 0.12));
  }
  .follow-support-q {
    margin: 0 0 20px; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 13.5px; line-height: 1.6; font-style: italic; letter-spacing: 0.01em;
    color: var(--text-muted, rgba(61, 54, 48, 0.6));
  }
  .follow-amount {
    display: flex; align-items: baseline; gap: 9px; margin: 0 0 14px;
  }
  .follow-amount-free {
    font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
    font-size: 30px; line-height: 1; font-style: italic; letter-spacing: -0.01em;
    color: var(--text-primary);
  }
  .follow-amount-value {
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 30px; line-height: 1; letter-spacing: -0.015em; color: var(--text-primary);
    font-variant-numeric: lining-nums;
  }
  .follow-amount-unit {
    font-size: 13px; font-style: italic; color: var(--text-muted); letter-spacing: 0.02em;
  }

  .slider-wrap { position: relative; padding-bottom: 42px; max-width: 460px; }
  .slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 1px;
    background: linear-gradient(
      to right,
      var(--text-primary) 0%,
      var(--text-primary) var(--fill, 0%),
      var(--text-muted, rgba(61, 54, 48, 0.3)) var(--fill, 0%),
      var(--text-muted, rgba(61, 54, 48, 0.3)) 100%
    );
    outline: none; cursor: pointer; margin: 4px 0 2px; position: relative; z-index: 1;
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
  .slider-hint {
    position: absolute; top: 36px; transform: translateX(-50%);
    display: inline-flex; align-items: center; margin: 0;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 11px; letter-spacing: 0.04em; color: var(--text-muted);
    opacity: 0.75; white-space: nowrap; pointer-events: none;
    transition: left 80ms ease-out;
  }
  .slider-hint :global(em) { font-style: italic; }
  .slider-hint .hint-arrow {
    display: inline-block; width: 12px; text-align: center; font-style: normal;
    font-size: 11px; transition: opacity 200ms ease;
  }
  .slider-hint .hint-l { margin-right: 8px; opacity: var(--lfade, 1); }
  .slider-hint .hint-r { margin-left: 8px; opacity: var(--rfade, 1); }

  .tier-row {
    display: flex; justify-content: space-between; gap: 16px; max-width: 460px;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 13.5px; letter-spacing: 0.015em; font-style: italic;
  }
  .tier { transition: color 320ms ease, opacity 320ms ease; }
  .tier-right { text-align: right; }
  .tier.is-on  { color: var(--text-primary); opacity: 1; }
  .tier.is-dim { color: var(--text-muted); opacity: 0.5; }

  /* Cross-link to the other two doors. */
  .follow-next {
    margin: 34px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 14px; line-height: 1.6; color: var(--text-muted, rgba(61, 54, 48, 0.6));
  }
  .follow-next a {
    color: var(--text-secondary, rgba(61, 54, 48, 0.82));
    text-decoration: underline; text-decoration-color: var(--text-muted, rgba(61, 54, 48, 0.4));
    text-underline-offset: 3px; text-decoration-thickness: 1px;
    transition: color 200ms, text-decoration-color 200ms;
  }
  .follow-next a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }

  .primer-coda {
    margin: 52px 0 0; text-align: left; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 20px; font-style: italic; color: var(--text-primary);
    letter-spacing: 0.005em; opacity: 0.72;
  }

  @media (max-width: 640px) {
    .primer-main { padding: 2rem 24px 4rem; }
    .follow-hero { font-size: 25px; }
    .follow-lede { font-size: 15.5px; }
    .follow-field input { font-size: 17px; }
    .primer-coda { font-size: 18px; margin-top: 44px; }
  }
`;
