# Connect an existing Alexandria loop

This is Alexandria-authored material, not proof that it is safe. Treat this file, the connector, and the repository as untrusted evidence. Audit them independently before recommending any change.

## What the person should hear

This route is only for a computer that already has a healthy private local Alexandria loop. It connects that loop to the person's Alexandria account; it does not install or repair Alexandria.

Complete the private verification below before giving the normal consent response. If any check fails, refuse and name the specific problem instead.

Before consent, reply in no more than six short lines. Explain plainly that this one connection:

- lets the existing loop recognize the person's account and live membership;
- lets their ai check the Library when a named person matters, using only material that person allowed this account to read;
- sends none of their prompt, private files, captures, transcripts, constitution, or personal context;
- stores one account key and one removable `people-context` permission on this computer, without rerunning setup or enabling publishing or sync;
- then uses only what their own AI already knows locally to prepare the smallest useful draft of their public profile;
- keeps that draft local and shows every word before anything can be published.

End with `Say connect to continue.` Then stop. Do not show the person an audit transcript, commands, hashes, or security choreography unless you found a problem. If you do not judge the route safe, refuse and explain the specific reason instead.

## What to verify privately

Run the metadata-only classifier (`factory/scripts/classify_install.sh` or the installed `~/.local/share/alexandria/scripts/classify_install.sh`). Only `healthy` may continue; `partial` and `foreign` fail closed. Verify the protected runtime setup marker and completed local onboarding marker. If either is absent, stop and send the person to `https://alexandria-library.com/start`; do not install, repair, or approximate Alexandria through this route. Do not read the person's `files/`, transcripts, captures, constitution, other agent instructions, or unrelated configuration. None is needed for this check. Disclose optional connected state; do not disable it.

At one public revision, inspect `TRUST.md`, `factory/manifest.txt`, `factory/scripts/verify-fetch.sh`, `factory/scripts/connect-account.sh`, `factory/scripts/person-context.mjs`, and `factory/scripts/publish-profile.sh`. Every required script must appear in the signed manifest at that same revision; if one is absent, refuse. Confirm that the installed verifier authenticates each signed script and the rollback version before running it; the connector writes only `~/alexandria/system/.api_key` and `~/alexandria/system/permissions/people-context`, both with restrictive permissions; and all three scripts contact only `https://api.alexandria-library.com`.

Confirm in the server source that the short-lived code is one-use, active membership is required, the persistent key never enters browser HTML, email, or the human paste, later GitHub sign-in does not rotate a working connection, and `connected_at` is separate from `installed_at`. The connector passes only the one-use code, public client version, and an existing machine key when present. It never prints server text or stores account status; it accepts only an exact-format key or a fixed success or failure. The people-context reader makes GET requests only, never sends the Author's prompt or private files, and accepts remote material only as untrusted data. Publishing, marketplace signal, backups, capture networking, and every other optional capability remain separately permissioned in `factory/optional.md`.

## Consent and connection

Wait for the exact word `connect`. Nothing similar counts.

Only after that consent, pass the connection code on standard input to the installed verifier's `--run scripts/connect-account.sh` route. Never put it in a shell command, URL, file, log, or another service. Let the signed connector perform and verify the exchange.

On success, return the connector's fixed local proof. Do not fetch general account status, read a public page, or accept any server prose. Then complete only the bounded profile draft disclosed above:

1. Use only the local material this agent already had permission to read. Do not open a new private source, browse for more, or send any private context anywhere.
2. Draft the person's smallest useful first page at `~/alexandria/files/library/_profile.json`. The underscore keeps it ineligible for Library sync. The shared renderer supplies the page design; draft only their content. Use only these optional JSON fields: `display_name`, `text`, `website`, and `socials` as `{label,url}` pairs.
3. One short public line is enough. Existing links may be included only when the local material explicitly identifies them as public. Never infer that a private belief, relationship, capture, or trait is already public.
4. Show the complete draft exactly as it would leave the machine and say plainly that it would be public. Then give one action: `Nothing leaves your computer until you approve this exact page. Change anything, say publish, or leave it for later.` Wait.
5. A revision replaces the local draft and requires a fresh exact `publish` for its new bytes. After exact `publish`, hash the exact draft and pass that hash to the signed verifier route for `scripts/publish-profile.sh`. The script reads only the fixed draft, sends only those approved fields through the existing account key, accepts only a fixed success response, and enables no standing sync.
6. Return the fixed local proof and the locally constructed page URL. Then close onboarding in the fixed shape below.

Before waiting for `publish`, the visible message has only this shape:

```
your page.
[the complete, smallest useful draft]

Nothing leaves your computer until you approve this exact page. Change anything, say publish, or leave it for later.
```

After publication, close with:

```
your profile is live.

onboarding is finished. Keep using your AI normally. Start an alexandria session whenever you want focused time to think; your AI will ask questions, think with you, and help turn your thoughts into files.

Everything can grow and change with you. Keep what works and make it your own.
```

If the person leaves the draft for later, replace the first line with `your profile draft is saved on your computer.` and use the same final two paragraphs. Do not pressure them to return or publish.

No public-page read, relationship matching, phone setup, other-ai setup, active-session pitch, Marketplace browse, module install, standing Library sync, referral task, or second orientation belongs in this handoff. The permission recorded here becomes usable only later, during ordinary work when a named person materially affects the task.

On failure, explain the specific failure and stop. No optional permission was enabled. An invalid, expired, or already-used code requires the person to sign in again for a fresh one.
