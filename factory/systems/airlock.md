# Airlock

## Module ID

`github:benmowinckel/alexandria#factory/systems/airlock`

## What it does

Airlock is a disposable projection of approved Alexandria context plus an untrusted inbox. Each untrusted AI connection gets a hidden isolated compartment with three simple surfaces:

- `context/` contains the Author's already-public Library shadow by default.
- `inbox/` accepts file writes.
- `airlock-capture` GitHub issues accept tools that can create issues but not files.

The app's identity never names the repo, path, state, permission, label, or capture. Hidden compartments use only `airlock`, `airlock-2`, and so on. The AI never receives the Author's Apple login, general GitHub login, sovereign repo, private Git history, or another compartment. Returned work is labelled `trust: untrusted` and enters the normal capture inbox for review. It has no automatic authority to change files, invoke tools, or become canon.

## Why hidden compartments

Each repo is a security boundary. A repository-scoped credential can reach that repo and nothing else. Separate hidden repos keep revocation, history, and provenance separate, so one untrusted app cannot read or poison another's work without turning app identity into system structure.

The Library shadow is the content. A private Git remote is only the default replaceable transport and write buffer. The public Library is the read-only door when no write-back is needed. A trusted AI running on the Author's own machine can use the sovereign local checkout. Airlock is the middle door: an approved projection plus a safe return path.

The human interface is one word: `Airlock`. It means connect the untrusted AI currently in view through this boundary. The trusted local agent chooses the next hidden compartment, handles every path and command, starts with already-public Library context, and asks once only if extra private context or the app's own approval screen is actually required.

## Operation

The signed controller is `factory/scripts/airlock.py`; the exact consent and commands are in `factory/optional.md § airlock`.

Saying `Airlock` is the go to connect the untrusted AI currently in view through a fresh isolated compartment. Already-public Library context needs no second verdict and stays current automatically. Any additional private context is a frozen snapshot until its exact new bytes are approved, and the external app may still show its own unavoidable repository-grant screen. Setup, joining, and marketplace browsing do none of this.

At the next local session, the controller fast-forwards file returns, rejects path traversal, symlinks, binary or oversized files, changed context, changed protected paths, and rewritten history, then imports both channels as untrusted captures. It closes an issue only after its local capture exists. After inbound work is safe locally, it regenerates the already-public shadow from ground truth and pushes it to the connected remote. A private snapshot changes only through an explicit approved refresh.

The honest limit is content: an untrusted AI can write malicious instructions into its inbox. Airlock makes those words powerless by structure; the trusted local AI still has to review them as data rather than obey them.

## Mirror and OFF

`status` shows the active state, repo, allowlist hash, selected-bytes hash, issue label, and import counts. The regression test rebuilds the boundary from scratch, attacks every protected path, and proves both return channels.

`off` disables local refresh and import and removes the selected-bytes permission. Revoking the repo credential or archiving the private remote removes the external AI's access. The sovereign source remains untouched.

## Product boundary

This is an official, optional connection. It is visible in the marketplace so people can discover it, but it is never part of Foundation, default setup, or onboarding. Visibility is not activation.
