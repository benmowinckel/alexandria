# patron updates — content directory

Each update is one markdown file. Filename = slug = footer-nav label (e.g. `u1.md` → `/updates/u1`).

## format

```
---
subject: first update.
date: 2026-05-24
---

body in markdown — whatever shape fits the week.

Benjamin a. Mowinckel
*a.*
```

Frontmatter fields:
- `subject` — email subject line + page `<title>` + index label
- `date` — ISO date (`YYYY-MM-DD`), used for ordering (newest first)

Files prefixed with `_` and `README.md` are ignored.

## publish flow

1. Write `u<n>.md` in this directory.
2. Commit + push. Vercel builds, `/updates/<slug>` goes live.
3. Preview the email first: `node scripts/send-update.mjs u<n> --preview` → lands in founder inbox only.
4. Broadcast: `node scripts/send-update.mjs u<n>` → goes to every `follow`-type subscriber not opted out.
