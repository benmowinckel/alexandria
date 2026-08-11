# alexandria.

Your ai thinks *with* you, not for you — and the difference is whether you wrote your mind down.

Alexandria is a free, local tool: your thinking in plain files on your machine, which your coding agent reads and develops. No account, no server touching your data, nothing sent to us. The paid part is the community around it — [alexandria-library.com](https://alexandria-library.com).

## Try it

Open [alexandria-library.com/start](https://alexandria-library.com/start), choose agent or chat, add the Shortcut, enter your email, and paste the matching setup message into the AI you already use.

The message makes your agent independently prove the GitHub release is ours, read the code, and run one exact signed commit. The website never gives you executable bytes.

The capability router is [`factory/onboarding.md`](factory/onboarding.md). Inside the agent branch, the AI verifies whether it can run the full local setup, reach an existing remote computer, or work through a user-owned folder. The chat branch starts a useful lightweight habit now and keeps the later computer handoff explicit.

The habit afterwards: start an Alexandria session and leave it. In Claude Code, Cursor, or Factory, type `/a`. In Codex, type `$a` (or `/alexandria`). In ordinary chat, type `a`.

## What's in this repo

- **`factory/`** — the gear that installs into `~/alexandria/`: canon (the methodology your agent follows), the `/a` session route, hooks, templates, and `setup.sh`. Public and forkable — the ideal Alexandrian replaces our defaults with their own.
- **`app/`** — the website ([alexandria-library.com](https://alexandria-library.com)), Next.js on Vercel.
- **`server/`** — the api ([api.alexandria-library.com](https://api.alexandria-library.com)), a Cloudflare Worker. Stateless by design: it holds accounts and what Authors *publish*, never their thinking.

## Sovereignty

Your files live in `~/alexandria/` on your computer — yours to read, edit, delete. Setup connects no cloud storage. iCloud capture, Drive, and backup to your own private GitHub are separate choices you can enable later. Full mechanism: [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics).

---

*keep thinking.*
