# parked — the Claude marketplace plugin (not operational)

This folder holds the old plugin delivery shell. **It is parked, not live.** Nothing installs it, nothing references it, and the marketplace it defined is de-activated (its `.claude-plugin/marketplace.json` lives here now, not at the repo root, so `claude plugin marketplace add mowinckelb/alexandria` no longer resolves).

## Why it's parked (2026-07-09)

The plugin added a second delivery mechanism on top of `setup.sh`. It never earned its keep:

- **Claude Code + Claude Desktop code tab** — already covered by `setup.sh` wiring `~/.claude/settings.json` hooks directly. The plugin did the same thing a more complicated way.
- **Cursor / Codex / Factory** — never used the plugin; `setup.sh` wires them directly (Cursor hooks, Codex/Factory instruction files).
- **Cowork** — the only surface the plugin was *for*, and it can't work: Cowork keeps its own account-synced skills registry (doesn't read `~/.claude/plugins/`), grants folder access per-session (no persistent vault), and doesn't fire session hooks. Verified hands-on 2026-07-09. A plugin can't fix any of that — it's Anthropic's sandbox.
- **The behavior auto-updates without it** — the shim re-fetches the signed `payload.sh` from GitHub every session regardless of delivery mechanism, so the plugin's "marketplace auto-update" was marginal.

Meanwhile the plugin *cost* real complexity: a second shim copy, hook manifest, signature coverage of 4 extra files, a CI signing gate, marketplace registration, double-fire defer logic, and a migration that removed settings hooks. Every plugin bug fixed on 2026-07-09 lived in exactly this machinery. Delete-the-part: the single `curl … | bash` is the whole product surface now.

## What's here

- `.claude-plugin/marketplace.json` — the marketplace manifest (was at repo root)
- `plugin/` — `.claude-plugin/plugin.json`, `hooks/hooks.json`, `scripts/plugin-shim.sh`, `scripts/shim.sh` (a copy of `factory/hooks/shim.sh`), `skills/a/SKILL.md`, `README.md`

## Reactivating (only if Anthropic makes plugins load AND fire hooks in Cowork)

1. `git mv factory/_parked-plugin/.claude-plugin .claude-plugin` and `git mv factory/_parked-plugin/plugin factory/plugin`.
2. Re-sync `factory/plugin/scripts/shim.sh` with `factory/hooks/shim.sh` (must be byte-identical).
3. Re-add the 4 plugin files to `SIGNED_FILES` in `factory/ship.sh`, restore the shim-cmp guard, and re-add the plugin JSON/shim checks to CI.
4. Restore the plugin-install + verify-then-remove migration in `setup.sh` (see git history around 2026-07-09, commits `6989231`..`34ec04f`).
5. `bash factory/ship.sh "reactivate plugin"` to re-sign the manifest with the plugin files.

Until then, the curl is the one true path. Don't wire this back in on a hunch — reactivate only when the Cowork limitation it was meant to solve actually lifts.
