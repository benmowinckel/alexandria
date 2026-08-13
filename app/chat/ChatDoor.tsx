'use client';

import { useState } from 'react';
import ChatCTA from './ChatCTA';
import { CHAT_HOSTS, type ChatHost } from '../../shared/onboarding-prompts';

const HOSTS = Object.keys(CHAT_HOSTS) as ChatHost[];

export default function ChatDoor({ refCode }: { refCode?: string }) {
  const [host, setHost] = useState<ChatHost | null>(null);

  if (host) {
    return <ChatCTA refCode={refCode} host={host} onChangeHost={() => setHost(null)} />;
  }

  return (
    <div className="door-block">
      <p className="door-q">which chat do you use?</p>
      <div className="door-answers">
        {HOSTS.map((id) => (
          <button key={id} type="button" className="door-btn" onClick={() => setHost(id)}>
            {CHAT_HOSTS[id].label}
          </button>
        ))}
      </div>
    </div>
  );
}
