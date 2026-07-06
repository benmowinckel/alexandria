# PLM — press-go deploy runbook (2026-07-05)

Everything is built, tested, and committed locally. This is the exact sequence to take the twins live. Founder-fired (deploy + keys + sidecar are your triggers). Red-team decisions baked in: **launch the deep twin (invite, 16/20) first; leave the public weights box dark until it clears the bar.**

## State
- **Weights twin (public floor):** v7, `tinker://c639a409-...:train:0/sampler_weights/final`, sign-off 8/20. BELOW the "mediocre-twin-worse-than-none" bar → keep it OFF/invite for now.
- **Context/deep twin (invite ceiling):** frontier + your constitution+voice in context, 16/20. Ships first. Tools: works=on (living page), web=off (flip on with a search key).
- All code committed (public repo: twin.ts, library.ts, AskThisMind, /v1 API; sidecar: `~/alexandria-inc/private/plm/twin_server.py`). Nothing deployed.

## Steps

The old wrangler.toml/secret dance is GONE — the Worker now stores each Author's sidecar per-account (encrypted), and `twin-serve.sh` registers it automatically. So the flow is: deploy once, enable once, then `bash twin-serve.sh` whenever you want to be online.

**ONE-TIME — deploy the code** (do this once; brew install cloudflared first if needed):
```
cd ~/alexandria-inc/public/code/server && npx wrangler deploy && curl https://api.alexandria-library.com/health
cd ~/alexandria-inc/public/code && bash scripts/push.sh      # website (waits for CI)
```

**ONE-TIME — enable your twin** (invite-only, weights dark):
```
curl -X POST https://api.alexandria-library.com/library/mowinckelb/twin \
  -H "Authorization: Bearer $(cat ~/.config/alexandria/admin_key)" -H 'Content-Type: application/json' \
  -d '{"context":{"enabled":true,"visibility":"invite","tools":{"works":true,"web":false}},"weights":{"enabled":false}}'
```

**ONE-TIME — make it automatic (do this once, then never again):**
```
cd ~/alexandria-inc/private/plm && bash twin-autostart.sh on
```
From now on your twin is **online whenever your laptop is on** — macOS starts it at login and keeps it alive across sleep/wake, re-registering a fresh address each time. Nothing to remember, ever. Same pattern as your backup + morning-email jobs.
- Turn it off any time: `bash twin-autostart.sh off` (twin goes offline, stays off).
- Check it: `bash twin-autostart.sh status`.
- Your keys + substrate never leave your machine; Alexandria only holds the address + shared secret (encrypted).

(Manual alternative, if you ever want to run it just for a session: `bash twin-serve.sh` — online while it's open, offline when you Ctrl-C. The autostart above makes this unnecessary.)

**Make invite codes** for the people you want to let in (one per person, so you can revoke individually):
```
curl -X POST https://api.alexandria-library.com/library/mowinckelb/access-code \
  -H "Authorization: Bearer $(cat ~/.config/alexandria/admin_key)" -H 'Content-Type: application/json' \
  -d '{"label":"early user - jane"}'    # returns {"code":"...."}
```

**Give early users an invite LINK (not just a code).** The page reads `?invite=CODE` and pre-fills the unlock field, so the flagship works in one click: send `https://alexandria-library.com/library/mowinckelb?invite=CODE`. Without the code an invited user now sees the twin section with a "have an invite code?" field (fixed this pass — before, an invite-only twin rendered nothing). The per-author daily cap defaults to 500 answers/day; raise it in `library.ts checkTwinDailyCap` if an early cohort needs more.

**6. Test live:** open `https://alexandria-library.com/library/mowinckelb?invite=CODE`, ask the deep twin about one of your published works (it should call search_my_works and discuss it in your voice), and ask a curveball. Confirm it never dumps the constitution when you try to inject it. Also open the page with NO invite and confirm the "have an invite code?" field shows (not a blank section).

**7. Ship the module to other Alexandrians** (separate, your call): `cd ~/alexandria-inc/public/code && bash factory/ship.sh "ship PLM + twin modules"` — re-signs the manifest so the (now corrected: tiered-shadow + frontier-teacher) `plm.md` + `twin.md` land in every Author's payload. NOTE: the factory canon edits this pass are committed but NOT yet signed — `ship.sh` is required before they reach Authors, and must run before any push that includes them (else payload verification breaks for every Author).

**8. Later — public weights twin:** once v7 clears your sign-off bar (or a better base/OPD lands), flip `weights.enabled=true, visibility=public` via the same endpoint. Not before.

## Costs (per plm.md § payment)
- Weights query ≈ $0.001 (public, Alexandria absorbs, rate-limited).
- Deep query ≈ $0.10–0.15 (constitution+voice context + tool rounds) — the paid act; querier pays, you earn a share; ledger records `twin_query` per author/variant; pricing amount is your call (not built).

## Online / offline + universal, per-Author hosting (2026-07-06)
The twin now shows **online/offline** on the page: when your `twin-serve.sh` is running the page says "ask away"; when it's not, it says "offline — check back soon" and hides the ask box (no dead ends). The Worker checks your sidecar's `/health` (cached ~30s).

This is built **universal**, not founder-only: every Author registers their OWN sidecar (`PUT /library/:author/twin/sidecar {url, secret}`, owner-auth, stored AES-encrypted in KV `twin_sidecar:{author}`), and the Worker routes each twin query to that Author's sidecar — it holds neither keys nor substrate for anyone. `twin-serve.sh` is the one-command Author flow (start → tunnel → auto-register → live). The env-var sidecar (`TWIN_INFERENCE_URL`) still works as a fallback but is no longer needed.

**Remaining for full marketplace universality (next increment, NOT done):** the sidecar *code* (`twin_server.py`) + `twin-serve.sh` still live in the private repo — they need to ship to Authors (a minimal, demo-UI-stripped inference server + the serve script) via the factory `twin`/`plm` module, and each Author brings their own Anthropic key (sovereign, "ride your own ai"). The factory canon (`twin.md`/`plm.md`) describes the model; the runnable artifacts aren't packaged yet.

## Substrate is now tiered (2026-07-06)
The deep twin loads the **live shadow at the twin's tier** (`~/alexandria/files/library/<tier>/shadow.md`), never the raw constitution — a structural ceiling per tier (see `~/alexandria-inc/private/plm.md § STRUCTURAL SECURITY MODEL` invariant 2, and `.tasks/plm-tiered-shadow-substrate.md`). Tier is Worker-set (`cfg.visibility` → `body.tier`). The dial per tier = the content of that tier's `shadow.md`, which you edit. `invite/shadow.md` was seeded from the old digest — **review it before enabling the deep twin** (it's the invite-tier ceiling). Cost scales with the tier's shadow size; the public tier uses `voice_lite`, trusted tiers use full `voice_exemplars`.
