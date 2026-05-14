# Filter

*Your publishing policy. What classes of content are ok to publish to the Library, what stays local. The Engine reads this before any publish action.*

*The filter is your consent layer. Default: nothing publishes without you saying so. As you build trust with the Engine, you can grant it discretion on specific categories ("auto-publish typo fixes to my shadow", "always require explicit ok for new positions").*

## Default policy (until customised)

- Nothing publishes automatically.
- The Engine drafts to `library/{tier}/*_draft.*` and surfaces it for you to review.
- You promote a draft by renaming it to the final name (e.g., `library/public/shadow_draft.md` → `library/public/shadow.md`).

## Customising

Add entries below as you develop trust with the Engine on specific publishing decisions.

```
## Auto-OK: <category>

What: <specific class of edit/publication>
Examples: <when this applies>
Conditions: <any guardrails>
Added: <date>
```

---

*(no auto-OK rules yet — explicit confirmation required for all publishes)*
