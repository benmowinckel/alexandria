'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
// The landing stylesheet — extracted from this file's former inline
// <style> tags so it head-loads render-blocking (no unstyled first
// paint on chunked HTML). See landing.css header for the story.
import './landing.css';

interface Props {
  brandClassName?: string;
}

/*
 * Structurally a carbon copy of fleetai.com. Only the words change.
 *
 * Layer stack (fixed position, peel-scroll like Fleet):
 *   1. .nav                 — fixed top over everything
 *   2. .top-slide           — fixed hero (cream bg, H1, orb cluster, prose card)
 *   3. .bottom-slide        — fixed colophon, revealed as top peels up
 *   4. .runway              — 200vh spacer so scroll drives the peel
 *
 * Bottom slide rotates: background color, ornamental mark, text polarity.
 */

/*
 * Theme variants for the bottom slide. Each theme pairs a generated
 * ornamental "a." image with the exact page background it was produced on,
 * so the image blends seamlessly into the slide. Foreground colors are
 * tuned so nav / wordmark / dict stay readable.
 */
type Theme = {
  id: string;
  image: string;
  bg: string;
  fg: string;
  fgMuted: string;
  fgFaint: string;
  borderSoft: string;
};

/*
 * Palette coordination: for each variant, fg pulls from the ornament's
 * dominant pigment (deep wax blue, mosaic navy, terracotta umber, jade
 * forest, muscle rose, etc.) rather than generic ink. Muted + faint are
 * softer descendants of the same family. This makes the wordmark and dict
 * read as part of the same artifact rather than text pasted on top.
 */
// Order matches `~/alexandria-inc/public/brand/ornament 1-9.png` — the curated
// sequence the founder set. Bottom-slide cycles through these in order, looping.
const THEMES: Theme[] = [
  {
    // 1. Blue wax seal on paper — pull deep navy from the wax into the text.
    id: 'wax-circle',
    image: '/ornaments/wax-circle.png',
    bg: '#f7f2ec',
    fg: '#0e1a4c',
    fgMuted: '#4a5080',
    fgFaint: '#8288a8',
    borderSoft: 'rgba(14,26,76,0.18)',
  },
  {
    // 2. Other stone — carved limestone relief with acanthus scrollwork.
    // PNG has two depth levels: outer raised stone border + inner recessed
    // cavity with carved relief. bg matches the outer border color so it
    // extends infinitely as the page surface; the inner cavity reads as
    // chiseled into the page.
    id: 'other-stone',
    image: '/ornaments/other-stone-v3.png',
    bg: '#ded7d0',
    fg: '#2a2620',
    fgMuted: '#5e564a',
    fgFaint: '#8a8276',
    borderSoft: 'rgba(42,38,32,0.20)',
  },
  {
    // 3. Light stone — Egyptian stelae, gilded gold "a." raised relief.
    id: 'light-stone',
    image: '/ornaments/light-stone.png',
    bg: '#b89a6a',
    fg: '#1c1208',
    fgMuted: '#4a3a26',
    fgFaint: '#8a7a5a',
    borderSoft: 'rgba(28,18,8,0.30)',
  },
  {
    // 4. Egyptian alabaster — carved relief with ibises and lotus.
    id: 'alabaster',
    image: '/ornaments/alabaster.png',
    bg: '#d6c6ac',
    fg: '#3a2a1a',
    fgMuted: '#7a6a50',
    fgFaint: '#a09680',
    borderSoft: 'rgba(58,42,26,0.18)',
  },
  {
    // 5. Greek red-figure terracotta — pottery shard with deep umber painted figures.
    // PNG bg flood-filled to transparency — shard floats on the terracotta page.
    id: 'greek-shard',
    image: '/ornaments/greek-shard.png',
    bg: '#e18558',
    fg: '#2a1008',
    fgMuted: '#6a3020',
    fgFaint: '#964a34',
    borderSoft: 'rgba(42,16,8,0.26)',
  },
  {
    // 6. Leather-tooled medallion — gilded eagle "a." on cream paper.
    // Paper bg + baked-in coin shadow; slide bg matches paper so the coin
    // sits on a continuous parchment surface, no CSS effect needed.
    id: 'leather-coin',
    image: '/ornaments/leather-coin-v3.png',
    bg: '#efe7d2',
    fg: '#3a1f10',
    fgMuted: '#7a4a30',
    fgFaint: '#a8826a',
    borderSoft: 'rgba(58,31,16,0.20)',
  },
  {
    // 7. Portuguese azulejo — ceramic tile mounted on a wall.
    id: 'azulejo',
    image: '/ornaments/azulejo.png',
    bg: '#ede5d8',
    fg: '#1c2c5a',
    fgMuted: '#4a5a82',
    fgFaint: '#828aa4',
    borderSoft: 'rgba(28,44,90,0.20)',
  },
  {
    // 8. Verdigris bronze plaque — mounted on a warm stone wall.
    id: 'bronze-laurel',
    image: '/ornaments/bronze-laurel.png',
    bg: '#c8b89c',
    fg: '#1c2a22',
    fgMuted: '#4a5a4e',
    fgFaint: '#7e8a7e',
    borderSoft: 'rgba(28,42,34,0.20)',
  },
  {
    // 9. Cross-stitch on cobalt — saturated royal blue linen, cream embroidery.
    id: 'cross-stitch',
    image: '/ornaments/cross-stitch.png',
    bg: '#1932a2',
    fg: '#ece5d2',
    fgMuted: '#a8acc4',
    fgFaint: '#7a82a8',
    borderSoft: 'rgba(236,229,210,0.22)',
  },
  {
    // 10. Roman mosaic — navy mosaic tile with transparent corners.
    // bg matches the cream tessera substrate so the tile blends into the page.
    id: 'roman-mosaic',
    image: '/ornaments/roman-mosaic-v2.png',
    bg: '#e1ceab',
    fg: '#1d2a52',
    fgMuted: '#4d5a80',
    fgFaint: '#8088a4',
    borderSoft: 'rgba(29,42,82,0.20)',
  },
];

// The homepage primary action — navigates to /start on every device (the
// action page: open-in-claude-code + copy-command on desktop, shortcut +
// email on mobile). One scalable door — new agents, deep links, and flows
// land on /start without ever touching this button again.
// Label history: "join the tribe" → "try it free" (07-09) → "join the
// tribe" (07-13) → "take it — it's free" (2026-07-15) → "free sample"
// (2026-07-16) → "close your loop" (07-27) → "try it free" (07-28:
// loop labels were opaque on the skim path) → "start your loop"
// (2026-08-02, founder killed "try it free"): the objection is gone —
// the first section lead now defines the loop one inch above the
// button, and the close line directly over it says free + five
// minutes, so the label can name the concept and the beginning.
function HomeInstall() {
  return (
    <div className="cta-block">
      <Link href="/start" className="install-cta">
        start your loop
      </Link>
    </div>
  );
}

// The films — the demo leads until the launch film ships. Its ONE home
// is the back-slide quiet-links foot (founder, 2026-08-02: "remove the
// demo from the front slide and only have it as the footer on the back
// slide" — the 07-27 archway door is gone). Pressing play lifts the film
// into a lightbox (x / Esc / backdrop closes).
const FILMS = [
  {
    src: '/demo-public.mp4',
    label: 'the demo',
  },
];

// The demo now lives at the foot of the back slide (founder, 2026-07-19):
// it's not a perfect demo, so it doesn't belong pinned to the hero as a
// caption on the art — a quiet secondary link in the action zone is the
// honest home. A plain text trigger; the film lifts into the same lightbox.
function DemoFilm({
  className = 'demo-link',
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const film = FILMS[0];
  // Lightbox plumbing — Esc closes, page scroll locks while open. The
  // lock removes the scrollbar, which would shift the whole page left by
  // its width (visible on Windows / mac-with-mouse); compensate with
  // padding so nothing under the dim moves.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const root = document.documentElement;
    const scrollbar = window.innerWidth - root.clientWidth;
    const prevOverflow = root.style.overflow;
    const prevPad = root.style.paddingRight;
    root.style.overflow = 'hidden';
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
    return () => {
      window.removeEventListener('keydown', onKey);
      root.style.overflow = prevOverflow;
      root.style.paddingRight = prevPad;
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        {children ?? <em>watch the demo</em>}
      </button>
      {/* The lightbox portals to <body> — .stage-top is transform-scaled,
          which would make position:fixed resolve against the stage. */}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="film-lightbox" onClick={() => setOpen(false)} role="dialog" aria-label={film.label}>
          <button
            type="button"
            className="film-lightbox-close"
            onClick={() => setOpen(false)}
            aria-label="close"
          >
            &times;
          </button>
          <video
            key={film.src}
            src={film.src}
            controls
            autoPlay
            playsInline
            className="film-lightbox-video"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

export default function LandingPage({ brandClassName = '' }: Props) {
  const [themeIdx, setThemeIdx] = useState(0);
  // ── THE BACK SLIDE — three sections, expand/contract (founder,
  // 2026-07-28: "radically simplify… a super super simple short version
  // of what it is and why its valuable which passes the 30s skim test").
  // The closed state IS the site: three one-line leads a half-attention
  // visitor reads in ~15 seconds — what it is, why it's valuable, how to
  // try it. Bodies are one short paragraph each, opt-in behind a click
  // (click-driven, never hover — the 07-17 hover-boundary cascade; no
  // CSS multicol inside the animated track — the 07-17 WebKit bug).
  // The manifesto tab is cut from the homepage: the letter (nav)
  // carries it. Cut texts preserved in git + truth/website.md.
  // The three beats — rewritten 2026-07-28 from the founder's full
  // dictation ("the preview text needs to be so radically simple that
  // its absurdly easy to get what we are doing"). The move that makes
  // it absurdly easy: anchor on the thing every visitor already knows
  // (ai memory personalisation), then state the delta — 10x better,
  // into files you own. Then his stranger-vs-closest-friend line, then
  // not-software-just-a-prompt + the Strava-shoes frame. Claims in the
  // display face; reasons quieter beneath; reading only the claims
  // delivers the whole argument.
  // THE PITCH — first-principles rebuild (founder, 2026-08-03:
  // "figure out what we want to say, then the section is just the
  // format"). The reader's questions arrive in a fixed order: what
  // is this and what do I get (ONE question — this product's
  // identity IS its effect: your ai, knowing you); what's the
  // catch; why now. Three jobs, three short paragraphs, ~140 words,
  // ALL VISIBLE — the accordion (preview + expanded) was built for
  // a 400-word pitch, and at 140 words there is nothing left to
  // hide, so the mechanism is deleted (labels too: each paragraph's
  // opening words do the label's job). Hierarchy is size + air
  // alone: the movie paragraph leads in the display italic; the
  // catch-dissolver and the push sit quieter beneath. The old
  // separate action-close merged into the third paragraph — one
  // urgency beat, not two. Copy derives from THE CANONICAL
  // RUN-THROUGH (a4, locked) — edit canon first, re-derive here.
  // EXPANSION RESTORED same day (founder: "we should still have the
  // expansion thing just bc it really provides frictionless marginal
  // value") — but inverted from the old accordion: the visible
  // paragraphs carry the COMPLETE pitch, and each opens one
  // bonus-depth paragraph (map/biographer · control/portability ·
  // library/Strava). Depth is never load-bearing.
  // One open at a time; null = all closed (the resting state).
  const [openPitch, setOpenPitch] = useState<string | null>(null);
  // HOVER + CLICK expansion — the July controller rules apply:
  // mousemove-driven (layout shifts under the pointer when a body
  // opens — the 07-17 boundary cascade), 160ms hover-intent, 560ms
  // settle lock, longer dwell before move-away closes. Touch taps
  // toggle via the click handler; coarse pointers skip mousemove.
  const hoverIntent = useRef<{
    id: string | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ id: null, timer: null });
  const settleLock = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const onMove = (e: MouseEvent) => {
      const item = (e.target as Element | null)?.closest?.(
        '.pitch-item',
      ) as HTMLElement | null;
      const id = item?.dataset.pitch ?? null;
      if (Date.now() < settleLock.current) return;
      const intent = hoverIntent.current;
      if (id === intent.id) return;
      if (intent.timer) clearTimeout(intent.timer);
      intent.id = id;
      intent.timer = setTimeout(
        () => {
          settleLock.current = Date.now() + 560;
          setOpenPitch(id);
        },
        id === null ? 420 : 160,
      );
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (hoverIntent.current.timer) clearTimeout(hoverIntent.current.timer);
    };
  }, []);
  // ── Front-slide feature rotation (founder, 2026-07-24: "the front
  // slide be ad rotation / feature rotation things elegantly"; second
  // pass same day: fixed rotation starting on the original hero,
  // smoother fades, hover holds the frame, subtle left/right controls,
  // an elegant it-rotates indicator). Each frame is ONE feature told
  // hook-register (the 07-17 hero-is-the-hook lock governs the frames):
  // a lead + one quiet sub-line. The cycle opens on the brand frame
  // (the locked question → alexandrian) and loops continuously; hover
  // pauses it indefinitely. Copy is canon verbatim where it exists:
  // "a file for how you think" (a4 four-beat ladder), "plugs into /
  // replaces nothing" (dominant-strategy frame), the saved-pile ad
  // concept (a4 2026-07-22), the stranger + switching lines (a4 THE
  // THREE TESTS, 2026-07-23).
  const FRONT_FRAMES: Array<
    { kind: 'feature'; name: string; lead: string; sub: string } | { kind: 'brand' }
  > = [
    // Third pass (founder, 2026-07-24: "it's not really clear what the
    // features are… make the value really clear"): frames are the a4
    // ad portfolio, one concrete named feature per frame, per the
    // THREE TESTS directive ("concretely enumerate/rotate the features
    // on the front slide"). Fourth pass (founder, 2026-07-24 night):
    // + development and one mind, "ensure the sequencing is optimal".
    // The lap after the a. hero runs promise → purpose → mechanics →
    // ubiquity → sovereignty → compatibility → reflection:
    // i personalisation (the locked stranger line — the broadest pain
    // leads), ii development (answering→developing, canon's locked
    // phrase — the deepest claim while attention is highest),
    // iii accretion (the saved-pile ad — extraction-into-you, never
    // summarisation; 400→200, founder: "400 is a bit much"), iv capture
    // (the "a" shortcut; same string as the digest CTA), v one mind
    // (fragmentation — one file every ai reads; sets up vi),
    // vi sovereignty-as-switching-freedom (canon's trapped line + the
    // free/portable/deletable ledger), vii coexistence (the
    // plugs-in-never-converts reassurance), viii the mirror
    // (self-recognition — the emotional close, wrapping back into the
    // hero's question). Each frame stands alone — visitors land
    // mid-cycle. The hero indexes as a. (founder: "so the hero is with
    // a."), now a fixed mark outside the cycle — see FRAME_NUMERALS.
    // Second pass (founder, 2026-07-24 evening): (1) each feature frame
    // carries its NAME as a quiet kicker — lowercase-with-period, the
    // site's section-label hand ("personalisation." not "Personalisation")
    // — so the rotation reads as a features tour, not anonymous slogans;
    // (2) every sub rewritten to the COLD-AD bar: "someone completely
    // randomly just reads it and is like, oh, thats sick, what is that,
    // i want that" — each frame self-contained, the mechanism stated in
    // the frame itself, zero reliance on the other frames (the old
    // capture sub failed this: "the file your ai reads" only lands after
    // you've internalised the system). One persona × one pain per frame
    // (a4, atomic WHAT / fan-shaped WHY); the plugs-in frame keeps its
    // jargon deliberately — its persona IS the CLAUDE.md-keeper.
    { kind: 'brand' },
    // Third pass (founder, 2026-07-24, same evening): "they have to FEEL
    // it" — the subs were still describing the product (spec register:
    // "keeps one file of who you are") when the ad's whole job is the
    // felt after: put the reader inside the moment the value lands.
    // Taste.md Mode 1 applied to conversion copy — evoke, don't tell;
    // the reader IS the content. Each sub is now a moment, not a
    // mechanism: the first message that already knows you / the saved
    // pile becoming things you know / the lost thought coming back
    // exactly when it matters / no one holding you / everything you've
    // built finally pulling together / being knowable. Spec survives
    // only where the spec itself is the feeling (the folder you own).
    {
      kind: 'feature',
      name: 'personalisation.',
      lead: 'Your AI still treats you like a stranger.',
      sub: 'Every conversation starts mid-thought: your AI already knows your work, your taste, and how you think.',
    },
    // Added 2026-07-24 (founder picked it from the brainstorm): the
    // deepest claim, previously only gestured at by the hero. Canon's
    // locked phrase (a4): "its job changes from answering you to
    // developing you — into the best version of yourself."
    {
      kind: 'feature',
      name: 'development.',
      lead: 'Your AI answers you. It should be developing you.',
      sub: 'It remembers where you’re trying to go, pushes your thinking further, and months later you can see how you changed.',
    },
    {
      kind: 'feature',
      name: 'saved posts.',
      lead: 'Saved 200 posts you’ll never read?',
      sub: 'Point your AI at the pile — it reads every one and writes what spoke to you into your own files. The things you saved become things you know.',
    },
    {
      kind: 'feature',
      name: 'capture.',
      lead: 'Your best thoughts die in your notes app.',
      sub: 'One tap from your phone and it’s kept — days later, mid-conversation, your AI brings it back exactly when it matters.',
    },
    // Added 2026-07-24 (founder: "development and mind"): the
    // fragmentation pain — distinct from i (stranger) and vi (trapped).
    // Placed before ownership: one-file-everywhere sets up
    // you-own-the-file.
    {
      kind: 'feature',
      name: 'one mind.',
      lead: 'Claude knows one you. Cursor another. ChatGPT a third.',
      sub: 'One mirror on your machine, shared with the compatible AIs you choose — each can pick up where the last one left off.',
    },
    {
      kind: 'feature',
      name: 'ownership.',
      lead: 'Switching AI shouldn’t mean starting over.',
      sub: 'What they know about you lives in a folder you own — move it to the next great AI in a minute, or delete it outright. No one holds you.',
    },
    {
      kind: 'feature',
      name: 'plugs in.',
      lead: 'Already have a system?',
      sub: 'Keep it all — the CLAUDE.md, the memory files, the vault. The instructions adapt to what you already use and pull it together.',
    },
    // Reframed biography → the mirror (founder, 2026-07-24: "rephrase the
    // biography thing to be the mirror" — same day as "its my mirror not
    // my twin"). The image is canon's own, everywhere: "a living map of
    // your mind — a mirror" (the colophon), "the mirror held up to your
    // thinking" (a4 richness mandate), "the labs build better servants;
    // Alexandria builds a better mirror" (a4). Felt after: self-recognition.
    {
      kind: 'feature',
      name: 'the mirror.',
      lead: 'You’ve never seen your own mind.',
      sub: 'As you use AI, it writes a living mirror of how you think — on your own machine. Read it and recognise yourself, clearer every day.',
    },
  ];
  // The hand (corrected, founder 2026-07-24 night: "when i say rotate
  // through, i mean that it goes to vi vii viii etc… each numeral has
  // to consistently refer to the same thing ofc"): every feature keeps
  // its OWN numeral for good — vi is always vi — and the row is a
  // five-slot WINDOW that slides along the full strip as the live frame
  // advances, so it still reads a.–v at rest and never grows as frames
  // are added. The a. stays a fixed brand mark outside the window
  // (founder: "the a. always stays"). The slide begins when v goes live;
  // the next numeral peeks in through the edge fade (the it-continues
  // cue), and the live numeral never sits inside a faded edge (the
  // window math below guarantees it). Arrows are BACK (founder: "maybe
  // we need to bring the arrows back so they can really steer it") —
  // they were cut as redundant when every numeral was visible; with a
  // window they're how you steer past it, so the cut reversed.
  const FRAME_NUMERALS = [
    'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii',
  ];
  const [frameIdx, setFrameIdx] = useState(0);
  const [frameHold, setFrameHold] = useState(false);
  // The hand stays hidden until the rotation first turns (founder,
  // 2026-08-02: "hide the numerals on the front slide until the first
  // rotation") — the page opens as a pure question; the numerals fade up
  // with the first incoming frame. Reduced-motion users never rotate, so
  // they get the hand immediately (it is their only way to the frames).
  const [numeralsIn, setNumeralsIn] = useState(false);
  const frameCount = FRONT_FRAMES.length;
  const featureCount = frameCount - 1;
  // Five slots visible; each slot advances 34px (26px numeral + 8px gap
  // — fixed-width slots so the strip's translate is pure arithmetic;
  // keep in sync with the .front-numeral-strip CSS).
  const NUMERAL_SLOTS = 5;
  const NUMERAL_ADVANCE = 34;
  const windowMax = Math.max(0, featureCount - NUMERAL_SLOTS);
  const liveFeature = frameIdx - 1; // -1 on the hero
  const windowStart =
    liveFeature < 0
      ? 0
      : Math.min(Math.max(liveFeature - (NUMERAL_SLOTS - 2), 0), windowMax);
  const stepFrame = (d: number) =>
    setFrameIdx((i) => (i + d + frameCount) % frameCount);
  // Touch swipe — left/right through the frames on coarse pointers.
  const frameTouchX = useRef<number | null>(null);
  useEffect(() => {
    // Reduced motion: no auto-rotation — the page rests on the brand
    // frame (index 0), which is exactly the pre-rotation hero. Manual
    // controls still work (and must be visible: reveal the hand now).
    // Read the media query directly: showBreeze is false for one mount
    // tick even for motion users, so keying off it would kill the
    // rotation for everyone.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setNumeralsIn(true);
      return;
    }
    if (frameHold) return;
    // 8000ms per frame, hero included (founder, 2026-07-24: 6000 was "a
    // touch too fast"; a 10s hero dwell was tried the same night and
    // pulled back to a uniform 8s). The dissolve was slowed 2026-08-02
    // ("too abrupt") and now eats ~2.6s, leaving ~5.4s of still read.
    const t = setTimeout(() => setFrameIdx((i) => (i + 1) % frameCount), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameIdx, frameHold]);
  // First turn — auto, swipe, or keyboard — reveals the hand for good.
  useEffect(() => {
    if (frameIdx !== 0) setNumeralsIn(true);
  }, [frameIdx]);
  // Keyboard ← → steps the rotation (vertical arrows keep scrolling the
  // page; horizontal are unclaimed on this layout).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') stepFrame(1);
      else if (e.key === 'ArrowLeft') stepFrame(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A/B variant for the slide-1 centerpiece. URL: ?v=arch | ?v=frame
  // Default (no param) keeps the existing CSS-built window. Read on
  // mount so the data-attribute picks up the correct CSS branch.
  const [centerpieceVariant, setCenterpieceVariant] = useState<string | null>(null);
  // Breeze video — null during SSR (PNG poster carries the scene). On
  // mount the page reads the OS reduced-motion preference and decides:
  // mount the <video> only for users who want motion. Reduced-motion
  // users never download the 923KB MP4 — they get the still PNG and
  // nothing else. Tracks live changes to the OS preference.
  const [showBreeze, setShowBreeze] = useState(false);
  // Mobile (<900px) gets the SQUARE scene assets (see the mobile
  // .top-slide CSS): its own poster + breeze video, matching the CSS
  // background swap. null during SSR — video mounts client-side only.
  const [mobileScene, setMobileScene] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setShowBreeze(!rm.matches);
    sync();
    rm.addEventListener('change', sync);
    const mq = window.matchMedia('(max-width: 899px)');
    const syncScene = () => setMobileScene(mq.matches);
    syncScene();
    mq.addEventListener('change', syncScene);
    return () => {
      rm.removeEventListener('change', sync);
      mq.removeEventListener('change', syncScene);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('v');
    if (v === 'arch' || v === 'frame') setCenterpieceVariant(v);
  }, []);

  // Breeze video — only mounted when motion is allowed (see showBreeze
  // state above), so this effect just handles Safari's autoplay quirk:
  // React doesn't reflect `muted` as an HTML attribute on initial parse,
  // so Safari treats the video as unmuted and shows its click-to-play
  // overlay. Forcing v.muted=true via the ref + explicit .play()
  // satisfies the policy. .is-ready flips on canplay to fade the video
  // in over the PNG poster (hides Veo's softening artifact).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    const tryPlay = () => v.play().catch(() => {});
    const reveal = () => {
      v.classList.add('is-ready');
      tryPlay();
    };
    if (v.readyState >= 3) {
      reveal();
    } else {
      v.addEventListener('canplay', reveal, { once: true });
      v.addEventListener('loadeddata', reveal, { once: true });
    }
    tryPlay();
    return () => {
      v.removeEventListener('canplay', reveal);
      v.removeEventListener('loadeddata', reveal);
    };
    // mobileScene remounts the <video> (key), so re-wire on flip too.
  }, [showBreeze, mobileScene]);

  // bfcache restore fix (founder 2026-07-20: "leave and come back and the
  // arch/ocean is blown up really big… refresh fixes it"). iOS Safari can
  // restore a back-forward-cached page with the scene <video> painted at its
  // native resolution, ignoring object-fit: cover, so it balloons over the
  // frame until a repaint. On pageshow(persisted) — the bfcache-restore
  // signal — re-init the video (reapplies cover sizing) and force a reflow of
  // the top slide so the cover-scaled background recomputes too.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const top = topRef.current;
      if (top) {
        top.style.display = 'none';
        void top.offsetHeight; // reflow — drops the stale layout
        top.style.display = '';
      }
      const v = videoRef.current;
      if (v) {
        v.muted = true;
        v.load();
        v.play().catch(() => {});
      }
      window.dispatchEvent(new Event('resize'));
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // Peel mechanic — top slide translates up as user scrolls; revealing bottom.
  // Disabled on mobile: slides flow naturally, no peel, no fixed positioning.
  // Scroll handler short-circuits on mobile so no DOM writes happen on every
  // scroll event; mode-change handler resets transforms exactly once when
  // crossing the breakpoint.
  useEffect(() => {
    let frame = 0;
    const mq = window.matchMedia('(max-width: 899px)');

    const updatePeel = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const peelDistance = window.innerHeight;
        const sy = window.scrollY;
        // Two-slide structure: top peels in [0, peelDistance], revealing
        // the bottom (colophon) directly. No middle slide, no dwell.
        const y1 = Math.min(sy, peelDistance);
        const progress = y1 / peelDistance;
        document.documentElement.style.setProperty('--peel-progress', String(progress));
        document.documentElement.style.setProperty('--peel-progress-2', String(progress));
        // on-bottom flips once the top slide is past the midpoint. Toggled
        // on mobile too so the nav can switch from transparent (over the
        // painting) to solid (over the back slide) without the desktop
        // peel transform.
        navRef.current?.classList.toggle('on-bottom', progress > 0.5);
        if (mq.matches) return;
        if (topRef.current) {
          topRef.current.style.transform = `translate3d(0, ${-y1}px, 0)`;
        }
      });
    };

    const onModeChange = () => {
      if (mq.matches) {
        if (topRef.current) {
          topRef.current.style.transform = '';
        }
        navRef.current?.classList.remove('on-bottom');
      }
      // Always run so --peel-progress is set on mobile too (used by
      // the nav tagline fade), even at scrollY > 0 on initial mount.
      updatePeel();
    };

    onModeChange();
    window.addEventListener('scroll', updatePeel, { passive: true });
    window.addEventListener('resize', updatePeel);
    mq.addEventListener('change', onModeChange);
    return () => {
      window.removeEventListener('scroll', updatePeel);
      window.removeEventListener('resize', updatePeel);
      mq.removeEventListener('change', onModeChange);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Stage scale — top and bottom slides are pixel-locked canvases,
  // uniformly scaled to the viewport so type and layout never reflow.
  // Top is 1440×900, bottom is 1600×1000 (more content needs more room).
  // Floor at 0.55 so on tiny windows the design clips slightly rather
  // than becoming unreadable. Mobile (<899px) sets .stage-* to
  // display:contents and ignores these vars entirely.
  useEffect(() => {
    const TOP_W = 1440;
    const TOP_H = 900;
    const BOT_W = 1600;
    const BOT_H = 1000;
    const MIN_SCALE = 0.55;
    let frame = 0;
    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const top = Math.max(MIN_SCALE, Math.min(w / TOP_W, h / TOP_H));
        const bot = Math.max(MIN_SCALE, Math.min(w / BOT_W, h / BOT_H));
        document.documentElement.style.setProperty('--stage-scale-top', String(top));
        document.documentElement.style.setProperty('--stage-scale-bottom', String(bot));
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, []);

  // After each full peek at the back slide, advance when the user scrolls
  // *back to the hero* (cross above the peel midpoint). Advancing on the
  // way *down* swapped the theme before the bottom slide was visible, so the
  // first peel never showed ornament 1. Same 50% threshold as `--peel-progress`.
  // `wasOnBack` matches the live scroll position on mount (restore-safe).
  useEffect(() => {
    // Mobile keeps the wax seal as a fixed brand mark — rotation is
    // a desktop-only delight that reads as "look how many themes" on
    // small screens; the founder prefers the wax seal alone there.
    if (window.matchMedia('(max-width: 899px)').matches) return;
    let wasOnBack = window.scrollY > window.innerHeight * 0.5;
    const onScroll = () => {
      const y = window.scrollY;
      const h = window.innerHeight;
      const isOnBack = y > h * 0.5;
      if (!isOnBack && wasOnBack) {
        setThemeIdx((i) => (i + 1) % THEMES.length);
      }
      wasOnBack = isOnBack;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Theme rotation pre-decode — pull only the NEXT ornament into cache
  // on idle, not all 10. Prefetch goes through Next's /_next/image
  // optimizer so the cached response is WebP (≈70% smaller than the
  // raw PNG, and the same URL the Ornament component will request when
  // it actually renders — cache hit). Direct `new Image()` against the
  // raw PNG would bypass the optimizer and waste both the bandwidth
  // and the cache slot. requestIdleCallback so we never compete with
  // the active ornament's load.
  useEffect(() => {
    const next = THEMES[(themeIdx + 1) % THEMES.length];
    const schedule = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(cb);
      else setTimeout(cb, 800);
    };
    schedule(() => {
      // 1080w is the width Next/Image picks for the Ornament's
      // sizes="480px" prop on a 2× retina viewport — matches what the
      // <Image> request will be, so the prefetch primes the right cache
      // entry. Quality 75 matches Next's default.
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'image';
      link.href = `/_next/image?url=${encodeURIComponent(next.image)}&w=1080&q=75`;
      document.head.appendChild(link);
      const cleanup = setTimeout(() => link.remove(), 8000);
      return () => clearTimeout(cleanup);
    });
  }, [themeIdx]);

  const theme = THEMES[themeIdx];

  // Inline CSS-var bag — descendants of a slide inherit these so
  // var(--theme-*) inside resolves to the slide's own theme. Used in
  // slides=3 mode where middle and bottom slides carry different themes
  // simultaneously.
  const themeVars = (t: Theme): CSSProperties => ({
    ['--theme-bg' as string]: t.bg,
    ['--theme-fg' as string]: t.fg,
    ['--theme-fg-muted' as string]: t.fgMuted,
    ['--theme-fg-faint' as string]: t.fgFaint,
    ['--theme-border-soft' as string]: t.borderSoft,
    backgroundColor: t.bg,
    color: t.fg,
  });

  // Push theme palette into CSS variables on :root so the static stylesheet
  // can pick them up via var(...). This avoids re-parsing the entire
  // ~1500-line <style> block on theme change — the previous template-string
  // approach caused a brief paint flicker on the front slide as the user
  // scrolled back up and the next theme advanced.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--theme-bg', theme.bg);
    root.setProperty('--theme-fg', theme.fg);
    root.setProperty('--theme-fg-muted', theme.fgMuted);
    root.setProperty('--theme-fg-faint', theme.fgFaint);
    root.setProperty('--theme-border-soft', theme.borderSoft);
  }, [theme]);
  return (
    <div className="landing-root" data-theme={theme.id} data-centerpiece={centerpieceVariant ?? undefined}>
      {/* ═════ PERSISTENT NAV — fixed over both slides. Colors switch at
             the peel midpoint so it stays readable on top (cream) and on
             any bottom-slide theme. ═════ */}
      <nav className="nav" ref={navRef} aria-label="Primary">
        <div className="nav-inner">
          <div className="nav-brand-block">
            <Link href="/" className={`nav-brand ${brandClassName}`}>
              alexandria<span className="nav-dot">.</span>
            </Link>
            {/* Frontispiece subtitle — small-caps Roman beneath the italic
                wordmark. Classical title-block contrast: italic display,
                roman small-caps Latin motto. The seal, not the explainer —
                the founding paragraph carries "library of human minds". */}
            <span className="nav-subtitle" aria-hidden>mentes aeternae</span>
          </div>
          <div className="nav-links">
            {/* Just the reading now — whitepaper + letter. library ·
                marketplace moved OUT of the nav down to the bottom of the
                back slide (2026-07-13, founder): they're the community's
                places, not for a first-time viewer, so they no longer
                compete for attention at the top. The colophon foot carries
                them on every viewport now. */}
            <span className="nav-group">
              {/* Two reading documents, two registers: the whitepaper is
                  a LABEL (tracked uppercase, wax accent — a document
                  category), the letter is a HAND (italic,
                  underlined — a signature). Same differentiation the
                  demo link used to carry. */}
              <a href="/whitepaper" className="nav-label">whitepaper</a>
              <span className="nav-sep" aria-hidden>·</span>
              <a href="/letter">letter</a>
            </span>
          </div>
        </div>
      </nav>

      <main className="landing-main">
      {/* ═════ TOP SLIDE ═════
           Three blocks. Everything conversion-critical.
             H1    → the tribe pitch (locked public headline, from a4)
             lede  → mechanic + cost in one read
             CTAs  → the action moment
           Form is content: typography does the work. The italic rhythm
           carries the "voice inside your head" register. Whitespace
           is the only ornament. */}
      <div className="top-slide" ref={topRef}>
        {/* Breeze video — the same scene as the PNG background, with
            tree-leaf shadows swaying and a faint shimmer on the sea.
            PNG stays as the .top-slide background so first paint is
            instant; video fades in on top once it can play. Reduced-
            motion users keep the still PNG (video is hidden via media
            query). Single-source pipeline (2026-07-08): the background
            still IS frame zero of this video (extracted, 2K-upscaled),
            and the loop is ping-pong encoded (forward+reverse, boundary
            frames deduped) — so the fade-in cannot jump and the loop
            cannot stutter, by construction. No watermark (the old Veo
            mask is gone with the old renderer). */}
        {showBreeze && (
          <video
            key={mobileScene ? 'm' : 'd'}
            ref={videoRef}
            className="breeze-video"
            poster={mobileScene ? '/sea-arch-mobile.jpg' : '/sea-arch-wide.jpg'}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden
          >
            {/* WebM (VP9) first — Android Chrome and most modern
                browsers pick it. Safari falls through to the H.264
                MP4. preload="metadata" so cellular users don't eat
                the full download until the canplay event drives the
                fade-in. Mobile gets the square scene (key remounts
                the element if the breakpoint flips). */}
            <source src={mobileScene ? '/sea-scene-mobile.webm' : '/sea-scene.webm'} type="video/webm" />
            <source src={mobileScene ? '/sea-scene-mobile.mp4' : '/sea-scene.mp4'} type="video/mp4" />
          </video>
        )}
        {/* Stage canvas — pixel-locked 1440×900 frame uniformly scaled to
            the viewport via --stage-scale-top. Inside this wrapper everything
            is absolute pixels, so type, drop-caps, and corner marks never
            reflow with viewport changes. Mobile (<899px) sets this to
            display:contents so the existing flow layout takes over. */}
        {/* Frontispiece composition — the wall + arch + fresco ARE the
            slide (restored 2026-07-01 after a framed-card detour: the
            painting is the image the launch film re-authors, so it
            stays). The arch is pure scenery again (founder, 2026-08-02:
            "remove the demo from the front slide and only have it as the
            footer on the back slide" — reversing the 07-27 archway door);
            the demo's one home is the back-slide quiet-links foot. */}
        <div className="stage-top">
        {/* The colophon — the front slide signed like a manuscript, the two
            marks bracketing the hero in opposite corners (founder 2026-07-23):
            the maker's name bottom-left, the place + year bottom-right, both in
            the same faded italic hand. "Benjamin a. Mowinckel" keeps caps B + M
            around the lowercase a. — the same a. that closes a session and dots
            the wordmark. A printed book credits its maker in the margins. */}
        <span className="alpha-mark">Benjamin a. Mowinckel</span>
        <span className="omega-mark">san francisco · mmxxvi</span>
        {/* Front-slide opening (2026-07-12, founder-directed): the letter
            begins on the hero — "to the reader" + the calculator hook —
            set low and centred over the scene, quiet serif. It peels up
            with the slide, handing off to the argument on the back
            slide. Positioned in the pixel-locked stage so it scales
            cleanly with the scene. */}
        {/* The why — the frame/hook, on the front slide (2026-07-13,
            founder): the cold visitor meets the argument on arrival, before
            the peel. what / how + the decision live on the back slide. */}
        <div
          className="front-epigraph"
          onMouseEnter={() => setFrameHold(true)}
          onMouseLeave={() => setFrameHold(false)}
          onTouchStart={(e) => {
            frameTouchX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (frameTouchX.current == null) return;
            const dx = e.changedTouches[0].clientX - frameTouchX.current;
            frameTouchX.current = null;
            if (Math.abs(dx) > 44) stepFrame(dx < 0 ? 1 : -1);
          }}
        >
          {/* Feature rotation (2026-07-24) — the frames grid-stack in one
              cell (constant height, zero layout shift; the optical centre
              never moves). Sequenced dissolve: exit, an empty breath,
              then enter (see .front-frame CSS). Hover holds the current
              frame; swipe steps it on touch, ← → on keyboard; the
              numeral row is both the it-rotates indicator and the
              navigation — the site's own roman-numeral hand, not
              carousel dots. Arrows returned 2026-07-24 night with the
              sliding window (no longer redundant: they steer past it). */}
          <div className="front-frames">
            {FRONT_FRAMES.map((f, i) =>
              f.kind === 'brand' ? (
                <div
                  key={i}
                  className={`front-frame${i === frameIdx ? ' is-live' : ''}`}
                  aria-hidden={i !== frameIdx}
                >
                  {/* The brand frame — the locked 07-17 hero, verbatim;
                      the rotation opens here. The answer arrives ~2s after
                      the question (founder, 2026-08-02: "have it reveal our
                      answer … after a couple seconds so it reads as an
                      answer to the question") — see .front-answer's
                      is-live animation. */}
                  <p className="front-lead">When AI can do everything humans can, what do we do?</p>
                  <p className="front-answer">
                    <span className="front-answer-lead">our answer is becoming an</span>
                    <span className="front-answer-nameline"><span className="front-answer-name">alexandrian</span><span className="front-answer-dot">.</span></span>
                  </p>
                </div>
              ) : (
                /* Feature frames are doors (founder, 2026-08-02: the
                   features link came off the back slide; "when you click
                   on the rotation of features on the front slide it takes
                   you there") — the live frame links to /features. Only
                   the live frame is clickable/tabbable; swipe still steps
                   (a >44px swipe suppresses the click). */
                <Link
                  key={i}
                  href="/features"
                  className={`front-frame front-frame-link${i === frameIdx ? ' is-live' : ''}`}
                  aria-hidden={i !== frameIdx}
                  tabIndex={i === frameIdx ? 0 : -1}
                >
                  <p className="front-frame-name">{f.name}</p>
                  <p className="front-lead">{f.lead}</p>
                  <p className="front-frame-sub">{f.sub}</p>
                </Link>
              ),
            )}
          </div>
          <div className={`front-numerals${numeralsIn ? ' is-in' : ''}`} aria-label="Slides">
            <button
              type="button"
              className="front-arrow"
              aria-label="Previous slide"
              onClick={() => stepFrame(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="front-numeral front-numeral-mark"
              aria-label="Slide a."
              aria-current={frameIdx === 0}
              onClick={() => setFrameIdx(0)}
            >
              a.
            </button>
            <div
              className={`front-numeral-window${
                windowStart > 0 ? ' has-before' : ''
              }${windowStart < windowMax ? ' has-after' : ''}`}
            >
              <div
                className="front-numeral-strip"
                style={{
                  transform: `translateX(-${windowStart * NUMERAL_ADVANCE}px)`,
                }}
              >
                {FRONT_FRAMES.slice(1).map((_, f) => (
                  <button
                    key={f}
                    type="button"
                    className={`front-numeral${
                      f === liveFeature ? ' is-live' : ''
                    }`}
                    aria-label={`Slide ${FRAME_NUMERALS[f]}`}
                    aria-current={f === liveFeature}
                    onClick={() => setFrameIdx(f + 1)}
                  >
                    {FRAME_NUMERALS[f]}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="front-arrow"
              aria-label="Next slide"
              onClick={() => stepFrame(1)}
            >
              ›
            </button>
          </div>
        </div>
        <div className="top-inner" />
        </div>
      </div>

      {/* Persistent fresco removed — the scene (wall + arch window) is
          the .top-slide background; nothing extra flows in the layout. */}

      {/* Persistent watermark — sits across both slides like the nav. */}
      <span className="watermark" aria-hidden>
        <em>a.</em>
      </span>



      {/* MIDDLE SLIDE removed — the four argument beats moved to /about
          so the main site is just hero + colophon. Two slides, true
          minimalism. The middleRef stays in case the peel logic still
          references it (gracefully no-ops). */}

      {/* ═════ BOTTOM SLIDE — Fleet colophon, theme rotates ═════ */}
      <section
        className="bottom-slide"
        aria-label="Colophon"
        style={themeVars(theme)}
      >
        <div className="stage-bottom">
        {/* For the designers who view source — a small acknowledgment. */}
        <div
          aria-hidden
          style={{ display: 'none' }}
          dangerouslySetInnerHTML={{
            __html:
              '<!-- with a fleeting thank you to fleetai.com -->',
          }}
        />
        <div className="bottom-inner">
          {/* TWO COLUMNS spanning full vertical height.
                LEFT  : ornament (top, original padding-top preserved)
                        + wordmark/dict (bottom)
                RIGHT : statement (top) + CTAs (bottom)
              The right column has the same width and right-alignment as
              the old right-stack, so the body's left edge is where the
              dagger's left edge was. */}
          <div className="left-col">
            <div className="ornament-wrap">
              <Ornament src={theme.image} id={theme.id} />
            </div>
            <div className="wordmark-block">
              <h2 className="big-word">
                alexandria<span className="big-word-dot">.</span>
                <sup className="big-word-sup">1</sup>
              </h2>
              <p className="phon">/ˌæl.ɪɡˈzæn.dri.ə/</p>
              <p className="dict-line">
                <em>I. n.</em> founded by alexander the great in
                egypt; antiquity&rsquo;s library of all human
                knowledge; destroyed by fire, centuries of thought
                lost forever.
              </p>
              <p className="dict-line">
                <em>II. n.</em> refounded two thousand years
                later; a library not of human knowledge but of
                human minds, written by their authors; this
                time, it cannot burn.
              </p>
            </div>
          </div>

          <div className="right-col">
              <div className="right-lower">
                {/* THE LETTER (2026-07-12 restructure, founder-directed):
                    the hook — "to the reader" + the calculator opening —
                    moved to the FRONT slide (.front-epigraph). Here the
                    whole argument (i–v) scrolls elegantly in one box; the
                    two closing sections (how to start + the door) stay
                    pinned below with the CTAs. Copy consolidated this
                    pass — same ideas and richness, fewer words. Section
                    plates (roman numerals) echo the dictionary block. */}
                {/* The pitch — a manuscript index, not a wall of prose.
                    Each large sentence carries the causal story on its own;
                    the quieter line beneath adds precision. Whitespace
                    separates the four beats, and the chevron alone implies
                    that each one opens. The final before/after is the fifth
                    beat: still literal, but typographically distinct. */}
                <div className="pitch">
                  <section
                    data-pitch="instructions"
                    className={`pitch-item${openPitch === 'instructions' ? ' is-open' : ''}`}
                  >
                    <button
                      type="button"
                      className="pitch-head"
                      aria-expanded={openPitch === 'instructions'}
                      onClick={() =>
                        setOpenPitch(openPitch === 'instructions' ? null : 'instructions')
                      }
                    >
                      <span className="pitch-lead">
                        <span className="pitch-thesis">
                          You start by showing the AI you already use our free
                          instructions.
                        </span>
                        <span className="pitch-detail">
                          Your AI reads them, then decides with you whether and
                          how to change the way it works.
                          <span className="pitch-caret" aria-hidden>›</span>
                        </span>
                      </span>
                    </button>
                    <div className="pitch-body">
                      <div className="pitch-body-inner">
                        <p className="pitch-more">
                          Think of the instructions as a recipe handed to a
                          chef. Your AI is the chef. It reads the purpose and
                          possible steps, then decides with you which parts make
                          sense and how to use them. Alexandria is just the name
                          for this way of working; nothing else is doing the
                          work.
                        </p>
                        <p className="pitch-more">
                          Starting from nothing? The free download gives you
                          the full set of instructions our founder uses.
                          Already have instructions, memory files, notes, or a
                          vault? Keep them. Your AI fits the new instructions
                          around what already works for you.
                        </p>
                      </div>
                    </div>
                  </section>
                  <section
                    data-pitch="mirror"
                    className={`pitch-item${openPitch === 'mirror' ? ' is-open' : ''}`}
                  >
                    <button
                      type="button"
                      className="pitch-head"
                      aria-expanded={openPitch === 'mirror'}
                      onClick={() =>
                        setOpenPitch(openPitch === 'mirror' ? null : 'mirror')
                      }
                    >
                      <span className="pitch-lead">
                        <span className="pitch-thesis">
                          Then your AI starts building a detailed mirror of you
                          in files you own.
                        </span>
                        <span className="pitch-detail">
                          It writes what it learns about you automatically, then
                          reads those files whenever they would help.
                          <span className="pitch-caret" aria-hidden>›</span>
                        </span>
                      </span>
                    </button>
                    <div className="pitch-body">
                      <div className="pitch-body-inner">
                        <p className="pitch-more">
                          These are ordinary text files on your computer, not a
                          profile in our database. They can hold your thoughts,
                          goals, work, taste, decisions, and way of
                          reasoning&mdash;in as much detail as your AI can
                          capture. Open them, edit them, move them, or delete
                          them. They are yours; we never see them.
                        </p>
                        <p className="pitch-more">
                          The same files can follow you from one AI to another,
                          so you do not have to explain yourself again or lose
                          your context when you switch. Most of the writing
                          happens quietly while you work. When something useful
                          exists only in your head, your AI can ask you to think
                          it through and save the result.
                        </p>
                      </div>
                    </div>
                  </section>
                  <section
                    data-pitch="development"
                    className={`pitch-item${openPitch === 'development' ? ' is-open' : ''}`}
                  >
                    <button
                      type="button"
                      className="pitch-head"
                      aria-expanded={openPitch === 'development'}
                      onClick={() =>
                        setOpenPitch(openPitch === 'development' ? null : 'development')
                      }
                    >
                      <span className="pitch-lead">
                        <span className="pitch-thesis">
                          The mirror stops your thinking from disappearing
                          between conversations.
                        </span>
                        <span className="pitch-detail">
                          When a thought matters, your AI can bring it back,
                          develop it with you, and help you act on it.
                          <span className="pitch-caret" aria-hidden>›</span>
                        </span>
                      </span>
                    </button>
                    <div className="pitch-body">
                      <div className="pitch-body-inner">
                        <p className="pitch-more">
                          Without the mirror, a useful thought helps once, then
                          gets buried. The next conversation cannot build on
                          it. With the mirror, each conversation can begin with
                          what you have already learned, what you care about,
                          and where you want to go.
                        </p>
                        <p className="pitch-more">
                          Your AI can bring a thought back, challenge it,
                          connect it to new work, and help you turn it into
                          something real. The thought keeps moving with you
                          instead of ending with the conversation.
                        </p>
                      </div>
                    </div>
                  </section>
                  <section
                    data-pitch="connector"
                    className={`pitch-item${openPitch === 'connector' ? ' is-open' : ''}`}
                  >
                    <button
                      type="button"
                      className="pitch-head"
                      aria-expanded={openPitch === 'connector'}
                      onClick={() =>
                        setOpenPitch(openPitch === 'connector' ? null : 'connector')
                      }
                    >
                      <span className="pitch-lead">
                        <span className="pitch-thesis">
                          That repeating read-and-write cycle is your Alexandria
                          loop.
                        </span>
                        <span className="pitch-detail">
                          The loop is complete on its own. The optional connector
                          joins it to the Alexandria community.
                          <span className="pitch-caret" aria-hidden>›</span>
                        </span>
                      </span>
                    </button>
                    <div className="pitch-body">
                      <div className="pitch-body-inner">
                        <p className="pitch-more">
                          The connector is the only paid part. It joins you to
                          people who value their minds enough to keep thinking.
                          The Library shows what they chose to keep, how they
                          developed it, and what they did because of it. The
                          marketplace lets you use and share useful parts of
                          how their loops work. You choose what to share; your
                          private files stay private.
                        </p>
                      </div>
                    </div>
                  </section>
                  <p className="pitch-coda">
                    <span className="pitch-coda-copy">
                      <span className="pitch-coda-line pitch-coda-loss">
                        Without the loop, important thoughts keep disappearing.
                      </span>
                      <span className="pitch-coda-line pitch-coda-gain">
                        With the loop, your AI saves and develops those thoughts
                        with you.
                      </span>
                    </span>
                  </p>
                </div>

                {/* The turn — the supermarket sequence puts trying before
                    deciding, then names the exact zero-commitment trial. */}
                <div className="pitch-rule" aria-hidden />
                <p className="pitch-close">
                  You try a supermarket sample before deciding whether you want
                  the product.
                  <br />
                  Press the button. Show your AI the instructions. Then decide
                  together.
                </p>

                <div className="cta-pair">
                  <HomeInstall />
                  <div className="cta-block">
                    {/* The ghost CTA — the EXTENDED level's door
                        (2026-07-29): /plainly carries the full
                        run-through with the ask docked beneath. Label
                        "the full story" → "ask us anything" (2026-08-03,
                        founder: the old label hid the interactive ask —
                        you can literally ask anything there; the
                        pronoun seam was accepted 07-29, "leave it").
                        Pairs 3-and-3 with "start your loop". */}
                    <Link href="/plainly" className="lr-cta lr-cta-ghost">
                      ask us anything
                    </Link>
                  </div>
                </div>

              </div>

              {/* The places line — library. marketplace., bottom-pinned in
                  the right column so its baseline lines up with the wordmark/
                  dictionary block at bottom-left (2026-07-13, founder). Out
                  of the nav, carrying the exact prod nav-shelf styling
                  (period marks, 15px medium, spaced). right-col's
                  space-between drops it to the bottom; matching right-lower's
                  752px flex-end box keeps it under the CTAs. */}
              {/* The shelf — two pairs with a hairline divider (founder,
                  2026-07-27): the places, then the doors. This is the
                  demo's ONE home (founder, 2026-08-02 — the archway door
                  removed). The features door also left this shelf the
                  same day: the front rotation itself is the features
                  door now (click any feature frame → /features); the
                  /features page stays live for direct links. */}
              <p className="quiet-links">
                <Link href="/library" className="quiet-link">library<span className="shelf-dot">.</span></Link>
                <Link href="/marketplace" className="quiet-link">marketplace<span className="shelf-dot">.</span></Link>
                <span className="quiet-div" aria-hidden />
                <DemoFilm className="quiet-link quiet-door"><em>watch the demo</em></DemoFilm>
                <Link href="/follow" className="quiet-link quiet-door"><em>show your support</em></Link>
              </p>
          </div>

        </div>
        </div>
      </section>

      {/* Runway gives scroll range for the peel */}
      <div className="runway" aria-hidden />
      </main>

    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ORNAMENT — renders the generated "a." image for the
   active theme. The image's solid background matches the
   slide's `theme.bg`, so it composites seamlessly.
   ════════════════════════════════════════════════════════ */
function Ornament({ src, id }: { src: string; id: string }) {
  // Per-material depth treatment.
  // chisel: inset rim shadow — looks set INTO the page (carved stones, ceramic tiles, fabric panels)
  // raised: drop shadow on the image alpha — looks placed ABOVE the page (irregular pottery, mounted plaques)
  // none: image carries its own shading (wax seal already 3D-rendered with cast shadow)
  // Brand sources have transparent backgrounds around irregular shapes —
  // drop-shadow on the alpha gives true 3D for those.
  // CHISELED applies only to ornaments whose pattern fills the rectangular
  // frame edge-to-edge — for those the inset box-shadow rim reads as the
  // ornament's own border being recessed into the page.
  const CHISELED = new Set(['cross-stitch']);
  // other-stone has the chiseled-into-page depth painted directly into the
  // source PNG (raised outer border + recessed cavity); no CSS effect needed.
  const DEEP_CHISEL = new Set<string>();
  const RAISED = new Set([
    'light-stone',
    'alabaster',
    'greek-shard',
    'roman-mosaic',
    'azulejo',
    'bronze-laurel',
  ]);
  // other-stone uses a slightly stronger chisel rim than the standard CHISELED
  // tiles — it's the carved-into-page hero, deserves more depth.
  const isDeep = DEEP_CHISEL.has(id);
  const isChisel = CHISELED.has(id) || isDeep;
  const isRaised = RAISED.has(id);
  const ORNAMENT_SCALES: Record<string, number> = {
    alabaster: 1.06,
    azulejo: 1.16,
    'bronze-laurel': 1.08,
    'greek-shard': 1.2,
    'light-stone': 1.12,
    'roman-mosaic': 1.04,
  };
  const ORNAMENT_FRAME_SCALES: Record<string, number> = {
    'wax-circle': 1.14,
  };
  const imageScale = ORNAMENT_SCALES[id] ?? 1;
  const frameScale = ORNAMENT_FRAME_SCALES[id] ?? 1;
  // Deep chisel: uniform 4-side cavity rim — slab pressed evenly into the page,
  // not lit from one direction. Plus a touch of directional emphasis on top-left
  // for natural ambient lighting.
  const chiselShadow = isDeep
    ? 'inset 0 0 28px rgba(0, 0, 0, 0.22), inset 6px 7px 16px rgba(0, 0, 0, 0.18)'
    : 'inset 5px 5px 14px rgba(0, 0, 0, 0.22), inset -3px -3px 10px rgba(255, 255, 255, 0.10)';
  return (
    <div
      className="orn"
      aria-hidden
      style={{ transform: `scale(${frameScale})` }}
    >
      <Image
        key={id}
        src={src}
        alt=""
        width={1024}
        height={1024}
        sizes="480px"
        className="orn-img"
        priority
        style={{
          transform: `scale(${imageScale})`,
          ...(isRaised
            ? {
                // Natural directional drop — gentle lift off the page without
                // the halo/diffuse look. Tight blur + small offset reads as a
                // real cast shadow rather than ambient occlusion.
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.18))',
              }
            : {}),
        }}
      />
      {isChisel && (
        <div
          aria-hidden
          className="orn-chisel"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            boxShadow: chiselShadow,
          }}
        />
      )}
    </div>
  );
}
