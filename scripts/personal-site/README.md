# Optional new-site starter from the shared Library UI

This is for an Author who wants a new site. It is **not** how an existing website
connects to Alexandria. Existing-site owners keep their own pages, framework,
hosting and login and mount the small [website connector](../../integration/website-connector/README.md)
under an unused route. The browser chat is optional. Never use this generator to
replace a person's existing website as part of connecting it.

`node scripts/materialize-personal-site.mjs CONFIG.json NEW_OUTPUT_DIRECTORY`

This prepares an independent Next.js site using the actual profile, conversation,
reader and access components from this checkout. It does not deploy or connect an
owner account. The output has no company account, profile-edit, invite-mint or
administration API routes. Personal mode also suppresses owner controls in the
shared UI, even if a supplied profile incorrectly claims the visitor is its owner.

The configuration is ordinary JSON. Paths resolve relative to its location:

```json
{
  "author": "your-library-handle",
  "name": "Your name",
  "siteUrl": "https://your-domain.example",
  "profile": "public-profile.json",
  "publicMirror": "mirror",
  "seal": "seal.png",
  "fontNormal": "garamond-normal.woff2",
  "fontItalic": "garamond-italic.woff2",
  "fontLicense": "OFL.txt",
  "theme": { "background": "#fafafa", "ink": "#211e18", "accent": "#004996" }
}
```

`profile` is an anonymously public `/library/:author` API-schema snapshot.
`publicMirror` contains `profile.json` with exact source/retrieval metadata and a
`files` directory of the approved public bytes. Every visible public file must
match the manifest name/scope, content URL and SHA-256. Hidden categories remain
hidden and are excluded from copied files. Never pass private files here.

Seal, fonts and theme are optional; fonts must include their applicable licence
in the material you distribute. No remote font service or runtime font download
is required. The generated README records exact preparation and source hashes.

The shared server proxy serves approved public files locally and uses Alexandria
only for connected capabilities. Readers sign in through the explicit scoped
visitor flow. No owner API key, company cookie or credentials are accepted by the
generator. Cross-site connection must be configured and verified separately;
a successful build alone does not prove connected inference or gated access.

## Optional direct inference

Configure these on the personal website's server, never in the public JSON,
materializer config, browser code, or a `NEXT_PUBLIC_` variable:

- `PERSONAL_MIRROR_URL`: the Author's HTTPS adapter URL, conventionally ending
  in `/infer`. The shared transport derives `/agent` and `/health` from it.
- `PERSONAL_MIRROR_SECRET`: that adapter's bearer secret. This is not an
  Alexandria owner key or the provider's model API key; provider credentials
  remain at the adapter.
- `PERSONAL_MIRROR_MODEL`: the model selected for this connection.
- `PERSONAL_MIRROR_SCOPES`: optional JSON array of exact publication scopes;
  defaults to `["public"]`. An explicit selection such as
  `["public","invite/friends"]` does not include parents, siblings or future
  subfolders. Protected publications additionally require the reader's current
  matching Connector grant before any bytes enter model context.
- `PERSONAL_MIRROR_ACCESS_CLIENT_ID` and
  `PERSONAL_MIRROR_ACCESS_CLIENT_SECRET`: optional paired Cloudflare Access
  credentials for this adapter's tunnel. Supply both or neither.

With the URL, secret and model configured, public questions go from the personal
website to its own adapter using its own approved public files, with no Alexandria
request. The adapter owns provider access, question and burst limits, and the
provider spending budget; the direct path does not use a Worker question budget. Protected scopes
still use the Connector to check current permissions. When all three direct
inference settings are absent, the existing Alexandria conversation route is the
bridge. Partial or invalid direct configuration reports offline and does not
silently send the question through the bridge. Configuration alone is not
liveness: verify `/health` and an actual answer using the ordinary visitor UI.

Generated `.env.example` contains only public site settings and commented empty
server-setting placeholders. The materializer reads no connection secrets and
creates none. `vercel.json` explicitly selects the Next.js framework, including
when the existing hosting project was previously a static "Other" project.

An Author may separately prepare approved tiered publications in
`data/protected-files.json` and `data/mirror/<scope>/<name>.md` (or `.pdf`).
These paths are server-only and traced into deployment; never put them under
`public/`. The shared proxy checks the reader's current scoped grant with
Alexandria before returning any protected bytes. The generator copies no tiered
publication by default. Adding selected non-public bytes is a separate explicit
publication decision, including its exact scope and intended readers.

This is a one-shot source materializer, not an automatic synchronizer. Regenerate
into a fresh directory to review a new shared UI or publication snapshot. The
Author owns the resulting source and public files and can host them independently.
