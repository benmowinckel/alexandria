#!/usr/bin/env python3
"""Resolve iOS share captures into markdown.

`vault/input/` is local by default. If the Author separately enables the
iCloud-capture add-on, that exact path becomes their iCloud capture folder.
This script reads each `.html`, and only with a separate local permission file
fetches the focal tweet via api.fxtwitter.com
(nests the quoted/replied tweet for free), writes resolved markdown to
`vault/_input/` (the underscore-prefixed derivative folder, local-only — keeps
derivatives out of iCloud per the dependency-alarm principle), and moves the
source `.html` alongside it so iCloud isn't left holding processed files.

Non-HTML files (audio, images, etc) stay in `input/` — they're raw, awaiting
engagement, surfaced by the opener directly. The waitlist count = unprocessed
items in `input/` + resolved markdown in `_input/`.

For each X HTML: pick a focal tweet id (soft default — entity flagged as a
quote tweet or reply, else first), fetch, render markdown. Verify the
resolved text appears in the source HTML; warn if not (catches focal-
extraction errors structurally rather than waiting for the Author to notice).
Idempotent — re-running skips any HTML whose `.md` derivative already exists.
"""

from __future__ import annotations
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

os.umask(0o077)

INPUT = Path.home() / "alexandria/files/vault/input"       # raw, iCloud-synced
OUTPUT = Path.home() / "alexandria/files/vault/_input"     # resolved, local-only derivative
SAVED = Path.home() / "alexandria/files/vault/saved"       # extracted analyses + ledger
OFF_SWITCH = Path.home() / "alexandria/system/.extraction_off"      # touch to mute the drain nudge
PENDING_MARKER = Path.home() / "alexandria/system/.extraction_pending"  # written when items await extraction
NETWORK_PERMISSION = Path.home() / "alexandria/system/permissions/capture-network"
RUNTIME_MARKER = Path.home() / ".local/share/alexandria/.setup_complete"
# A resolved per-item capture stem: YYYYMMDD-HHMMSS-handle-<tweetid> (X) or
# YYYYMMDD-HHMMSS-link (URL shares). Old/non-X derivatives (bookshelf_*,
# 2026-03-27.md, *.feedback.md) don't match, so they never get counted as
# pending extraction.
CAPTURE_STEM = re.compile(r"^\d{8}-\d{6}-(?:.+-\d{15,}|link)$")

# X embeds tweets in __INITIAL_STATE__:
#   "tweets":{"entities":{"<id>":{...}}, "errors":..., "users":...}
# Entity order isn't focal-first (quote-tweet pages list the quoted tweet
# first), so we read the bodies and prefer the one with is_quote_status:true
# or a non-null in_reply_to_status_id_str — those mark the tweet the user
# actually shared. Fall back to the first entity if neither signal is present.
# End-anchor is permissive across X state-key ordering (users / errors /
# moments / topics) so a single anchor reorder doesn't break extraction.
ENTITIES_BLOCK = re.compile(
    r'"tweets":\{"entities":\{(.+?)\},\s*"(?:users|errors|moments|topics)":',
    re.DOTALL,
)
ENTITY_ID = re.compile(r'"(\d{15,})":\{')
TWEET_URL_FALLBACK = re.compile(r"(?:x|twitter)\.com/[A-Za-z0-9_]+/status/(\d+)")
FOCAL_SIGNALS = ('"is_quote_status":true', '"in_reply_to_status_id_str":"')


def focal_tweet_id(html: str) -> str | None:
    block = ENTITIES_BLOCK.search(html)
    if not block:
        m = TWEET_URL_FALLBACK.search(html)
        return m.group(1) if m else None
    chunk = block.group(1)
    ids = list(ENTITY_ID.finditer(chunk))
    if not ids:
        return None
    for i, m in enumerate(ids):
        end = ids[i + 1].start() if i + 1 < len(ids) else len(chunk)
        body = chunk[m.end() : end]
        if any(s in body for s in FOCAL_SIGNALS):
            return m.group(1)
    return ids[0].group(1)


def verify_focal(tweet: dict, tid: str, html: str) -> bool:
    """Mirror catches two failure modes:
    1. fxtwitter returns a different tweet than asked (redirect/deletion).
    2. We picked a leaf (e.g. the quoted tweet) instead of the focal.
       If the HTML carries multiple tweet entities, the focal must have at
       least one outbound relationship (quote or reply). A leaf has neither.
    """
    if tweet.get("id") != tid:
        return False
    block = ENTITIES_BLOCK.search(html)
    if not block:
        return True
    if len(ENTITY_ID.findall(block.group(1))) > 1:
        return bool(tweet.get("quote") or tweet.get("replying_to_status"))
    return True


def fetch(tid: str) -> dict | None:
    req = urllib.request.Request(
        f"https://api.fxtwitter.com/i/status/{tid}",
        headers={"User-Agent": "alexandria-capture-resolver"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
        print(f"  fetch fail {tid}: {e}", file=sys.stderr)
        return None
    return data.get("tweet") if data.get("code") == 200 else None


MEDIA_EXT = re.compile(r"\.(jpg|jpeg|png|gif|webp)(?:\?|$)", re.I)


def fetch_media(t: dict, stem: str) -> list[str]:
    """Download tweet photos next to the derivative so extraction can READ them.

    The 2026-07-01 drain accepted a dozen 'image unviewed' gaps because media
    existed only as URLs — but the payload of a screenshot/list/letter save IS
    the image. Downloading at resolve time makes that gap class structurally
    impossible. Videos are skipped (size; URL stays in the .md). Any failure
    degrades to the URL — never blocks resolution."""
    urls: list[str] = []
    for src in (t, t.get("quote") if isinstance(t.get("quote"), dict) else None):
        if src:
            urls += [
                m.get("url", "")
                for m in (src.get("media") or {}).get("all", [])
                if m.get("type") == "photo"
            ]
    saved = []
    for i, url in enumerate(dict.fromkeys(u for u in urls if u), 1):
        m = MEDIA_EXT.search(url)
        dest = OUTPUT / f"{stem}-media-{i}.{m.group(1).lower() if m else 'jpg'}"
        if dest.exists():
            saved.append(dest.name)
            continue
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "alexandria-capture-resolver"}
            )
            with urllib.request.urlopen(req, timeout=20) as r, open(dest, "wb") as fh:
                shutil.copyfileobj(r, fh)
            saved.append(dest.name)
        except Exception as e:
            print(f"  ⚠ media fetch failed {url}: {e}", file=sys.stderr)
    return saved


def _fmt_date(t: dict) -> str:
    ts = t.get("created_timestamp")
    if not ts:
        return t.get("created_at", "")
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def render_block(t: dict, level: int) -> str:
    a = t["author"]
    media = [m["url"] for m in (t.get("media") or {}).get("all", [])]
    lines = [
        f"{'#' * level} @{a['screen_name']} ({a['name']}) — {_fmt_date(t)}",
        "",
        t.get("text", "").strip(),
        "",
        t["url"],
    ]
    if media:
        lines += ["", "Media:", *[f"- {u}" for u in media]]
    lines += [
        "",
        f"_{t.get('likes', 0)} likes · {t.get('retweets', 0)} RT · "
        f"{t.get('replies', 0)} replies · {t.get('bookmarks', 0)} bookmarks · "
        f"{t.get('quotes', 0)} quotes · {t.get('views', 0)} views_",
    ]
    return "\n".join(lines)


def render(t: dict, src: str, media_files: list[str] | None = None) -> str:
    parts = [render_block(t, 1)]
    # fxtwitter sometimes returns these as bare id strings, not nested objects.
    if isinstance(t.get("quote"), dict):
        parts += ["", "---", "", "## Quoted tweet", "", render_block(t["quote"], 3)]
    if isinstance(t.get("replying_to_status"), dict):
        parts += [
            "", "---", "", "## Replying to", "",
            render_block(t["replying_to_status"], 3),
        ]
    elif t.get("replying_to_status"):
        parts += ["", f"_Reply to status {t['replying_to_status']} (not expanded)._"]
    # X Articles: the body lives outside t['text'] — without this the capture
    # is a title-only stub (bayeslord/jacob_posel/JayaGup10, 2026-07-01 drain).
    # Schema unknown/unstable, so dump whatever fxtwitter carries as raw JSON;
    # the extracting model lifts from raw better than a hand-parse survives
    # schema drift.
    art = t.get("article")
    if isinstance(art, dict) and art:
        art_text = art.get("text") or art.get("content") or json.dumps(
            art, ensure_ascii=False
        )
        parts += ["", "---", "", "## Article", "", str(art_text)[:40000]]
    if media_files:
        parts += ["", "Local media (visually readable):",
                  *[f"- {n}" for n in media_files]]
    parts += ["", f"_Recovered from `{src}`._", ""]
    return "\n".join(parts)


def process_html(f: Path, stats: dict) -> None:
    html = f.read_text(encoding="utf-8", errors="ignore")
    tid = focal_tweet_id(html)
    if not tid:
        stats["no_tweet"] += 1
        print(f"  ✗ {f.name}: no tweet id", file=sys.stderr)
        return
    t = fetch(tid)
    if not t:
        stats["fetch_failed"] += 1
        return
    out = OUTPUT / f"{f.stem}-{t['author']['screen_name']}-{tid}.md"
    if out.exists():
        stats["skipped"] += 1
        return
    media_files = fetch_media(t, out.stem)
    out.write_text(render(t, f.name, media_files), encoding="utf-8")
    stats["resolved"] += 1
    print(f"  ✓ {out.name}", file=sys.stderr)
    if not verify_focal(t, tid, html):
        stats["verify_failed"] += 1
        print(
            f"  ⚠ {out.name}: focal extraction looks wrong "
            "(HTML has multiple tweets, resolved one has no quote/reply)",
            file=sys.stderr,
        )
    # Move source .html alongside its .md (out of iCloud — derivative pair
    # now lives in _input/, source preserved per the never-delete rule).
    try:
        shutil.move(str(f), str(OUTPUT / f.name))
    except Exception as e:
        print(f"  ⚠ {f.name}: source move failed ({e}) — .html stays in input/", file=sys.stderr)


URL_RE = re.compile(r"https?://\S+")


def resolve_link_title(url: str) -> str:
    """YouTube via oEmbed (keyless), anything else via the page <title>."""
    try:
        if "youtu" in url:
            o = (
                "https://www.youtube.com/oembed?url="
                f"{urllib.parse.quote(url, safe='')}&format=json"
            )
            req = urllib.request.Request(
                o, headers={"User-Agent": "alexandria-capture-resolver"}
            )
            with urllib.request.urlopen(req, timeout=15) as r:
                d = json.load(r)
            return f"{d.get('title', '?')} — {d.get('author_name', '?')} (YouTube)"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            head = r.read(65536).decode("utf-8", "ignore")
        m = re.search(r"<title[^>]*>(.*?)</title>", head, re.S | re.I)
        return re.sub(r"\s+", " ", m.group(1)).strip() if m else "(no title)"
    except Exception as e:
        return f"(unresolved: {e})"


def process_txt(f: Path, stats: dict) -> None:
    """Link captures — a .txt of URL(s) shared from the phone (YouTube, articles).

    Before 2026-07-01 these were invisible: no .md derivative, no pending count
    (two YouTube shorts sat 8 days unseen in input/). Resolve each URL to a
    title and write a link capture the pending report counts."""
    text = f.read_text(encoding="utf-8", errors="ignore")
    urls = URL_RE.findall(text)
    if not urls:
        stats["in_place"] += 1
        return
    out = OUTPUT / f"{f.stem}-link.md"
    if out.exists():
        stats["skipped"] += 1
        return
    lines = [f"# Link capture — {f.stem}", ""]
    for u in urls:
        lines += [f"- {u}", f"  - {resolve_link_title(u)}"]
    lines += ["", f"_Recovered from `{f.name}`._", ""]
    out.write_text("\n".join(lines), encoding="utf-8")
    stats["resolved"] += 1
    print(f"  ✓ {out.name}", file=sys.stderr)
    try:
        shutil.move(str(f), str(OUTPUT / f.name))
    except Exception as e:
        print(f"  ⚠ {f.name}: source move failed ({e})", file=sys.stderr)


def report_pending() -> None:
    """Make resolved-but-unextracted captures impossible to miss at session start.

    Extraction (each `_input/<stem>.md` → `saved/<stem>.analysis.md` + a ledger
    line) is a LOCAL-only Engine step. The cloud autoloop is structurally blind
    to phone captures: they aren't in git until extraction has already run
    locally (confirmed 2026-06-18 — the autoloop reported "no new vault" while a
    full day of captures sat unextracted on disk). So nothing drains `_input/`
    unless an interactive local session does it, and a silent resolver let the
    backlog grow to hundreds. This surfaces it: one stdout line at session start
    (the SessionStart hook adds resolver stdout to the session context) naming
    the count, plus a `.extraction_pending` marker any tool can read. Mute with
    `touch ~/alexandria/system/.extraction_off` (resolving still runs; only the
    drain nudge is silenced)."""
    try:
        pending = sorted(
            md.stem for md in OUTPUT.glob("*.md")
            if CAPTURE_STEM.match(md.stem)
            and not (SAVED / f"{md.stem}.analysis.md").exists()
        ) if OUTPUT.exists() else []
        raw = [
            p.name for p in INPUT.iterdir()
            if p.is_file() and not p.name.startswith(".")
        ] if INPUT.exists() else []
        if (pending or raw) and not OFF_SWITCH.exists():
            PENDING_MARKER.write_text(json.dumps(
                {"t": datetime.now(timezone.utc).isoformat(),
                 "count": len(pending), "stems": pending, "raw": raw}, indent=2),
                encoding="utf-8")
            raw_note = (
                f" Plus {len(raw)} raw item(s) (audio/video/other) in vault/input/ "
                f"awaiting engagement." if raw else ""
            )
            print(
                f"[alexandria] {len(pending)} saved capture(s) resolved and AWAITING "
                f"EXTRACTION in vault/_input/ — drain each to vault/saved/ "
                f"(<stem>.analysis.md + ledger.md line); protocol + parallel-drain "
                f"spec: ~/alexandria/files/core/capture.md.{raw_note} "
                f"Local-only Engine work — nothing drains these but a live session. "
                f"Mute: touch ~/alexandria/system/.extraction_off"
            )
        else:
            PENDING_MARKER.unlink(missing_ok=True)
    except Exception as e:
        print(f"  ⚠ pending-extraction report failed ({e})", file=sys.stderr)


def main() -> int:
    if not RUNTIME_MARKER.is_file():
        return 0
    INPUT.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if not INPUT.exists():
        print(f"Input folder not found: {INPUT}", file=sys.stderr)
        return 1
    stats = {
        "resolved": 0,
        "migrated": 0,
        "in_place": 0,
        "skipped": 0,
        "no_tweet": 0,
        "fetch_failed": 0,
        "verify_failed": 0,
    }
    network_approved = NETWORK_PERMISSION.is_file()
    for f in sorted(p for p in INPUT.iterdir() if p.is_file() and not p.name.startswith(".")):
        suffix = f.suffix.lower()
        if suffix == ".html":
            if not network_approved:
                stats["in_place"] += 1
                continue
            # Per-item isolation: one malformed capture must never jam the
            # queue behind it (a single render crash blocked the resolver for
            # days before 2026-06-11).
            try:
                process_html(f, stats)
            except Exception as e:
                stats["error"] = stats.get("error", 0) + 1
                print(f"  ✗ {f.name}: {type(e).__name__}: {e}", file=sys.stderr)
        elif suffix == ".md":
            # Stray .md in input/ — likely an old run before the source/derivative
            # split. Move to _input/ so it stops syncing to iCloud and stops being
            # double-counted by the waitlist.
            try:
                dest = OUTPUT / f.name
                if not dest.exists():
                    shutil.move(str(f), str(dest))
                    stats["migrated"] += 1
                    print(f"  ↺ {f.name} → _input/ (migrated)", file=sys.stderr)
                else:
                    stats["skipped"] += 1
                    print(f"  ⚠ {f.name}: counterpart exists in _input/, leaving in input/", file=sys.stderr)
            except Exception as e:
                print(f"  ⚠ {f.name}: migrate failed ({e})", file=sys.stderr)
                stats["skipped"] += 1
        elif suffix in (".txt", ".url"):
            if not network_approved:
                stats["in_place"] += 1
                continue
            try:
                process_txt(f, stats)
            except Exception as e:
                stats["error"] = stats.get("error", 0) + 1
                print(f"  ✗ {f.name}: {type(e).__name__}: {e}", file=sys.stderr)
        else:
            # Non-HTML (audio, images, etc) — raw, stays in input/ until engaged.
            stats["in_place"] += 1
    print(f"\nSummary: {stats}", file=sys.stderr)

    # Awareness marker — proves the resolver ran, lets the founder check last
    # run time + stats without parsing stderr logs.
    try:
        marker = Path.home() / "alexandria/system/.resolver_last_run"
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(json.dumps({
            "t": datetime.now(timezone.utc).isoformat(),
            "stats": stats,
        }, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"  ⚠ last-run marker write failed ({e})", file=sys.stderr)

    report_pending()
    return 0


if __name__ == "__main__":
    sys.exit(main())
