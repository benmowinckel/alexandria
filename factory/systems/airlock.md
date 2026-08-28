# Airlock

## Module ID

`github:benmowinckel/alexandria#factory/systems/airlock`

## What it does

Airlock gives one experimental AI a public-only Alexandria shadow plus an untrusted return path. It has three surfaces:

- `context/` contains already-public Library material.
- `inbox/` accepts file writes.
- `airlock-capture` GitHub issues accept tools that can create issues but not files.

Every return enters the normal capture inbox as `trust: untrusted`. It has no automatic authority to change files, invoke tools, or become canon. Private Alexandria material is not exportable through Airlock.

## The structural boundary

The wall is a separate GitHub account, not a repository label. Some AI products request account-wide GitHub access. A private repo inside the Author's normal account would therefore expose every repo that account can reach.

The dedicated Airlock account may own or access exactly one private repo named `alexandria-airlock` and belong to no GitHub organizations. It receives no Apple login, sovereign-repo credential, private Git history, or other repository. The signed controller checks the credential identity, remote owner, organization list, repository visibility, and complete accessible-repository list before every fetch, push, or issue import.

The account has one broad-OAuth occupant at a time. To change experimental AIs, first import any final return, revoke the old app, then delete or rebuild the remote before granting the next app. Two mutually untrusted broad-OAuth AIs cannot safely share this account at once; they need genuinely repo-scoped app grants or separate accounts.

The Library shadow is the content. The private Git repo is only a replaceable transport and write buffer. App identity appears only as the current occupant in local state; it never names the account, repo, path, label, or capture.

## Human use

The Author opens the trusted computer AI and types `Airlock this new AI: <name or URL>`. That is approval to prepare the local projection and the one generic repo. GitHub requires the human to create/sign into the separate account and approve or revoke third-party access; the trusted agent handles the files, checks, and commands around those unavoidable human steps.

The signed controller is `factory/scripts/airlock.py`; exact commands and consent boundaries are in `factory/optional.md § airlock`.

## Operation

The controller rejects any allowlist source outside `files/library/public/`. It rejects path traversal, symlinks, binary or oversized files, changed context, changed protected paths, rewritten history, the wrong GitHub identity, organization membership, and access to any second repository.

At import it fast-forwards file returns, verifies the exported shadow byte-for-byte, wraps both return channels as untrusted captures, and closes an issue only after its local capture exists. It then regenerates the public shadow from local ground truth and pushes it through the dedicated account credential.

The honest limit is content: an experimental AI can return malicious instructions. Airlock makes those words untrusted data; the trusted local AI must still review rather than obey them.

## OFF

`status` shows the account, current occupant, repo, hashes, issue label, and import counts. `off` disables local refresh and import. Revoking the current app removes its GitHub access; deleting or rebuilding the disposable repo clears its returned history before the account is reused. The sovereign source remains untouched.

## Product boundary

This is an official optional connection, never part of Foundation, default setup, or onboarding. Visibility in the marketplace does not activate it.
