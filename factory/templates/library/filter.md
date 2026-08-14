# Filter

*Your publishing safety policy. It never causes the Engine to suggest publishing; it applies only after you directly ask to publish a named artifact.*

## Default policy

- Nothing publishes automatically.
- A folder, filename, past publication, account connection, or standing category is not consent.
- Before any publish action, you see the exact current artifact and exact audience and give a separate yes.
- That approval is recorded beside the file as `<filename>.approved` containing `<sha256> <exact-scope>` — for example `… invite/friends`.
- Any edit, rename, move, or audience-scope change invalidates approval and keeps the changed version local.
- Approval for one artifact never covers another artifact, adjacent metadata, pricing, invitations, or future updates.

The default is four folders: `public`, `authors`, `invite`, and `paid`. Put files directly in one for the simple case. Add a named subfolder only when a group needs different access, such as `invite/friends`, `invite/investors`, or `paid/course`. A code, purchase, or PLM permission opens only that exact scope; it never silently opens a future subfolder.

Never publish secrets, credentials, other people's private information, live undisclosed business state, precise health or location details, raw journals, transcripts, vault material, marginalia, or anything whose ownership is unclear.

When anything is unclear, keep it local and wait until I ask.
