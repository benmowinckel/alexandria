# alexandria plugin — the `/a` skill for Cowork

This plugin exists for **one job: giving Cowork the `/a` command.** Nothing else uses it.

Everywhere else — Claude Code, Cursor, Codex, Factory, and Claude Desktop's code tab — you install Alexandria with the one curl (`curl -fsSL alexandria-library.com/a | bash`), which wires `/a` directly. Those surfaces do **not** need this plugin.

Cowork is the exception: it runs your agent in a sealed VM with its own skill registry, so the curl can't reach it. Adding this plugin is the only way to get `/a` there. Its hooks are **inert** in Cowork (Cowork doesn't fire session hooks), so it functions purely as a skill delivery — it ships `/a`, nothing more.

## Install (Cowork only)

In Cowork: **Add plugins → from repo → `benmowinckel/alexandria`**.

That's it — `/a` now works in your Cowork sessions. You still need the one-time curl install (to create `~/alexandria`) and the "Instructions for Claude" paste (so Cowork proactively prompts you to attach the folder). See the setup close message or [Mechanics](https://alexandria-library.com/mechanics) for the full Cowork flow.

## What it is

Packaging, not product. The product is your files (`~/alexandria/`). This is a hook manifest (inert in Cowork) + one bash wrapper + the `/a` skill (`skills/a/SKILL.md`), which reads your canon from the attached folder and runs the Alexandria loop. Audit: [TRUST.md](../../TRUST.md).
