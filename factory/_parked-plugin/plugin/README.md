# alexandria plugin

The Alexandria delivery shell for the Claude family — Claude Code and Claude Desktop. Auto-loads your constitution at session start, captures signal at session end, ships `/a`.

This is packaging, not product. The product is your files (`~/alexandria/`) and the signed payload every surface runs — see [TRUST.md](../../TRUST.md). Cursor, Codex, and Factory get the identical behavior via `setup.sh`; every surface reads and writes the same sovereign folder, so you can move between tools freely.

## Claude Code

Nothing to do — `setup.sh` installs this plugin automatically (falls back to settings hooks on older CLIs). Manual install:

```
claude plugin marketplace add mowinckelb/alexandria
claude plugin install alexandria@alexandria
```

## Claude Desktop / Cowork

1. Install the plugin via Claude Code on the same machine (the `claude plugin` commands above) — plugins are installed through the CLI, not a Desktop settings screen.
2. Claude Desktop's **code tab** runs the same engine as Claude Code — sessions there load and capture automatically, nothing more to do. (The chat tab has no local file access; use the code tab.)
3. **Cowork: not yet** — Cowork keeps its own skills/plugins registry and doesn't load Claude Code plugins (verified 2026-07-09). When Anthropic wires plugins into Cowork, this plugin already handles it: attach your `alexandria` folder and type `/a`.
