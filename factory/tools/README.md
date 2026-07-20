# tools — the adapter layer (pixel/acoustic × in/out)

Every tool Alexandria connects to is a small adapter here. Two base modalities — **acoustic** and
**pixel** — each with **in** and **out**. A "tool" (Reminders, Notes, Slack, Voice Memos, the phone
screen) is just a specialized plug on one of those four channels. Connecting a tool should never be a
project — it's one small file.

## Out-adapters — the agent DOES something in a tool
The texting brain is **caged** (no shell — that's what keeps it popup-free and un-injectable), so it
can't run `osascript` itself. Instead it **emits a marker** on its own line in the reply:

```
[[VERB: payload]]
```

The privileged handler (`scripts/imsg_handle.sh`, which runs in the terminal context and CAN actuate)
sees the marker, runs `tools/<verb>.sh "payload"`, and substitutes the adapter's stdout back into the
text he actually receives. Caged brain *signals*; privileged handler *actuates* — same split the
serve-surface uses, generalised to everything.

**Safety — armed-never-fired extends here.** Adapters that act only on *his own* stuff and are
reversible (show, remind, note, timer) fire freely. Adapters that reach **another person** or are
**irreversible/outward** (Slack/email/SMS-to-someone, a post, a payment) must NOT fire autonomously —
the brain drafts in plain text and waits for his "go" before emitting the firing marker. Bake the gate
into the brain's behaviour, not just the adapter.

**To connect a new out-tool: drop one file `tools/<verb>.sh` that takes `"$1"` and echoes the one line
he should see.** That's the entire contract. Shipped examples:
- `show.sh <filename>` — send a file the brain wrote to `served/` to his phone as a **private iMessage attachment** (Apple E2E, works anywhere; iCloud-drop fallback). No public exposure.
- `remind.sh "<text>"` — add a Reminder.
- `note.sh "<title> | <body>"` — save an Apple Note.
- `music.sh "<cmd>"` — Apple Music: play/pause/next/prev/`playlist <name>`/`airplay <device>` (AirPlay to a HomePod needs the mac on the same WiFi).
- `scene.sh "<name>"` — run a HomeKit scene from anywhere (via a same-named Shortcut → Home hub).

On a mac, `osascript` reaches almost everything — Calendar, Messages, Music, Contacts, and any app with
an AppleScript dictionary; Slack/others via their URL schemes or CLIs — so each new tool is ~10 lines.
First `osascript` call per app prompts **once** for Automation permission (user consent — can't be
scripted); after that it's silent and **background** (no window raised, per the never-hijack-the-screen
rule). An unknown marker (no matching adapter) is left as plain text — harmless.

## In-adapters — a tool FEEDS the agent
A reader that pulls from a tool and hands the brain text/image/audio. `scripts/imsg_recv.sh`
(Messages → text) is one. These run on the daemon side *before* the brain, not as markers. Next up:
**media-in** — a photo or voice-memo texted into the thread → extracted from Messages → the brain reads
the image / transcribes the audio (it's multimodal once the bytes reach it).

## The rule
One tool = one tiny, single-purpose file on the channel it belongs to, named for the verb the brain
emits. If connecting something feels like a project, the abstraction is wrong.
