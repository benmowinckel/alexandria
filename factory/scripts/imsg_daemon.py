#!/usr/bin/env python3
"""Alexandria iMessage inbound daemon — the always-on reader (Python, stable-binary FDA).

Why Python, not a compiled app: FDA grants are tied to a binary's code signature. A compiled
reader breaks its own grant every time it's rebuilt (re-signing changes the identity → re-grant
forever). /usr/bin/python3 is a stable Apple binary whose signature never changes, so the grant
is granted ONCE and survives every future edit to this script. It also matches the existing
launchd jobs (nudge, brief, session-capture) and already holds Automation → Messages.

Duties (dumb pipe, no model here): honor the pause sentinel; single-instance via flock; read the
two self-handles from .imsg_config; find new inbound since the watermark using the verified
discriminator (is_from_me=0 OR it's the number thread); ADVANCE THE WATERMARK IMMEDIATELY (so a
message can never be reprocessed — the infinite-reprocess loop is structurally impossible); then
hand off to imsg_handle.sh (brain → send → log). All intelligence + the Apple-Events send live
downstream; this only detects and de-duplicates.

OFF: touch ~/alexandria/system/.imsg_paused  (or imsg_ctl.sh off) / launchctl bootout the label.
"""
import fcntl, os, re, sqlite3, subprocess, sys, time

HOME = os.path.expanduser("~")
BASE = os.path.join(HOME, "alexandria/system")
DB     = os.path.join(HOME, "Library/Messages/chat.db")
WM     = os.path.join(BASE, ".imsg_watermark")
CFG    = os.path.join(BASE, ".imsg_config")
PAUSE  = os.path.join(BASE, ".imsg_paused")
TMP    = os.path.join(BASE, ".imsg_inbound_tmp")
LOCK   = os.path.join(BASE, ".imsg_reader.lock")
AISENT = os.path.join(BASE, ".imsg_ai_sent")   # ROWIDs the AI sent — everything else in-thread is Ben
HANDLE = os.path.join(BASE, "scripts/imsg_handle.sh")

def err(m): sys.stderr.write(m + "\n"); sys.stderr.flush()

def decode_attributed_body(data):
    """Extract plain text from a Messages `attributedBody` typedstream blob.
    Some of Ben's texts (emoji, formatting, mentions) store their text here with m.text NULL.
    Heuristic: after the 'NSString' marker comes an inline-string marker ('+'), then a
    typedstream variable-length int, then the UTF-8 bytes. Covers the overwhelming majority."""
    if not data:
        return None
    idx = data.find(b"NSString")
    if idx < 0:
        return None
    plus = data.find(b"+", idx + 8)
    if plus < 0 or plus + 1 >= len(data):
        return None
    p = plus + 1
    length = data[p]; p += 1
    if length == 0x81:
        length = int.from_bytes(data[p:p+2], "little"); p += 2
    elif length == 0x82:
        length = int.from_bytes(data[p:p+4], "little"); p += 4
    return data[p:p+length].decode("utf-8", "replace") or None

# single instance — belt-and-suspenders over launchd; orphans can't double-process
_lock = open(LOCK, "w")
try:
    fcntl.flock(_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
    err("another reader instance is running — exiting"); sys.exit(0)

cfg = {}
for line in open(CFG):
    m = re.match(r'\s*(IMSG_\w+)="([^"]*)"', line)
    if m: cfg[m.group(1)] = m.group(2)
EMAIL, NUMBER = cfg.get("IMSG_EMAIL"), cfg.get("IMSG_NUMBER")
if not EMAIL or not NUMBER:
    err("no handles in .imsg_config"); sys.exit(1)

# All self-thread messages since the watermark; the AI's own sends are filtered out in Python via
# .imsg_ai_sent (is_from_me is no longer a reliable signal — the saved contact made Ben's replies
# is_from_me=1, identical to AI sends).
Q = ("SELECT m.ROWID, m.text, m.attributedBody, c.chat_identifier "
     "FROM message m JOIN chat_message_join j ON m.ROWID=j.message_id JOIN chat c ON j.chat_id=c.ROWID "
     "WHERE c.chat_identifier IN (?,?) AND m.ROWID>? "
     "ORDER BY m.ROWID ASC")

while True:
    # If the terminal/shell that launched us is gone, our parent becomes launchd (pid 1). Running
    # under launchd is exactly what triggers the macOS "data from other apps" popup — so exit instead
    # of orphaning. Next terminal you open auto-starts a fresh one in the (silent) Terminal context.
    if os.getppid() == 1:
        err("launching terminal gone — exiting (won't run in background/launchd context)")
        break
    if os.path.exists(PAUSE):
        time.sleep(5); continue
    try:
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=5)
    except Exception as e:
        err(f"open failed: {e}"); time.sleep(5); continue
    try:
        try:
            wm = int(open(WM).read().strip())
        except Exception:
            mx = con.execute(
                "SELECT COALESCE(MAX(m.ROWID),0) FROM message m JOIN chat_message_join j ON m.ROWID=j.message_id "
                "JOIN chat c ON j.chat_id=c.ROWID WHERE c.chat_identifier IN (?,?)", (EMAIL, NUMBER)).fetchone()[0]
            open(WM, "w").write(str(mx)); time.sleep(4); continue
        rows = con.execute(Q, (EMAIL, NUMBER, wm)).fetchall()
    except Exception as e:
        err(f"read failed: {e}"); time.sleep(5); continue
    finally:
        con.close()

    if rows:
        maxrow = rows[-1][0]                          # advance past EVERYTHING seen (incl. AI sends)
        ai_sent = set()
        try:
            ai_sent = {int(x) for x in open(AISENT).read().split()}
        except Exception:
            pass
        ben = [r for r in rows if r[0] not in ai_sent]   # everything not an AI send is Ben
        open(WM, "w").write(str(maxrow))              # advance BEFORE handoff — no reprocess loop possible
        if ben:
            with open(TMP, "w") as tf:
                for rid, text, abody, chat_id in ben:
                    if not text:
                        text = decode_attributed_body(abody) or "[unreadable message]"
                    text = text.replace("\n", " ").replace("\r", " ")
                    tf.write(f"{rid}\t{text}\n")
            # Reply to Ben's NUMBER. Paired with him disabling the email handles in Send & Receive, his
            # account collapses to ONE identity (the number) → one thread, deterministic, no alternation.
            # Blue (self), but reliable — the trade he chose over messy-grey.
            subprocess.run(["/bin/bash", HANDLE, str(maxrow), NUMBER])
    time.sleep(4)
