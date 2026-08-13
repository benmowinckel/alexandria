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

## Chat branch

The website copies `factory/chat/bootstrap.md`. The person pastes it into the host's official instructions setting. Keep their existing setup. Only the first reply in a new chat carries the generic route: text uses the quiet action line; voice uses the casual `want me to spin up an Alexandria chat on the side?` offer and, on a simple yes, opens it and starts Alexandria there. Later replies mention Alexandria only when saving to it or reading from it would help that exact exchange.

If this app has a durable instructions setting they can edit themselves, one next action can name the exact clicks to add the same block there without deleting anything they already have. Never claim this chat installed cross-chat behaviour. If there is no durable setting, say that plainly. This conversation can still run the habit until they leave it. Then preserve the later handoff to the full local setup at `https://alexandria-library.com/start` → agents.

## Phone capture

Make capture real now, using the strongest available route:

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
