# Foundation — the minimal closed loop

*The objective base: the smallest complete system that develops a mind and connects it to others. Incompressible — remove any piece and the loop no longer closes. Universal — it works for everyone before any personalisation, because none of it is a matter of taste. This is the shared floor every Author stands on. The **Founder module** (see `MODULES.md`) is one person's best general way to build on it; the marketplace is where hyper-personal variants live. Foundation is the `mind.py` everyone runs — the rest is what you bolt on, and all of it is just files on your own machine.*

---

## the loop

A mind develops by running one cycle, over and over:

**capture → develop → crystallise → create → connect → and back.**

- **capture** — raw thought in (voice, text, anything), append-only, nothing lost. *(the vault)*
- **develop** — the five operations turn raw into sharper: **genesis** (get it out), **accretion** (bring it in), **development** (sharpen it), **entropy** (what decays, what's saved from loss), **creation** (use it).
- **crystallise** — what survives becomes a structured, owned, portable record of how you think. *(the constitution)*
- **create** — fragments bound into work that leaves your mind and enters the world.
- **connect** — a projection of your mind is published and reported to the network, which feeds back what works. *(the shadow + the call)*

That is the whole engine. Everything else is how *well* you run it.

## the invariants

The loop only holds under these. They are constraints, not preferences — change one and it is a different system:

- **the unit is one mind.** Never a company, team, or entity — they have their own files and owners. The loop develops a person.
- **sovereignty.** Every file lives on your machine, plain markdown, portable, model-agnostic. The server is stateless — it holds what you publish, never what you think. Exit cost is zero.
- **your cognition changes only by your action.** No canon or constitution file is auto-applied — the system verifies upstream against an offline-signed manifest, *notifies*, and you pull. The sole exception is the verified mechanism itself (the hook payload), which auto-updates only if it passes that signature check — the deliberate channel that lets security fixes reach you fast. A leaked signing key could push mechanism code; it can never silently rewrite your cognition.
- **the server is a postbox — input-only.** It holds nothing of yours and emits no content into your Engine. Everything your Engine reads from the network is your own pull, integrity-verified before it is written, and logged. A fully corrupted server can refuse you service; it cannot put one byte into your mind.
- **two zones, never crossed.** The Engine that holds your private cognition takes no untrusted external input (it cannot be injected); the Engine that reads untrusted input — web, foreign modules, others' minds — holds none of your private data (injection steals nothing). Everything ingested is written to a tamper-evident, public, append-only log: manipulation is structurally either impossible or permanently attributable.
- **data and intent, not intelligence.** The system ships your files and the developmental intent; your own model is the intelligence. Plain markdown, no schemas — when models improve, the same files yield more, with zero change.
- **neutral.** It develops cognition; it does not direct it. The loop is content-blind — it sharpens whatever you bring.
- **the objective is max thought space** — the fullest net signal of how you actually think, in symbols a model can work with. Develop that; keep an honest record of where it is.

## the spine — what closes the collective half

Three constants, server-enforced, the only part that is not a file on your machine:

- **account** — the relationship that lets the network enforce the other two.
- **file** — at least one published projection of your mind, kept live (static data does not survive AGI; live data does — you cannot replicate what is still being written).
- **call** — your machine reports which modules it is using (by reference — *never* your private files) and the network returns what is working. Every call is a vote on which ideas live.

account · file · call. This is the connection itself — disconnect and there is simply no network, only your local loop, which is still entirely yours.
