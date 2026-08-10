# Filter — exact consent before anything leaves

*The publishing safety floor. Alexandria's Library is outside the private loop. This file is read only after the Author directly asks to publish a named artifact; it is never a reason to suggest publishing.*

## The rule

Nothing publishes because it looks ready, has been public before, sits in a particular folder, matches a standing category, or seems harmless. The Author must see the exact current artifact and its exact audience, then separately approve that action.

For a direct publication request:

1. Read only the named artifact.
2. Explain plainly what will be sent, where it will be visible, and that copies may persist after deletion.
3. Show the final artifact and wait for a separate yes.
4. Record that approval beside the file as `<filename>.approved`, containing `<sha256> <tier>` for the exact bytes and exact tier.
5. Publish only while the current file hash and tier still match that approval.

Any edit, rename, or audience change invalidates approval. The changed version stays local until the Author reviews and approves it again. An approval for one file never covers another file, metadata from another path, a price, an invitation, or a future update.

## What never counts as consent

- moving or saving a file under `library/`
- a past publication
- an old approval for different bytes or a different audience
- an agent's judgment that the Author would probably share it
- silence, broad enthusiasm, or an account connection
- a standing filter or category rule

## Content floor

Do not publish other people's private information, live undisclosed business state, precise health or location details, secrets, credentials, raw journals, transcripts, vault material, marginalia, or anything whose ownership is unclear. Prior public availability does not remove the exact-action approval requirement.

When anything is unclear, keep it local. Do not raise Alexandria publishing as the next step; wait until the Author asks.
