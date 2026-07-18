# State-Based Sync

## Module ID

`github:benmowinckel/alexandria#factory/systems/state-based-sync`

## Problem

Agents drift when they reason from changelogs instead of the current invariant. Delta tracking answers "what changed?" State-based sync answers "is the system true right now?"

The delta can be complete and still misleading. The state can reveal a problem even when no recent delta mentions it.

## Pattern

For any loop that can silently drift, define the current-state invariant and verify against that directly.

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
3. Compare current state to the invariant.
4. If false, repair the state or surface the smallest concrete action.
5. Record the state check result where the next loop can see it.

## Example

Weak: "What changed in the canon since last run?"

Strong: "Does this machine currently have the canon files it should have, and are they the same as factory unless the Author explicitly overrode them?"

Weak: "Did the user edit a file this month?"

Strong: "Is the Author currently compliant with the file obligation, and if not, what exact approved/proposed public shadow state would close it?"

## When Not To Use

Use deltas when reconstructing history matters. Use state when deciding what to do next.

## Origin

First observed in user0's system. Stripped of private context and contributed as a reusable marketplace module.
