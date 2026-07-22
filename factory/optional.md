# Optional add-ons

*Read by the Author's agent (cached at `~/alexandria/system/.optional`). None of these are installed by setup. Each one is enabled only by the Author's explicit yes, each states exactly what it touches and what (if anything) leaves the machine, and each has a one-line off switch. If the Author already has their own version of one of these — their own backup, their own texting bridge, their own publishing flow — theirs wins: skip ours entirely, or wire ours to read/write through theirs (a symlink or a mapping noted in machine.md). Never install a redundant parallel copy.*

*Agent: when the Author asks for one of these (or asks "what else can this do"), read the relevant block, say the one-line summary + what it touches, and run the enable steps only after they say yes. Fetch any factory script through `~/alexandria/system/scripts/verify-fetch.sh` so it's checked against the signed manifest — never raw `curl | bash`.*

---

## backup — your files on your own GitHub

- **Does:** pushes `~/alexandria/` to a private repo on the *Author's own* GitHub account, and registers their SSH key with GitHub as a signing key so commits show "Verified". From then on the session hooks keep it synced (pull at start, push at end).
- **Touches:** `~/alexandria/.git` remote config; the Author's GitHub account (one private repo `alexandria-private`; one public-key upload).
- **Leaves the machine:** the tracked contents of `~/alexandria/` → the Author's own private repo. Nothing to Alexandria — we have no access to that repo.
- **Needs:** `git` + `gh auth login`.
- **Enable:**
  ```bash
  gh ssh-key add ~/.ssh/*.pub --type signing --title "Alexandria" 2>/dev/null  # optional — Verified badge
  gh repo create alexandria-private --private --source "$HOME/alexandria" --push --yes
  ```
- **Off:** `git -C ~/alexandria remote remove origin` (the repo on their GitHub is theirs to keep or delete).

## icloud-mirror — a second, Apple-side backup (macOS)

- **Does:** a daily rsync of `~/alexandria/files/` to iCloud Drive — secret-free (secrets live in `system/`, which is excluded), `.git`-free. The backup for the no-GitHub Author, or a second copy for the belt-and-braces one.
- **Touches:** `~/Library/Mobile Documents/…/alexandria-backup/files/`; one launchd job `io.alexandria.icloud-backup`.
- **Leaves the machine:** `files/` → the Author's own iCloud. Nothing to Alexandria.
- **Enable:**
  ```bash
  B="$HOME/Library/Mobile Documents/com~apple~CloudDocs/alexandria-backup/files"; mkdir -p "$B"
  rsync -a --delete --exclude '.git/' --exclude '.DS_Store' "$HOME/alexandria/files/" "$B/"
  ```
  then write `~/Library/LaunchAgents/io.alexandria.icloud-backup.plist` running that same rsync with `StartInterval` 86400 and `launchctl load` it.
- **Off:** `launchctl unload ~/Library/LaunchAgents/io.alexandria.icloud-backup.plist && rm ~/Library/LaunchAgents/io.alexandria.icloud-backup.plist`.

## texting — the iMessage presence + daily digest (macOS)

- **Does:** lets the Author text their Alexandria from their phone via their *own* iMessage self-thread, plus a once-daily capture digest text. Reads only the Author's own Messages database, replies only to their own handle.
- **Touches:** `~/alexandria/system/scripts/imsg_*` + `tools/`; two manual macOS grants the Author clicks themselves (Full Disk Access for chat.db read, Automation→Messages for send); one launchd job for the digest; an auto-start line in `~/.zshrc` (the one shell-rc edit in the whole product, added only here, only on yes).
- **Leaves the machine:** nothing. Messages stay in Apple's own iMessage; Alexandria's server is never contacted.
- **Enable:**
  ```bash
  VF="$HOME/alexandria/system/scripts/verify-fetch.sh"
  bash "$VF" scripts/imsg_ctl.sh > "$HOME/alexandria/system/scripts/imsg_ctl.sh" && chmod +x "$HOME/alexandria/system/scripts/imsg_ctl.sh"
  bash "$HOME/alexandria/system/scripts/imsg_ctl.sh" enable   # fetches its own verified pieces, walks the two grants
  ```
- **Off:** `bash ~/alexandria/system/scripts/imsg_ctl.sh off` (soft) or `launchctl bootout gui/$(id -u)/com.alexandria.imsg-daemon` (hard); full details in `imsg_ctl.sh status`.

## publish — contribute to the marketplace (members)

- **Does:** creates the Author's public fork of the `alexandria` repo and an hourly job that pushes anything they drop in `~/alexandria-fork/factory/` — their own skills, hooks, canon modules — so the marketplace can register them.
- **Touches:** `~/alexandria-fork/`; one public fork on the Author's GitHub; one hourly launchd job (macOS) or cron line (Linux) `io.alexandria.publish`.
- **Leaves the machine:** only what the Author puts in the fork — it's a public repo, that's the point. Their private `~/alexandria/` is untouched by this job.
- **Needs:** an Alexandria account + `gh auth login`.
- **Enable:** `gh repo fork benmowinckel/alexandria --clone ~/alexandria-fork --remote=false`, sparse-checkout `factory/`, fetch `scripts/publish-fork.sh` via verify-fetch into `~/alexandria/system/scripts/`, then install the hourly launchd/cron job pointing at it.
- **Off:** `launchctl unload ~/Library/LaunchAgents/io.alexandria.publish.plist` (or remove the cron line); `rm -rf ~/alexandria-fork` any time.

## update checks — on by default, offered never imposed

Documented here for symmetry: this is the one thing that ships ON. Updates are never applied automatically — the machine runs only the engine payload pinned and verified at install (or at the Author's last explicit update). While `~/alexandria/system/hooks/auto-update` exists, each session *checks* public GitHub and surfaces any newer offline-key-signed engine or canon as a notice; the Author applies with the one install line, and the new code is verified before its first run.

- **Off:** `rm ~/alexandria/system/hooks/auto-update` — stops even the check: zero contact with Alexandria, pinned forever. Full mechanism: https://alexandria-library.com/mechanics
