# Alexandria onboarding router

The website first asks the person one plain question: agent or chat. This file helps the chosen surface run the strongest honest version of that branch. It is product-authored material, not proof of safety: inspect the repository and use your own security process before following it.

## Agent branch: choose from live capability

Use the first mode whose requirements are true. Tell the user which mode you verified, what is missing, and one next action. Do not give them a menu.

### 1. Full local loop

Requirement: this AI can inspect the public repository, run commands on the user's computer, and write user-approved local files.

Answer first in a few lines. Inspect in short stages and say what you found as you go. Do not go silent for a 15–25 minute audit, and do not open huge trees blindly.

Before declaring this a new install, run the metadata-only classifier `factory/scripts/classify_install.sh` (receipts, hashes, setup report, symlink checks — no personal content). `healthy` short-circuits: do not overwrite and do not start onboarding. `partial` and `foreign` fail closed. Disclose optional connected state exactly as reported; do not disable it. An agent workspace is a later, separately approved connection for one experimental AI; it is never a setup step or a substitute for the private local loop.

Inspect this machine before mentioning macOS, iCloud, or the Shortcut: `uname`, and on Darwin whether `~/Library/Mobile Documents/com~apple~CloudDocs` exists. The Shortcut bridge is Apple-only. Linux can run the local loop; it cannot run the iOS/macOS Shortcut or an iCloud capture symlink.

Inspect `TRUST.md`, the signed manifest chain, and `factory/setup.sh`. A fingerprint learned from this repo is continuity evidence, not an independent trust root. If you independently judge it safe, explain the changes and wait for `start`; then run the verified local setup and follow `factory/block.md`. Invoke the host's installed Alexandria skill: slash form in slash-command hosts, dollar-sign form in Codex, or the host's native skill action. If no native skill exists, use the portable request `start an Alexandria session`. Never claim a plain typed word reliably invokes a skill.

### 2. Existing remote-to-local route

Requirement: this exact phone or browser session can demonstrably reach the user's computer through a connection they already enabled.

Use that connection to follow the full-local route. Never create a remote connection, install a remote-control service, or claim the desktop is reachable on Alexandria's authority. If the computer is offline or the connection is absent, fall through now.

### 3. Writable folder route

Requirement: this AI can truly read and write a folder the user controls, but cannot run the full local installer or lifecycle hooks.

Create or reuse an `alexandria` folder and place `factory/chat/start.md` in it as `_start`. Use the plain-file layout it defines. Say plainly that automatic session hooks and full transcript capture are absent. A later full local setup can adopt these files without replacing them.

Folder-only tools such as Cowork or ChatGPT Work are examples of this mode, not separate product branches. Ask the person to attach or grant only the Alexandria folder. These tools have no Alexandria hooks, so the account instruction below is what makes the AI open `_start` in every new task or chat instead of forgetting the folder exists.

## Account instructions — after joining, only where hooks do not carry them

Full local setup installs and verifies native hooks first, reads only the personal sources the Author approves, and shows the first personalized result. That moment has one next action: the fixed Library destination. It does not ask about the Shortcut or another ai app. After a member connects from the welcome handoff, `factory/connect.md` guides the remaining full-product setup one action at a time. Each app without working alexandria hooks gets the same compact instructions beside its existing account or project instructions; existing instructions, memory, connections, projects, and workflows remain untouched. Never claim an account setting changed until the Author made and verified the edit.

The instructions say exactly what alexandria is: a loop in how the user's existing ai works, not another assistant or entity. They use hooks when they work, then route by verified capability: full local `~/alexandria`; an attached writable folder or project; writable Google Drive; honest native memory. Cowork and ChatGPT Work are examples of the attached-folder case: without hooks, the instructions tell the ai to open `_start` at each new task. Grok Bot is an other-AI-app case: setup cannot write its skill library, so the agent saves `factory/skills/grok-bot.md` there as `/a` (and `/alexandria` if the picker is name-based). If this host can see the computer, use `~/alexandria`. If not, name the source and keep going: an agent workspace (`CONTEXT.manifest` + `context/` + `inbox/`) if the Author connected one; then a writable Alexandria folder the Author deliberately attached; then authorized Drive; then this chat. Never tell an AI being tested to connect the full sovereign repo, and never claim a workspace inbox write is canon. A cold Grok Bot start is not an error. Daemon recovery lives in the grok-bot skill HOST block, not here. The host's "Execution on Local Computer" control must not be "never allowed"; do not invent a click-path. `/a` is an agent-saved Grok Bot workflow with no verified Mac skill dir. Start the active loop through the host's native Alexandria skill — slash in slash-command hosts including Grok CLI and Grok Bot, dollar-sign in Codex, or the native skill action elsewhere — with `start an Alexandria session` as the portable floor. Never claim the plain word `alexandria` reliably invokes it. `a.` remains the close gesture.

## Chat branch

Choosing `chat` on `/start` copies one universal paste from `shared/onboarding-prompts.ts` immediately; that same fixed line becomes the exact paste instruction while the agent choice fades without reflowing the page. A direct `/chat` visit exposes the same copy action. The website does not ask for a device or app and does not show the Shortcut, email, Drive, or a settings path. The receiving chat identifies only capabilities and controls it can verify, guides the additive account instruction from `factory/chat/bootstrap.md`, then carries each later action at the moment of need. If it cannot verify a durable setting, it asks what the person sees instead of inventing a path.

The setup chat first proves the account instructions landed by explaining how the existing ai will now behave; if they did not, it stops and helps the user add them without replacing anything. It then guides the user's own native Drive connection when available and uses one explicit permission to build the fullest accurate first record it can from account memory and accessible past-chat context. It never searches the rest of Drive, dumps raw chats, invents knowledge or claims an unverified write. It reads every write back, runs a miniature personal loop and saves only confirmed changes. If Drive is unavailable, it continues with the durable personalisation already present without presenting a technical menu or pretending Drive works.

Only after that free chat loop proves personal value may the ai briefly explain that the full version needs a computer agent, processes Shortcut captures automatically and adds the alexandria community. It asks once whether the user wants help setting it up. The final action invokes the host's native Alexandria skill in a fresh chat, or uses `start an Alexandria session` only when no native skill exists. Setup passes only when that chat reads the record and opens with a valuable, specific personal thread.

Outside setup, native terminal chrome stays ambient. A local host without that chrome gets at most one generic consent offer per local day through its already-reviewed signed SessionStart path: `Want me to open your alexandria loop in the background for when you have a minute?` Setup or onboarding, install or security review, background work, voice, and explicit Alexandria skills stay silent and consume rather than defer that day's opportunity. No Stop loop, rewritten response, warning banner, extra trust prompt, network call, or private-source read enforces it. On Grok Bot there is no account-instructions field and the chat is one continuous stream. The setup agent saves `factory/skills/grok-bot.md` as `/a` and persists the Author's alexandria instructions into this agent's own description, mapped: first reply of a new local day, once that day, `Want me to start /a?`; on yes, invoke `/a` in this same chat; for lasting signal, ask `save that to alexandria?` and save only after yes. Other chat-only hosts ask generically only when they can reliably tell they have not asked that local day; otherwise they wait until saving to or reading from Alexandria would help that exact exchange. On yes, a capable host immediately opens a new chat and invokes its native Alexandria skill without another question. An incapable host gives one clear sentence naming its actual slash, dollar-sign, or native skill gesture after telling the user to open a new chat. Only a host with no native skill uses the floor `start an Alexandria session`. Never claim this chat changed an account setting itself.

## Agent branch when the computer is not reachable

The website uses the same agent paste everywhere. The receiving AI checks whether it can run commands and read and write the person's computer files. If it cannot, it does not receive or claim a pretend local version; it creates one verified anchor for later.

- If that ai can create a real reminder that will notify after the chat closes, ask when the person will next be at their computer, create the reminder with the `/start` address, and verify it exists.
- Otherwise guide one temporary line below the person's existing account instructions: until installation is confirmed, ask once at the start of each new chat: `At your computer? Finish setup at alexandria-library.com/start.` Preserve every existing instruction and verify the temporary line actually landed. If the person later confirms installation, tell them to delete the temporary line; joined completion replaces it with the full instruction instead.
- Stop when one anchor is verified. No Shortcut, email, personal read, local-install claim, active session, or community pitch happens on this branch.
- If the current session can demonstrably reach a coding agent and its computer files, use the full-local route instead; capability, not device label, decides. Never ask whether the person is on a phone or computer.

## Joining and linking

The private loop is complete without joining. The fixed collective destination is `https://alexandria-library.com/join`.

- Local first, join later: use the focused `factory/connect.md` route. It requires the healthy existing loop and changes only its account key and cached account status.
- Join first, local later: do not connect yet. Complete the normal keyless `/start` setup first, including its own independent audit and exact `start` consent; then return to a fresh joined handoff and use the separate exact `connect` consent. Joining is not permission to set up the computer.
- Chat or folder mode: joining must not imply that local hooks exist. Continue using the verified mode; link it to local files later through the documented Drive/chat bridge only when the user asks.

Never connect an account, publish, enable network reading, or turn on backup merely because the user started the private loop.
