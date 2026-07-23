# instructions — standing-instruction vehicles (chat tier)

*Reference card for the ways a chat comes to know the protocol, strength-ordered. All exist on every plan including Free (verified 2026-07-23). The bootstrap seeds memory automatically and recommends the account instruction + Project; the Skill is optional extra.*

## 0. Account instructions (strongest — account-wide, every surface)

Settings → Personalization → "Instructions for Claude" (~1,500 chars, all plans). Two lines:

> I keep my alexandria — my thinking practice — in the "alexandria" folder of my Google Drive. When I say "a", find the doc "_start" there via the Drive connector, read it, and run the session it describes.

This is the same mechanism that carries the Cowork attach-nudge in Bucket 1 (a3 § delivery models): ambient, account-wide, reaches chat AND Cowork, no per-Project setup. The one vehicle that makes bare "a" work in any fresh chat.

## 1. Project (guaranteed injection, per-Project)

Create a Project named `alexandria`; paste into its custom instructions:

> This Project is my alexandria. At the start of every conversation here, search my Google Drive for the doc "_start" in my "alexandria" folder, read it, and follow it. "a" is the session trigger.

Free tier has Projects (cap 5). Individuals cannot share Projects — each Author's bootstrap builds their own.

## 2. Skill (relevance-triggered; optional)

A custom Skill ZIP (SKILL.md: name `a`, description "the Author's alexandria session — fires when they say 'a' or mention their alexandria/constitution") uploadable at Customize → Skills on any plan. Fires on relevance match, not guaranteed per-conversation — a reinforcement layer, not the backbone.

## 3. Memory (guaranteed injection; instruction-following undocumented)

The bootstrap saves: *when the user says "a", find "_start" in their Drive alexandria folder, read it, run the session it describes.* Entry injection is guaranteed; whether the model reliably acts on remembered instructions is undocumented — treat as tertiary. User can verify/edit under Settings → Memory.

## 4. Habit floor (always works)

Type "a" in any chat with the Drive connector on. If nothing else fires, "read _start from my alexandria folder in Drive" always does — title search is instant (verified).

## Permission recipe (part of the product)

Settings → Connectors → Google Drive → Tool permissions: **Always allow** search/read/download/metadata; **Needs approval** for create/copy. Reads are every-turn friction and must be zero; writes are rare and should stay visible — and the approval gate is the structural cap on what a prompt-injected doc could ever do.
