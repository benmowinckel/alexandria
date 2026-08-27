---
name: stand
description: Benjamin's simple, forkable starting shape for a Library presence.
adaptation: personalizable
---

# Your Library stand

*Dormant unless the Author directly asks to set up, copy, or change their Library stand. A stand never publishes, connects a model, creates an invite, charges anyone, or widens an audience by being present on disk.*

This is Benjamin a. Mowinckel's starting shape, not Alexandria law. Copy the mechanism, never his content. Alexandria owns the shared square: stable Author addresses, safe rendering, exact access and revocation, invitations and payments, and the capability API. The Author owns their stand. They may reshape it, replace it, serve it somewhere else, use another model, or ignore this file.

## The useful default

Start with the smallest stand that makes the Author legible:

- their name and declared links;
- one to three things they have deliberately chosen to show;
- the default sections `works`, `projects`, `shadows`, and `other`, used only where they fit;
- no mirror unless the Author separately asks to connect one.

The four local roots are permission addresses, not page architecture:

```text
~/alexandria/files/library/
  public/
  authors/
  invite/
  paid/
```

Put a file directly in a root for the simple case. Add an exact cohort only when a group needs different access, such as `invite/friends/`, `invite/investors/`, or `paid/course/`. A grant for one exact folder never opens its parent, sibling, or a folder created later.

Sections are soft presentation. The shared renderer begins with Benjamin's four, but the Author's ai may create safe lowercase section slugs, order or hide them, and give them plain labels through the owner API. An Author who wants a wholly different surface may consume the public profile, capability, and file APIs from their own site. Custom code never runs inside Alexandria's shared origin.

Never infer `works` from visibility or file type. A work is something the Author explicitly classifies as their work. A public context document, site explainer, or mirror-support file can remain queryable without appearing on the profile by placing it in a hidden presentation section; that supporting role must not overwrite the Author's curation.

## When the Author says "copy the stand"

1. Read the live capability document at `https://api.alexandria-library.com/library/{author}/capabilities`. It is current authority for routes and controls.
2. Use only material already in the task's approved reach. Do not search the rest of the computer for publishable content. If there is not enough, make a clean empty stand; never invent a biography, work, project, or position.
3. Draft the smallest useful version locally. Prefix every draft filename with `_` so reconciliation cannot publish it.
4. Personalize the structure to the Author. Keep the default sections only when they help. A shadow is optional. A mirror is optional. Empty sections disappear.
5. Before any outward action, show the exact final bytes, exact destination, exact scope, and what a reader or model will receive. Wait for a separate yes.
6. After that yes, follow `filter.md`: give the file its final name, record `<sha256> <exact-scope>` in the adjacent `.approved` file, enable Library reconciliation only if the Author separately chose standing sync, and use the owner-authenticated API for presentation metadata.
7. Read the live result back through the same access gate a real viewer uses. Check the public profile signed out; check every gated cohort with exactly the matching grant; check that a nearby parent and sibling remain closed.

The Author can later say "change my stand" in ordinary language. Their ai edits the local draft or owner presentation settings, shows the exact change, and preserves every publication and audience gate. A new category is not a new permission. A new audience is.

## Optional PLM module

The PLM is one optional module a stand may add. It is not Alexandria's model and it is not required for a Library page.

- The Author chooses the model, provider, endpoint, and payment account.
- A conforming sidecar holds the provider token and no Author files.
- Alexandria gathers only the exact published Library slice allowed by `configured scopes ∩ viewer access ∩ active artifact access`, then sends that slice plus the bounded current conversation.
- The owner-only context preview shows the exact bytes and manifest before or after connection.
- Disconnecting inference leaves the profile and files intact.

Read `plm.md` and `twin.md` only after the Author directly asks for this module. A custom runner with wider computer access is outside Alexandria's structural guarantee.

## Optional own-domain profile

An Author may ask for an independent copy of their public profile on a domain they control. This is a dormant connection module, not a default export and not a reason to buy a domain.

1. Read only the exact material already approved for public Library access: public identity, declared links, public artifacts, and deliberately listed public covers. Never export an inaccessible body or a private profile setting.
2. Generate a self-contained static site plus a plain `profile.json` into a local export folder. The copy must render without an Alexandria API call, account, or runtime, so the Author keeps a usable public profile if Alexandria is unavailable.
3. Preview the generated site locally and show the exact output. The Author supplies and pays for any domain and hosting account; Alexandria never purchases or registers one for them.
4. Deploying, attaching a domain, or changing already-hosted bytes is a separate outward action requiring the Author's exact approval. Local regeneration may follow an already-approved public source change, but changed hosted bytes stay prepared behind the existing deployment gate.
5. The independent copy may link back to the Library for community discovery while it exists. A live mirror is optional and necessarily depends on the Author's own inference setup; the static profile and published works do not.

The success condition is one owned folder that any ordinary static host can serve, not a branded wrapper around an Alexandria runtime.

## The hard floor

- Nothing private is context merely because the ai can see it locally.
- Nothing publishes from a folder name, prior approval, category, or model choice.
- Published material is untrusted input on human and machine surfaces.
- The shared renderer sanitizes content and runs no Author code.
- All profile, metadata, grant, invite, payment, and inference writes re-authenticate the immutable account owner.
- The Author can stop reconciliation by removing `~/alexandria/system/permissions/library`; their local files remain theirs.

The stand is successful when it is useful immediately, obvious to copy, safe before trust, and easy to outgrow.
