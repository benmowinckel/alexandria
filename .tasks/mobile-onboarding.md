# Mobile-first onboarding

Make signup work end-to-end on a phone. Most signups today bounce at the curl command on the onboarding page because they're not at a computer. Fix: single page with honest copy + daily reminder email + verified /a opener surfaces what they captured via the shortcut.

## Verified architecture (no changes needed)

- iOS Shortcut writes to user's own `iCloud Drive/Alexandria/[Date]/` — per-user via iCloud being device-scoped.
- `setup.sh` (line 376) creates `iCloud Drive/alexandria/` on user's Mac and symlinks to `~/alexandria/files/vault/input`. macOS APFS is case-insensitive so the `Alexandria/` vs `alexandria/` mismatch resolves to the same folder. Cosmetic only.
- `installed_at` on Account fires only inside `/call` handler (protocol.ts:166), which only desktop CC hits. Shortcut writes to iCloud, doesn't touch the API. So `installed_at == null` correctly identifies mobile-only signups.
- /a opener already surfaces shortcut-captured items in Accretion slot (verified via founder's actual /a output showing "Catmull from the shortcut queue"). Wiring works for the founder; smoke test needed for fresh account.
- Resend (server/src/email.ts) + Cloudflare Cron at 15:00 UTC (wrangler.toml) + per-user KV state all live.

## Work

### 1. Onboarding page copy (templates.ts `callbackPageHtml`)

Single page, no device fork, no CSS @media branching, no UA sniff. State the constraint plainly:

- Step 1 (install) — needs you to paste a command into your coding agent. Most people do this on their computer. If you can't right now, skip to Step 3 and we'll email a reminder.
- Step 2 (begin) — same caveat as Step 1, needs a coding agent.
- Step 3 (shortcut) — works on any device. Tap share → tap alexandria. Anything you save will be waiting when you finish setup.

Future-proof: don't prescribe "computer" — say "coding agent." If a phone-side coding agent (iOS Claude Code app, etc.) lets them do Steps 1+2, the copy still works.

Founder redlines the draft before shipping.

### 2. Folder rename: `inbox` / `intake` → `input` everywhere

Three names today, collapse to one:
- methodology.md canon: `~/alexandria/inbox/` → `~/alexandria/files/vault/input/`
- `capture_resolver.py:27` INTAKE path: `~/alexandria/files/vault/intake` → write resolved markdown to `~/alexandria/files/vault/` root (drop the intermediate folder entirely)
- Any factory/canon references that mention "intake" — sweep and update
- CLAUDE.md architecture doc — note `vault/input/` as the canonical capture folder

Result: `vault/input/` = raw iCloud drops (the front door, where everything lands). `vault/` root = resolved markdown. No intermediate `intake/` folder.

The `vault/input` symlink stays as is.

### 3. Daily nudge email

Extend the existing 15:00 UTC daily cron in `cron.ts`.

**Filter:** `created_at` 1–7 days ago AND `installed_at` is null AND `nudge_last_sent_at` is not today AND `engagement_opt_out` is false.

**State:** one new Account field — `nudge_last_sent_at?: string` (idempotency).

**Email body — v1 generic:**
- Subject: "your library is waiting"
- Body: "you signed up but haven't installed on your computer yet. paste this into your coding agent when you're back at it: [curl command]. keep adding things via the shortcut in the meantime — they'll be there when you finish setup."
- Unsubscribe via existing `/email/less` and `/email/stop`.

**Future:** generate body from actual captured-item count once we have a Shortcut→server ping. Flagged as known constraint: server can't see user's iCloud today, so v1 is generic.

**Cadence:** daily for 7 days from signup, then weekly for 2 weeks more, then stop. (Founder confirmed defaults.)

### 4. Mirror loop for the nudge

Without this the email is faith.

- Log `nudge_sent_at` per account (or just the count).
- When `installed_at` is set, check if `nudge_sent_at` is within 7 days prior — if yes, count as conversion.
- New admin route or extension to existing admin dashboard: surface `nudges_sent_30d`, `installed_after_nudge_30d`, conversion rate.
- If conversion rate is too low after 2 weeks of data, change the email or kill it.

### 5. Smoke test fresh /a opener

Verified to work for founder. Need to confirm for fresh account:
- Create a test account.
- Drop 3–5 markdown files into its `vault/input/`.
- Run `/a` in that account.
- Confirm Accretion slot surfaces those items.

If it doesn't work for a fresh account but works for the founder's, there's a path-hardcode somewhere in SKILL.md.

## Out of scope for this task plan

- **Casing fix** (Shortcut writes `Alexandria/`, setup.sh creates `alexandria/`) — cosmetic only on macOS, not blocking, defer to convenience.
- **Per-user email body with capture count** — needs Shortcut→server ping, separate task.
- **Opener tweaks** (unresolved-captures section, remove "pick a door" line, trim "drew from" citation) — parked, do after this ships.

## Ship order

1. Onboarding copy + folder rename (today, 1–2 hrs)
2. Daily nudge email + mirror (next, 2–3 hrs)
3. Smoke test fresh /a (verify only)
4. Deploy via `bash scripts/push.sh`
5. Verify on real phone end-to-end before declaring done

## Verification (the product is the ground truth)

- Real phone: signup → Stripe → onboarding renders honest copy → Shortcut install → fragment captures land in iCloud `Alexandria/`
- Wait 24h with that account uninstalled → confirm nudge email arrives at 15:00 UTC
- Install on Mac via the curl command → confirm fragments appear in `vault/input/`
- Run /a → confirm Accretion surfaces them
- Check admin dashboard → confirm conversion is logged
