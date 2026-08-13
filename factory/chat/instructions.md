# after setup — nothing to remember

*The Author pastes one first-person preference into the host's official instructions setting. `/chat` asks which app they use and names the exact clicks. A chat paste is a fallback for that conversation only — it is not an install.*

## normal use

Keep chatting exactly as before. Ordinary replies end with `→ type a in a new chat`. If you state a lasting belief, preference, decision, or idea, the AI asks `save that to alexandria?` before that line.

Type **a** or **alexandria** for a thinking session. Type **a.** or **alexandria.** to close it.

`a` starts immediately with one thought or question, or asks what you have changed your mind about recently. It is okay for the AI to disagree. While that session is on, the ordinary line is replaced by `→ close with a. when done`.

On `a.`, the AI says what shifted and does not save.

If you answer yes to the save question and it can write Google Drive, it creates or reuses `alexandria/_start` and reads the write back. Otherwise it uses the app's strongest existing private personalisation. If that works across chats without exposing a manual write, it can say it will use the thought in future chats. You never have to guess which mode you are in.

## storage ladder

1. Local writable `~/alexandria` — full sovereign mode.
2. Writable Google Drive — connected chat mode.
3. Native memory — the lightweight content store when no writable files exist.

The user never chooses a mode and never moves material between them. The agent recognizes the current surface, uses the strongest live capability, preserves all existing personalisation, and says honestly when the current surface cannot persist something.

Instructions and memory are not interchangeable. The host's durable instruction setting carries Alexandria's operating behavior; writable files or native personalisation carry the Author's content. Gemini can recall prior-chat preferences even though it cannot perform a named Drive write from chat, so it uses that personalisation without mentioning missing tools.

Native host personalisation remains independent. Gemini and Claude may learn from chats under the user's existing account setting. Alexandria does not ask the model to change that setting.
