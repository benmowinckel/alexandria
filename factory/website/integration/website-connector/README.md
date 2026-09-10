# Add a mirror to an existing website

A mirror is the selected thinking you make accessible. A Connector connects it
to shared discovery and reader permissions. They are separate choices.

Keep the existing website, hosting account, domain, pages, styles, sign-in and
publishing workflow. Start with ordinary public files. Add a model or shared
connection only when the owner wants what that part does.

## 1. Public mirror: one file, no account or backend

Put a small description file on the existing website. It points to material the
owner already publishes; it does not copy their site, move their storage or send
anything to Alexandria. For example, `/mirror.json`:

```json
{
  "name": "Your name",
  "website": "https://your-existing-domain.example/",
  "files": [{
    "name": "thinking",
    "title": "My thinking",
    "scope": "public",
    "format": "md",
    "content_url": "https://your-existing-domain.example/thinking.md"
  }]
}
```

That is a usable public mirror. Give its address to a person or their ai; they can
read your selected material directly. No login, subscription, Alexandria handle,
JavaScript, model, package installation or registry is needed. Existing HTML pages
remain ordinary website links; selected Markdown and PDF files provide the
portable deeper material. An optional `sha256` records the exact published bytes.

A small helper can create and verify the file. It is one plain Node 20+ script,
with no npm dependencies, build or Git checkout requirement. An existing trusted
ai can fetch the integrity-verified helper through the module delivery path, or
inspect this source and run it with the host's existing Node runtime:

```sh
node static-mirror.mjs create --site https://your-existing-domain.example --name "Your name" --root /your/website/public --file thinking.md --file writing/essay.pdf --output mirror.json
node static-mirror.mjs verify https://your-existing-domain.example/mirror.json
```

The first command **writes only the descriptor**. Each `--file` must already be
in the explicitly selected public directory; it never scans private files,
copies material into public storage, or edits HTML/CSS. Deploy the descriptor
through the site's usual publishing path before running `verify`. To refresh the
selected files and their hashes, review the publication changes and repeat
`create` with `--replace`. That replacement accepts an existing mirror descriptor
for the same site, never an arbitrary page. Removing a public URL also requires
removing it from the owner's hosting/CDN: changing the descriptor alone cannot
make already-published bytes private.

A site builder that permits custom files can use this same JSON without Node.
If it does not permit files or backend routes, use another owner-controlled host
for the mirror and link to it from the existing site. The current Connector
registers one HTTPS origin at a time. Do not claim that a pasted script can give
a static or restricted platform server capabilities it does not provide.

## 2. Optional live mirror: reuse the owner's backend

A model requires an actual backend to keep provider credentials and selected
protected material out of browser source. Mount this small handler under an
unused path, normally `/_alexandria`; it returns `null` for every other route.
It adds no homepage, navigation, footer, profile editor, required chat box or
company account. Public files and own-model questions make zero Alexandria calls.

Use plain `handler.mjs` and `shared/mirror-context.mjs` through the site's existing
bundler, or retain their relative paths when copying source. There are no npm
dependencies and no Next.js or React requirement. It uses standard `Request`,
`Response`, Web Crypto and `fetch`; `node.mjs` adapts Node HTTP.

```js
import { createWebsiteMirror } from './integration/website-connector/handler.mjs';

const mirror = createWebsiteMirror({
  site: 'https://your-existing-domain.example',
  name: 'Your name',
  publications: {
    list: () => yourPublishedInventory(),
    read: file => readYourPublishedFile(file),
  },
  infer: request => yourExistingModel(request), // optional; no model selected here
});

// Inside the host's existing request handler:
return await mirror(request) ?? existingWebsite(request);
```

Each inventory item is `{name, scope, format, title?, category?, sha256?}`.
`name` is a stable lowercase file name; `scope` is an exact publication scope such
as `public`, `public/projects` or `invite/friends`; `format` is `md` or `pdf`.
`read(file)` returns a string or `Uint8Array` from owner storage. Only explicitly
public inventory appears in the manifest. Supplied SHA-256 values are checked
against the actual bytes before serving or inference. Accept selected
publications only; never point this at a private canon or automatic file scan.

For Node's `createServer`, call `await nodeConnector({handle: mirror, site})(req,
res)` first and return if it returns `true`; otherwise run the existing router.
[example/server.mjs](example/server.mjs) attaches an account-free backend to a
plain website without editing HTML/CSS. A static-only host needs a separate
owner-operated backend for model calls; choosing that backend never requires
moving the existing pages.

To use the site's **existing** restricted access, supply
`authorize: async (request, exactScope) => yourCurrentAccessCheck(request, exactScope)`.
Only the literal boolean `true` permits a protected read; every request checks
again before listing, reading or answering from protected material. The existing
owner login remains the login. Its security, availability and revocation are the
owner adapter's responsibility. Without `authorize` or an explicit Connector,
protected scopes stay unavailable and no shared sign-in routes exist.

## 3. Optional Connector: the paid shared service

The public mirror above already works. Connection adds verified discovery and
shared reader identity/current permissions across separately hosted mirrors.
Only that live shared service requires membership. The copied recipe, files and
own model do not expire when the owner cancels. Subscription expiry removes the
shared connection; it cannot recall public files or answers already delivered.
A membership alone is never an invitation or purchase of another owner's material.

Register from the owner's trusted account client, with explicit listing consent:

```json
{
  "site": "https://your-existing-domain.example",
  "manifest_path": "/mirror.json",
  "listed": true
}
```

Use `POST /connect/site`, add the returned DNS TXT proof at the existing DNS
provider, then call `POST /connect/site/verify` from the same account client.
**Never put the owner account key in the website.** A static mirror omits
`callback_path`; it needs no backend, browser identity exchange or hosted profile.
Verified registration binds its own-site manifest to the account; the descriptor
itself does not need an Alexandria author field.

For shared protected access, add an explicit connection to the backend config:

```js
connector: {
  author: 'your-registered-handle',
  flowSecret: process.env.WEBSITE_CONNECTION_SECRET,
}
```

Register the matching `manifest_path: '/_alexandria/manifest.json'` and
`callback_path: '/_alexandria/callback'`. These paths can be changed to the chosen
mount. The server chooses callbacks only from verified registration; the visitor
cannot supply an arbitrary callback. Changing an address or callback invalidates
the old registration version and requires fresh verification. Use either the
owner's `authorize` or this shared Connector, never two competing access sources.
The old `createWebsiteConnector` export remains a compatibility wrapper for
previous connected deployments; new integrations start with `createWebsiteMirror`.

On serverless hosts, `flowSecret` is a stable random secret of at least 32 bytes,
stored only in server configuration. It encrypts a five-minute HttpOnly PKCE-flow
cookie, so another instance can finish sign-in without adding a database. It is
not an owner account key or model key. Alternatively supply
`connector.flows: {put(id, flow), take(id)}` using the owner's existing shared
store with atomic read-and-delete. Only explicit loopback development defaults
to the in-memory helper. Unconfigured production sign-in stays unavailable;
public operations still work.

| Owner host | Alexandria shared service |
| --- | --- |
| Existing pages, assets and selected publications | Verified account → site/manifest/callback address |
| Model, model credentials, questions, selected context and answers | Discovery across opted-in registered sites |
| Public and owner-authorized reads | Delegated reader identity and current exact access checks |

Public mirror operations continue during a network outage or after departure.
Shared protected access checks fail closed when current permission cannot be
verified. Optional Alexandria-hosted profiles and model relay remain starter
conveniences for people choosing them; they are not dependencies of this recipe
or a required migration destination. This package does not silently provision
hosting, choose a model account, activate billing or enable those bridges.

## Optional mirror chat and protected reads

The optional chat hook sends a same-origin `POST /_alexandria/ask` with JSON:

```json
{"question":"What is this author working on?","messages":[]}
```

For chat beside a particular piece, also send an exact reference:

```json
{"question":"What is this piece saying?","artifact":{"name":"essay","scope":"public"}}
```

The handler resolves the reference from the owner's selected, currently permitted
Markdown publications and passes `focus: {name, content}` to `infer` alongside
the surrounding `works`. The focus is read first within the context bound. It
never accepts caller-supplied article text or a caller's substitute title. A
missing, empty, PDF-only, unselected or inaccessible reference fails without
calling the model; it does not silently answer about another piece. Protected
references also require the exact scope in `scopes` and a fresh reader grant.

It returns `{answer, author, scopes, disclaimer}` or `{error, reason}`. There is no
streaming dependency. Use your own presentation, or the optional browser control
alongside this integration. A visitor's question is never sent to Alexandria by
this handler; it goes to the owner's injected `infer` callback with the selected
publications, bounded conversation history and shared mirror identity instructions.
The callback must apply those instructions, enforce model quotas/timeouts, keep
provider credentials server-side and return `{answer}` or
`{error, reason, status}`. Allowed failure statuses are 400, 401, 402, 403, 429, 502,
503 and 504. No model is chosen, purchased or silently substituted here.

The optional browser control reuses the Library composer and answer renderer,
with its styles confined to a shadow root. Build one script from this reviewed
checkout, then host the output on the existing website:

```sh
node integration/website-connector/build-browser.mjs /your/site/assets/mirror.js
```

Add this only where the owner wants chat; the backend also works without it:

```html
<alexandria-mirror endpoint="/_alexandria" name="Your name">
  <a href="/your-published-thinking">Read my published thinking</a>
</alexandria-mirror>
<script defer src="/assets/mirror.js"></script>
```

The component uses the host font. Optional CSS properties `--mirror-ink`,
`--mirror-muted`, `--mirror-accent`, `--mirror-border` and `--mirror-background`
let the owner match their site. It reads public context only, retains the question
on errors, provides a copyable conversation and stores no chat history after the
page closes. Advanced protected-context controls belong in the owner's UI; the
server endpoint supports them independently. Include the generated `.LEGAL.txt`
alongside the script when redistributing it. There is no external script service,
iframe, analytics, global navigation or required Alexandria footer.

Public is the default context. To deliberately offer protected model context,
set `inferenceScopes: ['public', 'invite/friends']`. The visitor then requests
those exact scopes in `scopes`; parent, sibling and future nested scopes are not
included. Every requested protected scope must be granted before **any** content
is read for that question. Unknown/denied scope requests return an error rather
than silently pretending the answer used unavailable material.

Only when using the shared Connector for protected material does a reader need
`/_alexandria/sign-in?next=/your-existing-page`. It delegates their reader identity
to this author and website, using the existing explicit consent, PKCE, one-use
code and live grant checks. It does not replace the website's existing login and
adds no global sign-in link. `POST /_alexandria/sign-out` clears only this mount's
reader cookies and requires the site's origin. An invite may be supplied as the
`invite` query parameter on a protected read/ask; redemption remains bound to the
signed-in reader and exact scope. Membership never substitutes for a paid/invite
grant. This add-on creates no checkout for owner-hosted paid publications.

## Limits and proof

The handler bounds inventory to 250 publications, individual files to 4 MiB,
questions to 20,000 characters, request bodies to 128 KiB, selected scopes to 64,
and model context to 128 Markdown files / 750,000 characters (50,000 per file).
PDF reads work; inference needs a selected Markdown counterpart. It bounds
history to the last 20 messages / 60,000 characters (8,000 per message). These are
transport bounds; the owner's model callback still owns cost and concurrency.
Revocation affects subsequent requests; material already delivered cannot be
recalled. Stable HTTPS origins are required outside explicit loopback development.

Run:

```sh
node --test integration/website-connector/test/*.test.mjs
```

The static-file proof creates one descriptor beside an existing site, verifies
its published files over actual HTTP and removes only that descriptor. A copied
helper also runs outside the checkout with no dependencies. The backend HTTP
proof takes byte snapshots of an existing homepage, stylesheet and unrelated
route before mounting, while mounted and after removal; all remain identical.
It exercises public reads and a stub own-model answer with zero Alexandria calls.
Other tests cover exact grants/revocation, scope isolation, PKCE, tampering,
serverless cold starts, replay, CSRF, secret forwarding and body bounds. These
tests do not claim a real domain was registered or a real model account was used.

Uninstall the backend by removing the mount and optional chat hook. A static
mirror can be removed by deleting only its descriptor; its already public files
remain where they were. Removing only `connector` disables shared access while
keeping public files and the own-model endpoint. The existing website and owner
storage remain. Remove the optional network registration separately with
`DELETE /connect/site` from the owner's account client.
