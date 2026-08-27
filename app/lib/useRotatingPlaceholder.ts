'use client';

import { useEffect, useState } from 'react';

/**
 * useRotatingPlaceholder — the ask composer's ghost text quietly cycles through
 * example questions, so a reader always has a sense of what they could ask
 * (founder 2026-07-20; matches the profile door's rotating door placeholder).
 * Context-aware examples are built by the caller: a loaded piece gets piece-
 * specific prompts, a general surface gets general ones.
 *
 * `enabled` pauses the rotation (e.g. while the reader is mid-type), so the
 * placeholder never shifts out from under a half-formed question.
 *
 * The cadence is unhurried on purpose — a suggestion holds long enough to read
 * before the next fades in (founder 2026-07-20: the old pace was "too quick, too
 * abrupt"). The crossfade itself lives in PromptBox.
 */
export function useRotatingPlaceholder(examples: string[], enabled = true, intervalMs = 5200): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!enabled || examples.length <= 1) return;
    const id = setInterval(() => setIdx((i) => i + 1), intervalMs);
    return () => clearInterval(id);
  }, [enabled, examples.length, intervalMs]);
  return examples.length ? examples[idx % examples.length] : '';
}

function clean(qs?: string[]): string[] {
  return (qs || []).map((q) => (typeof q === 'string' ? q.trim() : '')).filter(Boolean);
}

/**
 * pieceExamples — rotating prompts for a reader sitting on ONE loaded piece.
 *
 * When the publish pipeline has attached questions to the artifact (the Artifact
 * Loop's `.questions` sidecar — derived FROM the piece, so the PLM context is
 * guaranteed to answer them), those lead, with a couple of outward prompts so
 * the door also points beyond the piece. Absent artifact questions, it falls
 * back to generic-but-sensible prompts (founder 2026-07-20: the rotation must be
 * coherent with the automatic artifact flow, not hand-authored per surface).
 */
export function pieceExamples(who?: string, artifactQs?: string[]): string[] {
  const fromArtifact = clean(artifactQs).slice(0, 5);
  if (fromArtifact.length) return Array.from(new Set([
    ...fromArtifact,
    'what’s the strongest counter to this?',
    'what changes if this is right?',
    'ask anything…',
  ]));
  // Written as a reader actually arrives: most haven't read it yet, so the
  // honest first questions are "what is this", "why does it matter", "what's
  // the counter". Held deliberately short of becoming a substitute for reading
  // — "explain that last bit" needs the text open, and "which part should i
  // read first" sends them into it. Supplement, not replacement (founder
  // 2026-07-28).
  const first = who ? who.split(' ')[0] : '';
  return [
    'what’s this actually about?',
    'why does it matter?',
    'what’s the biggest counter to it?',
    'explain that last bit in plain english',
    first ? `what does ${first} actually think here?` : 'what’s really being claimed here?',
    'which part should i read first?',
    'ask anything…',
  ];
}

/** The docked composer rotates only through real questions. The pane already
 *  says "mirror"; onboarding copy in the input made the control less useful. */
export function readingExamples(who?: string, artifactQs?: string[]): string[] {
  // The questions themselves are NOT filtered by length. A character budget is
  // a proxy for rendered width — wrong the moment the font, the device or the
  // Author's own questions change — and these are generated per piece for
  // every Author. A suggestion too long for the line fades off its right edge
  // instead (PromptBox, bare), which needs no number and never picks wrong.
  return pieceExamples(who, artifactQs);
}

/**
 * authorExamples — rotating prompts for a general surface pointed at one
 * Author's whole mind (the profile chat), not a single piece. Prefers the
 * artifact-derived questions the Author has published (aggregated across their
 * pieces); falls back to general questions about the person.
 */
export function authorExamples(who?: string, artifactQs?: string[]): string[] {
  const fromArtifact = clean(artifactQs).slice(0, 5);
  const first = (who && who.split(' ')[0]) || 'them';
  return Array.from(new Set([
    'what’s the strongest idea here?',
    `what does ${first} believe that most people get wrong?`,
    `where do ${first}’s ideas pull against each other?`,
    `which of ${first}’s views has changed most?`,
    `what connects ${first}’s work?`,
    `what would ${first} argue against most strongly?`,
    `what is ${first} still figuring out?`,
    ...fromArtifact,
    'where should i start?',
    'ask anything…',
  ])).slice(0, 12);
}
