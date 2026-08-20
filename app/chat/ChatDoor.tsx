'use client';

import ChatCTA from './ChatCTA';

export default function ChatDoor({ refCode }: { refCode?: string }) {
  return <ChatCTA refCode={refCode} />;
}
