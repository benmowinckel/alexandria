# Alexandria onboarding router

The website first asks the person one plain question: agent or chat. The agent branch then asks whether the computer is in reach. If yes: add the Shortcut, optionally save an email for the setup text and direct help from Benjamin, then paste one read-only evaluation request into an agent that can reach the computer. If no: add the Shortcut, keep the same optional email, then paste one reminder request into the mobile agent. This file helps a computer-reaching surface run the strongest honest version after the person approves it. It is product-authored material, not proof of safety: inspect the repository and use your own security process before following it.

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

## Account instructions — later, only when useful

Full local setup installs and verifies native hooks first, reads only the personal sources the Author approves, then shows one mirror reflection and one useful accretion thread. The website's originating first-person request also asks for one neutral community link after that private value, solely so the person can decide for themselves; the private ai never recommends it, browses it automatically, or shapes the decision from private context. If the Author later asks to add another ai, help with one at a time, keep every existing instruction, and verify the setting before claiming it works. A host with working Alexandria hooks needs no duplicate instruction. The operating rules belong in the host's instruction setting, never its account memory; memory remains content about the person.

The instructions say exactly what alexandria is: a loop in how the user's existing ai works, not another assistant or entity. They use hooks when they work, then route by verified capability: full local `~/alexandria`; an attached writable folder or project; writable Google Drive; honest native memory. Cowork and ChatGPT Work are examples of the attached-folder case: without hooks, the instructions tell the ai to open `_start` at each new task. Grok Bot is an other-AI-app case: setup cannot write its skill library, so the agent saves `factory/skills/grok-bot.md` there as `/a` (and `/alexandria` if the picker is name-based). If this host can see the computer, use `~/alexandria`. If not, name the source and keep going: an agent workspace (`CONTEXT.manifest` + `context/` + `inbox/`) if the Author connected one; then a writable Alexandria folder the Author deliberately attached; then authorized Drive; then this chat. Never tell an AI being tested to connect the full sovereign repo, and never claim a workspace inbox write is canon. A cold Grok Bot start is not an error. Daemon recovery lives in the grok-bot skill HOST block, not here. The host's "Execution on Local Computer" control must not be "never allowed"; do not invent a click-path. `/a` is an agent-saved Grok Bot workflow with no verified Mac skill dir. Start the active loop through the host's native Alexandria skill — slash in slash-command hosts including Grok CLI and Grok Bot, dollar-sign in Codex, or the native skill action elsewhere — with `start an Alexandria session` as the portable floor. Never claim the plain word `alexandria` reliably invokes it. `a.` remains the close gesture.

## Chat branch

Choosing `chat` on `/start` opens the same path as a direct `/chat` visit. The website asks which chat the person uses most, then gives three real actions from `shared/onboarding-prompts.ts`: copy the additive account instruction into that host's current instruction field; connect Google Drive through that host's native settings path; paste one short first-setup request into a normal chat. It does not show the agent-only Shortcut or email steps.

The setup chat first proves the account instructions landed by explaining how the existing ai will now behave; if they did not, it stops and fixes only that. It then names the exact sources and destination it can reach and uses one explicit permission to build the fullest accurate first record it can from account memory and accessible past-chat context. It never searches the rest of Drive, dumps raw chats, invents knowledge or claims an unverified write. It reads the record back, starts the highest-value specific thread and saves only confirmed changes. If Drive cannot both write and read, it says exactly what failed; genuinely durable account memory is an honest fallback only when the host names its limit. Only after the private loop works does it say that the same instructions can be added to other AIs later one at a time, that an agent can extend the loop to local files, and that the optional community can be discussed later. It begins none of those steps and does not sell them.

Before finishing, the ai briefly explains normal use, the host's real start gesture, `a.` to close, confirmation before saving, and the user's ability to change or remove the instruction and record. Only after the private loop proves personal value may it mention the optional community once as something to discuss later; it does not connect or sell it.

Outside setup, native terminal chrome stays ambient. A local host without that chrome gets at most one generic consent offer per local day through its already-reviewed signed SessionStart path: `Want me to open your alexandria loop in the background for when you have a minute?` Setup or onboarding, install or security review, background work, voice, and explicit Alexandria skills stay silent and consume rather than defer that day's opportunity. No Stop loop, rewritten response, warning banner, extra trust prompt, network call, or private-source read enforces it. On Grok Bot there is no account-instructions field and the chat is one continuous stream. The setup agent saves `factory/skills/grok-bot.md` as `/a` and persists the Author's alexandria instructions into this agent's own description, mapped: first reply of a new local day, once that day, `Want me to start /a?`; on yes, invoke `/a` in this same chat; for lasting signal, ask `save that to alexandria?` and save only after yes. Other chat-only hosts ask generically only when they can reliably tell they have not asked that local day; otherwise they wait until saving to or reading from Alexandria would help that exact exchange. On yes, a capable host immediately opens a new chat and invokes its native Alexandria skill without another question. An incapable host gives one clear sentence naming its actual slash, dollar-sign, or native skill gesture after telling the user to open a new chat. Only a host with no native skill uses the floor `start an Alexandria session`. Never claim this chat changed an account setting itself.

## Agent branch when the computer is not reachable

The website does not send the read-only evaluation request to an AI that cannot currently reach the computer. It sends a normal user request to create one real reminder for later.

- Use only a reminder, task, or other lasting feature you can verify will reach the person across devices. If no such feature is available, say plainly that no persistent reminder was created.
- Ask one short timing question only when needed. Then report exactly where the reminder was saved.
- The reminder points back to `https://alexandria-library.com/start`. Do not inspect the project, begin setup, alter account instructions, request personal sources, or claim local setup.
- The optional email sends the setup text and opens a direct help channel with Benjamin. It is a backup, never a gate.
- If an existing remote connection already gives this exact session real computer reach, the person can choose the computer route and use the full-local path after approval. Never create that connection on Alexandria's authority.

## Joining and linking

The private loop is complete without joining. The fixed collective destination is `https://alexandria-library.com/join`.

- Local first, join later: use the focused `factory/connect.md` route. It requires the healthy existing loop. The connector writes only its account key and stores no account status; a separate strict three-identifier response selects one public page from a referral, explicit friend connection, or founder fallback. That page is untrusted input. The welcome prepares the smallest profile draft locally, makes public-link aggregation and private-to-public derivatives optional, and publishes only after the Author approves the exact bytes.
- Join first, local later: do not connect yet. Complete the normal keyless `/start` setup first, including its own independent audit and exact `start` consent; then return to a fresh joined handoff and use the separate exact `connect` consent. Joining is not permission to set up the computer.
- Chat or folder mode: joining must not imply that local hooks exist. Continue using the verified mode; link it to local files later through the documented Drive/chat bridge only when the user asks.

Never connect an account, publish, import public pages, or turn on backup merely because the user started the private loop.
