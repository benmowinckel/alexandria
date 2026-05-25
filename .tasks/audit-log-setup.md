# Audit Log — One-Time Founder Setup

The tamper-evident access audit log is wired in code (cron, hash chain, public head endpoint, per-Author endpoint, smoke health check). It needs one manual step before the first deploy.

## What you have to do

**Create the GitHub repo: `mowinckelb/alexandria-audit` (private).**

Empty repo is fine — the cron creates `HEAD.json` and the first `audit/YYYY-MM-DD/...jsonl` batch on its first run after a file access happens.

Confirm `GITHUB_BOT_TOKEN` (the existing secret used by `alexandria-feedback`) has write access to the new repo. Same bot, second repo. From the GitHub UI: settings → developer settings → personal access tokens → confirm the token includes `repo` scope (or fine-grained access to `alexandria-audit`).

## How to verify it's working after deploy

```bash
# 1. Hit the public head endpoint — should return a JSON object
curl https://api.alexandria-library.com/audit/head

# 2. Wait at most 10 minutes (cron interval). Re-poll — `last_run_at` should
#    advance even if `head_hash` doesn't (cron runs liveness-only when no
#    new file-view events landed).

# 3. As yourself (Author), see your own access log:
curl -H "Authorization: Bearer $(cat ~/alexandria/system/.api_key)" \
  https://api.alexandria-library.com/library/mowinckelb/access-log

# 4. Smoke workflow asserts /audit/head freshness on every scheduled run + every deploy.
#    A stale mirror → CI fails loud.
```

## What this gives you (and what it doesn't)

**Gives:** every successful and denied file read through the gate gets a hash-chained entry in `mowinckelb/alexandria-audit`. Any later attempt to silently rewrite a historic entry breaks every downstream hash AND produces a head_hash that differs from anyone who already polled `/audit/head`. Authors can clone the repo and walk the chain forward to verify it themselves.

**Doesn't yet:** catch direct R2 reads that bypass the Worker (Cloudflare console, wrangler with the API token). That's the next move — enable R2 native access logs + Logpush in the Cloudflare dashboard, stream into the same chain. Documented in [follow-up below].

**Doesn't yet:** distribute the head_hash to user machines for cross-witness verification. That's a SessionStart hook extension — separate, smaller PR after this lands and proves stable.

## Follow-ups (separate PRs)

1. **Distributed witness via SessionStart hook.** Each user's daily hook polls `/audit/head` and appends `{ts, head_hash}` to `~/alexandria/system/.audit-witness.log` — auto-committed via the existing user-repo flow. After N users active, tampering requires force-pushing every active Author's private GitHub repo. The property strengthens monotonically with growth. Touches the hook → wants its own PR + careful rollout.

2. **R2 native access log → Logpush → audit chain.** Cloudflare dashboard work: enable R2 audit logs on the `alexandria-artifacts` bucket, configure Logpush to a destination (HTTP endpoint on the Worker, or another bucket), stream those entries through the same hash chain. Closes the "bypass the Worker entirely" hole.

3. **Cross-witness assertion.** Once #1 lands and witness data exists, add a check that compares witness entries across Authors — divergent head_hash for the same timestamp = audit breach surfaced automatically.

Delete this file once the repo is created and the first cron has succeeded.
