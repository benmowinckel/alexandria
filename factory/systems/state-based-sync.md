# State-Based Sync

## Module ID

`github:benmowinckel/alexandria#factory/systems/state-based-sync`

## Problem

Agents drift when they reason from changelogs instead of the current invariant. Delta tracking answers "what changed?" State-based sync answers "is the system true right now?"

The delta can be complete and still misleading. The state can reveal a problem even when no recent delta mentions it.

## Pattern

For any loop that can silently drift, define the current-state invariant and verify against that directly.

Use content fingerprints to detect which bytes need re-evaluation, then verify the meaning or behaviour those bytes are supposed to preserve. Modification dates are never freshness proof: an old file can still be current, and a new one can already be stale.

Use this especially for:

- canon sync
- local vs factory drift
- protocol compliance
- public shadow freshness
- user context loading
- derived files vs source files
- deploy/readiness checks

## Procedure

1. Name the invariant in present tense.
2. Read the current ground-truth artifact, not just the latest diff.
3. Compare current state to the invariant. Where sources have outputs, compare their recorded fingerprints and re-check the semantic relationship.
4. If false, repair the state or surface the smallest concrete action.
5. Record the state check result where the next loop can see it.

For substantive edits with downstream outputs, use the core `../canon/change-closure.md`: it adds the explicit-relationship pass, semantic corpus scan, sovereign receipts, and a workspace fingerprint that also detects when the receipt itself was missed. State-based sync names the general test; change closure applies it to a source and everything materially downstream.

## Example

Weak: "What changed in the canon since last run?"

Strong: "Does this machine currently have the canon files it should have, and are they the same as factory unless the Author explicitly overrode them?"

Weak: "Did the user edit a file this month?"

Strong: "Do the current source fingerprint, approved output fingerprint, and stated relationship still agree; if not, what exact local repair or consent gate closes them?"

## When Not To Use

Use deltas when reconstructing history matters. Use state when deciding what to do next.

## Origin

First observed in user0's system. Stripped of private context and contributed as a reusable marketplace module.
