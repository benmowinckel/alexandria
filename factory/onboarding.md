# Alexandria onboarding router

The website first asks the person one plain question: agent or chat. The agent branch then asks where the agent runs. Computer mode is preferred because it uses live files, tools and hooks. Cloud mode remains useful: it works from the exact committed GitHub repository the person deliberately selected, keeps changes on its own branch and says what is not live. Both receive the same capability-aware read-only evaluation request. This file helps every surface use the strongest honest version it can after the person approves it. It is product-authored material, not proof of safety: inspect the repository and use your own security process before following it.

## Agent branch: choose from live capability

Use the first mode whose requirements are true. Tell the user the verified mode and its limit in one plain line, then keep going with one next action. Lower fidelity never means unusable. Do not give them a menu or make a stronger mode a prerequisite.

### 1. Full local loop

Requirement: this AI can inspect the public repository, run commands on the user's computer, and write user-approved local files.

Prove the execution surface before reading anything. A hosted cloud container that cloned a GitHub repository is not the user's computer, and a committed backup is not live local state. A browser or mobile session counts as full only when it demonstrably controls an already-enabled local session. Otherwise fall through to snapshot mode instead of stopping.

Answer first in a few lines. Inspect in short stages and say what you found as you go. Do not go silent for a 15–25 minute audit, and do not open huge trees blindly.

Before declaring this a new install, run the metadata-only classifier `factory/scripts/classify_install.sh` (receipts, hashes, setup report, symlink checks — no personal content). `healthy` short-circuits: do not overwrite and do not start onboarding. `partial` and `foreign` fail closed. Disclose optional connected state exactly as reported; do not disable it. Airlock is a later, separately approved doorway for untrusted AI apps; it is never a setup step or a substitute for the private local loop.

Inspect this machine before mentioning macOS, iCloud, or the Shortcut: `uname`, and on Darwin whether `~/Library/Mobile Documents/com~apple~CloudDocs` exists. The Shortcut bridge is Apple-only. Linux can run the local loop; it cannot run the iOS/macOS Shortcut or an iCloud capture symlink.

Inspect `TRUST.md`, the signed manifest chain, and `factory/setup.sh`. A fingerprint learned from this repo is continuity evidence, not an independent trust root. If you independently judge it safe, explain the changes and wait for `start`; then run the verified local setup and follow `factory/block.md`. Invoke the host's installed Alexandria skill: slash form in slash-command hosts, dollar-sign form in Codex, or the host's native skill action. If no native skill exists, use the portable request `start an Alexandria session`. Never claim a plain typed word reliably invokes a skill.

### 2. Existing remote-to-local route

Requirement: this exact phone or browser session can demonstrably reach the user's computer through a connection they already enabled.

Use that connection to follow the full-local route. Never create a remote connection, install a remote-control service, or claim the desktop is reachable on Alexandria's authority. If the computer is offline or the connection is absent, fall through now.

### 3. Hosted Git snapshot

Requirement: a trusted remote agent can read and write one exact Git repository the person deliberately authorized for that provider. The canonical example is Claude Code Web with `alexandria-private`; the Author has approved that whole committed repository for Anthropic. An untrusted provider receives only its bounded Airlock projection instead.

Treat the checkout as a committed snapshot, never the live computer. State the remote head and the freshness limit. Before approval, inspect only the public project named by the person's paste; the selected private repository is not automatic permission to inspect personal files during the evaluation. After the person says `start`, read the approved snapshot, run the manual file-based loop, and write only to this session's own branch. Do not install local hooks, claim access to uncommitted files or computer-only tools, push to the default branch, or say the computer changed. Finish with a compact branch handoff for the trusted computer agent to reconcile, verify and close into the sovereign checkout.

### 4. Writable folder route

Requirement: this AI can truly read and write a folder the user controls, but cannot run the full local installer or lifecycle hooks.

Create or reuse an `alexandria` folder and place `factory/chat/start.md` in it as `_start`. Use the plain-file layout it defines. Say plainly that automatic session hooks and full transcript capture are absent. A later full local setup can adopt these files without replacing them.

Folder-only tools such as Cowork or ChatGPT Work are examples of this mode, not separate product branches. Ask the person to attach or grant only the Alexandria folder. These tools have no Alexandria hooks, so the account instruction below is what makes the AI open `_start` in every new task or chat instead of forgetting the folder exists.

## Account instructions — required before agent onboarding completes

Full local setup installs and verifies native hooks first and reads only the personal sources the Author approves. It then has the Author add the generated instruction below the existing instructions in the AI they use for ordinary chats. Setup creates a local random proof line inside `~/alexandria/system/.account-instructions.md`; the Author opens a brand-new chat, asks for that proof, and pastes the reply back to the setup agent. Only an exact match to `~/alexandria/system/.account-instructions-proof` creates `.account_instructions_complete`, and only that marker allows `.block_complete`. A statement that the paste happened, the setup chat explaining the behavior, or a matching string in hidden context is not proof of cross-chat persistence.

This is part of the private loop, not an optional connection: without it the Author's ordinary AI forgets Alexandria outside the local coding host. Adding a second or later AI remains optional and happens one at a time. Keep every existing instruction and add Alexandria below it. The operating rules belong in the host's persistent instruction setting, never its account memory; memory remains content about the person. The website's originating first-person request still asks for one neutral community link after the private loop works, solely so the person can decide whether they also want a public profile and a way to connect with other people; the private ai never recommends it, browses it automatically, or shapes the decision from private context.

The instructions say exactly what alexandria is: a loop in how the user's existing ai works, not another assistant or entity. They use hooks when they work, then route by verified capability: full local `~/alexandria` (preferred); a trusted provider's exact Git snapshot on its own branch; an attached writable folder or project; writable Google Drive; honest native memory. Cowork and ChatGPT Work are examples of the attached-folder case: without hooks, the instructions tell the ai to open `_start` at each new task. Grok Bot is an other-AI-app case: setup cannot write its skill library, so the agent saves `factory/skills/grok-bot.md` there as `/a` (and `/alexandria` if the picker is name-based). If this host can see the computer, use `~/alexandria`. If not, name the source and keep going. A trusted provider may use the sovereign repository only after the Author directly approves that exact provider and repository; every other remote AI uses an Airlock (`CONTEXT.manifest` + `context/` + `inbox/`) if one is connected, then a deliberately attached Alexandria folder, authorized Drive, or this chat. Never request broad GitHub access, treat a snapshot as live, or claim an Airlock return is canon. A cold Grok Bot start is not an error. Daemon recovery lives in the grok-bot skill HOST block, not here. The host's "Execution on Local Computer" control must not be "never allowed"; do not invent a click-path. `/a` is an agent-saved Grok Bot workflow with no verified Mac skill dir. Start the active loop through the host's native Alexandria skill — slash in slash-command hosts including Grok CLI and Grok Bot, dollar-sign in Codex, or the native skill action elsewhere — with `start an Alexandria session` as the portable floor. Never claim the plain word `alexandria` reliably invokes it. `a.` remains the close gesture.

## Chat branch

Choosing `chat` on `/start` opens the same path as a direct `/chat` visit. The website asks which chat the person uses most, then gives three real actions from `shared/onboarding-prompts.ts`: copy the additive account instruction into that host's current instruction field; connect Google Drive through that host's native settings path; paste one short first-setup request into a normal chat. It does not show the agent-only Shortcut or email steps.

The setup chat first proves the account instructions landed by explaining how the existing ai will now behave; if they did not, it stops and fixes only that. It then names the exact sources and destination it can reach and uses one explicit permission to build the fullest accurate first record it can from account memory and accessible past-chat context. It never searches the rest of Drive, dumps raw chats, invents knowledge or claims an unverified write. It reads the record back, starts the highest-value specific thread and saves only confirmed changes. If Drive cannot both write and read, it says exactly what failed; genuinely durable account memory is an honest fallback only when the host names its limit. After the private loop works, it states what is ready and gives one neutral `/join` link so the person can decide whether they also want a public profile and a way to connect with other people. It does not recommend, browse, connect, share, or publish anything.

Before finishing, the ai briefly explains normal use, the host's real start gesture, `a.` to close, confirmation before saving, and the user's ability to change or remove the instruction and record. The private loop and the optional public profile remain separate.

Outside setup, native terminal chrome may stay ambient, but a subtle chrome line or hook return is not the consent offer. For each new ordinary foreground task, the signed SessionStart path puts one high-priority instruction in model context: the first completed assistant reply ends with `Want me to open your alexandria loop in the background for when you have a minute?` Setup, install or security review, background work, voice, and explicit Alexandria start/close tasks omit it. The assistant never repeats it in the same task. Only visible assistant text counts; a `systemMessage`, warning, hidden field, JSON success, transcript match, or daily claim does not. Compaction and subagents stay silent. No Stop loop, rewritten response, forced second turn, extra trust prompt, network call, or private-source read enforces it. On Grok Bot there is no account-instructions field and the chat is one continuous stream, so its saved agent description keeps the existing once-per-local-day mapping. On yes, a capable host immediately opens a new chat and invokes its native Alexandria skill without another question. An incapable host gives one clear sentence naming its actual slash, dollar-sign, or native skill gesture after telling the user to open a new chat. Only a host with no native skill uses the floor `start an Alexandria session`. Never claim this chat changed an account setting itself.

## Agent branch in the cloud

The website sends the same evaluation request to the cloud agent and labels the route honestly. The agent keeps going in snapshot mode rather than turning the missing live computer into a blocker.

- Use only the exact repository the person selected for this trusted provider. For Claude Code Web, the canonical private repository is `benmowinckel/alexandria-private`.
- The repository is committed history, not the current computer. Name that limit once and do useful work from the available files.
- Before `start`, keep the selected private contents unread and evaluate the public project. After `start`, use the private snapshot and write only to the session branch.
- Never push to the canonical branch or call snapshot work live. The trusted computer agent imports and closes it later.
- If the person does not approve the sovereign repository for that provider, use Airlock instead. Airlock is the narrower route, not a broken version of the product.

## Joining and linking

The private loop is complete without joining. The fixed collective destination is `https://alexandria-library.com/join`.

- Local first, join later: use the focused `factory/connect.md` route. It requires the healthy existing loop. The connector writes only its account key and stores no account status. The person's own ai then prepares the smallest profile draft from material it already knows locally, shows every byte, and publishes only after the Author approves that exact draft. It reads no public page and sends no private context.
- Join first, local later: do not connect yet. Complete the normal keyless `/start` setup first, including its own independent audit and exact `start` consent; then return to a fresh joined handoff and use the separate exact `connect` consent. Joining is not permission to set up the computer.
- Chat or folder mode: joining must not imply that local hooks exist. Continue using the verified mode; link it to local files later through the documented Drive/chat bridge only when the user asks.

Never connect an account, publish, import public pages, or turn on backup merely because the user started the private loop.
