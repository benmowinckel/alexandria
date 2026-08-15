# The PLM

*Dormant unless the Author directly asks to compile a personal model. The private ai never proposes compilation, account connection, or publication from private corpus growth. Nothing here grants consent to send training data or model weights anywhere.*

*One optional module for an Author's stand: compiling or connecting a queryable language model that thinks like them. It is Benjamin's reference implementation, not Library architecture. The Author may use another model, endpoint, compile method, or no PLM at all. This file is craft observation: what this implementation optimises for and the hard-won corrections that make it land instead of producing a broken twin. How to run each stage is an intelligence decision — the Author's own harness agent is the intelligence; the infra named here is today's rideable option, not a fixture.*

## Ownership before inference

Alexandria provides the aggregation area and permission broker, not the model. The Author chooses the provider, model, endpoint, and payment account. A stand can remove this module without changing its profile, publications, grants, or address.

Every non-founder Author runs inference on a model account and token they control. Their sidecar registers only its URL plus a separate bearer secret with the Library; the model-provider token and private source files never enter Alexandria's Worker. Registration explicitly acknowledges `own_account: true`. If the connection is missing, malformed, or not author-owned, the mirror is offline. It never falls back to the company's checkpoint, model, sidecar, or token.

The founder's deployment may use the founder compatibility defaults. That exception is bound to the configured founder login before model resolution and sidecar lookup; it cannot spill into another Author's account. Reading shadows and published work never requires inference and keeps working when the sidecar is off.

## Serve-time boundary — Library is the whole context authority

The compile pipeline below may use private sources only after the Author directly asks to compile. Serving is a different boundary: a context PLM never mounts the Constitution, vault, voice files, project tree, or any other local source.

The Author configures an exact list of Library scopes for that PLM. For each query the Worker computes **configured PLM scopes ∩ current reader access ∩ active artifact access**, then adds only the bounded current visitor conversation. The browser sends an artifact reference, never bytes. Every artifact byte comes through the canonical Library read gate. `public`, `authors`, `invite`, and `paid` are the four permission prefixes; nested cohorts such as `invite/friends` are exact identities with no parent, sibling, or future-child inheritance.

There is no second hidden prompt or context field. The Worker supplies only a fixed identity instruction derived from the public profile; custom Author material must be an approved Library artifact inside an exact selected scope.

The sidecar receives that request-scoped slice and its manifest hash. Profile links are routing references only and are never crawled. Live web is off whenever Author context is loaded. Alexandria's reference macOS runner uses a deny-by-default process sandbox that allows its runtime, model cache, network, and public product-guide assets while denying reads and directory enumeration under `~/alexandria`. A custom sidecar granted wider computer access is outside Alexandria's structural boundary and must be sandboxed equivalently to make the same claim. The owner-only `GET /library/{author}/twin/context-preview` calls the same broker and returns the exact scopes, documents, manifest, and hash the provider would receive.

This is structural up to the honest cap: the model provider necessarily sees the exact authorized slice sent for inference. The system controls what enters the request; it cannot control what a provider does after legitimately receiving that slice. Choose a provider you trust for the material placed in those scopes.

**Primary:** Creation (a Library artifact). **Secondary:** Development.

The twin is a **downstream artifact**, not a preserved asset. Per Alexandria's ground-truth architecture, downstream artifacts are *regenerated from ground truth, never hand-maintained* — and the twin is exactly that: compiled from the Author's positions (the Constitution) and their voice (all of their first-person text), then recompiled from scratch each base-model generation. The weights are disposable. The compounding was always in the substrate. What the Author owns and keeps is not the model — it is the corpora it compiles from, plus the exported adapter file, which they can port, revoke, or delete at will.

**Two halves, both product exhaust.** The Constitution carries *what the Author believes* — status-assigned, contradiction-resolved positions. The Author's accumulated first-person text carries *how the Author actually talks* — their verbatim words, produced automatically every time they use the product. Weights carry voice; context carries positions; the twin needs both, and both fall out of using Alexandria for free. This is the moat made literal: a passive-capture competitor that only observes produces a measurably worse twin, because observation never elicits the Author's choices, corrections, contested transitions, and accumulated first-person voice through the practice.

## "Be the Author" is four problems, not one

The first thing to get right, because it governs every stage below: *sounding like the Author* decomposes into four separable capabilities, each learned differently. Collapsing them into one training target is how the early twin failed.

- **Voice** — the register: word choice, rhythm, sentence shape, the reflexes of how they phrase things. Voice is a **statistical style**, learned from the *volume* of the Author's raw words. It lives in the weights. Starve the volume and the twin never sounds like them, no matter how good the positions are.
- **Positions** — the specific things they believe about specific topics. Learned from context (the Constitution handed at query time) or from many worked Q&A examples. Facts about their mind, not the shape of their speech.
- **Judgment** — how they reason about a **novel** question they've never addressed. This is the generative engine and the hardest of the four: not recalling a stored position but *applying the Author's frame* to new ground. Taught only by many examples of them doing exactly that — the frame in motion on unseen situations.
- **Biographical facts** — where they went to school, who their family is, what they've built. These must be **pinned exactly** or the model confabulates them — a fine-tuned model will smoothly invent a plausible-but-wrong biography. Facts are a retrieval problem, not a style problem; treat them as such (context-pinned, never left to the weights to guess).

Voice and judgment want weights. Positions and facts want context. That split is the reason "sound like me" is not one training target — and it is the reason for the two-lever tradeoff next.

## Two levers, honest tradeoff

There are exactly two places to put the Author into a model, and each is genuinely better at half the job. This is fundamental, not a bug to engineer away.

- **Context / RAG** — hand the model deliberately published Library artifacts at query time. Great at **positions and facts**: instant and live-updatable. At compile time a teacher may receive private context only under the separate explicit compile consent above. At serve time the context PLM receives only the exact brokered Library intersection; any approved text artifact can contribute, not only a shadow. A total prompt-injection win is therefore bounded to the exact published slice that reader was already allowed to receive.
- **Weights / fine-tuning** — bake the Author into an adapter. Great at **voice and reflexes**: the register comes for free on every answer, cheap at serving scale (one query, no giant prefix). But the weights are **frozen** at compile time, and they can only bake in what was *well-represented in the training data* — thin coverage of a topic means the weights learned nothing there.

The optimal twin can use both, matched to their strengths: **weights carry the voice; the exact Library view carries live positions and facts.** The compile below trains the voice into the adapter while the permission broker keeps serve-time context current and bounded.

## Application-shaped, never recitation-shaped

The lesson that cost the most, and it still governs the position half. Fine-tuning a model on the *text* of a constitution (continued pretraining on the prose) memorises phrasing and changes no behaviour — the founder's historical null result, run four ways, all zero-delta. The twin must learn to *apply* the Author's frame to situations it has never seen, not recite the frame back. Every position pair is a judgment, a reaction, a real reply — the Author's machinery in motion — never a paraphrase of their documented views. (This is the *judgment* capability from above, made into data.)

## Prerequisites

- **Every first-person corpus inventoried — and all of it used.** This is the single biggest correction in the record: the early twin trained on a *fraction* of the available voice data, and it never sounded like the Author. Voice is learned from volume; starve the volume and the twin is generic. So before compiling, inventory *every* first-person source the Author has:
  - **Voice-memo / dictation transcripts** — often the **largest and richest** voice source, because it is the Author talking freely and at length. Frequently overlooked because it lives outside the session directory. Do not.
  - **Session transcripts** — the Author's verbatim replies in their harness sessions (dialogue layer only; their text and the agent's text, no tool calls or results).
  - **Long-form writing** — essays, drafts, published works, anything they authored.
  - **The Constitution** — positions, and a secondary voice source.

  The voice half of training must draw on **all** of it. Each source is sovereign — it lives in the Author's vault, not stranded in a harness directory a tool-switch orphans. Two hard rules at capture time, structural and enforced before anything lands: **firewall** — any material from a walled-off context (another company the Author keeps separate, per their own canon) is dropped whole; and **credential redaction** — key-shaped strings are scrubbed before the vault sees them, because the vault syncs to cloud storage.
- **A Constitution derivative.** The position half needs a compiled Constitution to hand the teacher as privileged context. A full derivative works; a compressed *digest* (positions preserved, prose fat gone) is the better default — it cuts teacher prefill cost materially with no fidelity loss (see cost envelope).

## The pipeline

The method is **weighted multi-source SFT in a single run.** Not continued-pretraining-then-SFT — that ordering is the corrected mistake (see stage 3). Voice sources and position sources are mixed into *one* supervised fine-tuning run, with the voice sources weighted up, so the twin learns voice **in the act of answering** rather than voice in a vacuum. Each stage carries the concrete lesson that makes it work.

### 1. Data — weighted multi-source, one shape

Assemble the training set from every first-person source (voice) plus teacher-generated position pairs (positions), all rendered to the same chat shape, and **weight the mix**.

**Voice rows (from all first-person corpora).** Role-flip the Author's own text into chat turns: a short synthetic or real user turn, then the Author's *verbatim* words as the assistant turn. Session dialogue role-flips directly (user turn = tail of what the agent said, assistant turn = the Author's real reply). Dictation transcripts, long-form writing, and standalone utterances are windowed and given a light synthetic prompt so the Author's words are always the assistant turn. These are the highest-fidelity rows in the set — they are literally the Author — and they need no content filter, only the usability gates (drop pasted code, images, redaction-bearing replies, one-word acknowledgements). The point of pulling from *every* corpus is raw volume: voice is statistical, and more of the Author's real words is the lever that makes the twin sound like them.

**Position rows (teacher-generated).** The strongest **frontier** model available (Claude today), held to the Author's frame, generates in-voice answers to a broad prompt corpus *as the Author*. **The teacher must be frontier — not a big open model picked because it is co-located with the training infra. This is the single most important correction in the record.** Teacher quality is the twin's hard ceiling: you cannot distill quality the teacher does not have. The decisive evidence, identical pipeline and identical calibrated judge: an open teacher (a 397B-class model) scored **4/20** blind sign-off and the twin distilled from it also **4/20**; swap in a frontier teacher on the same questions and it scored **16/20** (~human self-consistency). The whole ceiling was teacher choice. Note the deliberate asymmetry with the **student**, which correctly *stays* open (a Qwen3-class MoE, see stage 3): the open model is the cheap-to-serve vessel the frontier teacher's fidelity is compressed *into*, never the source of that fidelity. The teacher is **privileged**: its system prompt holds the Constitution (or digest) plus a voice profile of the Author's real utterances; it is instructed to *apply* the constitution, never recite it, and to match register to the question (a casual question gets a terse texted answer, a substantive one gets a plain lead then depth). The corpus is deliberately diverse and application-shaped — roughly: in-distribution position questions, concrete judgment scenarios that force the frame onto *new* situations, and a large out-of-distribution slice (casual opinions, self-knowledge, meta) so the twin learns to extrapolate the Author rather than parrot the covered topics. The teacher's answers become the training rows — but the **student-visible row carries only a short identity system line** (`You are <Author>. Speak as yourself.`), not the constitution. The student learns to behave *as if the constitution were in context*. This is prompt/context distillation: the privileged teacher's positional fidelity is compressed into the student's weights, with zero Author time spent.

The asymmetry is the whole trick, and it is why the founder's earlier self-distillation attempts collapsed: **the teacher must hold information the student never sees.** A judge or teacher that is the same model as the policy, with the same context, can inject no new signal. Constitution-in-context teacher → no-context student is the gradient.

**The mix — weight voice up.** A starting default of roughly **60–65% voice rows / 35–40% position rows** by training weight. Voice is weighted up because it is the harder statistical target and the thing the early twin lacked; positions ride along and are topped up by the exact brokered Library view at query time. This balance is a **default, not sacred** — it moves with how much real voice data the Author has and how position-dense their corpus is. Tune it against the sign-off eval, never against loss.

### 2. Hygiene gates

Cheap, mechanical, run before training. Skipping them trains the twin to perform its own analysis out loud.

- **Dedupe by question hash.** Same question, one row.
- **Drop thinking-leak and document-speak artifacts.** Reject any answer that contains the tells of a model narrating its process or describing the knowledge base rather than speaking as the Author: strings like *thinking process*, *voice check*, *register:*, *verdict:*, *as [the Author's name]*, *constitution*, *analyze the*, or answers that open like a document (`1.`, `Here's`, `**`). These are contamination from thinking-enabled generation (see stage 3) and from the teacher slipping into meta-commentary.
- **Hard exclusions (the same firewall as capture, re-enforced).** No knowledge belonging to another company or context the Author walls off. No credentials, keys, or security-operational detail. No private facts about third parties beyond the Author's own stated positions and relationships. If the Author's constitution diverges from consensus, the pairs diverge too — never smuggle a training-distribution default in where the Author is contrarian.

### 3. Train — weighted SFT in one run on an open MoE base

Rented, cheap, boring on purpose. LoRA supervised fine-tuning on a mid-size open mixture-of-experts base (a Qwen3-class 35B-A3B model today, via a hosted fine-tuning API such as Tinker). Working parameters from the proven run: **rank 32, learning rate 2e-4 on a linear schedule, 2 epochs, train on ALL_ASSISTANT_MESSAGES, max sequence length 8192.** Strong defaults, not sacred — the base is open-weight precisely so no lab owns the Author's twin.

**One run, not two — no continued pretraining first.** The corrected method. The intuitive move is to continue-pretrain (CPT) the base on the Author's raw monologues to soak up voice, then SFT on Q&A for behaviour. **Do not.** Pure CPT on raw first-person text **degrades instruction-following**: the model learns to ramble regardless of the question, and recovering the lost instruction-following needs a distillation repair pass — documented in Thinking Machines' own personalization research, where CPT dropped instruction-following and had to be clawed back. The optimal is the single weighted SFT run of stage 1: voice sources and position sources mixed together, voice weighted up, so the twin acquires the register **while answering a question**, never in a vacuum. Voice in the act of answering is the whole point of the one-run design.

**DISABLE THINKING at the renderer, everywhere — teacher generation, twin inference, and the judge.** The single most expensive lesson in the record. Hidden reasoning tokens burned ~60% of the first teacher run's budget (and truncated batches, losing later answers that were then re-paid on retry). Worse, the default chat template's reasoning prefill trained a twin that **dumped its reasoning as its visible answer** — the twin performed its analysis out loud instead of just answering. Every renderer in the pipeline uses the thinking-disabled variant. No exceptions.

### 4. Judge — calibrated, positive-controlled

The judge is a big model with the Constitution in context, scoring twin answers two ways: **pairwise** ("which of these is more faithfully the Author?") and **absolute** ("would the Author sign this as their own words?"). The absolute sign-off is the real bar; pairwise is a noisy calibration signal.

**The judge must be positive-controlled on the Author's own decontaminated verbatim words** — the lesson that saves the whole eval from lying to you. A naive "be a harsh judge" prompt caricatures: a constitution-and-voice-primed judge **rejected 9 of 10 of the founder's own real utterances** for not matching his *most stylised* register ("he'd never say lol" — he says lol constantly). A judge that rejects the Author's actual words is measuring an idealised fiction, not the Author. Calibrate the bar to **"plausibly them on a normal day," not "peak them"** — real people do not pass their own idealised filter, and the authentic range is wide (terse typed register *and* rambling dictated register both count). Feed it a held-out sample of the Author's real replies as a positive control; if it rejects those, recalibrate before trusting any twin verdict. When calibrated well it signs the Author's real words, rejects obvious fakes, and reaches human self-consistency-class pairwise agreement (~78% against ~82% human).

**Parse the verdict from the last line only.** Models echo the instruction (with both options named) inside their reasoning; matching the verdict token anywhere in the text catches the echo, not the decision. Force the judge to end with `FINAL: <verdict>` and read only that.

### 5. Eval gate — absolute sign-off, Author grades once

The ship decision. Fresh held-out questions (never in training), the twin answered against the context-privileged teacher as the ceiling.

- **LOSS IS NOT AN EVAL.** State it loudly, because getting this wrong cost trust. Training loss measures how well the model fit the *training text* — it can be low while the twin is useless on new questions, or low precisely *because* the training data was thin and easy to memorise. A falling loss curve tells you the run converged, nothing about whether the twin sounds like the Author. The **only** quality number is the **blind sign-off rate on held-out questions**: would the Author sign this as their own words. Never report loss as a result; never let a good loss number substitute for reading the answers.
- **Absolute sign-off per answer, never forced choice.** The founder's own instrument mistake, called out by him: forced-choice blind grading ("which is more them?") measures *least-bad*, not *good* — pick the better of two mediocre answers and you learn nothing about whether either is shippable. Grade each answer on its own: *would the Author sign this, yes or no.*
- **A sense-check gate that refuses any degenerate sheet.** Before the Author ever sees the sheet, an automatic gate rejects it if any arm contains chain-of-thought dumps, document-speak, empty or runaway answers, or the thinking-leak tells from stage 2. Two sheets once shipped to the founder unread with one arm full of reasoning dumps — the recurring failure was *verifying the pipeline ran* instead of *reading the artifact*. The gate makes reading the artifact structural.
- **The Author grades only the final, gated sheet**, and their sign-off is the only ship trigger. The twin publishes **behind the Author's gate**, in addition to their shadow, labelled as a twin — never as the Author themselves. A mediocre twin is worse than no twin (uncanny mediocrity attached to a real name cheapens the whole Library), so the fidelity gate plus Author consent is the floor, not a nicety.

## Cost envelope

Roughly **$5–20 per compile** at 2026 rented-infra prices — a test the Author runs themselves, not a wait on anyone. The teacher generation dominates, and two moves keep it cheap: **batch multiple questions per teacher call** (4 questions amortises the constitution system-prefix ~4×, the single largest lever), and **hand the teacher a compressed constitution digest** rather than the full derivative (cuts prefill ~40% with positions preserved). The **frontier** teacher's constitution prefix re-sent on every call is the cost centre; amortise it with the two moves above — batch multiple questions per call, hand it a digest not the full derivative — and the whole compile lands in single-digit-to-low-double-digit dollars. Serving is cheaper still: one shared open base with the Author's adapter hot-loaded, marginal cost per additional mind ≈ adapter storage. (Weights being cheap at serving scale is exactly the lever from § Two levers — the frozen adapter carries voice for free per query, while live positions come from the exact brokered Library view.)

## The compounding loop

**Fidelity rises by using Alexandria.** Every session, every dictated memo, every published draft is exhaust that becomes voice data; the Constitution sharpens every time the Author develops it. The twin's fidelity ceiling *is* the substrate's fidelity, which converts the substrate moat into a visible, measurable product difference: better substrate → measurably better twin, now.

**The limiting factor is authentic first-person data *volume*, not training technique.** The mechanism is solved enough — the corrections in this file are the mechanism. What separates a thin twin from a faithful one is how much real position-and-voice text the Author has generated, which is precisely what the product accumulates by existing. This is why stage 1's inventory-everything rule is load-bearing: the technique is fixed, the volume is the variable, and the volume is what using the practice produces. The product *is* the training pipeline.

**Recompile cadence: a new base model, or meaningfully grown substrate.** Nothing else. The weights are regenerated from ground truth on each trigger, exactly as the ground-truth architecture prescribes for every downstream artifact — the founder demonstrated this mid-pilot when the chosen base was retired hours before the run and the compile moved to its successor with a one-line change.

## Sovereignty

- **Open-weight base** → no lab lock-in on the Author's own mind.
- **Author-owned inference account** → the Author chooses and pays the model provider directly. Alexandria is the router, not the token owner; disconnecting the sidecar stops inference without touching the Author's files or adapter.
- **Exportable adapter** → the trained twin is a file in the Author's storage: portable, revocable, deletable. A new canon file type, held under the same publish/unpublish/revoke model as any Library artifact.
- **Querying the twin is the paid act.** Reading a shadow stays free (the reader's own engine processes it locally, no inference). A twin query is live inference — a new cost surface priced into the paid Library tier with margin. The floor/ceiling revenue architecture does not move.
- **The twin ships only behind the Author's publish gate**, labelled as a twin, in addition to their shadow — never silently, never as the Author. Consent is captured the same way every Library publish is: an explicit act the Author takes, never a default.

## The ship gate — the ordering is structural, not preference

The two twins do **not** ship at the same time, and which goes first is forced by their privacy shape, not by taste.

1. **The context twin may ship first with only `public` configured.** Its blast radius is then exactly the public files already approved for anyone to read. Adding `authors`, `invite/...`, or `paid/...` is a separate exact-scope decision; the reader still needs live access to that same scope. The outer twin visibility may narrow who can ask but can never widen the context intersection.
2. **The public WEIGHTS twin ships only AFTER a canary extraction eval passes.** The weights twin is the stranger-facing floor, and its whole safety claim is that the substrate is baked irreversibly into the adapter — nowhere in the request at query time. That claim has to be *proven*, because **substrate baked into weights cannot be un-baked**: plant a held-out probe of secrets, firewalled other-company terms, and third-party-private names, then interrogate the trained weights for every one of them. **The weights must return ZERO on all of them.** A single leak fails the gate — you cannot retrain the leak out of a shipped adapter, so this is the one hard gate before any stranger-facing publish. Below the canary bar, the weights twin does not go public, full stop.
