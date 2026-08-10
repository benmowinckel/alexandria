# Canon Overrides

*Your consent layer for the upstream canon. Anything here wins over `factory/canon/methodology.md`. Upstream updates are checked only if you separately enable update checks, and are never applied automatically; overrides stay local and authoritative.*

*The Engine adds entries here when upstream canon changes conflict with your practice. You can add entries directly. Each entry should name what is being overridden and why.*

## How this file works

- The signed canon installed on this machine is the default practice.
- Entries below supersede the default when they conflict.
- The Engine reads this file on every session alongside the upstream canon.
- If update checks are enabled and upstream canon changes, the Engine surfaces a diff at `.canon_update_notice`; nothing changes unless you approve it.
- Clear entries that no longer apply.

## Example entry format

```
## Override: <section or line from upstream canon>

Upstream says: <quoted line or summary>
For this Author: <what to do instead>
Why: <reason — a personal practice, a taste call, an incompatible framing>
Added: <date> by <engine|author>
```

---

*(no overrides yet — upstream canon applies in full)*
