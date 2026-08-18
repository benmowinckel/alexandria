# Alexandria Shortcut — auditable action spec

This is the repo's canonical description of the Apple Shortcut the website
offers. The live iCloud artifact is hosted by Apple, not by Alexandria, and
this file is the inspectable contract. No secret, account key, or token is
part of the Shortcut.

## Artifact

| Field | Value |
|---|---|
| Public add URL | `https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337` |
| Apple Shortcut id | `0ea1bb7333fd43a9881e9c7b9938a337` |
| Website route | `https://alexandria-library.com/shortcut` |
| SHA-256 of the public URL | `3efb4b6dfedc4d283c0b40cc0dfc9037923f49e4ab444889810e0978d0caed26` |

The hash above is continuity evidence for the published URL string. Recalculate
it locally:

```bash
printf '%s' 'https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337' | shasum -a 256
```

A fingerprint learned from this repo is not independent proof that Apple still
serves the same action list. Confirm on-device.

## Platform

The Shortcut is an Apple Shortcuts item. It runs on iPhone, iPad, and Mac.
It does not run on Linux, Android, or Windows. Setup must inspect the actual
machine (`uname`, and on macOS whether iCloud Drive exists) before claiming
compatibility. Linux installs keep a local `~/alexandria/files/vault/input`
folder; they do not get an iCloud bridge unless the Author later uses a Mac.

## What it does

One share-sheet / Shortcuts action. The person picks a post, link, image,
audio, or short note. The Shortcut writes that item into **the Author's own
iCloud Drive** at:

```
iCloud Drive/alexandria/vault/input/
```

On a Mac with iCloud Drive, that folder is:

```
~/Library/Mobile Documents/com~apple~CloudDocs/alexandria/vault/input
```

Nothing is sent to Alexandria. There is no Alexandria URL, API key, analytics
call, or account lookup. The local loop sees those files only after the
separate `icloud-capture` add-on replaces `~/alexandria/files/vault/input`
with a symlink to that exact nested folder. Until then the pile waits cold.

## Network behavior

| Destination | When | What leaves |
|---|---|---|
| Apple iCloud | every save | the file the Author just shared, through their iCloud account |
| Alexandria | never | nothing |
| X / YouTube / the saved site | never from the Shortcut | the later optional `capture-link-resolution` add-on is a local session hook, not this Shortcut |

If the device is offline, the save stays in iCloud's local outbox until Apple
syncs it. That is Apple's transport, not ours.

## Destination, filenames, formats, collisions

- **Destination:** only `alexandria/vault/input/` inside the Author's iCloud
  Drive. Never the iCloud `alexandria` root (that root may hold a full files
  mirror).
- **Formats:** X/Twitter shares arrive as `.html`; ordinary links as `.txt` or
  `.url`; photos, screenshots, and audio stay as the original media bytes.
- **Filenames:** a timestamp plus a short source hint, for example
  `2026-08-17_21-04-11-x.html`. The Shortcut must not overwrite an existing
  name: if the computed name exists, append `-2`, `-3`, and so on.
- **Never-delete:** the Shortcut only creates files. It does not clear the
  folder or rewrite earlier saves.

## On-device inspection

1. Open the Shortcuts app.
2. Open the Alexandria Shortcut.
3. Use **Show Shortcut** / the action list. Confirm there is no Get Contents
   of URL to `alexandria-library.com`, `api.alexandria-library.com`, or any
   other non-Apple host.
4. Confirm the Save File / Save to Files action targets
   `iCloud Drive/alexandria/vault/input`.
5. Confirm no Text action embeds an API key or token.

If the live action list disagrees with this file, trust the device and stop.

## Provenance

The add URL is an Apple iCloud Shortcuts link. This repository cannot ship the
binary Shortcut; Apple signs and hosts it. Authors who do not want Apple in
the path skip the Shortcut and drop files into a local folder themselves.
The later local resolver (`factory/scripts/capture_resolver.py`) is a separate
permissioned hook and is not this Shortcut.
