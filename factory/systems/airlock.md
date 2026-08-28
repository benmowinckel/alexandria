# Airlock

## Module ID

`github:benmowinckel/alexandria#factory/systems/airlock`

## What it does

Airlock gives one experimental AI a bounded Alexandria projection plus an untrusted return path. It has three surfaces:

- `context/` contains only files deliberately selected by the owner.
- `inbox/` accepts file writes.
- `airlock-capture` GitHub issues accept tools that can create issues but not files.

Every return enters the normal capture inbox as `trust: untrusted`. It has no automatic authority to change files, invoke tools, or become canon. A wholly public Library projection may refresh automatically. Any projection containing private context requires approval of the exact selected bytes and remains frozen as a unit until changed bytes are reapproved.

## The structural boundary

The wall is a separate GitHub account, not a repository label. Some AI products request account-wide GitHub access. A private repo inside the Author's normal account would therefore expose every repo that account can reach.

The dedicated Airlock account may own or access exactly one private repo named `<ai>-airlock` and belong to no GitHub organizations. It receives no Apple login, sovereign-repo credential, private Git history, or other repository. The signed controller checks the credential identity, expected app-named remote, organization list, repository visibility, and complete accessible-repository list before every fetch, push, or issue import.

The account has one broad-OAuth occupant at a time. To change experimental AIs, first import any final return, revoke the old app, then delete or rebuild the remote before granting the next app. Two mutually untrusted broad-OAuth AIs cannot safely share this account at once; they need genuinely repo-scoped app grants or separate accounts.

The selected projection is the content. The private Git repo is only a replaceable transport and write buffer. App identity names the disposable repo for legibility and provenance; the separate account remains the structural wall.

## Human use

The Author opens the trusted computer AI and types `Airlock this new AI: <name or URL>`. That is approval to prepare the local projection and the one app-named repo. Any private selection is shown with its exact content hash and separately approved before export. GitHub requires the human to create/sign into the separate account and approve or revoke third-party access; the trusted agent handles the files, checks, and commands around those unavoidable human steps.

The signed controller is `factory/scripts/airlock.py`; exact commands and consent boundaries are in `factory/optional.md § airlock`.

## Operation

The controller accepts only explicit regular text files under `files/`, and requires exact-byte approval whenever any selected file is not already public Library material. It rejects path traversal, symlinks, binary or oversized files, unapproved private-byte changes, changed exported context, changed protected paths, rewritten history, the wrong GitHub identity, a generic or wrong app repo, organization membership, and access to any second repository.

At import it fast-forwards file returns, verifies the exported projection byte-for-byte, wraps both return channels as untrusted captures, and closes an issue only after its local capture exists. It may then regenerate an already-public shadow from local ground truth. Private snapshots never auto-refresh.

The honest limit is content: an experimental AI can return malicious instructions. Airlock makes those words untrusted data; the trusted local AI must still review rather than obey them.

## OFF

`status` shows the account, current occupant, repo, hashes, issue label, and import counts. `off` disables local refresh and import. Revoking the current app removes its GitHub access; deleting or rebuilding the disposable repo clears its returned history before the account is reused. The sovereign source remains untouched.

## Product boundary

This is an official optional connection, never part of Foundation, default setup, or onboarding. Visibility in the marketplace does not activate it.
