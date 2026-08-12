# after setup — nothing to remember

*The Author pastes one first-person preference into a chat. The same block can live in the host's official instructions setting so it lasts across chats. A chat paste does not install cross-chat behaviour.*

## normal use

Keep chatting exactly as before. Ordinary replies have no extra line and no save question.

Type **a** or **alexandria** (the whole message) for a short thinking conversation. Type **a.** or **alexandria.** (the whole message) to close it.

`a` starts with one thought or question, or asks what you have changed your mind about recently. It is okay for the AI to disagree. The conversation stays in that mode until you type `a.`.

On `a.`, the AI says what shifted. It only keeps an idea if you ask it to.

If you ask it to keep something and it can write Google Drive, it creates or reuses `alexandria/_start` and reads the write back. Otherwise it uses the app's strongest existing private personalisation. If that works across chats without exposing a manual write, it can say it will use the thought in future chats. You never have to guess which mode you are in.

## storage ladder

1. Local writable `~/alexandria` — full sovereign mode.
2. Writable Google Drive — connected chat mode.
3. Native memory — the lightweight content store when no writable files exist.

The user never chooses a mode and never moves material between them. The agent recognizes the current surface, uses the strongest live capability, preserves all existing personalisation, and says honestly when the current surface cannot persist something.

Instructions and memory are not interchangeable. The host's durable instruction setting carries Alexandria's operating behavior; writable files or native personalisation carry the Author's content. Gemini can recall prior-chat preferences even though it cannot perform a named Drive write from chat, so it uses that personalisation without mentioning missing tools.

Native host personalisation remains independent. Gemini and Claude may learn from chats under the user's existing account setting. Alexandria does not ask the model to change that setting, overlay every reply, or scan ordinary messages for beliefs to save.
