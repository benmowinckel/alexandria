/**
 * The handoff — what a reader takes with them when they leave.
 *
 * Alexandria's whole claim is that the intelligence is rented and the mind is
 * owned. This is that claim made literal at the one place it could be broken:
 * when our allowance runs out, the reader does not lose the conversation, they
 * take the substance of it — the Author's public mind, the piece under
 * discussion, and everything said so far — and continue on the model they
 * already pay for. Nothing is held hostage; the wall is a door.
 *
 * It is markdown on purpose. Every AI reads it, no format to agree on, no
 * integration to maintain, and it stays readable to a human who opens the file
 * years later. Data and intent, never intelligence.
 */

export type HandoffAuthor = {
  author: string;
  author_name: string;
  profile_url: string;
  shadow: string;
  works: { name: string; title: string | null; url: string }[];
};

export type HandoffMsg = { role: 'you' | 'twin' | 'note'; text: string };

export type HandoffInput = {
  ctx: HandoffAuthor | null;
  /** The artifact being read, when there is one. */
  piece?: { name: string; content: string } | null;
  /** The conversation so far, in order. Status notes are dropped — nobody said them. */
  messages?: HandoffMsg[];
  /** What answered up to here, so the next model knows what it is continuing. */
  model?: string | null;
  variant?: string | null;
};

/** A piece can be book-length; keep the bundle pasteable into any chat box. */
const PIECE_CAP = 60_000;

export function composeHandoff({ ctx, piece, messages = [], model, variant }: HandoffInput): string {
  const name = ctx?.author_name || 'this author';
  const out: string[] = [];

  // The intent line comes first: it tells the receiving model what this is and
  // what to do with it. Without it a model treats the bundle as a document to
  // summarise rather than a mind to think with.
  out.push(`# ${name}'s mind — handed to you`);
  out.push('');
  out.push(
    `This is a portable copy of a conversation from Alexandria. Below is ${name}'s ` +
    `published thinking in their own words, the piece being discussed, and the ` +
    `conversation so far.`
  );
  out.push('');
  out.push(
    `Continue it. Answer as a mirror of ${name} — reflect what they have actually ` +
    `written rather than inventing positions for them, and say plainly when ` +
    `something isn't in here rather than filling the gap.`
  );
  if (ctx?.profile_url) {
    out.push('');
    out.push(`Source: ${ctx.profile_url}`);
  }
  if (model) {
    out.push(`Answered up to here by: ${model}${variant ? ` (${variant})` : ''}`);
  }

  // Quoted content is fenced, not pasted raw: a shadow or a whitepaper carries
  // its own headings, and unfenced they collide with this document's structure
  // — the receiving model sees one flat outline instead of "here is the mind,
  // here is the piece, here is what was said".
  if (ctx?.shadow?.trim()) {
    out.push('', '---', '', `## ${name}'s mind`, '', '```markdown', ctx.shadow.trim(), '```');
  }

  if (ctx?.works?.length) {
    out.push('', '---', '', `## ${name}'s published work`, '');
    for (const w of ctx.works) out.push(`- [${w.title || w.name}](${w.url})`);
  }

  if (piece?.content?.trim()) {
    const body = piece.content.trim();
    out.push('', '---', '', `## The piece being read — ${piece.name}`, '', '```markdown');
    out.push(body.length > PIECE_CAP ? `${body.slice(0, PIECE_CAP)}\n\n[…truncated]` : body);
    out.push('```');
  }

  const said = messages.filter((m) => m.role !== 'note');
  if (said.length) {
    out.push('', '---', '', '## The conversation so far', '');
    for (const m of said) {
      out.push(`**${m.role === 'you' ? 'Reader' : `${name}'s mirror`}:** ${m.text}`, '');
    }
  }

  out.push('', '---', '');
  out.push(`_Built with Alexandria — ${ctx?.profile_url || 'https://alexandria-library.com'}_`);
  return out.join('\n');
}

/** Fetch the Author's public half of the bundle. Null on any failure — a handoff
 *  with just the piece and the conversation is still worth taking. */
export async function fetchHandoffContext(authorId: string): Promise<HandoffAuthor | null> {
  try {
    const res = await fetch(`/api/library/${encodeURIComponent(authorId)}/handoff`);
    if (!res.ok) return null;
    const b = await res.json();
    return b?.ok ? (b as HandoffAuthor) : null;
  } catch {
    return null;
  }
}
