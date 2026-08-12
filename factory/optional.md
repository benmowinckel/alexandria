# Optional add-ons

*Read by the Author's agent (cached at `~/alexandria/system/.optional`). Nothing here is enabled by setup. Each add-on needs its own explicit yes and states exactly what it touches, what leaves the machine, and its one-line off switch. Never bundle several choices into one ask. If the Author already has their own version, theirs wins: connect to it or skip the redundant copy.*

*Agent: when the Author asks for one of these (or asks "what else can this do"), read the relevant block, say the one-line summary + what it touches, and run the enable steps only after they say yes. Fetch any factory script through `~/.local/share/alexandria/scripts/verify-fetch.sh` so it's checked against the signed manifest — never raw `curl | bash`.*

---

## account — connect identity only

- **Does:** validates and stores the Author's Alexandria account key locally. This alone enables no publishing, marketplace reporting, network fetch, telemetry, or feedback send.
- **Touches:** `~/alexandria/system/.api_key` (0600) and one account-status request to Alexandria for validation.
- **Leaves the machine:** the account key in that validation request; no personal files.
- **Enable:** after the Author directly asks to connect the account, explain the lines above and wait for the exact word `connect`. Then run the installed verifier with the key and the consent flag:
  ```bash
  ALEXANDRIA_ACCOUNT_CONNECT_APPROVED=1 bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh "$ALEXANDRIA_ACCOUNT_KEY"
  ```
- **Off:** `rm ~/alexandria/system/.api_key ~/alexandria/system/permissions/library ~/alexandria/system/permissions/marketplace ~/alexandria/system/permissions/network 2>/dev/null`.

## library-sync — publish exact approved files

- **Does:** on session start, updates only files with an adjacent approval whose exact hash and audience still match. Drafts and private files outside that folder never ship. It never deletes a remote file; unpublishing is a separate direct request with its own confirmation.
- **Touches:** one local permission marker and the Author's Alexandria Library.
- **Leaves the machine:** only a final-named file whose adjacent `<filename>.approved` contains the SHA-256 of its current bytes and the approved visibility tier. Editing it or moving it to another tier stops publication until the new scope is approved. Nearby title/category files and other private paths are never read into the request.
- **Needs:** a connected account. Before enabling, show the Author every currently publishable local filename and its audience tier; an empty list is valid.
- **Enable:** after showing one exact file and tier and receiving a separate yes, approve both with `printf '%s %s\n' "$(shasum -a 256 <file> | awk '{print $1}')" '<tier>' > <file>.approved`. After a separate yes to run reconciliation, `touch ~/alexandria/system/permissions/library`.
- **Off:** `rm ~/alexandria/system/permissions/library` — stops all future Library reconciliation without deleting either copy.

## marketplace-signal — report modules this machine uses

- **Does:** reports the public IDs listed in `~/alexandria/.call_manifest` at most once a day, and again after an approved manifest change, so Alexandria can rank modules by sustained use without flooding duplicate events. It does not publish private files or draft contributions.
- **Touches:** one local permission marker and the connected account's marketplace activity.
- **Leaves the machine:** the exact module IDs, whether each is used exactly or in adapted form, the reviewed upstream hash when present, and any text already in `.call_manifest`; show that file in full before enabling. No private adapted bytes leave. Editing the manifest changes its hash and stops future sends.
- **Needs:** a connected account.
- **Enable:** after a separate yes to the displayed bytes: `shasum -a 256 ~/alexandria/.call_manifest | awk '{print $1}' > ~/alexandria/system/permissions/marketplace`.
- **Off:** `rm ~/alexandria/system/permissions/marketplace`.

## network — fetch Authors the user already chose

- **Does:** fetches published pages named in `~/alexandria/files/network.md` into a local cache, at most daily.
- **Touches:** one permission marker and `~/alexandria/files/network/`.
- **Leaves the machine:** the account key on authenticated reads; no private content is sent.
- **Needs:** a connected account and a user-authored `network.md` list. Editing the list changes the hash and stops future fetches.
- **Enable:** after showing the exact list and receiving a separate yes: `shasum -a 256 ~/alexandria/files/network.md | awk '{print $1}' > ~/alexandria/system/permissions/network`.
- **Off:** `rm ~/alexandria/system/permissions/network`.

---

## icloud-capture — phone and share-sheet captures in your own iCloud

- **Does:** connects `~/alexandria/files/vault/input` to `alexandria/vault/input` in the Author's own iCloud Drive so Apple Shortcuts and Files drops can reach the local loop.
- **Touches:** one nested folder in the Author's iCloud Drive and one local symlink. No job, daemon, account, or Alexandria server.
- **Leaves the machine:** only files the Author puts in that capture folder, through their own iCloud account. Nothing goes to Alexandria. Saved links stay as local raw files unless the separate `capture-link-resolution` add-on below is also enabled.
- **Needs:** macOS with iCloud Drive enabled.
- **Save-before-connect (product ladder, 2026-08-10):** the Apple Shortcut may be installed and used first — saves pile in the Author's own iCloud `alexandria/vault/input` with no loop connection. The `/a` opener's rung-2 `recommended` is the connect ask: wire this add-on so either new saves enter the loop, or the pile already waiting lands in `vault/input` and drains. Connected proof is the symlink below; decline is `~/alexandria/system/.shortcut_decision` = `no`.
- **Enable:** only after the Author says yes to this add-on. If the local input folder already contains files, stop and ask whether they want those moved; never move them silently. If the iCloud capture folder already has files from prior shortcut use, connecting is enough — they appear in `vault/input` immediately.
  ```bash
  LOCAL="$HOME/alexandria/files/vault/input"
  CLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/alexandria/vault/input"
  [ "$(uname)" = "Darwin" ] && [ -d "$(dirname "$(dirname "$CLOUD")")" ] || { echo "iCloud Drive is not available"; exit 1; }
  if [ -L "$LOCAL" ]; then echo "iCloud capture is already connected"; exit 0; fi
  if [ -d "$LOCAL" ] && [ -n "$(find "$LOCAL" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then echo "local capture files exist; stop for the Author's choice"; exit 1; fi
  rmdir "$LOCAL" 2>/dev/null || true
  mkdir -p "$CLOUD"
  ln -s "$CLOUD" "$LOCAL"
  ```
- **Off:** `unlink ~/alexandria/files/vault/input && mkdir -p ~/alexandria/files/vault/input` — captures already in iCloud stay there.
- **Never** symlink `vault/input` to the iCloud `alexandria` root — that root may hold a full files mirror; only the nested `vault/input` is the capture inbox.

## capture-link-resolution — fetch links the Author deliberately saved

- **Does:** turns X/Twitter, YouTube, and ordinary links already placed in `~/alexandria/files/vault/input/` into locally readable text, titles, and media at session start.
- **Touches:** one local permission file and local derivatives under `~/alexandria/files/vault/_input/`.
- **Leaves the machine:** the exact saved URL or tweet ID goes to that site; X/Twitter captures use `api.fxtwitter.com`, YouTube captures use YouTube's oEmbed endpoint, and ordinary links contact the saved site. Those services also see the Author's IP. Nothing is sent to Alexandria.
- **Enable:** only after showing this exact disclosure and receiving a separate yes: `touch ~/alexandria/system/permissions/capture-network && chmod 600 ~/alexandria/system/permissions/capture-network`.
- **Off:** `rm ~/alexandria/system/permissions/capture-network` — future saved links remain raw and local.

---

## backup — your files on your own GitHub

- **Does:** pushes `~/alexandria/` to a private repo on the *Author's own* GitHub account, and registers their SSH key with GitHub as a signing key so commits show "Verified". From then on the session hooks keep it synced (pull at start, push at end).
- **Touches:** `~/alexandria/.git` remote config; one local permission file tied to that exact remote URL; the Author's GitHub account (one private repo `alexandria-private`; one public-key upload).
- **Leaves the machine:** the tracked contents of `~/alexandria/` → the Author's own private repo. Nothing to Alexandria — we have no access to that repo.
- **Needs:** `git` + `gh auth login`.
- **Enable:** after showing the exact tracked files and destination and receiving a separate yes, create or use the private repo, complete one successful push, then bind backup permission to that exact remote:
  ```bash
  gh ssh-key add ~/.ssh/*.pub --type signing --title "Alexandria" 2>/dev/null  # optional — Verified badge
  if git -C "$HOME/alexandria" remote get-url origin >/dev/null 2>&1; then
    git -C "$HOME/alexandria" push -u origin HEAD
  else
    gh repo create alexandria-private --private --source "$HOME/alexandria" --push --yes
  fi
  REMOTE=$(git -C "$HOME/alexandria" remote get-url origin) || exit 1
  mkdir -p "$HOME/alexandria/system/permissions"
  printf '%s\n' "$REMOTE" > "$HOME/alexandria/system/permissions/backup"
  chmod 600 "$HOME/alexandria/system/permissions/backup"
  ```
- **Off:** `rm ~/alexandria/system/permissions/backup` — stops all automatic pushes and pulls while leaving the remote and the repo on their GitHub untouched.

## drive — the chat pocket copy in your own Google Drive

- **Does:** keeps the local folder as ground truth while projecting `_start` and the compact constitution into `Google Drive/alexandria` as native Google Docs. New or changed chat writings in `vault/`, `marginalia/`, and versioned constitution proposals are copied home to `~/alexandria/files/vault/input/chat/` for `/a` to drain.
- **Touches:** the Author's own Google Drive `alexandria` folder; local rclone config and OAuth token; two signed scripts; one daily macOS job `io.alexandria.drive-sync`.
- **Leaves the machine:** the compact position layer and whatever the Author deliberately writes through chat → the Author's own Google Drive. Credentials and private data never go to Alexandria.
- **Enable:** after the Author says yes, fetch the controller through the installed verifier and run it. Google opens once for the unavoidable approval; do not turn that approval into a checklist.
  ```bash
  VF="$HOME/.local/share/alexandria/scripts/verify-fetch.sh"
  tmp=$(mktemp); bash "$VF" scripts/drive_ctl.sh > "$tmp" && mv "$tmp" "$HOME/.local/share/alexandria/scripts/drive_ctl.sh" && chmod 700 "$HOME/.local/share/alexandria/scripts/drive_ctl.sh"
  bash "$HOME/.local/share/alexandria/scripts/drive_ctl.sh" enable
  ```
- **Credentials:** Google's OAuth token stays only in the Author's local rclone config (normally `~/.config/rclone/rclone.conf`, mode 0600). Alexandria's server holds nothing.
- **Off:** `bash ~/.local/share/alexandria/scripts/drive_ctl.sh off`. This stops the bridge and keeps both user-owned copies. Removing the `alexandria` rclone remote separately revokes the local token.

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

## update checks — optional

- **Does:** while `~/alexandria/system/hooks/auto-update` exists, each session checks public GitHub and surfaces any newer Touch ID-signed engine or canon as a notice. Nothing is applied automatically; the Author applies through the installed verifier, which checks the new code before it runs.
- **Leaves the machine:** a request for public release files. No Author file, transcript, account key, or private context is sent.
- **Enable after a separate yes:** `touch ~/alexandria/system/hooks/auto-update`.
- **Off:** `rm ~/alexandria/system/hooks/auto-update` — stops the checks and keeps the currently pinned local copy. Full mechanism: https://alexandria-library.com/mechanics
