# member updates — content directory

Each update is one markdown file. Filename = slug = footer-nav label (e.g. `u1.md` → `/updates/u1`).

## format

```
---
subject: first update.
date: 2026-05-24
youtube: dQw4w9WgXcQ
---

body in markdown — whatever shape fits the week.

Benjamin a. Mowinckel
*a.*
```

Frontmatter fields:
- `subject` — email subject line + page `<title>` + index label
- `date` — ISO date (`YYYY-MM-DD`), used for ordering (newest first)
- `youtube` *(optional)* — video ID or full URL (`dQw4w9WgXcQ` / `https://youtu.be/dQw4w9WgXcQ` / `https://www.youtube.com/watch?v=dQw4w9WgXcQ`). When present, the email renders the thumbnail (clickable → YouTube), the archive page embeds the player inline. Body markdown still renders below either way.

Files prefixed with `_` and `README.md` are ignored.

## publish flow

1. Write `u<n>.md` in this directory.
2. Commit + push. Vercel builds, `/updates/<slug>` goes live.
3. Preview the email first: `node scripts/send-update.mjs u<n> --preview` → lands in founder inbox only.
4. Broadcast: `node scripts/send-update.mjs u<n>` → goes to every `follow`-type subscriber not opted out.
