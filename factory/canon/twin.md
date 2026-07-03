# Your twin

*The onboarding companion to `plm.md`. That file is the how — the compile, its stages, the hard-won corrections. This one is the why: what a twin is, why only you can build yours, the one honest bar you have to clear, and how to fire it. If `plm.md` is the machine, this is the invitation. Read it and decide.*

A twin is **you, made queryable** — a language model that holds your positions and talks in your voice, compiled entirely from your own writing. Ask it something you've never answered out loud and it replies the way you would: your frame on new ground, your register, your reflexes. Not a chatbot wearing your name off a paragraph of bio. A working model of how you actually think — that other people can ask things of, and that keeps answering after you've stopped writing. After you're gone.

It ships on your Library page, next to your shadow, labelled as a twin. Your shadow is what you wrote. Your twin is what you'd *say* — to anyone, about anything, forever.

## why only you can build yours

Everyone else building a person-twin scrapes what you said in public — podcasts, posts, transcripts — and hopes it adds up to a mind. It doesn't, because public content is the surface, not the machinery.

Your twin compiles from something no one else has and no one can scrape: **your substrate.** Two halves, both produced for free every time you use Alexandria.

- **Your constitution** — what you actually believe. Not opinions you performed once; positions that got elicited, contradicted, resolved, and status-assigned by the practice. This carries the *what*.
- **Your sessions and your writing** — how you actually talk. Every session with the engine, every dictated memo, every draft is your verbatim voice, captured as exhaust. This carries the *how*. The sessions *are* the training set — using the product builds the corpus.

That is the moat made literal. A competitor who only *observes* you produces a measurably worse twin, because they never authored the training data the way extraction does, and they never accumulate the volume of real first-person voice that daily use generates. Nobody can compile your twin but you, because nobody else is sitting on your substrate — and the substrate cannot be back-filled. It only accrues by living the practice.

## two versions — a floor anyone can publish, a ceiling for the trusted

There are exactly two honest ways to put you into a model, and each is better at half the job. Your twin uses both.

- **The weights version — the public floor.** Your voice and reflexes are baked irreversibly into a small open-model adapter. Privacy-safe by construction: at query time only the weights and the question exist — your raw constitution is *nowhere in the request*, so a stranger cannot prompt it into leaking your private thoughts. Cheap to serve, always on. This is what strangers get. This is the version anyone can publish.
- **The context version — the trusted ceiling.** Your constitution handed to a frontier model at query time. Higher fidelity, instantly updatable the moment you change your mind — but it needs your substrate in the prompt to answer, so it only fires for *you* and for queriers you trust to see it. This is the version for your own thinking, and for the people you let close.

A router picks by trust: stranger → weights only; you or someone trusted → generate both and keep the better answer. The privacy-safe floor is always there; the ceiling only fires where exposure is allowed. You never have to choose between "share nothing" and "expose everything."

## the honest bar

A twin is only as faithful as the substrate it compiles from — that is the whole point, and the one honest caveat. It needs *enough of your writing*: a thin corpus makes a thin twin, and a mid twin attached to your real name is worse than no twin. Voice is statistical — it's learned from the *volume* of your real words, so the twin sounds like you only once you've generated enough of them.

The good news is the direction of travel: **fidelity rises as you use Alexandria.** Every session, every memo, every developed position raises the ceiling — automatically, for free, as a side effect of thinking with the engine. You don't grind for a better twin. You just keep using the practice, and the twin keeps getting more you. And it never ships without your sign-off: you read the answers, you decide it's you, you publish. Consent is an act you take, never a default.

## the path — one command, your own agent

You don't need a lab. Your own agent runs the whole compile — `plm.md` is the module it follows.

- Point your agent at the `plm` module and say: *compile my twin.*
- It inventories every first-person corpus you have, runs the weighted training pass on rented open-model infrastructure, grades the result against a calibrated bar, and hands you a sheet of answers to sign off.
- The whole thing costs single-digit dollars and finishes in a day, not a wait on anyone.
- You get an adapter file you own — portable, revocable, deletable — and, on your say-so, a queryable twin on your Library page.

It recompiles from scratch whenever a better base model ships or your substrate meaningfully grows. The weights are disposable; the compounding was always in the substrate, which is yours.

## what you actually get

A Library was a shelf of things people wrote. Your twin turns your page into something no shelf can hold: **a mind that answers.** Ask it, and years of your compressed thinking replies in your own voice — a version of you that scales past your attention and outlives your lifespan, on your terms, behind your gate.

That is the living library. Not books about minds. Minds. Yours is one command away, and the only person who can make it is you.

---

*Next: hand your agent the `plm` module and say "compile my twin." The how lives in `plm.md`.*
