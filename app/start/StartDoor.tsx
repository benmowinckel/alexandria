'use client';

import { useEffect } from 'react';
import { checkReferral } from '../lib/referral';
import { useDoorStep } from '../lib/door-step';
import ChatCTA from '../chat/ChatCTA';
import StartCTA from './StartCTA';
import { CHAT_HOSTS, isChatHost, type ChatHost } from '../../shared/onboarding-prompts';

const CHAT_HOST_IDS = Object.keys(CHAT_HOSTS) as ChatHost[];
const STEPS = ['agent', 'computer', 'phone', 'chat', ...CHAT_HOST_IDS] as const;

// Agent/chat chooses the product. Computer reach then changes the action:
// setup now, or leave a verified cross-device reminder and durable email copy.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, go] = useDoorStep(STEPS);

  useEffect(() => {
    if (!refCode) return;
    let live = true;
    checkReferral(refCode).then((valid) => {
      if (!live || !valid) return;
      try { window.localStorage.setItem('alexandria-referrer', refCode); } catch { /* storage is optional */ }
    });
    return () => { live = false; };
  }, [refCode]);

  if (isChatHost(screen)) {
    return <ChatCTA refCode={refCode} host={screen} />;
  }

  if (screen === 'chat') {
    return (
      <div className="door-block">
        <p className="door-q">which chat do you use most?</p>
        <div className="door-answers">
          {CHAT_HOST_IDS.map((host) => (
            <button key={host} type="button" className="door-btn" onClick={() => go(host)}>
              {CHAT_HOSTS[host].label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (screen === 'agent') {
    return (
      <div className="door-block">
        <p className="door-q">is your computer in reach?</p>
        <div className="door-answers">
          <button className="door-btn" onClick={() => go('computer')}>yes — i’ll grab it now</button>
          <button className="door-btn" onClick={() => go('phone')}>no — not right now</button>
        </div>
      </div>
    );
  }

  if (screen === 'computer') {
    return <StartCTA key="computer" refCode={refCode} mode="computer" />;
  }

  if (screen === 'phone') {
    return <StartCTA key="later" refCode={refCode} mode="later" />;
  }

  return (
    <div className="door-block">
      <p className="door-q">what do you have access to?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => go('agent')}>
          an agent<span className="act-why"> — eg codex, claude code, cursor</span>
        </button>
        <button className="door-btn" onClick={() => go('chat')}>
          just chat<span className="act-why"> — eg chatgpt, claude, gemini</span>
        </button>
      </div>
    </div>
  );
}
