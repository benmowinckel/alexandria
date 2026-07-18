---
name: brief-setup
description: One-time setup for the daily morning brief — GH Actions cron when available, local launchd fallback. Sovereign by construction; survives Alexandria the company vanishing.
---

You are setting up the Author's daily morning brief delivery. ONE-TIME interactive setup. After it completes, the brief sends itself daily, with no dependency on alexandria.* infrastructure.

## What the brief does

The brief fires once a day and SMTP-sends through the Author's own credentials, against the Author's own email provider. The body is assembled in priority order:

1. **Stranded autoloop alarm** — `claude/*` branch ahead of master, surfaces a rescue command.
2. **Fresh `~/alexandria/system/.brief_outbox`** — autoloop-written content (decisions parked / alarm-worthy state). Optional `SUBJECT:` first line overrides the default subject; everything after a blank line is the body.
3. **Stale-routine alarm** — `last_run.md` hasn't been committed within ~24h.
4. **Droplet floor** — one stanza from `~/alexandria/files/core/shelf.md`, deterministic per ISO week (weekday indexes into a per-week shuffle, so 7 unique stanzas a week when N ≥ 7). Missing/empty shelf → built-in `*keep thinking.*` fallback.

The brief always sends — silence would train the inbox to filter. The droplet floor is the daily heartbeat; outbox/alarms promote over it when something actually warrants the Author's attention.

## Two paths, one outcome

Where the daily fire happens depends on the Author's environment. Detect — don't ask:

- **GH Actions** (preferred) — fires from GitHub's clock. Immune to laptop sleep/off. Requires `gh` CLI authenticated AND a private alexandria-private repo on the Author's GitHub. This is the path the canonical user (benmowinckel) runs on.
- **launchd** (fallback) — fires from the Author's Mac at a chosen local time. Requires nothing beyond the Author's laptop being awake at brief-time. Failure mode: silent miss if the laptop is sleeping/off.

```bash
if command -v gh &>/dev/null && \
   gh auth status &>/dev/null 2>&1 && \
   [ -d "$HOME/alexandria/.git" ] && \
   (cd "$HOME/alexandria" && git remote get-url origin 2>/dev/null | grep -q "alexandria-private"); then
    MODE=ghactions
else
    MODE=launchd
fi
```

If MODE=launchd, tell the Author: "Your brief will fire from your laptop. If it's off/asleep at brief time, the brief misses. Authenticate `gh` and push your alexandria-private repo to GitHub, then re-run `/brief-setup` to upgrade to GH Actions (no laptop dependency)."

## Common steps (both paths)

### 1. Email address
Ask the Author what email they want briefs sent to. Default offer: their git config `user.email` or their gh login email. Usually both `from` and `to` are the same address (sending from themselves to themselves).

### 2. Provider detection + app password
Look at the email's domain and produce provider-specific SMTP setup instructions. Don't hardcode a full list — read the domain, name the provider you recognize, and walk through the canonical flow:

- `@icloud.com` / `@me.com` / `@mac.com` / Apple-managed custom domain → `smtp.mail.me.com`, port `587` (STARTTLS). App-specific password at appleid.apple.com → Sign-In and Security → App-Specific Passwords. Name it `alexandria-brief`.
- `@gmail.com` (or Google Workspace) → `smtp.gmail.com`, port `465` (SSL). App password at myaccount.google.com → Security → App passwords. Requires 2-Step Verification first.
- `@proton.me` / `@protonmail.com` → SMTP via Proton Bridge (paid plan) or Proton's SMTP submission. `smtp.protonmail.ch`, port `587`. Generate an SMTP token in Proton settings.
- Fastmail, Zoho, Outlook/Hotmail, custom domains → identify the provider, surface its canonical SMTP + app-password flow.

Author pastes the app password back. Treat as sensitive — never echo, never commit raw.

### 3. Install brief.py
Copy `factory/scripts/brief.py` from the public alexandria repo to `~/alexandria/system/scripts/brief.py`. Make executable.

```bash
mkdir -p "$HOME/alexandria/system/scripts"
# brief.py handles SMTP creds, so verify it against the offline-signed manifest
# before installing — verify-fetch refuses tampered/unsigned code. (installed by
# setup.sh; self-bootstrap if absent.)
VF="$HOME/alexandria/system/scripts/verify-fetch.sh"; [ -f "$VF" ] || { curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/scripts/verify-fetch.sh -o "$VF" && chmod +x "$VF"; }
bash "$VF" scripts/brief.py > "$HOME/alexandria/system/scripts/brief.py" || { echo "brief.py verification failed — not installed"; return 1 2>/dev/null || exit 1; }
chmod +x "$HOME/alexandria/system/scripts/brief.py"
```

brief.py reads SMTP creds from env vars (GH Actions) OR from `~/alexandria/system/.brief_email` (launchd). Same script, both modes — the script's path-portable, drop it anywhere in `~/alexandria/system/scripts/`.

---

## Path A: GH Actions

### 4a. Set GH secrets
Set six secrets via stdin so values never appear in shell argv:

```bash
REPO=$(cd "$HOME/alexandria" && gh repo view --json nameWithOwner -q .nameWithOwner)
printf '%s' "<smtp host>"        | gh secret set SMTP_HOST     -R "$REPO"
printf '%s' "<port: 465 or 587>" | gh secret set SMTP_PORT     -R "$REPO"
printf '%s' "<email address>"    | gh secret set SMTP_USER     -R "$REPO"
printf '%s' "<app password>"     | gh secret set SMTP_PASSWORD -R "$REPO"
printf '%s' "<email address>"    | gh secret set SMTP_FROM     -R "$REPO"
printf '%s' "<email address>"    | gh secret set SMTP_TO       -R "$REPO"
```

Verify with `gh secret list -R "$REPO" | grep SMTP` — should show all six.

### 5a. Add the workflow file
Write `~/alexandria/.github/workflows/brief.yml`:

```yaml
name: Daily brief

on:
  schedule:
    - cron: '0 15 * * *'   # 15:00 UTC. Edit if the Author wants a different time.
  workflow_dispatch:

jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # detect_stranded needs full history + claude/* refs
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Send brief
        env:
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_PORT: ${{ secrets.SMTP_PORT }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASSWORD: ${{ secrets.SMTP_PASSWORD }}
          SMTP_FROM: ${{ secrets.SMTP_FROM }}
          SMTP_TO: ${{ secrets.SMTP_TO }}
        run: python3 system/scripts/brief.py
```

The cron is in UTC. 15:00 UTC = 8am PDT / 7am PST (DST drift is accepted; consistency beats local-clock fidelity).

### 6a. Commit, push, verify
```bash
cd "$HOME/alexandria"
git add .github/workflows/brief.yml system/scripts/brief.py
git commit -m "brief: enable via GH Actions cron"
git push origin HEAD
gh workflow run brief.yml -R "$REPO"
sleep 20
gh run list -R "$REPO" --workflow=brief.yml --limit=1
```

Conclusion `success` → ask the Author to check their inbox. If the test email landed, the loop is closed. Tell them the next brief fires at 15:00 UTC tomorrow.

### Maintenance (GH Actions)
- **Change the time**: edit the cron line in `.github/workflows/brief.yml`, commit + push. Cron is UTC.
- **Pause briefs**: disable the workflow at `https://github.com/<owner>/<repo>/actions` or remove the `schedule:` block and push.
- **Rotate SMTP password**: regenerate at provider, then `printf '%s' "<new>" | gh secret set SMTP_PASSWORD -R "$REPO"`.
- **Override tomorrow's body**: write `~/alexandria/system/.brief_outbox` and commit/push (the file is gitignored by default — use `git add -f`).
- **Failure visibility**: GH auto-emails the workflow author when a scheduled run fails. No silent-miss class.

---

## Path B: launchd (fallback)

### 4b. Write credentials file
Save to `~/alexandria/system/.brief_email` as JSON:

```json
{
  "host": "<smtp host>",
  "port": <587 or 465>,
  "user": "<email address>",
  "password": "<app password>",
  "from": "<email address>",
  "to": "<email address>",
  "subject": "alexandria."
}
```

`chmod 600` immediately. Plaintext on disk — same trust level as the Author's email password, gated by their user account.

### 5b. Schedule via launchd
Ask the Author what local time they want the brief (default 08:00). Write `~/Library/LaunchAgents/com.alexandria.brief.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>           <string>com.alexandria.brief</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>{HOME}/alexandria/system/scripts/brief.py</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>   <integer>{HOUR}</integer>
    <key>Minute</key> <integer>{MINUTE}</integer>
  </dict>
  <key>StandardOutPath</key> <string>{HOME}/alexandria/system/.brief_log</string>
  <key>StandardErrorPath</key> <string>{HOME}/alexandria/system/.brief_log</string>
</dict>
</plist>
```

Substitute `$HOME` and chosen time. Then load:
```bash
launchctl unload ~/Library/LaunchAgents/com.alexandria.brief.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.alexandria.brief.plist
```

`StartCalendarInterval` uses local time and catches up after sleep — closing the laptop overnight is fine. If the laptop is fully off at brief time, the brief misses silently.

### 6b. Verify with a test email
```bash
python3 ~/alexandria/system/scripts/brief.py
tail -3 ~/alexandria/system/.brief_log
```

Last line should be `sent: ...`. If `fail: ...`, surface the error (usually wrong app password, wrong SMTP host, or no internet at fire time). If `sent`, ask the Author to check their inbox.

### Maintenance (launchd)
- **Change the time**: edit `Hour`/`Minute` in the plist, `launchctl unload && launchctl load`.
- **Pause**: `launchctl unload ~/Library/LaunchAgents/com.alexandria.brief.plist`.
- **Override tomorrow's body**: `echo "<one line>" > ~/alexandria/system/.brief_outbox`.
- **Failure visibility**: none built in. Silent misses if laptop is asleep/off. Upgrade to GH Actions to remove this failure class.

---

## Sovereignty test

After setup, every piece of the brief loop lives on the Author's stuff:

- SMTP creds against the Author's email provider (Gmail, iCloud, Proton, etc.)
- Outbox content from the Author's autoloop, in the Author's repo
- Scheduler on the Author's GitHub account (Path A) or laptop (Path B)
- brief.py downloaded from public alexandria but kept frozen in the Author's `~/alexandria/`

If alexandria the company shuts down tomorrow, none of this stops working. The Author's brief keeps arriving forever, until they delete the workflow/plist themselves.
