#!/usr/bin/env python3
"""Daily brief sender — syncs ~/alexandria with origin, then assembles a
subject + body and SMTP-sends it.

Priority of body sources:
  1. Stranded autoloop work (alarm).
  2. Fresh `system/.brief_outbox` (autoloop wrote something to surface).
  3. Stale-routine alarm if the autoloop hasn't committed in ~24h.
  4. Default — one droplet picked from `files/core/shelf.md`, deterministic per
     day. The brief always lands; silence trains the inbox to filter.

Subject taxonomy:
  - `alexandria. — alarm` for stranded / alarm bodies.
  - Whatever `SUBJECT:` line the outbox supplies (e.g. `alexandria. — 2 to decide`).
  - `alexandria.` for the daily droplet.

Sovereign by construction: no network calls except git (the Author's own
remote) and SMTP (the Author's own provider).
"""

import html
import json
import os
import random
import re
import smtplib
import ssl
import subprocess
import sys
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import List, Optional, Tuple

REPO = Path(__file__).resolve().parent.parent.parent
ALEX = REPO / "system"
CREDS = ALEX / ".brief_email"
LOG = ALEX / ".brief_log"
# Relative paths first, then absolute. The relatives are what git operates on
# (git -C $REPO log -- $REL); the absolutes are what Python opens. One source.
OUTBOX_REL = "system/.brief_outbox"
LAST_RUN_REL = "system/.autoloop/last_run.md"
SHELF_REL = "files/core/shelf.md"
OUTBOX = REPO / OUTBOX_REL
LAST_RUN = REPO / LAST_RUN_REL
SHELF = REPO / SHELF_REL

FALLBACK_DROPLET = "*keep thinking.*"
# Outbox content from before this threshold is treated as stale (yesterday's
# run, not today's). The autoloop fires at 14:00 UTC, the brief at 15:00 UTC
# — today's outbox is ~50 min old when read. 20h rejects anything older than
# this morning while leaving slack for autoloop running late.
OUTBOX_STALE_HOURS = 20
# Last_run.md commit older than this triggers the "routine missed today" alarm.
LAST_RUN_STALE_HOURS = 24
# A claude/* branch counts as a "live strand" only if its tip is this fresh.
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
    """Hours since `rel_path` was last committed. `git pull` resets mtime, so
    commit time is the only direct freshness signal."""
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
    """Fetch + FF master so OUTBOX/LAST_RUN reflect the latest autoloop push.
    Failures logged but non-fatal — the brief still sends a droplet."""
    try:
        git("fetch", "--all", "--quiet", timeout=45)
    except Exception as e:
        log(f"sync_repo fetch failed: {type(e).__name__}: {e}")
        return
    status = git("status", "--porcelain")
    if status.returncode == 0 and not status.stdout.strip():
        git("pull", "--ff-only", "origin", "master", "--quiet")


def read_fresh_outbox() -> Optional[str]:
    """Return outbox content if it was committed within STALE_HOURS, else None.

    The outbox is git-transported: the autoloop commits, brief pulls master to
    read. Natural lifecycle is "autoloop overwrites every run" — but silent days
    leave yesterday's content. Commit-time check prevents re-sending stale text.
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


def parse_outbox(raw: str) -> Tuple[Optional[str], str]:
    """Extract an optional `SUBJECT: ...` first line. Returns (subject, body).

    Format is intentionally minimal — autoloops write plain text. A leading
    `SUBJECT:` line overrides the default subject (e.g. `alexandria. — 2 to
    decide`). Everything after blank-line separator is the body.
    """
    first_line, _, rest = raw.partition("\n")
    if first_line.upper().startswith("SUBJECT:"):
        subject = first_line.split(":", 1)[1].strip()
        return subject, rest.lstrip("\n")
    return None, raw


def detect_stranded() -> Optional[str]:
    """Return alarm body describing stranded autoloop work, or None.

    A strand = a claude/* branch on origin newer than master AND fresh enough
    to be this cycle's. Old claude/* branches cherry-picked onto master have
    older tips and are ignored.
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

    branch_ref, _ = max(candidates, key=lambda x: x[1])
    short_branch = branch_ref[len("origin/"):] if branch_ref.startswith("origin/") else branch_ref

    payload = ""
    try:
        show = git("show", f"{branch_ref}:{OUTBOX_REL}", timeout=10)
        if show.returncode == 0:
            payload = show.stdout.strip()
    except Exception:
        pass

    rescue = (
        f"cd ~/alexandria && git fetch origin && "
        f"git push origin {branch_ref}:master"
    )
    header = f"STRANDED on {short_branch} — autoloop didn't reach master."
    if payload:
        return f"{header}\n\n{payload}\n\nRescue: {rescue}"
    return f"{header}\n\nRescue: {rescue}"


def pick_droplet() -> str:
    """Pick one droplet from the shelf, deterministic for today's UTC date.

    Stanzas in `files/core/shelf.md` are separated by lines of three+ dashes.
    Anything before the first separator is treated as header/meta and ignored.
    Empty/missing shelf → built-in fallback.

    Rotation: reshuffles the stanza order each ISO week (seed = year+week);
    weekday indexes into the shuffled list. Same day-of-week within a week =
    same droplet (idempotent reruns). 7 unique droplets per week when N ≥ 7.
    """
    if not SHELF.exists():
        return FALLBACK_DROPLET
    raw = SHELF.read_text()
    parts = re.split(r"\n-{3,}\n", raw)
    # parts[0] is the header above the first `---`. Stanzas start at parts[1:].
    stanzas = [p.strip() for p in parts[1:] if p.strip()]
    if not stanzas:
        return FALLBACK_DROPLET
    today = datetime.now(timezone.utc).date()
    iso_year, iso_week, iso_weekday = today.isocalendar()
    rng = random.Random(f"{iso_year}-W{iso_week:02d}")
    order = list(range(len(stanzas)))
    rng.shuffle(order)
    # iso_weekday is 1..7; index modulo N so weeks where N<7 still cycle cleanly.
    return stanzas[order[(iso_weekday - 1) % len(stanzas)]]


def _inline(text: str) -> str:
    """Escape, then render `**bold**` and `*italic*` from shelf droplets and
    outbox prose. Order matters — `**` before `*` to avoid greedy collision.
    No other markdown — keeping the parser tiny is the point.
    """
    s = html.escape(text)
    s = re.sub(r"\*\*([^*\n]+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*([^*\n]+?)\*", r"<em>\1</em>", s)
    return s


def render_html(body: str) -> str:
    """Render plaintext body into a scannable HTML email.

    Splits on blank lines into paragraphs; within a paragraph, lines beginning
    with `· `, `* `, or `- ` become a styled <ul>. Inline CSS only — email
    clients strip <style> blocks. The autoloop owns content discipline; this
    function owns rendering, nothing more.
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]
    blocks: List[str] = []
    for para in paragraphs:
        lines = para.split("\n")
        bullet_re = re.compile(r"^[·*\-]\s+(.*)")
        if all(bullet_re.match(ln.strip()) for ln in lines):
            items = "".join(
                f'<li style="margin:0 0 8px 0;text-indent:-14px;padding-left:14px;">'
                f'<span style="color:#888;">·</span>&nbsp;'
                f'{_inline(bullet_re.match(ln.strip()).group(1))}</li>'
                for ln in lines
            )
            blocks.append(
                f'<ul style="margin:0 0 18px 0;padding:0 0 0 22px;list-style:none;">{items}</ul>'
            )
            continue
        head, *rest = lines
        head_re = bullet_re.match(head.strip())
        if head_re or any(bullet_re.match(ln.strip()) for ln in rest):
            head_text = head_re.group(1) if head_re else head
            rendered_head = f'<p style="margin:0 0 8px 0;">{_inline(head_text)}</p>'
            bullet_items = []
            paragraph_lines = []
            for ln in rest:
                m = bullet_re.match(ln.strip())
                if m:
                    bullet_items.append(m.group(1))
                else:
                    paragraph_lines.append(ln)
            items_html = "".join(
                f'<li style="margin:0 0 6px 0;text-indent:-14px;padding-left:14px;">'
                f'<span style="color:#888;">·</span>&nbsp;{_inline(it)}</li>'
                for it in bullet_items
            )
            ul_html = (
                f'<ul style="margin:0 0 12px 0;padding:0 0 0 22px;list-style:none;">{items_html}</ul>'
                if bullet_items else ""
            )
            extra = (
                f'<p style="margin:0 0 12px 0;">{_inline(" ".join(paragraph_lines))}</p>'
                if paragraph_lines else ""
            )
            blocks.append(f'<div style="margin:0 0 18px 0;">{rendered_head}{ul_html}{extra}</div>')
            continue
        rendered = _inline(para).replace("\n", "<br>")
        blocks.append(f'<p style="margin:0 0 18px 0;">{rendered}</p>')

    body_html = "\n".join(blocks)
    return (
        '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#fafafa;'
        'font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',Arial,sans-serif;'
        'color:#222;font-size:16px;line-height:1.55;">'
        '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;'
        'padding:32px 36px;border:1px solid #eee;">'
        f'{body_html}'
        '<div style="margin-top:28px;padding-top:14px;border-top:1px solid #eee;'
        'color:#aaa;font-size:13px;letter-spacing:0.02em;">alexandria.</div>'
        '</div></body></html>'
    )


def load_creds() -> dict:
    """Env vars (CI) win over the local .brief_email file."""
    if os.environ.get("SMTP_HOST"):
        return {
            "host": os.environ["SMTP_HOST"],
            "port": int(os.environ.get("SMTP_PORT", "465")),
            "user": os.environ["SMTP_USER"],
            "password": os.environ["SMTP_PASSWORD"],
            "from": os.environ["SMTP_FROM"],
            "to": os.environ["SMTP_TO"],
            "subject": os.environ.get("SMTP_SUBJECT", "alexandria."),
        }
    return json.loads(CREDS.read_text())


def assemble(creds: dict) -> Tuple[str, str]:
    """Return (subject, body) for today's brief. Priority:
      stranded > fresh outbox > stale-routine alarm > droplet.
    """
    body: Optional[str] = None
    subject: Optional[str] = None

    stranded = detect_stranded() if (REPO / ".git").exists() else None
    if stranded:
        return "alexandria. — alarm", stranded

    fresh = read_fresh_outbox()
    if fresh:
        parsed_subject, parsed_body = parse_outbox(fresh)
        body = parsed_body
        subject = parsed_subject

    if body is None:
        # No outbox content: check routine health before falling through to droplet.
        if not LAST_RUN.exists():
            return "alexandria. — alarm", "alarm: machine routine has never run — no last_run.md found."
        age_h = file_commit_age_h(LAST_RUN_REL)
        if age_h is not None and age_h > LAST_RUN_STALE_HOURS:
            return "alexandria. — alarm", f"alarm: machine routine stale — last_run.md last committed {age_h:.0f}h ago."
        body = pick_droplet()

    if subject is None:
        if body.startswith("STRANDED") or body.startswith("alarm:"):
            subject = "alexandria. — alarm"
        else:
            subject = creds.get("subject", "alexandria.")

    return subject, body


def main() -> int:
    try:
        creds = load_creds()
    except Exception as e:
        log(f"abort: creds unavailable ({type(e).__name__}: {e})")
        return 1

    if REPO.exists() and (REPO / ".git").exists():
        sync_repo()

    subject, body = assemble(creds)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = creds["from"]
    msg["To"] = creds["to"]
    msg.set_content(body)
    msg.add_alternative(render_html(body), subtype="html")

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
        log(f"sent [{subject}]: {body[:80]}")
        return 0
    except Exception as e:
        log(f"fail: {type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
