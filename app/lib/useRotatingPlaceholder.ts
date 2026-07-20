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
  const fromArtifact = clean(artifactQs);
  if (fromArtifact.length) return [...fromArtifact, 'what is alexandria?', 'ask anything…'];
  const first = who ? who.split(' ')[0] : '';
  return [
    'what’s the core argument here?',
    'summarise this in three lines.',
    'what’s the strongest objection to it?',
    'what should i take away?',
    first ? `what does ${first} believe?` : 'what does this really mean?',
    'what is alexandria?',
    'ask anything…',
  ];
}

/**
 * authorExamples — rotating prompts for a general surface pointed at one
 * Author's whole mind (the profile chat), not a single piece. Prefers the
 * artifact-derived questions the Author has published (aggregated across their
 * pieces); falls back to general questions about the person.
 */
export function authorExamples(who?: string, artifactQs?: string[]): string[] {
  const fromArtifact = clean(artifactQs);
  if (fromArtifact.length) return [...fromArtifact, 'ask anything…'];
  const first = (who && who.split(' ')[0]) || 'them';
  return [
    `what does ${first} believe?`,
    `what’s ${first} like?`,
    `how does ${first} think about ai?`,
    'what should i read first?',
    `what’s ${first}’s philosophy?`,
    `what would ${first} push back on?`,
    'ask anything…',
  ];
}
