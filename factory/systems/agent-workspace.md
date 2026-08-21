# Agent Workspace

## Module ID

`github:benmowinckel/alexandria#factory/systems/agent-workspace`

## What it does

Safely lets an AI you are testing read selected files and send work back. It creates one fresh private Git repo for that AI with two simple surfaces:

- `context/` contains only exact text files the Author reviewed and approved.
- `inbox/` is the only place the AI is allowed to write.

The AI never receives the Author's Apple login, general GitHub login, sovereign repo, private Git history, or another AI's workspace. Returned work is labelled `trust: untrusted` and enters the normal capture inbox for review; it never becomes canon automatically.

## Why one repo per AI

The repo is the security boundary. A repository-scoped credential can reach that repo and nothing else. Separate repos also keep revocation, history, and provenance separate, so one AI cannot read or poison another's work.

The public Library is the read-only door when no write-back is needed. A trusted AI running on the Author's own machine can use the sovereign local checkout. The agent workspace is the middle door: selected private context plus a safe return path.

## Operation

The signed controller is `factory/scripts/agent_workspace.py`; the exact consent and commands are in `factory/optional.md § agent-workspace`.

Enabling has two distinct approvals: first the Author approves the exact selected bytes by hash; then the Author separately creates or connects a private remote and grants that one repo to the AI. Setup, joining, and marketplace browsing do none of this.

The controller rejects path traversal, symlinks, binary or oversized files, changed context, changed protected paths, and rewritten history. It never pushes automatically.

## Mirror and OFF

`status` shows the active state, repo, allowlist hash, selected-bytes hash, and import count. The regression test rebuilds the boundary from scratch and attacks every protected path.

`off` disables local refresh and import and removes the selected-bytes permission. Revoking the repo credential or archiving the private remote removes the external AI's access. The sovereign source remains untouched.

## Product boundary

This is an official, optional connection. It is visible in the marketplace so people can discover it, but it is never part of Foundation, default setup, or onboarding. Visibility is not activation.
