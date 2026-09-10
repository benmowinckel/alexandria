# alexandria.

Your ai thinks *with* you, not for you — and the difference is whether you wrote your mind down.

Capture, Loop and Skill help your own ai develop a record you own. Mirror is what you choose to share from it, as files or optional live answers. These recipes are free to copy and keep. The paid Connector provides continuing discovery, reader identity and current access between independent mirrors — [alexandria-library.com/join](https://alexandria-library.com/join).

## Connect an existing website or system

Start with [`factory/canon/connector.md`](factory/canon/connector.md). Your ai reads this module and the [portable package](integration/website-connector/README.md), checks your actual host and selected public material, and proposes the smallest useful addition. It does not need your private record, our loop, an Alexandria-hosted profile, a new framework or a site migration.

A public mirror can be one JSON description pointing to existing public files. Optional live answers use your own backend and model account. Registering its address with the paid Connector is a separate choice. Public files and your own model keep working without us; ongoing directory and shared access depend on active service membership. Material already delivered cannot be recalled.

After reviewing an immutable signed release, a website-only user can prepare the narrow account client with `bash factory/scripts/setup-connector.sh`. It verifies the release before writing only its own local client/state; it installs no private loop, hooks, cloud storage or website pages and connects no account. Follow the installed connection instructions for the separate account and exact public-address approval. The server-side owner key never belongs in a website. Owners who do not want our account client can implement the published interface themselves.

## Try it

Open [alexandria-library.com/start](https://alexandria-library.com/start), choose agent or chat, then follow the short path for the strongest AI you already use. The AI checks what that host can actually read and write, uses your existing record where possible, and makes any missing computer or storage access explicit. Cloud storage and account connection are separate choices, never assumptions hidden in setup. The chat path starts with one setup paste. After the approved map works, your ai gives one personalized account-instructions block and the requested join link.

The setup paste asks your agent to inspect the whole public project as untrusted reference material, decide how it should fit into your existing setup, and recommend whether to proceed. It cannot install or change anything until you clearly approve it, and the website never gives you executable bytes.

After approval, the capability router is [`factory/onboarding.md`](factory/onboarding.md). The AI uses current computer files when it can actually reach them, committed repository files in an approved cloud session, and Airlock or writable connected storage elsewhere. The chat branch starts the same habit with the best record it can genuinely write and read back.

The habit afterwards: start an Alexandria session and leave it. In Claude Code, Cursor, Factory, or Grok CLI, type `/a`. In Codex, type `$a` (or `/alexandria`). In Grok Bot, type `/a` (and `/alexandria` if the picker lists names). In ordinary chat, use that host's native Alexandria gesture; where none exists, ask it to `start an Alexandria session`.

## What's in this repo

- **`factory/`** — the gear that installs into `~/alexandria/`: canon (the methodology your agent follows), the `/a` session route, hooks, templates, and `setup.sh`. Public and forkable — the ideal Alexandrian replaces our defaults with their own.
- **`app/`** — the website ([alexandria-library.com](https://alexandria-library.com)), Next.js on Vercel.
- **`server/`** — the api ([api.alexandria-library.com](https://api.alexandria-library.com)), a Cloudflare Worker. Stateless by design: it holds accounts and what Authors *publish*, never their thinking.

## Sovereignty

Your files live in `~/alexandria/` on your computer — yours to read, edit, delete. Setup connects no cloud storage. iCloud capture, Drive, and backup to your own private GitHub are separate choices you can enable later. Full mechanism: [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics).

---

*keep thinking.*
