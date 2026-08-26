'use client';

import ChatCTA from './ChatCTA';
import { CHAT_HOSTS, type ChatHost } from '../../shared/onboarding-prompts';
import { useDoorStep } from '../lib/door-step';

const HOSTS = Object.keys(CHAT_HOSTS) as ChatHost[];

export default function ChatDoor({ refCode }: { refCode?: string }) {
  const [host, go] = useDoorStep(HOSTS);

  if (host) {
    return <ChatCTA refCode={refCode} host={host} />;
  }

  return (
    <div className="door-block">
      <p className="door-q">which chat do you use most?</p>
      <div className="door-answers">
        {HOSTS.map((id) => (
          <button key={id} type="button" className="door-btn" onClick={() => go(id)}>
            {CHAT_HOSTS[id].label}
          </button>
        ))}
      </div>
    </div>
  );
}
