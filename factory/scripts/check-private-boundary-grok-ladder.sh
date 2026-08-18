#!/usr/bin/env bash
# Extra private-boundary requires for Grok Bot capability-ladder.
# Live checker remains factory/scripts/check-private-boundary.sh; this snippet documents the locked phrases.
require factory/skills/grok-bot.md \
  'If it is down, missing, or cannot actually read `~/alexandria`, say the source in one sentence, then fall through the capability ladder: a verified GitHub private copy of `files/` + `system/` via the GitHub connector (the Author'\''s connected GitHub private Alexandria backup); then a writable attached folder; then writable Drive only if actually authorized.' \
  'Grok Bot skill fail-closes instead of falling through the capability ladder when the computer connection is down'
require factory/skills/grok-bot.md \
  'Never invent constitution, vault, transcripts, or a save.' \
  'Grok Bot skill can invent the record when no verified source is available'
require factory/skills/grok-bot-close.md \
  'If that connection is down, missing, or cannot actually write `~/alexandria`, say the source in one sentence, then close against the next verified copy on the capability ladder: a verified GitHub private copy of `files/` + `system/` via the GitHub connector (the Author'\''s connected GitHub private Alexandria backup); then a writable attached folder; then writable Drive only if actually authorized.' \
  'Grok Bot close fail-closes instead of closing against the next verified copy on the capability ladder'
require factory/skills/grok-bot-close.md \
  'Never claim a Mac save.' \
  'Grok Bot close can claim a Mac save while writing another source'
