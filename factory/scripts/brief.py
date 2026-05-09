#!/usr/bin/env python3
"""Daily brief sender — syncs ~/alexandria with origin, then reads
~/alexandria/system/.brief_outbox (one line, written by the autoloop or any
other producer) and SMTP-sends it. Falls back to a default line when the
outbox is empty.

Verification loop: also detects autoloop work that didn't reach master
(stranded on a claude/* branch from a failed master push) and surfaces a
rescue command in the brief body. Without this, silent strands look identical
to silent days.

Sovereign by construction: no network calls except git (the Author's own
remote) and SMTP (the Author's own provider).
"""

import json
import smtplib
import ssl
import subprocess
import sys
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import List, Optional, Tuple

REPO = Path.home() / "alexandria"
ALEX = REPO / "system"
CREDS = ALEX / ".brief_email"
LOG = ALEX / ".brief_log"
# Relative paths first, then absolute. The relatives are what git operates on
# (git -C $REPO log -- $REL); the absolutes are what Python opens. One source.
OUTBOX_REL = "system/.brief_outbox"
LAST_RUN_REL = "system/.autoloop/last_run.md"
OUTBOX = REPO / OUTBOX_REL
LAST_RUN = REPO / LAST_RUN_REL

DEFAULT_BODY = "no material change overnight."
# Outbox content from before this threshold is treated as stale (yesterday's
# run, not today's). The autoloop fires at 14:00 UTC, the brief at 15:00 UTC
# — today's outbox is ~50 min old when read. 20h rejects anything older than
# this morning while leaving slack for autoloop running late.
OUTBOX_STALE_HOURS = 20
# Last_run.md commit older than this triggers the "routine missed today" alarm.
# With autoloop daily at 14:00 UTC, yesterday's commit is ~24h 50m old when
# brief reads at 15:00 UTC the next day. 24h catches the miss; tighter would
# false-positive on slow autoloops, looser would silently skip a missed day.
LAST_RUN_STALE_HOURS = 24
# A claude/* branch counts as a "live strand" only if its tip is this fresh.
# Older branches are leftover artefacts from successful runs that are now on master.
STRAND_FRESH_HOURS = 26


def log(line: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(f"{ts} {line}\n")


def git(*args: str, timeout: int = 30, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(REPO), *args],
        capture_output=True, text=True, timeout=timeout, check=check,
    )


def file_commit_age_h(rel_path: str) -> Optional[float]:
    """Hours since `rel_path` was last committed on the current ref. None on
    failure (git missing, file never committed, repo absent).

    Use this instead of file mtime — `git pull` resets mtime to clock time,
    breaking mtime as a freshness signal. Commit time is the direct ground
    truth.
    """
    try:
        proc = git("log", "-1", "--format=%ct", "--", rel_path)
        if proc.returncode != 0 or not proc.stdout.strip():
            return None
        commit_time = int(proc.stdout.strip())
        return (datetime.now(timezone.utc).timestamp() - commit_time) / 3600
    except Exception as e:
        log(f"file_commit_age_h({rel_path}) failed: {type(e).__name__}: {e}")
        return None


def sync_repo() -> None:
    """Fetch all refs and fast-forward master so we see the latest autoloop output.

    Failures are logged but non-fatal — the brief should still send something
    rather than block on git issues.
    """
    try:
        git("fetch", "--all", "--quiet", timeout=45)
    except Exception as e:
        log(f"sync_repo fetch failed: {type(e).__name__}: {e}")
        return
    # FF master only when the working tree is clean enough; if not, skip the pull
    # rather than risk a merge conflict during a non-interactive job.
    status = git("status", "--porcelain")
    if status.returncode == 0 and not status.stdout.strip():
        git("pull", "--ff-only", "origin", "master", "--quiet")


def read_fresh_outbox() -> Optional[str]:
    """Return outbox content if it was committed within STALE_HOURS, else None.

    The outbox file is git-transported: the autoloop commits it, brief pulls
    master to read it. The natural lifecycle is "autoloop overwrites every
    run" — but if a run has nothing to surface and skips the write, origin
    keeps yesterday's content. Without a freshness check the brief would
    re-send the same line every silent day. Commit time on the blob is the
    direct signal, not file existence.
    """
    if not OUTBOX.exists():
        return None
    text = OUTBOX.read_text().strip()
    if not text:
        return None
    age_h = file_commit_age_h(OUTBOX_REL)
    if age_h is None:
        return text  # git inspection failed — fail open, use the content
    if age_h > OUTBOX_STALE_HOURS:
        return None
    return text


def detect_stranded() -> Optional[str]:
    """Return a brief body describing stranded autoloop work, or None.

    A strand = a claude/* branch on origin whose tip is newer than master AND
    fresh enough to be from this run cycle. Old claude/* branches that were
    later cherry-picked onto master have older tips than master and are ignored.
    """
    try:
        refs = git(
            "for-each-ref",
            "--format=%(refname:short) %(committerdate:unix)",
            "refs/remotes/origin/claude/",
        )
        if refs.returncode != 0:
            return None
        master_time_proc = git("log", "-1", "--format=%ct", "origin/master")
        if master_time_proc.returncode != 0:
            return None
        master_time = int(master_time_proc.stdout.strip())
    except Exception as e:
        log(f"detect_stranded failed: {type(e).__name__}: {e}")
        return None

    now = int(datetime.now(timezone.utc).timestamp())
    candidates: List[Tuple[str, int]] = []
    for line in refs.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        ref, ts_str = parts[0], parts[1]
        try:
            ts = int(ts_str)
        except ValueError:
            continue
        if ts > master_time and (now - ts) < STRAND_FRESH_HOURS * 3600:
            candidates.append((ref, ts))

    if not candidates:
        return None

    branch_ref, _ = max(candidates, key=lambda x: x[1])  # most recent strand
    short_branch = branch_ref[len("origin/"):] if branch_ref.startswith("origin/") else branch_ref

    # Try to surface what was on the strand — read its outbox if it has one.
    payload = ""
    try:
        show = git("show", f"{branch_ref}:{OUTBOX_REL}", timeout=10)
        if show.returncode == 0:
            payload = show.stdout.strip()
    except Exception:
        pass

    # Refspec push — branch-agnostic (works regardless of user's current
    # branch), FF-only by default (rejects if not a fast-forward), updates
    # remote master directly. Local master syncs naturally on next pull.
    rescue = (
        f"cd ~/alexandria && git fetch origin && "
        f"git push origin {branch_ref}:master"
    )
    header = f"STRANDED on {short_branch} — autoloop didn't reach master."
    if payload:
        return f"{header}\n\n{payload}\n\nRescue: {rescue}"
    return f"{header}\n\nRescue: {rescue}"


def main() -> int:
    if not CREDS.exists():
        log(f"abort: creds missing at {CREDS} — run /brief-setup")
        return 1

    try:
        creds = json.loads(CREDS.read_text())
    except Exception as e:
        log(f"abort: creds unreadable ({type(e).__name__}: {e})")
        return 1

    # Sync first so OUTBOX and LAST_RUN reflect the latest autoloop push.
    if REPO.exists() and (REPO / ".git").exists():
        sync_repo()

    body = DEFAULT_BODY

    # Stranded work takes priority — it's the alarm condition.
    stranded = detect_stranded() if (REPO / ".git").exists() else None
    if stranded:
        body = stranded
    else:
        fresh = read_fresh_outbox()
        if fresh:
            body = fresh

    # If still defaulting, verify the upstream routine is alive. The default
    # body is meaningful only when the machine routine ran and chose silence —
    # otherwise it silently masks a stalled loop.
    if body == DEFAULT_BODY:
        if not LAST_RUN.exists():
            body = "alarm: machine routine has never run — no last_run.md found."
        else:
            age_h = file_commit_age_h(LAST_RUN_REL)
            if age_h is not None and age_h > LAST_RUN_STALE_HOURS:
                body = f"alarm: machine routine stale — last_run.md last committed {age_h:.0f}h ago."

    msg = EmailMessage()
    msg["Subject"] = creds.get("subject", "alexandria.")
    msg["From"] = creds["from"]
    msg["To"] = creds["to"]
    msg.set_content(body)

    try:
        ctx = ssl.create_default_context()
        port = int(creds.get("port", 465))
        if port == 465:
            with smtplib.SMTP_SSL(creds["host"], port, context=ctx, timeout=20) as srv:
                srv.login(creds["user"], creds["password"])
                srv.send_message(msg)
        else:
            with smtplib.SMTP(creds["host"], port, timeout=20) as srv:
                srv.starttls(context=ctx)
                srv.login(creds["user"], creds["password"])
                srv.send_message(msg)
        log(f"sent: {body[:80]}")
        return 0
    except Exception as e:
        log(f"fail: {type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
