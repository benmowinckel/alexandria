# PLM — press-go deploy runbook (2026-07-05)

Everything is built, tested, and committed locally. This is the exact sequence to take the twins live. Founder-fired (deploy + keys + sidecar are your triggers). Red-team decisions baked in: **launch the deep twin (invite, 16/20) first; leave the public weights box dark until it clears the bar.**

## State
- **Weights twin (public floor):** v7, `tinker://c639a409-...:train:0/sampler_weights/final`, sign-off 8/20. BELOW the "mediocre-twin-worse-than-none" bar → keep it OFF/invite for now.
- **Context/deep twin (invite ceiling):** frontier + your constitution+voice in context, 16/20. Ships first. Tools: works=on (living page), web=off (flip on with a search key).
- All code committed (public repo: twin.ts, library.ts, AskThisMind, /v1 API; sidecar: `~/alexandria-inc/private/plm/twin_server.py`). Nothing deployed.

## Steps

**1. Start the inference sidecar** (holds all keys; the Worker never does). On your always-on machine:
```
cd ~/alexandria-inc/private/plm
TINKER_API_KEY=$(cat ~/alexandria/system/.tinker_key) \
ANTHROPIC_API_KEY=<your anthropic key> \
TWIN_INFERENCE_SECRET=<pick a strong secret> \
TWIN_FRONTIER_MODEL=claude-sonnet-4-6 \
.venv/bin/python twin_server.py --port 8899
# (optional web search later:  TWIN_SEARCH_KEY=<brave key>  and set context tools.web=true)
```

**2. Expose it** (public URL for the Worker to reach):
```
cloudflared tunnel --url http://127.0.0.1:8899     # or any tunnel; note the https URL
```

**3. Point the Worker at it + set the secret:**
```
cd ~/alexandria-inc/public/code/server
# in wrangler.toml:  TWIN_INFERENCE_URL = "https://<tunnel>/infer"   (agent path derived automatically)
npx wrangler secret put TWIN_INFERENCE_SECRET     # paste the SAME secret as step 1
```

**4. Deploy the Worker + website:**
```
cd ~/alexandria-inc/public/code/server && npx wrangler deploy && curl https://api.alexandria-library.com/health
cd ~/alexandria-inc/public/code && bash scripts/push.sh      # website (waits for CI)
```

**5. Enable YOUR twins** (owner-only endpoint; weights kept dark, deep=invite):
```
# deep twin — invite-only, living page on:
curl -X POST https://api.alexandria-library.com/library/mowinckelb/twin \
  -H "Authorization: Bearer $(cat ~/.config/alexandria/admin_key)" -H 'Content-Type: application/json' \
  -d '{"context":{"enabled":true,"visibility":"invite","tools":{"works":true,"web":false}},"weights":{"enabled":false}}'
# make invite codes for people you want to let in (existing access_codes mechanism).
```

**5b. Give early users an invite LINK (not just a code).** The page reads `?invite=CODE` and pre-fills the unlock field, so the flagship works in one click: send `https://alexandria-library.com/library/mowinckelb?invite=CODE`. Without the code an invited user now sees the twin section with a "have an invite code?" field (fixed this pass — before, an invite-only twin rendered nothing). The per-author daily cap defaults to 500 answers/day; raise it in `library.ts checkTwinDailyCap` if an early cohort needs more.

**6. Test live:** open `https://alexandria-library.com/library/mowinckelb?invite=CODE`, ask the deep twin about one of your published works (it should call search_my_works and discuss it in your voice), and ask a curveball. Confirm it never dumps the constitution when you try to inject it. Also open the page with NO invite and confirm the "have an invite code?" field shows (not a blank section).

**7. Ship the module to other Alexandrians** (separate, your call): `cd ~/alexandria-inc/public/code && bash factory/ship.sh "ship PLM + twin modules"` — re-signs the manifest so the (now corrected: tiered-shadow + frontier-teacher) `plm.md` + `twin.md` land in every Author's payload. NOTE: the factory canon edits this pass are committed but NOT yet signed — `ship.sh` is required before they reach Authors, and must run before any push that includes them (else payload verification breaks for every Author).

**8. Later — public weights twin:** once v7 clears your sign-off bar (or a better base/OPD lands), flip `weights.enabled=true, visibility=public` via the same endpoint. Not before.

## Costs (per plm.md § payment)
- Weights query ≈ $0.001 (public, Alexandria absorbs, rate-limited).
- Deep query ≈ $0.10–0.15 (constitution+voice context + tool rounds) — the paid act; querier pays, you earn a share; ledger records `twin_query` per author/variant; pricing amount is your call (not built).

## Substrate is now tiered (2026-07-06)
The deep twin loads the **live shadow at the twin's tier** (`~/alexandria/files/library/<tier>/shadow.md`), never the raw constitution — a structural ceiling per tier (see `~/alexandria-inc/private/plm.md § STRUCTURAL SECURITY MODEL` invariant 2, and `.tasks/plm-tiered-shadow-substrate.md`). Tier is Worker-set (`cfg.visibility` → `body.tier`). The dial per tier = the content of that tier's `shadow.md`, which you edit. `invite/shadow.md` was seeded from the old digest — **review it before enabling the deep twin** (it's the invite-tier ceiling). Cost scales with the tier's shadow size; the public tier uses `voice_lite`, trusted tiers use full `voice_exemplars`.
