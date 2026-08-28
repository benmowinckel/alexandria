'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { checkReferral } from '../lib/referral';
import { useDoorStep } from '../lib/door-step';
import ChatCTA from '../chat/ChatCTA';
import StartCTA from './StartCTA';
import { CHAT_HOSTS, isChatHost, type ChatHost } from '../../shared/onboarding-prompts';

const CHAT_HOST_IDS = Object.keys(CHAT_HOSTS) as ChatHost[];
const STEPS = ['agent', 'computer', 'phone', 'chat', ...CHAT_HOST_IDS] as const;
type Step = (typeof STEPS)[number];
type StagePhase = 'idle' | 'leaving' | 'entering';

const EXIT_AND_BREATH_MS = 230;
const ENTER_MS = 320;
const REDUCED_EXIT_AND_BREATH_MS = 100;
const REDUCED_ENTER_MS = 160;

// Agent/chat chooses the product. Computer reach then changes the action:
// setup now, or leave a verified cross-device reminder and durable email copy.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, go] = useDoorStep(STEPS);
  const [phase, setPhase] = useState<StagePhase>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!refCode) return;
    let live = true;
    checkReferral(refCode).then((valid) => {
      if (!live || !valid) return;
      try { window.localStorage.setItem('alexandria-referrer', refCode); } catch { /* storage is optional */ }
    });
    return () => { live = false; };
  }, [refCode]);

  function transitionTo(next: Step) {
    if (phase !== 'idle') return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const exitDelay = reduced ? REDUCED_EXIT_AND_BREATH_MS : EXIT_AND_BREATH_MS;
    const enterDelay = reduced ? REDUCED_ENTER_MS : ENTER_MS;

    setPhase('leaving');
    timers.current.push(setTimeout(() => {
      go(next);
      setPhase('entering');
      timers.current.push(setTimeout(() => setPhase('idle'), enterDelay));
    }, exitDelay));
  }

  function stage(content: ReactNode) {
    return (
      <div
        key={screen ?? 'start'}
        className={`door-stage${phase === 'idle' ? '' : ` is-${phase}`}`}
        aria-busy={phase !== 'idle'}
      >
        {content}
      </div>
    );
  }

  if (isChatHost(screen)) {
    return stage(<ChatCTA refCode={refCode} host={screen} />);
  }

  if (screen === 'chat') {
    return stage(
      <div className="door-block">
        <p className="door-q">which chat do you use most?</p>
        <div className="door-answers">
          {CHAT_HOST_IDS.map((host) => (
            <button key={host} type="button" className="door-btn" onClick={() => transitionTo(host)}>
              {CHAT_HOSTS[host].label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (screen === 'agent') {
    return stage(
      <div className="door-block">
        <p className="door-q">is your computer in reach?</p>
        <div className="door-answers">
          <button className="door-btn" onClick={() => transitionTo('computer')}>yes — i’ll grab it now</button>
          <button className="door-btn" onClick={() => transitionTo('phone')}>no — not right now</button>
        </div>
      </div>
    );
  }

  if (screen === 'computer') {
    return stage(<StartCTA key="computer" refCode={refCode} mode="computer" />);
  }

  if (screen === 'phone') {
    return stage(<StartCTA key="later" refCode={refCode} mode="later" />);
  }

  return stage(
    <div className="door-block">
      <p className="door-q">what do you have access to?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => transitionTo('agent')}>
          an agent<span className="act-why"> — eg codex, claude code, cursor</span>
        </button>
        <button className="door-btn" onClick={() => transitionTo('chat')}>
          just chat<span className="act-why"> — eg chatgpt, claude, gemini</span>
        </button>
      </div>
    </div>
  );
}
