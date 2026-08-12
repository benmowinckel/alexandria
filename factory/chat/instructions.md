# after setup — nothing to remember

*The Author pastes one instruction into the host's official instructions setting. Behavior then lives in that setting; personal content lives in files or memory. Pasting into a chat is a fallback for this conversation only — it does not install cross-chat behaviour.*

## normal use

Keep chatting exactly as before. For a lasting belief, preference, decision, or idea, the AI asks **“save that to alexandria?”** before saving and never claims it saved anything first.

Type **a** or **alexandria** for a deliberate session. Type **a.** or **alexandria.** to close it.

`a` starts immediately with one specific thought for you to react to. It does not make you configure storage first. The session keeps developing that thought until you type `a.`.

Every ordinary-chat answer ends with **→ type a in a new chat**. During an Alexandria session, the line becomes **→ close with a. when done**.

On the first thought you approve saving, the AI checks storage itself. If it can write Google Drive, it creates or reuses `alexandria/_start` and reads the write back. Otherwise it uses the app's strongest existing private personalisation. If that works across chats without exposing a manual write, it says only that it will use the thought in future chats; it never sends the user into setup. You never have to guess which mode you are in.

## storage ladder

1. Local writable `~/alexandria` — full sovereign mode.
2. Writable Google Drive — connected chat mode.
3. Native memory — the lightweight content store when no writable files exist.

The user never chooses a mode and never moves material between them. The agent recognizes the current surface, uses the strongest live capability, preserves all existing personalisation, and says honestly when the current surface cannot persist something.

Instructions and memory are not interchangeable. The host's durable instruction setting carries Alexandria's operating behavior; writable files or native personalisation carry the Author's content. Gemini can recall prior-chat preferences even though it cannot perform a named Drive write from chat, so it uses that personalisation without mentioning missing tools.

Native host personalisation remains independent. Gemini and Claude may learn from chats under the user's existing account setting before Alexandria asks to save; Alexandria preserves that setting. The yes gate controls Alexandria's explicit save action, not the host's own background memory.
