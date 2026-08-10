# alexandria.

Your ai thinks *with* you, not for you — and the difference is whether you wrote your mind down.

Alexandria is a free, local tool: your thinking in plain files on your machine, which your coding agent reads and develops. No account, no server touching your data, nothing sent to us. The paid part is the community around it — [alexandria-library.com](https://alexandria-library.com).

## Try it

Open [alexandria-library.com/start](https://alexandria-library.com/start), copy the setup message into your coding agent (Claude Code, Cursor, Codex, Factory), and hit enter.

The message makes your agent independently prove the GitHub release is ours, read the code, and run one exact signed commit. The website never gives you executable bytes.

The habit afterwards: open a new tab, type `/a`, and leave it. That's a session.

## What's in this repo

- **`factory/`** — the gear that installs into `~/alexandria/`: canon (the methodology your agent follows), skills (`/a` and friends), hooks, templates, `setup.sh`. Public and forkable — the ideal Alexandrian replaces our defaults with their own.
- **`app/`** — the website ([alexandria-library.com](https://alexandria-library.com)), Next.js on Vercel.
- **`server/`** — the api ([api.alexandria-library.com](https://api.alexandria-library.com)), a Cloudflare Worker. Stateless by design: it holds accounts and what Authors *publish*, never their thinking.

## Sovereignty

Your files live in `~/alexandria/` on your computer — yours to read, edit, delete. Setup connects no cloud storage. iCloud capture, Drive, and backup to your own private GitHub are separate choices you can enable later. Full mechanism: [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics).

---

*keep thinking.*
