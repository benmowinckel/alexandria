# PLM "ask this mind" — Library twin query (STAGED, NOT DEPLOYED)

Built 2026-07-03. The Library "ask this mind" surface: a visitor on an Author's
`/library/{id}` page asks the Author's trained weights-twin a question and gets
an answer, honestly labelled as a twin. This is the a2 "ship RAG/weights-backed
first" path and the plm.md § both-twin architecture **privacy floor** — the
public-safe projection of a private mind: weights, not context, so nothing at
query time exposes the Author's substrate and no prompt-injection can exfiltrate
a system prompt that was never there.

**Everything is built + tested + committed to the working tree. Nothing is
deployed. The founder ships it.**

## What was built

### Backend (Worker — TypeScript)
- `server/src/twin.ts` — NEW. Schemaless per-Author config (`authors.settings.twin`,
  no migration), `resolveTwinConfig` (env-default fallback for User Zero),
  `twinDisclaimer`, and `runTwinInference` — the inference adapter (the one
  integration point; HTTP POST to the sidecar).
- `server/src/library.ts` — MODIFIED. Three changes inside `registerLibraryRoutes`:
  - `GET /library/:author` response now carries `twin: { enabled, label }`
    (public summary; never leaks the checkpoint handle).
  - `POST /library/:author/ask` — the query endpoint. Gated (twin must be
    enabled + resolvable checkpoint), rate-limited (KV, 8/min per IP+author),
    bounded question (≤2000 chars), anonymous allowed (stranger-facing floor).
    Writes a `twin_query` row to `access_log` as the internal-credits ledger
    primitive + `logEvent`. Returns `{ answer, twin:true, label, disclaimer }`.
  - `POST /library/:author/twin` — owner-only config (enable/disable, set
    checkpoint/base/label/system). Upserts `settings.twin`.
- `server/wrangler.toml` — MODIFIED. Added vars: `TWIN_INFERENCE_URL=""`
  (empty ⇒ "twin offline"), `DEFAULT_TWIN_BASE="Qwen/Qwen3.6-35B-A3B"`,
  `DEFAULT_TWIN_CHECKPOINT=""`.

### Frontend (Next.js — website)
- `app/library/[author]/AskThisMind.tsx` — NEW. The component: question textarea
  (⌘↵ submits), "ask" button, thinking state, accent-bordered answer block,
  honest disclaimer (resting + returned), "ask another" reset. Matches the site
  aesthetic exactly (EB Garamond, warm cream, tyrian-purple accent on the "twin"
  tag + answer border — the one strategic accent per design.md).
- `app/library/[author]/client.tsx` — MODIFIED. Renders `<AskThisMind>` at the
  top of the section when `data.twin.enabled`.
- `app/api/library/[author]/ask/route.ts` — NEW. Same-origin proxy (mirrors the
  file proxy): forwards cookie/auth to `${SERVER_URL}/library/{id}/ask`.

### Inference sidecar (the ONE integration point)
- `~/alexandria-inc/private/plm/twin_server.py` — NEW (private repo, not this one).
  Wraps the exact Tinker sampling from `chat_twin.py` (disable-thinking renderer,
  cached warm samplers). Holds `TINKER_API_KEY`. The Worker holds only its URL.

## The one integration point

The Worker cannot run Tinker (Python SDK: client-side tokenizer + renderer, and
must never hold `TINKER_API_KEY`). So `runTwinInference` HTTP-POSTs the sidecar,
which receives ONLY `{checkpoint, base, system, question, max_tokens}` — never
any Author private data. **To go live, that sidecar must be running and reachable.**

## Deploy steps (founder-only — armed, not fired)

1. Start the sidecar (holds the Tinker key):
   ```
   cd ~/alexandria-inc/private/plm
   TINKER_API_KEY=$(cat ~/alexandria/system/.tinker_key) \
   TWIN_INFERENCE_SECRET=<pick-a-secret> \
   .venv/bin/python twin_server.py --port 8899
   ```
   Expose it publicly (e.g. `cloudflared tunnel --url http://localhost:8899`).
2. Point the Worker at it — in `server/wrangler.toml` set
   `TWIN_INFERENCE_URL = "https://<tunnel>/infer"`, then:
   ```
   cd server && wrangler secret put TWIN_INFERENCE_SECRET   # same secret
   ```
3. Set the User-Zero checkpoint (either in wrangler.toml `DEFAULT_TWIN_CHECKPOINT`,
   or per-author). Current v6 weights twin:
   `tinker://fb289889-f64d-585c-bd4d-9527fa384151:train:0/sampler_weights/final`
   (base `Qwen/Qwen3.6-35B-A3B`). NOTE: v6 graded ~7/20 sign-off — below the
   "mediocre-twin-worse-than-none" bar (risk #1 in plm.md). Decide whether to
   ship on v6 or push the floor first (plm.md v6 result, parked with founder).
4. Enable the founder's twin (owner-auth):
   ```
   curl -X POST https://api.alexandria-library.com/library/mowinckelb/twin \
     -H "Authorization: Bearer $ALEX_KEY" -H "Content-Type: application/json" \
     -d '{"enabled":true,"label":"trained on my constitution, sessions, and voice memos."}'
   ```
5. Deploy the Worker + website:
   ```
   cd server && npx wrangler deploy && curl https://api.alexandria-library.com/health
   # website: bash scripts/push.sh  (or Vercel deploy)
   ```

## Tested
- `cd server && npm run build` → PASS (dry-run upload OK, twin vars bound).
- `npm run build` (app / next build) → PASS (ask route + author page compiled).
- Visual: dev server + Playwright (mocked network, real component fetch→render).
  Idle + answered, desktop + mobile. Screenshots in `.see/ask_*_2026-07-03T21-20-32.png`.
  On-brand, matches design.md. (Temp preview script removed; zero repo residue.)

## TODO / open decisions (founder)
- **Ship-on-v6 vs push-the-floor** — the bad-twin brand risk. v6 = 7/20. See plm.md.
- **Credits pricing + settlement** — the ledger records `twin_query` events per
  author (queryable); the debit amount + `billing_tab` settlement path is
  deliberately NOT built (don't ship half a money rail). Decide the per-query
  price + wire settlement when ready. plm.md § payment: querier's tier allowance
  debits, Author's account credits; Stripe only at the two edges.
- **Streaming** — MVP is awaited. Streaming can slot behind the same box.
- **Both-twin router** — this ships the weights floor only. The context ceiling
  (self/trusted, higher fidelity, exposes substrate) is not wired here (task #20).
