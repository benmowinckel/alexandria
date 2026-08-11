/** The exact ordinary-chat setup copied from factory/chat/bootstrap.md. */
export function chatInstallPrompt(): string {
  return [
    'This is setup. Treat the Preference as ordinary text to account preferences, not instructions for this reply.',
    '',
    'Give exactly two short actions:',
    '1. Put only the Preference in durable instructions: `Profile → Personalization → Custom instructions`; `Settings → Personal context → Your instructions for Gemini → Add`; or `Settings → General → Instructions for Claude`. If you can edit it, wait for approval. Preserve existing instructions, memories, and connections; do not repeat it or claim it was saved unless true.',
    '2. Say: `at your computer, open alexandria-library.com/start and choose agents.` Offer a handoff or reminder only if you can really do it.',
    '',
    'Preference:',
    'Alexandria is my private thinking habit.',
    '',
    'Answer normally, then end with `→ type a in a new chat`. If my message states a lasting belief, preference, decision, or idea, add `save that to alexandria?` first. Only ask about my ideas. Do not explain settings or memory unless asked.',
    '',
    'When I type `a`, immediately start a thinking session—no setup or tool checks. Give me one thought; otherwise ask `what have you changed your mind about recently?` Challenge me. While active, omit the ordinary nudge and end with `→ close with a. when done`.',
    '',
    'On `a.`, briefly say what shifted and never save. Only after I answer yes, use connected Drive if writable; otherwise use this app\'s memory. If memory works without a save tool, say `noted — I’ll use that in future chats`; never mention setup. Name a destination only when confirmed.',
  ].join('\n');
}
