'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * ChatHistoryItem — one row in the reader/PLM history pane. Rendered identically
 * on every chat surface (the reader shell and the profile PLM chat) so the
 * history behaves the same everywhere by construction.
 *
 * The row shows the conversation's title (a live-derived first-line, or a name
 * the reader set). Hovering the row reveals two quiet icons — rename and delete
 * — that stay hidden otherwise so the pane never clutters (founder 2026-07-20).
 * Rename swaps the title for an inline field; Enter/blur commits, Esc cancels.
 */

export type ChatMsg = { role: 'you' | 'twin'; text: string };
export type ChatConvo = { id: string; messages: ChatMsg[]; title?: string };

export function convoTitle(c: ChatConvo): string {
  if (c.title && c.title.trim()) return c.title.trim();
  const first = c.messages.find((m) => m.role === 'you')?.text.trim();
  if (!first) return 'Untitled';
  return first.length > 34 ? `${first.slice(0, 34)}…` : first;
}

const actIcon = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
const EditGlyph = (
  <svg width="14" height="14" {...actIcon}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
const TrashGlyph = (
  <svg width="14" height="14" {...actIcon}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);

export default function ChatHistoryItem({
  convo, active, onOpen, onRename, onDelete,
}: {
  convo: ChatConvo;
  active: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  const startEdit = () => { setDraft(convoTitle(convo)); setEditing(true); };
  const commit = () => { onRename(convo.id, draft.trim()); setEditing(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
  };

  const rowBase = {
    position: 'relative' as const, display: 'flex', alignItems: 'center',
    borderRadius: '8px', margin: '0 0 0.15rem', minHeight: '2rem',
  };

  if (editing) {
    return (
      <div className="chat-hist-row is-active" style={rowBase}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          spellCheck={false}
          aria-label="rename conversation"
          style={{
            flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
            color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.4,
            padding: '0.5rem 0.6rem',
          }}
        />
      </div>
    );
  }

  return (
    <div className={`chat-hist-row${active ? ' is-active' : ''}`} style={rowBase}>
      <button
        type="button"
        onClick={() => onOpen(convo.id)}
        className="hover:opacity-80"
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer',
          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
          fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.4,
          // Right gutter reserved for the two hover actions so a long title's
          // ellipsis never collides with the icons.
          padding: '0.5rem 2.8rem 0.5rem 0.6rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {convoTitle(convo)}
      </button>
      <div className="chat-hist-actions">
        <button type="button" onClick={startEdit} aria-label="rename conversation" title="rename" className="chat-hist-act">{EditGlyph}</button>
        <button type="button" onClick={() => onDelete(convo.id)} aria-label="delete conversation" title="delete" className="chat-hist-act">{TrashGlyph}</button>
      </div>
    </div>
  );
}
