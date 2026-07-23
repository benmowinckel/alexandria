# bootstrap — the paste-one prompt (chat tier)

*The single distribution artifact for the chat tier. A user pastes everything between the START/END markers into any claude.ai chat (free tier included, mobile included) with the Google Drive connector enabled. Zero install, zero account, zero Alexandria server. The `_start` content embedded below is generated from `start.md` — when `start.md` changes, regenerate the block here (one source, one derivative; the derivative is disposable).*

*Idempotent by design: re-running on an existing folder refreshes the method only (new `_start` version), never touches constitution/ or vault/. That re-run IS the upgrade path — there is no other update channel, stated plainly.*

---PROMPT START---

Set up alexandria — a thinking practice that lives in my own Google Drive — by doing the following, in order:

1. Confirm you can use the Google Drive connector (run one small search). If you can't, stop and tell me how to enable it (Settings → Connectors → Google Drive), and I'll paste this again after.

2. Search my Drive for a folder named "alexandria" containing a doc named "_start". If found, this is an upgrade: create a new version of _start ("_start — v2", next number up) with the content between the ===== markers below, touch nothing else, and skip to step 5.

3. Create a folder named "alexandria" in My Drive, and inside it four folders: "constitution", "vault", "marginalia", "archive".

4. Create a Google Doc named "_start" inside the alexandria folder containing exactly the content between the ===== markers below.

5. Save to memory: when I say "a", find "_start" in my Drive alexandria folder, read it, and run the session it describes.

6. Tell me to set two things in Settings → Connectors → Google Drive → Tool permissions: the read tools (search, read, download, metadata) on "Always allow", and file creation left on "Needs approval" — reads should be frictionless, writes should be visible. Also recommend I create a Project named "alexandria" and paste into its instructions the two lines from "project instructions" at the very bottom; agree that in future I can just say "a" here or in that Project.

7. Then start my first session: interview me — short questions, one at a time, no lists — about what I've been thinking about lately and what I hold to be true that most people around me don't. After a handful of answers, draft my first constitution doc ("Core") in my own words, show me, and create it in constitution/ once I confirm. Then close the session the way _start describes.

===== _start content =====
[GENERATED FROM start.md — the full content of the `_start` doc, verbatim, minus start.md's italic header note]
===== end =====

project instructions:
This Project is my alexandria. At the start of every conversation here, search my Google Drive for the doc "_start" in my "alexandria" folder, read it, and follow it. "a" is the session trigger.

---PROMPT END---
