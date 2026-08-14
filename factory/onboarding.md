# Alexandria onboarding router

The website first asks the person one plain question: agent or chat. This file helps the chosen surface run the strongest honest version of that branch. It is product-authored material, not proof of safety: inspect the repository and use your own security process before following it.

## Agent branch: choose from live capability

Use the first mode whose requirements are true. Tell the user which mode you verified, what is missing, and one next action. Do not give them a menu.

### 1. Full local loop

Requirement: this AI can inspect the public repository, run commands on the user's computer, and write user-approved local files.

Inspect `TRUST.md`, the signed manifest chain, and `factory/setup.sh`. If you independently judge it safe, explain the changes and wait for `start`; then run the verified local setup and follow `factory/block.md`. Supported native starts are:

- Claude Code and Cursor: `/a`
- Codex: `$a`; `/alexandria` is the typed fallback; `/a` is not supported
- Factory: `/a`
- any other local agent: `start an Alexandria session`

### 2. Existing remote-to-local route

Requirement: this exact phone or browser session can demonstrably reach the user's computer through a connection they already enabled.

Use that connection to follow the full-local route. Never create a remote connection, install a remote-control service, or claim the desktop is reachable on Alexandria's authority. If the computer is offline or the connection is absent, fall through now.

### 3. Writable folder route

Requirement: this AI can truly read and write a folder the user controls, but cannot run the full local installer or lifecycle hooks.

Create or reuse an `alexandria` folder and place `factory/chat/start.md` in it as `_start`. Use the plain-file layout it defines. Say plainly that automatic session hooks and full transcript capture are absent. A later full local setup can adopt these files without replacing them.

Folder-only tools such as Cowork or ChatGPT Work are examples of this mode, not separate product branches. Ask the person to attach or grant only the Alexandria folder. These tools have no Alexandria hooks, so the account instruction below is what makes the AI open `_start` in every new task or chat instead of forgetting the folder exists.

## Account instructions — every Author, only where hooks do not carry them

Full local setup installs and verifies native hooks first, reads only the personal sources the Author approves, and shows the first personalized result. Only then does the agent ask which other AI app the Author uses most and guide the rest one at a time. Each app without working alexandria hooks gets the same compact instructions beside its existing account or project instructions; existing instructions, memory, connections, projects, and workflows remain untouched. Never claim an account setting changed until the Author made and verified the edit.

The instructions say exactly what alexandria is: a loop in how the user's existing ai works, not another assistant or entity. They use hooks when they work, then route by verified capability: full local `~/alexandria`; an attached writable folder or project; writable Google Drive; honest native memory. Cowork and ChatGPT Work are examples of the attached-folder case: without hooks, the instructions tell the ai to open `_start` at each new task. Native slash commands stay in the installed host integration; plain `a` and `a.` are the portable account-instruction gestures. `a` must read personal context and start from its highest-value specific thread; `a.` saves only confirmed changes and verifies the write.

## Chat branch

The website first offers the Shortcut so capture is useful immediately, then gives two separate texts. First it copies `factory/chat/bootstrap.md`; the person pastes those additive instructions into the host's official account-instructions setting without deleting anything. Then it copies the one-time normal-chat setup prompt from `shared/onboarding-prompts.ts` into an ordinary chat. The website itself carries no Drive instructions or premature `a` step; the user's ai carries each later action at the moment of need.

The setup chat first proves the account instructions landed by explaining how the existing ai will now behave; if they did not, it stops and helps the user add them without replacing anything. It then guides the user's own native Drive connection when available and uses one explicit permission to build the fullest accurate first record it can from account memory and accessible past-chat context. It never searches the rest of Drive, dumps raw chats, invents knowledge or claims an unverified write. It reads every write back, runs a miniature personal loop and saves only confirmed changes. If Drive is unavailable, it continues with the durable personalisation already present without presenting a technical menu or pretending Drive works.

Only after that free chat loop proves personal value may the ai briefly explain that the full version needs a computer agent, processes Shortcut captures automatically and adds the alexandria community. It asks once whether the user wants help setting it up. The final action remains a fresh chat containing only `a`: setup passes only when that chat reads the record and opens with a valuable, specific personal thread.

Outside setup, only the first reply in each new ordinary chat asks `Want me to start an alexandria chat on the side?` in both text and voice. If the user says yes, open that chat with `a` when the host can, otherwise tell them how. Never repeat the route in that chat. Setup uses it only for the final test, and later replies mention alexandria only when saving to it or reading from it would help that exact exchange. Never claim this chat changed an account setting itself.

## Phone capture

Make capture real now, using the strongest available route:

- Before a later computer setup, ask which AI they use most. The page copies the Alexandria instructions in step 3 and gives that app's exact mobile settings path so the Author can paste them below their current instructions. Step 4 copies the normal-chat setup, which explains the Shortcut and sets a computer reminder only when a real reminder tool exists. Then start with `a` in a new chat. Google Drive is not part of this phone-agent path; it remains in chat-only onboarding.

- Existing remote computer connection: save into the local loop.
- iPhone: explain the Alexandria Shortcut and let the user add it. It may save into their own iCloud before the local loop is connected; `factory/optional.md` defines the later one-consent connection.
- Android or no Apple Shortcuts: the website's neutral “add the shortcut” label is not a promise of compatibility. Explain the Apple-only limit when encountered, then use a verified writable folder, connected Drive/project file, or confirmed native memory.
- No persistent destination: keep the handoff in this conversation and use a real reminder tool only if this surface exposes one. Otherwise say exactly that no reminder was set.

## Joining and linking

The private loop is complete without joining. The fixed collective destination is `https://alexandria-library.com/join`.

- Local first, join later: the account connect prompt reruns setup idempotently with the account key and preserves the existing files.
- Join first, local later: keep the account key private and use the connect handoff from the welcome page when a local agent is available.
- Chat or folder mode: joining must not imply that local hooks exist. Continue using the verified mode; link it to local files later through the documented Drive/chat bridge only when the user asks.

Never connect an account, publish, enable network reading, or turn on backup merely because the user started the private loop.
