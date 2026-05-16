# Filter — What the Author Would Say to a Stranger

*The gate between the Author's private system and the Library. Publishing is irreversible — cached, indexed, forkable. This file is the policy the Publisher obeys before anything leaves `~/alexandria/`.*

*Canon default. The Author's `~/alexandria/files/library/filter.md` sharpens on top, optionally refined per leaf as `library/{tier}/filter.md`. This file is the floor.*

---

## The principle

*Imagine the Author meets someone in person. Infinite time — every topic, every question, every follow-up. What the Author would say in that conversation is what belongs in the Library.*

That is the filter. First principles. The Author has a lifetime of calibration on what they'd tell a stranger who asked — every topic they've ever dodged, every frame they've ever offered openly, every boundary they've felt in their body when a question went somewhere they didn't want to go. The filter is that calibration written down once, at scale.

This frame is a **lower bound**: everything the Author would say to an infinite-time stranger should be in the Library. If the Author would tell a curious person face-to-face, the content is already public in their behaviour — the Library just formalises it.

The frame cuts both ways. It removes the Engine's discretion — the Author already knows the answer, instantly, from their actual life. And it removes the Engine's over-conservatism — the Library should contain *more*, not less, of what the Author openly shares with people who ask.

Every edge case resolves by returning to the frame. *Would the Author say this, unprompted or in response to honest curiosity, to a stranger with infinite time?*

## What the frame naturally excludes

The things the Author wouldn't tell a stranger even given infinite time. These fall into predictable shapes:

- **What belongs to other people.** Names, stories, positions of friends, family, colleagues, clients. The Author wouldn't share these without consent in a real conversation, and doesn't here either. Default redact to role or pseudonym. Exception: public figures already discussed in the Author's public work.
- **Live, undisclosed business state.** Active negotiations, unclosed deals, unannounced moves. The Author wouldn't brief a stranger on these while they're live; the Library waits too.
- **Processing state.** The Author wouldn't read a stranger their private journals or voice memos mid-thought. Vault, ontology, constitution stay closed. If a processed position crystallises into something the Author would say aloud, the Author moves it into `library/` as a deliberate act of authorship.
- **Health, location, schedule, relationships** at a granularity the Author wouldn't offer. Public framing the Author already uses is fine. Operational specifics aren't — exact address, daily routine, health details, specific relationship dynamics.
- **Hypotheses posing as conclusions.** The Author wouldn't tell a stranger "I believe X" about a position they voiced for the first time that morning. First-thought is exploration, not disclosure. Wait for the position to settle into something the Author carries in conversation.

## What the frame naturally includes

- Everything the Author has already said publicly — in their writing, talks, conversations, published work. Prior public authorship is continuing consent.
- Their methodology, their frames, their positions that have crystallised into how they actually think and talk.
- Their work — essays, projects, opinions, observations — framed at the level the Author is comfortable speaking them.
- Their aesthetic, taste, craft. The things they'd happily spend hours on with anyone who asked.
- Anything they'd read aloud from a journal at a dinner party without hesitation.

## The minimum compliance template — two integrated floors

Every Author publishes one file at minimum: the floor of protocol participation. Two parts, fused into a single artifact (router on top, content below).

**Floor 1 — stranger-parity content.** The frame above, applied. Anything the Author would say to a stranger in real life, they should be able to say to a stranger in digital life.

**Floor 2 — the router.** A table of contents that signals *the Author has thoughts on X* without exposing the thoughts. Each entry resolves to a deeper file or contact gate — paid (`library/paid/`), invite-only (`library/invite/`), an external link (email, Calendly, the Author's site), or to nothing further if covered in the content below. The router is the entry point for machines (another Author's Engine, a frontier model, a stranger's tool) to navigate the Author's full surface.

Both floors are mandatory for every Author regardless of openness: the router is what lets machines navigate, the content is what makes the file readable rather than a bare index.

## The trust boundary

`~/alexandria/files/library/` is the opt-in. The folder has four tier sub-folders (`public/`, `authors/`, `invite/`, `paid/`); placement selects both consent and visibility:

- **`library/public/`** — ships to the open web. Anyone can read.
- **`library/authors/`** — ships to all other Alexandria Authors. The social tier — "you're not a user, you're an Author." Visible to anyone with an account.
- **`library/invite/`** — ships only to people the Author has explicitly invited (token-gated). With zero invitees, this is functionally private — the Author's own eyes only.
- **`library/paid/`** — ships to paying Authors (subscribers). Gated.

Placing a final-named file in one of the four tiers is the Author's explicit decision: *this is the right visibility for this artifact*. The Publisher ships it at that tier without re-asking. Folder = visibility. Filename = artifact type (`shadow.md`, `pulse.md`, `works/essay.md`). The path relative to `library/` becomes the `name` in the publish call; the first segment becomes the `visibility` field.

Everything outside `library/` is not yet conversation-grade. If the Engine believes a fragment outside `library/` should ship, it surfaces the question — the Author decides by moving the file into the appropriate tier-folder or not. The move is the consent.

This is why the filter enables auto-propagation. The Author's review happens once, at the moment of placement. Every subsequent publish is the Publisher honouring that decision.

## Auto-propagation contract

- Files inside `library/{public,paid,invite}/` ship automatically at that tier — the filter already passed at write time.
- Files inside `library/` outside the four tier folders (e.g. loose files at the root) never ship. The tier must be explicit.
- Files outside `library/` never ship without the Author moving them in.
- Drafts (`*_draft.*`) inside any tier never ship. Promotion is renaming to the final filename within the same tier.
- When the filter and the Engine disagree, the filter wins.
- When in doubt, hold. Unpublish is partial — caches, indexes, and forks persist.

## Machine override

The Machine is the Author's specific reading of the frame; this canon is the generic reading. Where the Machine is more specific (this person has consented, this position has already crystallised into public work, this specific is already public), the Machine applies. Where the Machine is silent, the canon's general cases hold. Neither can override the frame itself — *would the Author say this to a stranger* is the absolute, and the shapes above follow from it, not the other way around.

When no Machine filter exists, this canon applies directly.

## When in doubt

Return to the frame. *Would the Author say this to someone they just met, if that person had the time to ask and listen?* Yes — publish. No — hold. Maybe — surface. Don't guess on the Author's behalf.
