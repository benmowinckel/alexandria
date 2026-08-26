# alexandria.

Your ai thinks *with* you, not for you — and the difference is whether you wrote your mind down.

Alexandria is a free, local tool: your thinking in plain files on your machine, which your coding agent reads and develops. No account, no server touching your data, nothing sent to us. The paid part is the community around it — [alexandria-library.com](https://alexandria-library.com).

## Try it

Open [alexandria-library.com/start](https://alexandria-library.com/start), choose agent or chat, then follow the short path for the strongest AI you already use. The agent path asks whether your computer is in reach. If it is, you get the Shortcut, an optional setup email, and one setup paste. If it is not, you get the Shortcut, the same optional email, and one reminder request to paste into the AI already in your hand. The chat path adds the approved instruction, connects your own Drive, then uses one setup paste to create and verify the first record.

The setup paste asks your agent to inspect the whole public project as untrusted reference material, decide how it should fit into your existing setup, and recommend whether to proceed. It cannot install or change anything until you clearly approve it, and the website never gives you executable bytes.

After approval, the capability router is [`factory/onboarding.md`](factory/onboarding.md). Inside the agent branch, the AI verifies whether it can run the full local setup, reach an existing remote computer, or work through a user-owned folder. The chat branch starts a useful lightweight habit now and keeps the later computer handoff explicit.

The habit afterwards: start an Alexandria session and leave it. In Claude Code, Cursor, Factory, or Grok CLI, type `/a`. In Codex, type `$a` (or `/alexandria`). In Grok Bot, type `/a` (and `/alexandria` if the picker lists names). In ordinary chat, use that host's native Alexandria gesture; where none exists, ask it to `start an Alexandria session`.

## What's in this repo

- **`factory/`** — the gear that installs into `~/alexandria/`: canon (the methodology your agent follows), the `/a` session route, hooks, templates, and `setup.sh`. Public and forkable — the ideal Alexandrian replaces our defaults with their own.
- **`app/`** — the website ([alexandria-library.com](https://alexandria-library.com)), Next.js on Vercel.
- **`server/`** — the api ([api.alexandria-library.com](https://api.alexandria-library.com)), a Cloudflare Worker. Stateless by design: it holds accounts and what Authors *publish*, never their thinking.

## Sovereignty

Your files live in `~/alexandria/` on your computer — yours to read, edit, delete. Setup connects no cloud storage. iCloud capture, Drive, and backup to your own private GitHub are separate choices you can enable later. Full mechanism: [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics).

---

*keep thinking.*
