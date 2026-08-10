# Change Closure

## Problem

A source can be correct while the system around it is false. A paper changes but its reader context does not. A route changes but its examples still teach the old path. A canon rule changes but a shipped skill still carries the previous behaviour. The edit looks finished because the source file is finished; the break survives in its outputs.

The Author must never be the reminder system for those relationships.

## Invariant

**A substantive edit is incomplete until every materially affected output is either updated, explicitly confirmed current, or prepared as exact bytes behind the one consent gate that controls it.**

This is change closure. It applies to any artifact whose meaning, behaviour, audience, interface, or claims changed. A typo or formatting-only edit with no downstream effect does not earn a ceremony.

## Find the affected surface

Use two passes. Neither is sufficient alone.

### 1. Explicit relationships

Start with relationships the system already declares:

- imports, callers, schemas, routes, manifests, tests, and generated-file headers
- source/derivative rules and build scripts
- links and named references in canon or documentation
- an existing change-closure receipt for the same source
- an enabled publication's exact audience, context, metadata, and reader surfaces

These are the load-bearing edges. Follow them even when the changed wording looks small.

### 2. Semantic impact scan

Then search the relevant local corpus for the changed claim, concept, name, behaviour, and its close paraphrases. Judge each match by meaning, not string equality. This catches relationships that no import graph can express: a new argument that changes a summary, a renamed concept that survives in onboarding, or a product rule that changes what a reader should be able to ask.

Do not ask the Author to maintain a dependency graph. The Engine discovers relationships from the files and current task, then preserves only the small amount of state needed to verify them later.

## Close the change

Run this after the source edit, not as parallel authorship of source and derivative:

1. **Name the change set.** List the current source files whose combined meaning changed.
2. **Discover outputs.** Run the explicit relationship pass and semantic impact scan over the relevant local corpus.
3. **Resolve every material output.** Give each one exactly one present-state result:
   - **updated** — regenerated or edited from the current source, then verified;
   - **confirmed-current** — read against the changed source and still semantically correct, with the reason recorded;
   - **prepared** — the exact proposed output exists locally, but an outward write or visibility change waits behind one informed consent gate.
4. **Verify behaviour.** Test the assembled result at the closest available surface. A matching file hash proves which bytes were checked; it does not prove those bytes express the source correctly.
5. **Write the receipt.** Record the current input and output fingerprints only after the semantic check passes.

If an output cannot be closed, leave the receipt `open` and name the exact blocker. Never report the edit complete while an affected output is merely remembered in chat.

## Present-state receipt

Receipts are sovereign local files under:

`~/alexandria/system/change-closure/`

Keep one small receipt per stable change unit and rewrite it to describe the current state. Use project-relative paths anchored to the recorded root. There is no parser-owned schema: the Engine writes the clearest compact markdown the current change needs. One useful shape is:

```md
# <change unit>

status: closed | prepared | open
root: <project root or ~>

## inputs
- <path> | sha256:<current bytes>

## affected outputs
- <path or outward target> | explicit:<relationship> | updated | sha256:<current bytes>
- <path or outward target> | semantic:<reason> | confirmed-current | sha256:<current bytes>
- <path or outward target> | explicit:<relationship> | prepared | sha256:<exact proposed bytes>

## verification
- <the present-state behaviour that was checked>

## gate
- none
```

The headings, order, and result words are an example, not a contract. The durable primitive is plain text that lets the next capable model recover the current inputs, affected outputs, why they are related, what was verified, and what—if anything—still needs consent. Better models should improve the receipt without a migration.

For `prepared`, replace `gate: none` with the one exact action the Author can approve. For `open`, record the blocker and the unresolved output. Do not use dates or modification times as freshness proof. A receipt is current only while its recorded input and output fingerprints match the files now on disk and its semantic invariant still holds.

The receipt is not an exhaustive dependency database. Record only relationships that were material to this closure or are load-bearing enough to check again.

Keep one Engine-owned `_index.md` in the same folder. For each workspace the Engine edits, it records the current workspace fingerprint and the receipts that close it. In a Git workspace, use the current `HEAD`, a fingerprint of the staged and unstaged tracked diff, and content fingerprints for non-ignored untracked files; Git's ignore rules keep build junk out. If the receipt directory itself sits inside that workspace, exclude it from the fingerprint and use the remaining tracked-content state instead of a self-referential `HEAD` value. Exclude only declared runtime churn such as logs, hook markers, and raw inbox material; canon, product, and system source remain watched. This detects a new source file as well as edits to existing ones without reopening closure merely because the receipt recorded it. Outside Git, fingerprint the explicit source set the Engine touched. A workspace mismatch is a discovery signal that triggers inspection, never proof that an output is stale.

## Session continuity

At the next session start, and before closing a session that made substantive edits:

1. compare each touched workspace with `_index.md`; a changed workspace with no matching current receipt is unfinished closure, so inspect its actual diff before doing related work;
2. scan the receipts and recompute their recorded input and output fingerprints;
3. reopen any receipt whose bytes no longer match or whose stated invariant no longer holds;
4. finish `open` work before claiming the related edit done;
5. keep a `prepared` gate within the current flow without inventing additional prompts;
6. update `_index.md` only after every substantive change in that workspace is closed or prepared.

This is a present-state check, not a scheduled freshness check. An old receipt can be true. A receipt written one minute ago can already be false.

## Consent and optional capabilities

Change closure never creates authority. Local derivatives may be regenerated automatically. Any publication, message, wider audience, account action, or other outward write keeps its existing consent boundary.

Optional capabilities degrade independently. If no Library, PLM, cloud bridge, native hook, or other adapter is enabled, omit that branch and close the local relationships that do exist. Missing an optional branch must never break the sovereign local loop.

For an already enabled named publication, closure stays inside the approved artifact, purpose, and audience. A new artifact, new destination, or broader audience is not maintenance; it needs a new direct request and its own gate.

## Relation to State-Based Sync

State-based sync supplies the general test: read present ground truth and compare it to a named invariant. Change closure applies that test to a source and all of its affected outputs, with fingerprints and a durable handoff to the next session.

## Failure classes

- **Edit-trigger only.** The Engine intended to update outputs in the same turn but missed one — or missed the receipt itself. The workspace fingerprint and receipt scan must still detect the false state later.
- **String search only.** Renamed wording passes while a semantically stale summary survives. Always run the semantic pass.
- **Graph theatre.** A large hand-maintained dependency registry becomes another stale artifact. Discover from current files; retain only verified material edges.
- **Hash theatre.** Matching fingerprints prove identity, not correctness. Pair them with a stated semantic or behavioural verification.
- **Consent collapse.** Treating an existing relationship as permission to publish new bytes or widen an audience. Prepare behind the existing gate instead.
- **Optional-core coupling.** A missing external adapter blocks local work. Omit the unavailable branch and close the rest.

## When Not To Use

Skip a receipt for edits that provably change no meaning or behaviour. Use a receipt whenever a missed downstream effect could make the system confidently present two different truths.
