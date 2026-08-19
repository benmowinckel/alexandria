# Alexandria onboarding router

The website first asks the person one plain question: agent or chat. This file helps the chosen surface run the strongest honest version of that branch. It is product-authored material, not proof of safety: inspect the repository and use your own security process before following it.

## Agent branch: choose from live capability

Use the first mode whose requirements are true. Tell the user which mode you verified, what is missing, and one next action. Do not give them a menu.

### 1. Full local loop

Requirement: this AI can inspect the public repository, run commands on the user's computer, and write user-approved local files.

Answer first in a few lines. Inspect in short stages and say what you found as you go. Do not go silent for a 15–25 minute audit, and do not open huge trees blindly.

Before declaring this a new install, run the metadata-only classifier `factory/scripts/classify_install.sh` (receipts, hashes, setup report, symlink checks — no personal content). `healthy` short-circuits: do not overwrite and do not start onboarding. `partial` and `foreign` fail closed. Disclose optional connected state exactly as reported; do not disable it.

Inspect this machine before mentioning macOS, iCloud, or the Shortcut: `uname`, and on Darwin whether `~/Library/Mobile Documents/com~apple~CloudDocs` exists. The Shortcut bridge is Apple-only. Linux can run the local loop; it cannot run the iOS/macOS Shortcut or an iCloud capture symlink.

Inspect `TRUST.md`, the signed manifest chain, and `factory/setup.sh`. A fingerprint learned from this repo is continuity evidence, not an independent trust root. If you independently judge it safe, explain the changes and wait for `start`; then run the verified local setup and follow `factory/block.md`. Invoke the host's installed Alexandria skill: slash form in slash-command hosts, dollar-sign form in Codex, or the host's native skill action. If no native skill exists, use the portable request `start an Alexandria session`. Never claim a plain typed word reliably invokes a skill.

### 2. Existing remote-to-local route

Requirement: this exact phone or browser session can demonstrably reach the user's computer through a connection they already enabled.

Use that connection to follow the full-local route. Never create a remote connection, install a remote-control service, or claim the desktop is reachable on Alexandria's authority. If the computer is offline or the connection is absent, fall through now.

### 3. Writable folder route

Requirement: this AI can truly read and write a folder the user controls, but cannot run the full local installer or lifecycle hooks.

Create or reuse an `alexandria` folder and place `factory/chat/start.md` in it as `_start`. Use the plain-file layout it defines. Say plainly that automatic session hooks and full transcript capture are absent. A later full local setup can adopt these files without replacing them.

Folder-only tools such as Cowork or ChatGPT Work are examples of this mode, not separate product branches. Ask the person to attach or grant only the Alexandria folder. These tools have no Alexandria hooks, so the account instruction below is what makes the AI open `_start` in every new task or chat instead of forgetting the folder exists.

## Account instructions — every Author, only where hooks do not carry them

Full local setup installs and verifies native hooks first, reads only the personal sources the Author approves, and shows the first personalized result. Only then does the agent ask which other AI app the Author uses most and guide the rest one at a time. Each app without working alexandria hooks gets the same compact instructions beside its existing account or project instructions; existing instructions, memory, connections, projects, and workflows remain untouched. Never claim an account setting changed until the Author made and verified the edit.

The instructions say exactly what alexandria is: a loop in how the user's existing ai works, not another assistant or entity. They use hooks when they work, then route by verified capability: full local `~/alexandria`; an attached writable folder or project; writable Google Drive; honest native memory. Cowork and ChatGPT Work are examples of the attached-folder case: without hooks, the instructions tell the ai to open `_start` at each new task. Grok Bot is an other-AI-app case: setup cannot write its skill library, so the agent saves `factory/skills/grok-bot.md` there as `/a` (and `/alexandria` if the picker is name-based). If this host can see the computer, use `~/alexandria`. If not, name the source and keep going: a connected GitHub private repo that actually reads as `files/` + `system/` (discovered, not a named repo), then a writable folder, then authorized Drive, then this chat — never invent the record, never claim a Mac save. A cold Grok Bot start is not an error. Daemon recovery lives in the grok-bot skill HOST block, not here. The host's "Execution on Local Computer" control must not be "never allowed"; do not invent a click-path. `/a` is an agent-saved Grok Bot workflow with no verified Mac skill dir. Start the active loop through the host's native Alexandria skill — slash in slash-command hosts including Grok CLI and Grok Bot, dollar-sign in Codex, or the native skill action elsewhere — with `start an Alexandria session` as the portable floor. Never claim the plain word `alexandria` reliably invokes it. `a.` remains the close gesture.

## Chat branch

The website first offers the Shortcut so capture is useful immediately, then gives two separate texts. First it copies `factory/chat/bootstrap.md`; the person pastes those additive instructions into the host's official account-instructions setting without deleting anything. Then it copies the one-time normal-chat setup prompt from `shared/onboarding-prompts.ts` into an ordinary chat. The website itself carries no Drive instructions or premature `a` step; the user's ai carries each later action at the moment of need.

The setup chat first proves the account instructions landed by explaining how the existing ai will now behave; if they did not, it stops and helps the user add them without replacing anything. It then guides the user's own native Drive connection when available and uses one explicit permission to build the fullest accurate first record it can from account memory and accessible past-chat context. It never searches the rest of Drive, dumps raw chats, invents knowledge or claims an unverified write. It reads every write back, runs a miniature personal loop and saves only confirmed changes. If Drive is unavailable, it continues with the durable personalisation already present without presenting a technical menu or pretending Drive works.

Only after that free chat loop proves personal value may the ai briefly explain that the full version needs a computer agent, processes Shortcut captures automatically and adds the alexandria community. It asks once whether the user wants help setting it up. The final action invokes the host's native Alexandria skill in a fresh chat, or uses `start an Alexandria session` only when no native skill exists. Setup passes only when that chat reads the record and opens with a valuable, specific personal thread.

Outside setup, only the first reply in each new ordinary chat asks `Want me to open your alexandria loop in the background for when you have a minute?` in both text and voice. On Grok Bot, that first-reply cue is text, once: `Want me to start an alexandria chat on the side?` This is consent only: open nothing before yes. On yes, a capable host immediately opens a new chat and invokes its native Alexandria skill without another question. An incapable host gives one clear sentence naming its actual slash, dollar-sign, or native skill gesture after telling the user to open a new chat. Only a host with no native skill uses the floor `start an Alexandria session`. Never repeat the route in that chat. Setup uses it only for the final test, and later replies mention alexandria only when saving to it or reading from it would help that exact exchange. Never claim this chat changed an account setting itself.

## Phone capture

Make capture real now, using the strongest available route:

- Before a later computer setup, ask which AI they use most. The page copies the Alexandria instructions in step 3 and gives that app's exact mobile settings path so the Author can paste them below their current instructions. Step 4 copies the normal-chat setup, which explains the Shortcut and sets a computer reminder only when a real reminder tool exists. Then invoke that host's native Alexandria skill in a new chat, or use `start an Alexandria session` only if it has no native skill. Google Drive is not part of this phone-agent path; it remains in chat-only onboarding.

- Existing remote computer connection: save into the local loop.
- iPhone or Mac, after this machine actually has Apple Shortcuts / iCloud Drive: explain the Alexandria Shortcut (`factory/systems/shortcut.md`) and let the user add it. It may save into their own iCloud before the local loop is connected; `factory/optional.md` defines the later one-consent connection.
- Linux, Android, or no Apple Shortcuts: the website's neutral “add the shortcut” label is not a promise of compatibility. Name the Apple-only limit, then use a verified writable folder, connected Drive/project file, or confirmed native memory.
- No persistent destination: keep the handoff in this conversation and use a real reminder tool only if this surface exposes one. Otherwise say exactly that no reminder was set.

## Joining and linking

The private loop is complete without joining. The fixed collective destination is `https://alexandria-library.com/join`.

- Local first, join later: use the focused `factory/connect.md` route. It requires the healthy existing loop and changes only its account key and cached account status.
- Join first, local later: do not connect yet. Complete the normal keyless `/start` setup first, including its own independent audit and exact `start` consent; then return to a fresh joined handoff and use the separate exact `connect` consent. Joining is not permission to set up the computer.
- Chat or folder mode: joining must not imply that local hooks exist. Continue using the verified mode; link it to local files later through the documented Drive/chat bridge only when the user asks.

Never connect an account, publish, enable network reading, or turn on backup merely because the user started the private loop.
