'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

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
// (2026-07-16, founder): the button names the thing itself, and the sub
// carries his even-slightly-interested test — the pair with the ghost
// CTA covers product-interest and company-interest as parallel doors.
function HomeInstall() {
  return (
    <div className="cta-block">
      <Link href="/start" className="install-cta">
        free sample
      </Link>
      <span className="cta-sub">
        if even slightly interested in the product &mdash; just try it
      </span>
    </div>
  );
}

// The films — front-slide rotation. The demo leads until the launch film
// ships; add entries here and the plate arrows appear automatically.
// The frame at rest is a title card (the fresco crop was tried and cut —
// Creation-of-Adam is borderline cliché across ai/tech now); pressing
// play lifts the film out into a lightbox (x / Esc / backdrop closes).
const FILMS = [
  {
    src: '/demo-public.mp4',
    label: 'the demo',
  },
];

function FrontFilm() {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  // Shared hover — the window hit-area and the caption wake each other
  // (hovering the art inks the caption; hovering the caption cues the art).
  const [hot, setHot] = useState(false);
  const film = FILMS[idx];
  const step = (d: number) => {
    setIdx((idx + d + FILMS.length) % FILMS.length);
    setOpen(false);
  };
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
    <figure className={`film-invite${hot ? ' is-hot' : ''}`} role="group" aria-label="films">
      {/* The window IS the player — an invisible hit-area over the arch
          (same wall-cover geometry as the plate, see CSS) opens the
          lightbox; hovering it raises a quiet play cue in the window and
          inks the caption. The caption returns to the museum whisper: it
          is the label OF the art, not the sole affordance (the ringed
          placard restyle was tried 2026-07-08 and reverted — founder).
          Arrows appear when the rotation has more than one film. */}
      <button
        type="button"
        className="film-window-hit"
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
        aria-label={`play ${film.label}`}
        tabIndex={-1}
      >
        <span className="film-window-cue" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </button>
      {FILMS.length > 1 && (
        <button type="button" className="film-arrow" onClick={() => step(-1)} aria-label="previous film">&larr;</button>
      )}
      <button
        type="button"
        className="film-invite-btn"
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
        aria-label={`play ${film.label}`}
      >
        {/* The title is the centered object; the glyph hangs outside it
            (absolute) so the optical centre is the words, not
            words+glyph — founder caught "the m is the thing in the
            middle". */}
        <em>{film.label}</em>
        <svg className="film-play-glyph" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </button>
      {FILMS.length > 1 && (
        <button type="button" className="film-arrow" onClick={() => step(1)} aria-label="next film">&rarr;</button>
      )}
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
    </figure>
  );
}

export default function LandingPage({ brandClassName = '' }: Props) {
  const [themeIdx, setThemeIdx] = useState(0);
  // Letter scroll cue — "keep reading" sits at the box's bottom over the
  // ghost text; it retires once the reader scrolls the box.
  const [letterCue, setLetterCue] = useState(true);
  // Expandable overviews (accordion — one open at a time — so the fixed
  // back-slide stage can never overflow).
  const [openPillar, setOpenPillar] = useState<string | null>(null);
  // Hover-intent controller — MOUSEMOVE only (layout shifts are silent to
  // it, unlike hover-boundary events), 160ms dwell so transit opens
  // nothing, settle lock through the animation. Touch gets tap-toggle via
  // onClick; desktop click force-opens as a fallback but never closes.
  const focusLockUntil = useRef(0);
  const focusPending = useRef<{ title: string | null; timer: ReturnType<typeof setTimeout> } | null>(null);
  const handleSecsPointer = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    const sec = el.closest?.('.sec');
    const title = sec?.getAttribute('data-sec') ?? null;
    if (title === null && el.closest?.('.secs')) return;
    if (title === openPillar) {
      if (focusPending.current) { clearTimeout(focusPending.current.timer); focusPending.current = null; }
      return;
    }
    if (Date.now() < focusLockUntil.current) return;
    if (focusPending.current?.title === title) return;
    if (focusPending.current) clearTimeout(focusPending.current.timer);
    focusPending.current = {
      title,
      timer: setTimeout(() => {
        focusPending.current = null;
        focusLockUntil.current = Date.now() + 560;
        setOpenPillar(title);
      }, 160),
    };
  };
  // The founder's own text (2026-07-16) — his why/what/how, set verbatim
  // (mechanical cleanup only: typos, punctuation; no word choices touched).
  // Lead = each section's opening line as he wrote it; body = his remaining
  // paragraphs, rendered as paragraphs.
  const SECTIONS = [
    {
      title: 'why',
      lead: 'Cultures must choose to value humans, but humans must choose to value themselves.',
      body: [
        'Human chess is more popular than ever — even though ai plays better — because humans value humans; but only if they can still play.',
        'Let ai think for you, and your mind — like any muscle you don’t use — begins to fade. Technology is a multiplier — it will take you down the path you point it down: continue to let it think for you, and you’ll end up like the humans in Wall-E; align it to think with you, and you can master anything.',
        'Alexandrians are defined by this choice alone.',
      ],
    },
    {
      title: 'what',
      lead: 'We help humans build systems to keep thinking and not lose our minds.',
      body: [
        'Alexandrians choose growth over emptiness — aligning their ai to act as a thought partner. But personal alignment requires personal context: your ai needs to know where you are now to help you get where you want to go.',
        'ai can’t read your mind, but it can read words. Think out loud, and it builds a full mirror of what and how you think.',
        'The founder has made his entire system free to download — anybody can start, if they make the choice for themselves.',
      ],
    },
    {
      title: 'how',
      lead: 'Connect an Alexandria folder to your ai so it knows your thinking and how to use it.',
      body: [
        'A private folder on your own computer holds what and how you think. Dump everything you have into it, and your ai ties it into one unified map of your mind — chatting with you to fill the gaps, surfacing connections you’d never seen, showing you ideas it now knows you’d find interesting, and synthesising what only you know so you can get it out into the world.',
        'The privacy is structural, not a promise: just plain files on your computer, no server behind the tool, nothing sent to us. Any ai can connect — and all of it is free, because it’s your ai and your files.',
        'The community is two coffees a month — Strava, but for the mind: share your system, show what you’ve made, meet the others doing the same. The humans who chose to keep thinking, connected.',
      ],
    },
  ];
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

  const statementBlock = (
    <div className="statement">
      <p>
        <span className="beat-title">The substrate</span>
        alexandria is{' '}
        <em className="em-strong">files on your own computer</em>{' '}
        where you write what you actually think. You add to them &mdash;
        thoughts, decisions, notes &mdash; and AI develops them with
        you in short sessions. The files compound.{' '}
        <em>Your machine. Your files. Your pace.</em>
      </p>
      <p>
        <span className="beat-title">The practice</span>
        Every AI you use pulls from{' '}
        <em className="em-strong">the same files</em>. You stop
        repeating yourself. You stop losing context when you switch
        models.{' '}
        <em>The more you write, the sharper your thinking stays.</em>
      </p>
      <p>
        <span className="beat-title">The community</span>
        <em className="em-strong">Three friends and your membership
        is free.</em>{' '}Share files with friends you choose &mdash;
        both ways, revocable any time. AI stops guessing about the
        people in your life.{' '}
        <em>More authors &rarr; richer AI for everyone.</em>
      </p>
      <p>
        <span className="beat-title">The founding</span>
        Greece had the agora. Rome the forum. America the constitution.
        The original alexandria had the library &mdash; until it
        burned, and centuries of thought were lost.{' '}
        <em className="em-strong">We are building it again</em>, this
        time as a library of human minds.{' '}
        <em>Early members shape what it becomes &mdash; the practice,
        the culture, the people.</em>
      </p>
    </div>
  );

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
            stays). The film plate beneath the arch is the one quiet
            affordance; it lives OUTSIDE the stage because the stage
            scales by min(vw/1440, vh/900) while the wall scales by
            cover — the plate tracks the wall's own geometry instead. */}
        <FrontFilm />
        <div className="stage-top">
        <span className="alpha-mark">san francisco · mmxxvi</span>
        {/* Front-slide opening (2026-07-12, founder-directed): the letter
            begins on the hero — "to the reader" + the calculator hook —
            set low and centred over the scene, quiet serif. It peels up
            with the slide, handing off to the argument on the back
            slide. Positioned in the pixel-locked stage so it scales
            cleanly with the scene. */}
        {/* The why — the frame/hook, on the front slide (2026-07-13,
            founder): the cold visitor meets the argument on arrival, before
            the peel. what / how + the decision live on the back slide. */}
        <div className="front-epigraph">
          {/* The frontispiece plate — the block reads as the opening of a
              letter, not floating lines: a small salutation over a hairline
              anchors the composition (background layer: "what kind of thing
              is this"); the beats below carry the argument (foreground). */}
          {/* The front as two mini-sections (founder, 2026-07-16): a plate
              pair — the question / our answer — so the two halves visibly
              fit together; the answer is the name over its three functions,
              each under a faint mini header. All copy his, verbatim. */}
          {/* Zero apparatus (2026-07-17, zero-inertia derivation): the
              text performs its own structure — the question mark announces
              the question, the founding line announces a list of three,
              and three parallel verb-lines ARE the list. Plates, rules,
              and labels all explained what the words already say, so they
              are gone; hierarchy is size and air alone. */}
          <p className="front-lead">When ai can do everything humans can, what do we do?</p>
          <div className="front-fork">
            <p className="fork-line front-alex">Founded with this question in mind &mdash;<br />our answer comes in three parts.</p>
            <p className="fork-line fork-ans">explain why we must keep thinking &mdash; and how</p>
            <p className="fork-line fork-ans">connect those who, even slightly, agree</p>
            <p className="fork-line fork-ans">provide free tools so anyone can join</p>
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
        <div className="bottom-inner" onMouseMove={handleSecsPointer}>
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
                <em>II. n.</em> its rebuilding; a library of
                human minds, written by their authors so ai
                thinks with them, not for them; this time, it
                cannot burn.
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
                {/* WHY / WHAT / HOW — a small section title (the old
                    letter-plate register) over full-width copy (2026-07-13),
                    flowing with no dividers between them. A lead paragraph
                    shows; a rotating caret reveals the rest. Accordion (one
                    open at a time) keeps the fixed stage bounded. */}
                <div className="secs">
                  {SECTIONS.map((s) => {
                    const isOpen = openPillar === s.title;
                    return (
                      <div
                        key={s.title}
                        data-sec={s.title}
                        className={`sec${isOpen ? ' is-open' : ''}`}
                        onClick={() => {
                          const touch = window.matchMedia('(hover: none)').matches;
                          setOpenPillar(touch ? (isOpen ? null : s.title) : s.title);
                        }}
                      >
                        <button
                          type="button"
                          className="sec-head"
                          aria-expanded={isOpen}
                        >
                          <span className="sec-title">{s.title}</span>
                          <span className="sec-caret" aria-hidden />
                        </button>
                        <p className="sec-lead">{s.lead}</p>
                        <div className="sec-body"><div className="sec-body-inner">{s.body.map((para, i) => <p key={i}>{para}</p>)}</div></div>
                      </div>
                    );
                  })}
                </div>

                {/* The line break — one rule between the sections and the
                    single action beat below. */}
                <div className="secs-rule" aria-hidden />

                {/* The close — the founder's sample paragraph, split into
                    three beats (founder, 2026-07-16: "split up the text
                    under the line so that its maximally engaging"):
                    the frame / the punch / the action. */}
                <div className="action-close">
                  <p className="statement-beat action-beat">
                    <em>See this as a free food sample at the supermarket
                    &mdash; the only reason you&rsquo;d say no is if
                    you&rsquo;re allergic&hellip; reading this far is proof
                    you&rsquo;re not, and have at least enough interest to try.</em>
                  </p>
                  <p className="statement-beat action-beat action-beat-final">
                    <em>Just try it, if you don&rsquo;t like it, bin it
                    &mdash; should be the smallest decision you make all day.</em>
                  </p>
                </div>

                <div className="cta-pair">
                  <HomeInstall />
                  <div className="cta-block">
                    {/* The ghost CTA — the SPECTATOR's button (friends,
                        family, fans of the company), deliberately NOT
                        offered in the close as a middle door for the
                        interested-but-not-ready — the sample decision is
                        binary. Label names the transaction (07-09 field
                        data: "stay close" was unparseable). */}
                    <Link href="/follow" className="lr-cta lr-cta-ghost">
                      show support
                    </Link>
                    <span className="cta-sub">
                      if even slightly interested in the company &mdash; stay updated
                    </span>
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
              <p className="quiet-links">
                <Link href="/library" className="quiet-link">library<span className="shelf-dot">.</span></Link>
                <Link href="/marketplace" className="quiet-link">marketplace<span className="shelf-dot">.</span></Link>
              </p>
          </div>

        </div>
        </div>
      </section>

      {/* Runway gives scroll range for the peel */}
      <div className="runway" aria-hidden />
      </main>

      <style>{`
        /* Initial theme palette — matches THEMES[0] (wax-circle), the first
           theme rendered on every fresh load. The useEffect below pushes
           the active theme's values into these same vars on rotation, so
           the static stylesheet stays static and theme changes don't
           re-parse the CSSOM (which caused a flicker on the front slide). */
        :root {
          --theme-bg: #f7f2ec;
          --theme-fg: #0e1a4c;
          --theme-fg-muted: #4a5080;
          --theme-fg-faint: #8288a8;
          --theme-border-soft: rgba(14, 26, 76, 0.18);
        }

        body {
          background: var(--theme-bg);
          transition: background 400ms ease;
        }

        .landing-root {
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          color: var(--theme-fg);
          -webkit-font-smoothing: antialiased;
        }

        /* Runway provides scroll range for two sequential peels (top →
           middle, then middle → bottom), each a full 100vh, plus a 40vh
           dwell on slide 2 before its peel starts. Total: 100 (peel1)
           Two-slide structure now: 100 (peel) + 100 (viewport) = 200vh.
           (Was 340vh when there was a middle slide between top and bottom.) */
        .runway {
          height: 200vh;
        }

        /* ─── NAV ─── */
        /* Persistent nav — fixed over both slides. Lives above the peel
           animation. Colors default to dark (for the cream top slide);
           flip to the active theme fg when .on-bottom is set via JS
           once peel progress crosses the midpoint. */
        .nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 22px clamp(56px, 8vw, 160px);
          pointer-events: none;
        }
        .nav-inner {
          max-width: 1700px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          pointer-events: auto;
        }
        /* Default = "top" phase (cream slide, dark ink) */
        .nav .nav-brand {
          color: #1a1318;
          transition: color 320ms ease;
        }
        .nav .nav-brand .nav-dot {
          color: #1a1318;
          transition: color 320ms ease;
        }
        .nav-links a {
          color: rgba(26, 19, 24, 0.6);
          transition: color 320ms ease;
        }
        .nav-links a:hover {
          color: #1a1318;
        }
        .nav-links a sup {
          color: rgba(26, 19, 24, 0.38);
          transition: color 320ms ease;
        }
        /* Bottom phase — swap to theme fg once peel crosses midpoint */
        .nav.on-bottom .nav-brand,
        .nav.on-bottom .nav-brand .nav-dot {
          color: var(--theme-fg);
        }
        .nav.on-bottom .nav-links a {
          color: var(--theme-fg-muted);
        }
        .nav.on-bottom .nav-links a:hover {
          color: var(--theme-fg);
        }
        .nav.on-bottom .nav-links a sup {
          color: var(--theme-fg-faint);
        }

        .nav-brand {
          /* Roman wordmark (founder 2026-07-16: "make the top left
             alexandria not in italics") — upright serif; the italic
             voice now belongs to the argument lines, not the mark. */
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: normal;
          font-weight: 500;
          font-size: 32px;
          line-height: 1;
          text-decoration: none;
          letter-spacing: -0.01em;
          display: inline-flex;
          align-items: baseline;
          transition: opacity 200ms ease;
          /* Tap target — Apple HIG ≥ 44pt. Extend the hit-rect via
             vertical padding + negative margin so visual placement
             stays exactly where the design wants it (nav-brand-block
             centers on the wordmark's text height, subtitle is abs
             below). */
          padding: 12px 0;
          margin: -12px 0;
        }
        .nav-brand .nav-dot {
          font-style: normal;
          display: inline-block;
        }
        .nav-brand:hover {
          opacity: 0.72;
        }
        /* Brand block — wordmark + tagline stacked. The block is
           collapsed to the wordmark's height (tagline is absolute
           below) so the nav's center alignment doesn't shift. */
        .nav-brand-block {
          position: relative;
          display: inline-flex;
          flex-direction: column;
          align-items: flex-start;
        }
        /* Frontispiece subtitle — the Latin motto in the italic hand the
           back slide used to carry (nav-subtitle-back, pre-2026-07-08):
           italic lowercase, 13px, gentle tracking — a written line, not
           the tracked small-caps plaque (founder: that back-slide font,
           now on both slides). Only the colour follows the theme. */
        .nav-subtitle {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 6px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-weight: 500;
          font-size: 13px;
          letter-spacing: 0.04em;
          font-feature-settings: "kern" 1;
          color: rgba(26, 19, 24, 0.55);
          line-height: 1;
          white-space: nowrap;
          user-select: none;
          transition: color 320ms ease;
        }
        .nav.on-bottom .nav-subtitle {
          color: var(--theme-fg-faint, rgba(26, 19, 24, 0.45));
        }

        /* Tagline — kept for legacy markup if any. Hidden by default. */
        .nav-tagline {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-weight: 400;
          font-size: 14px;
          line-height: 1;
          letter-spacing: 0.008em;
          color: rgba(26, 19, 24, 0.6);
          white-space: nowrap;
          pointer-events: none;
          user-select: none;
          /* Fade with scroll on both desktop and mobile. --peel-progress
             is set by the scroll handler on every viewport. Multiplier 2
             so the tagline is fully gone by the time the front content
             has scrolled half off. */
          opacity: calc(1 - var(--peel-progress, 0) * 2);
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: clamp(20px, 2.2vw, 40px);
        }
        /* Places (library. marketplace.) — the house mark: lowercase
           roman with the wordmark's terminal period. The places are the
           house's own rooms, so they carry the house's signature; the
           documents keep their voices (wax label, signed hand). Register
           history, all 2026-07-08: italic (the letter's twin) → roman
           ("a little bit boring") → small-caps ("too similar to the
           white paper") → this. The periods punctuate, so the group
           needs no separator dot. */
        .nav-shelf {
          display: inline-flex;
          align-items: center;
          gap: clamp(18px, 1.8vw, 26px);
          padding-right: clamp(16px, 2.2vw, 28px);
          margin-right: clamp(2px, 0.4vw, 6px);
          border-right: 1px solid rgba(26, 19, 24, 0.14);
        }
        .nav.on-bottom .nav-shelf {
          border-right-color: color-mix(in srgb, var(--theme-fg) 18%, transparent);
        }
        .nav-links .nav-shelf-link {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: normal;
          font-weight: 500;
          font-size: 15px;
          letter-spacing: 0.02em;
          text-decoration: none;
          color: rgba(26, 19, 24, 0.62);
          transition: color 180ms ease;
        }
        /* The mark — upright period, a breath tighter to the word than
           the tracking would set it, echoing the brand's nav-dot. */
        .nav-shelf-link .shelf-dot {
          letter-spacing: 0;
          margin-left: 0.02em;
        }
        .nav-links .nav-shelf-link:hover {
          color: #1a1318;
        }
        .nav-shelf-sep {
          margin: 0 clamp(8px, 1vw, 14px);
          color: rgba(26, 19, 24, 0.3);
          font-size: 14px;
        }
        .nav.on-bottom .nav-shelf-sep {
          color: var(--theme-fg-faint);
        }
        .nav.on-bottom .nav-links .nav-shelf-link {
          color: var(--theme-fg-faint);
        }
        .nav.on-bottom .nav-links .nav-shelf-link:hover {
          color: var(--theme-fg);
        }
        .nav-links a {
          font-family: inherit;
          font-size: 16px;
          font-weight: 400;
          text-decoration: none;
          transition: color 180ms ease;
        }
        .nav-links a sup {
          font-size: 0.6em;
          margin-left: 1px;
          font-variant-numeric: lining-nums;
        }
        /* Nav group — pair of links separated by a dot, with optional
           inline icon (e.g. copy). Two groups sit side by side with a
           wider gap between groups than within. */
        .nav-group {
          display: inline-flex;
          align-items: center;
          gap: 18px;
          font-family: inherit;
          font-size: 15px;
          font-weight: 400;
        }
        .nav-group .nav-sep {
          opacity: 0.45;
        }
        .nav-group a {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-weight: 400;
          font-size: 15px;
          letter-spacing: 0.04em;
          color: rgba(26, 19, 24, 0.5);
          text-decoration: underline;
          text-decoration-color: rgba(26, 19, 24, 0.25);
          text-underline-offset: 5px;
          text-decoration-thickness: 1px;
          transition: color 180ms ease, text-decoration-color 180ms ease;
          /* Tap target — extend without shifting visual baseline. Apple
             HIG asks 44pt; this pushes the hit-rect to ~36px which works
             for nav marginalia and avoids layout shift on the same row. */
          display: inline-flex;
          align-items: center;
          padding: 8px 4px;
          margin: -8px -4px;
        }
        .nav-group a:hover {
          color: #1a1318;
          text-decoration-color: rgba(26, 19, 24, 0.6);
        }
        /* whitepaper — uppercase in wax-seal accent. No underline (color +
           letterform carry the link affordance). Reads as a label against
           the italic letter (the hand). Uppercase instead of small-caps
           because the smcp OpenType feature only activates after EB
           Garamond loads, which caused a visible reflow on first paint
           (lowercase fallback → small-caps). Plain uppercase renders
           identically in fallback and webfont, no flicker. */
        .nav-group .nav-label {
          font-style: normal;
          font-feature-settings: "kern" 1;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 11px;
          font-weight: 700;
          color: var(--accent);
          opacity: 0.7;
          text-decoration: none;
        }
        .nav-group .nav-label:hover {
          color: var(--accent-hover);
          opacity: 1;
          text-decoration: none;
        }
        .nav.on-bottom .nav-group .nav-label {
          color: var(--accent);
        }
        .nav.on-bottom .nav-group .nav-label:hover {
          color: var(--accent-hover);
        }
        .nav-copy {
          background: none;
          border: none;
          padding: 4px;
          margin: 0 0 0 -2px;
          cursor: pointer;
          color: rgba(26, 19, 24, 0.55);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 0;
          transition: color 180ms ease, transform 180ms ease;
        }
        .nav-copy:hover {
          color: #1a1318;
          transform: translateY(-1px);
        }
        .nav-copy svg {
          display: block;
        }
        /* Bottom-phase color overrides for the new nav groups */
        .nav.on-bottom .nav-group a {
          color: var(--theme-fg-faint);
          text-decoration-color: var(--theme-border-soft);
        }
        .nav.on-bottom .nav-group a:hover {
          color: var(--theme-fg);
          text-decoration-color: var(--theme-fg-muted);
        }
        .nav.on-bottom .nav-group .nav-sep {
          color: var(--theme-fg-faint);
        }
        .nav.on-bottom .nav-copy {
          color: var(--theme-fg-muted);
        }
        .nav.on-bottom .nav-copy:hover {
          color: var(--theme-fg);
        }
        /* Founder bio in the nav — name and role sit faint as
           positioning context; "call now" is the prominent action,
           italic and underlined to read as the live element.
           Colors set explicitly per phase (top vs on-bottom) so the
           opacity doesn't compound with the default link rgba. */
        .nav-bio {
          font-family: inherit;
          font-size: 15px;
          font-weight: 400;
          letter-spacing: 0.003em;
        }
        /* Top phase — cream slide, dark ink */
        .nav-bio .nav-sep {
          color: rgba(26, 19, 24, 0.35);
          margin: 0 2px;
        }
        .nav-links a.nav-name {
          color: rgba(26, 19, 24, 0.5);
          text-decoration: none;
          transition: color 180ms ease;
        }
        .nav-links a.nav-name:hover {
          color: rgba(26, 19, 24, 0.95);
        }
        .nav-bio .nav-role {
          color: rgba(26, 19, 24, 0.5);
        }
        .nav-links a.nav-call {
          color: rgba(26, 19, 24, 0.95);
          font-style: italic;
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
          letter-spacing: 0.005em;
          margin-left: clamp(18px, 1.6vw, 28px);
          transition: color 180ms ease;
        }
        .nav-links a.nav-call:hover {
          color: rgba(26, 19, 24, 0.7);
        }
        /* Bottom phase — theme background */
        .nav.on-bottom .nav-bio .nav-sep {
          color: var(--theme-fg-faint);
        }
        .nav.on-bottom .nav-links a.nav-name {
          color: var(--theme-fg-muted);
        }
        .nav.on-bottom .nav-links a.nav-name:hover {
          color: var(--theme-fg);
        }
        .nav.on-bottom .nav-bio .nav-role {
          color: var(--theme-fg-muted);
        }
        .nav.on-bottom .nav-links a.nav-call {
          color: var(--theme-fg);
        }
        .nav.on-bottom .nav-links a.nav-call:hover {
          color: var(--theme-fg-muted);
        }

        /* ─── TOP SLIDE (the peel layer) ─── */
        /* Top slide never scrolls — everything fits in the viewport.
           This is the manuscript — paper grain texture, slow ink-drawn
           underline on the centerpiece, drop cap on the body, and a
           breathing chevron that pulls the eye to the back slide. */
        .top-slide {
          position: fixed;
          inset: 0;
          z-index: 20;
          /* Slide IS the scene — full viewport. Image sized cover so
             the niche centres horizontally; bg-color matches the
             image's edge cream so any uncovered area at extreme
             aspect ratios still reads as the same wall. */
          background-color: #d8ccb6;
          /* SEA scene (settled 2026-07-09, v8) — the arch window onto
             open water as a memory: dissolved edges, everything faint,
             a quiet blue in the water. The founder's terminal verdict
             after eight iterations: "I just want what's currently in
             production, but the water slightly more blue. That's it."
             Shipped recipe = the v6 "memory" chain with ONLY the
             blue-cut relaxed, applied to poster + loop from the
             ungraded source: huesaturation -0.15 on c+b strength 16
             (the blue knob; ladder to date -0.98 → -0.60 → -0.45 →
             -0.15, each founder "touch" ≈ 0.15), global
             eq saturation 0.8, shadow lift 0.15, gblur 2.0, sigma-25
             bloom screen-blended at 35% (edges melt under their own
             light), 45% wash of the wall's cream (0xdcd6c2). The c+b
             targeting is what keeps everything except the water
             pixel-equal to the preferred production scene.
             Iteration history (v1 crisp blue "fake" → v2 fog "mid" →
             v3 real sea "crisp" → CSS veil rejected → v4-v5 global
             mutes → v6 memory (was production) → v7 Adam-fresco
             sepia "overcorrected… gray") lives in git; the v7 fresco
             recipe (measured off the old Adam asset) is in commit
             2f6af0a if the plaster treatment is ever wanted again.
             (Pharos lighthouse and Creation-of-Adam were cut earlier —
             image anti-reflex, design.md.) Poster is JPEG: frame zero
             of the loop, ~10x lighter than PNG for first paint. */
          background-image: url(/sea-arch-wide.jpg);
          /* Desktop landscape viewports crop the wide image evenly;
             75% pulls the niche from right-of-centre to visual middle
             and brings the tree shadow into view on the left. Mobile
             gets its own value below — portrait crop is heavier and
             needs centre-anchored positioning. */
          background-position: 75% center;
          background-size: cover;
          background-repeat: no-repeat;
          overflow: hidden;
          will-change: transform;
          box-shadow: var(--peel-shadow, 0 0 0 rgba(0, 0, 0, 0));
          color: #1a1318;
        }
        /* Breeze video — sits on top of the PNG background, below the
           stage. Same crop logic (object-position 75% center) so it
           registers exactly with the still PNG underneath; the eye
           sees no jump when the video begins playing. Fades in on
           canplay (.is-ready) to hide Veo's slight bloom/softening
           vs the source PNG. */
        .breeze-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 75% center;
          opacity: 0;
          transition: opacity 800ms ease-in;
          pointer-events: none;
          z-index: 0;
        }
        .breeze-video.is-ready {
          opacity: 1;
        }
        /* Reduced-motion: keep the still frontispiece. */
        @media (prefers-reduced-motion: reduce) {
          .breeze-video { display: none; }
        }
        /* FILM PLATE — the quiet line beneath the arch ("the demo ▸").
           Anchored to the WALL's cover geometry, not the stage:
           --wall-w/--wall-h reproduce background-size: cover for the
           2246×1264 sea image (AR 1.7771, same as the old wall); x
           sits on the window's centre (image-fraction 0.514, measured
           off the inner side edges, with the 75% crop position) and y
           below the outer ledge line (0.711 + margin) at every aspect
           ratio. Type scales gently with the scene. */
        .film-invite {
          position: absolute;
          --wall-w: max(100vw, 177.71vh);
          --wall-h: max(100vh, 56.27vw);
          left: calc(75vw - 0.236 * var(--wall-w));
          top: calc(50vh + 0.238 * var(--wall-h));
          transform: translate(-50%, -50%);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 2;
        }
        /* WINDOW HIT-AREA — the art itself is the button. Invisible zone
           over the arch's inner window (image fractions: centre x 0.514,
           y 0.285→0.649), expressed as offsets from the plate's anchor
           point in the same wall units. Hover raises a quiet play cue at
           the window's centre and inks the caption (shared .is-hot). */
        .film-window-hit {
          position: absolute;
          left: 50%;
          top: calc(50% - 0.271 * var(--wall-h));
          width: calc(0.273 * var(--wall-w));
          height: calc(0.364 * var(--wall-h));
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          /* arch-ish top so the cursor zone hugs the window's shape */
          border-radius: 42% 42% 2% 2% / 34% 34% 2% 2%;
        }
        .film-window-cue {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          /* Hairline ring over frosted glass — the heavy dark disc read
             as a UI sticker on the faint water; this one sits IN the
             scene, like a lens of the view itself. Ink triangle. */
          border: 1px solid rgba(26, 19, 24, 0.38);
          background: rgba(245, 240, 232, 0.28);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
          color: rgba(26, 19, 24, 0.68);
          opacity: 0;
          /* nudged below the window's centre so it floats on the water,
             beneath the horizon line */
          position: relative;
          top: 13%;
          transform: scale(0.94);
          transition: opacity 260ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .film-window-cue svg { width: 14px; height: 14px; margin-left: 3px; }
        .film-window-hit:hover .film-window-cue,
        .film-invite.is-hot .film-window-cue {
          opacity: 1;
          transform: scale(1);
        }
        .film-window-hit:active .film-window-cue { transform: scale(0.96); }
        @media (hover: none) {
          /* touch: the window stays tappable, the hover cue never shows */
          .film-window-cue { display: none; }
        }
        .film-invite-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          padding: 10px 14px;
          margin: -10px -14px;
          border: none;
          background: none;
          cursor: pointer;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          /* Museum-caption register (the alpha-mark's family): small,
             tracked, faint — the arch is the art, the plate whispers.
             Hover (or hovering the art) wakes it to full ink. */
          font-size: clamp(12.5px, calc(0.0095 * var(--wall-w)), 20px);
          letter-spacing: 0.12em;
          color: rgba(26, 19, 24, 0.46);
          transition: color 200ms ease;
        }
        .film-invite-btn em { font-style: italic; }
        .film-invite-btn:hover,
        .film-invite.is-hot .film-invite-btn { color: #1a1318; }
        .film-play-glyph {
          position: absolute;
          left: 100%;
          top: 50%;
          margin-left: -4px;
          width: 0.55em;
          height: 0.55em;
          color: rgba(26, 19, 24, 0.35);
          transform: translateY(-50%);
          transition: color 200ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .film-invite-btn:hover .film-play-glyph,
        .film-invite.is-hot .film-play-glyph {
          color: #1a1318;
          transform: translate(2px, -50%);
        }
        .film-invite-btn:active .film-play-glyph {
          transform: translate(1px, -50%) scale(0.96);
        }
        /* Lightbox — the film lifts out and plays over a dimmed room.
           Backdrop or × or Esc closes. Portalled to <body>. */
        .film-lightbox {
          position: fixed;
          inset: 0;
          z-index: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(16px, 4vw, 56px);
          background: rgba(20, 16, 12, 0.7);
          backdrop-filter: blur(10px);
          animation: filmLightboxIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes filmLightboxIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .film-lightbox-video {
          display: block;
          max-width: min(1180px, 100%);
          max-height: 100%;
          border-radius: 6px;
          box-shadow: 0 40px 120px -20px rgba(0, 0, 0, 0.55);
          animation: filmVideoIn 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes filmVideoIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .film-lightbox-close {
          position: absolute;
          top: 18px;
          right: 26px;
          padding: 6px 12px;
          border: none;
          background: none;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 34px;
          line-height: 1;
          color: rgba(245, 240, 232, 0.75);
          cursor: pointer;
          transition: color 180ms ease;
        }
        .film-lightbox-close:hover { color: #f5f0e8; }
        @media (prefers-reduced-motion: reduce) {
          .film-lightbox,
          .film-lightbox-video { animation: none; }
        }
        .film-arrow {
          padding: 4px 8px;
          margin: -4px -8px;
          border: none;
          background: none;
          font: inherit;
          color: rgba(26, 19, 24, 0.45);
          cursor: pointer;
          transition: color 180ms ease;
        }
        .film-arrow:hover { color: rgba(26, 19, 24, 0.85); }
        /* Stage — pixel-locked 1440×900 canvas, centred, uniformly scaled.
           Everything inside is absolute pixels at this design size, so
           layout never reflows. JS sets --stage-scale-top from viewport. */
        .stage-top {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 1440px;
          height: 900px;
          transform: translate(-50%, -50%) scale(var(--stage-scale-top, 1));
          transform-origin: center center;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 63px 32px 27px;
          box-sizing: border-box;
        }
        /* Vertical margin rule REMOVED — was distracting against the
           full-bleed wall scene. Kept the selector with no content so
           the rest of the cascade is unchanged. */
        .stage-top::after {
          content: none;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(58, 15, 61, 0.18) 18%,
            rgba(58, 15, 61, 0.18) 82%,
            transparent 100%
          );
          pointer-events: none;
          z-index: 0;
        }
        /* Folio — tiny "vol. i" in the bottom-right, like the spine
           label of a printed book. Marks the page as a designed object. */
        .folio {
          position: absolute;
          bottom: 27px;
          right: 58px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 13px;
          color: rgba(26, 19, 24, 0.42);
          letter-spacing: 0.02em;
          user-select: none;
          z-index: 2;
        }
        .top-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 980px;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 36px 0;
        }
        /* Alpha glyph — legacy class, kept in case any other surface
           still references it. */
        .alpha-glyph {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 28px;
          color: rgba(58, 15, 61, 0.45);
          line-height: 1;
          user-select: none;
          letter-spacing: -0.02em;
          margin: -8px 0;
        }
        /* Bubble removed — the manifesto sits directly on the cream paper
           of the wall scene, so the prose rests in clean cream. The
           vertical margin rule on .stage-top provides the manuscript
           anchor; the slide reads as one continuous folio rather than a
           card on a page. */

        /* H1 — title-page composition.
           Three registers, deliberately distinct so each line is
           unmistakably a different VOICE — not just a different size.
           Outer brackets: small-caps roman with wide tracking → reads
           like a Roman inscription, declarative, civic.
           Main line: large italic → the BOOK TITLE, the artifact, the
           thing being inscribed. Hand of the author.
           The contrast (geometric small-caps ↔ flowing italic) is what
           makes the composition feel like a frontispiece, not a banner. */
        .hero-h1 {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 400;
          font-style: normal;
          color: #1a1318;
          text-align: center;
          margin: 0;
          max-width: 1180px;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1;
          font-variant-ligatures: common-ligatures discretionary-ligatures;
          animation: heroFadeIn 1200ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        .hero-h1 em {
          font-style: italic;
        }
        /* Brackets — Roman inscription marginalia. Small caps, wide
           letter-spacing, lightweight, faint. The tone says "stated
           plainly, with weight" — like a dateline or a legend. */
        .hero-h1 .hero-bracket {
          display: block;
          font-size: 14px;
          font-style: normal;
          font-weight: 400;
          color: rgba(26, 19, 24, 0.55);
          letter-spacing: 0.32em;
          line-height: 1;
          padding-bottom: 2px;
          text-transform: uppercase;
          font-feature-settings: "kern" 1, "smcp" 1;
          font-variant-caps: all-small-caps;
        }
        .hero-h1 .bracket-left {
          text-align: center;
          margin-bottom: 26px;
        }
        .hero-h1 .bracket-right {
          text-align: center;
          margin-top: 26px;
          padding-right: 0;
        }
        /* Main line — the book title. Large italic, generous size,
           tight tracking, gentle text-shadow that suggests letterforms
           pressed slightly into the wall. The artifact gets its own
           voice: italic, hand-drawn, elevated. */
        .hero-h1 .hero-main {
          display: inline-block;
          font-style: italic;
          font-weight: 400;
          font-size: 76px;
          line-height: 1.05;
          letter-spacing: -0.02em;
          color: #1a1318;
          text-align: center;
          padding: 0;
          position: relative;
          text-shadow:
            0 1px 0 rgba(255, 250, 240, 0.55),
            0 2px 6px rgba(40, 25, 18, 0.05);
        }
        /* Hairline rules above and below the main line — manuscript
           ruling that frames the title without enclosing it. The
           gradient fades at both ends so the rules dissolve into the
           cream wall rather than terminating in a hard edge. */
        .hero-h1 .hero-main::before,
        .hero-h1 .hero-main::after {
          content: '';
          position: absolute;
          left: 8%;
          right: 8%;
          height: 1px;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(26, 19, 24, 0.28) 30%,
            rgba(26, 19, 24, 0.28) 70%,
            transparent 100%
          );
        }
        .hero-h1 .hero-main::before {
          top: -12px;
        }
        .hero-h1 .hero-main::after {
          bottom: -8px;
        }
        @keyframes heroFadeIn {
          0% {
            opacity: 0;
            transform: translateY(14px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pageFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes softPulse {
          0%, 100% {
            opacity: 0.45;
            transform: translateY(0);
          }
          50% {
            opacity: 0.85;
            transform: translateY(2px);
          }
        }

        /* Manifesto — prose + fleuron + italic closer. The fleuron is
           the rhetorical beat between stance and civilisational claim,
           not decoration. Old book discipline. */
        .manifesto {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          color: #2a1f28;
          text-align: center;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
        }
        /* Manifesto body — book typography. Justified column, generous
           leading, optical features on. Reads like the opening of a
           well-set chapter: narrow column, dense type, breathing room. */
        .manifesto p {
          margin: 0;
          font-size: 20px;
          line-height: 1.7;
          letter-spacing: 0.008em;
          text-align: justify;
          text-align-last: center;
          hyphens: auto;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1, "onum" 1;
          font-variant-ligatures: common-ligatures discretionary-ligatures;
          hanging-punctuation: first last;
          animation: manifestoFadeIn 1400ms 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        /* Incipit — the first 3 words in small caps after the drop cap.
           Classical book convention: the eye is led from the illuminated
           initial through the small-caps opening into the body type.
           Three typographic registers in one phrase. */
        .manifesto p .manifesto-incipit {
          font-feature-settings: "kern" 1, "smcp" 1, "c2sc" 1;
          font-variant-caps: all-small-caps;
          letter-spacing: 0.08em;
          font-weight: 500;
          color: #1a1318;
        }
        @keyframes manifestoFadeIn {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        /* Illuminated initial — the "a" of alexandria as the manuscript
           initial of a chapter. Big enough to clearly be a typographic
           gesture, not a typo. Italic burgundy with layered text-shadow
           (highlight + soft halo + drop) creates the embossed feel of
           a hand-pressed letter. Tuned vertical-align so it descends
           below the baseline and sits beside the small-caps incipit. */
        .manifesto p:first-of-type::first-letter {
          font-size: 4.4em;
          font-style: italic;
          font-weight: 600;
          line-height: 0.78;
          letter-spacing: -0.04em;
          vertical-align: -0.36em;
          margin-right: 0.06em;
          color: #3a0f3d;
          text-shadow:
            0 1px 0 rgba(255, 250, 240, 0.7),
            0 2px 4px rgba(58, 15, 61, 0.14),
            0 8px 22px rgba(58, 15, 61, 0.10);
        }
        /* Fleuron break — typographic ornament between body and close.
           A real manuscript element: not decoration, a rhetorical pause.
           The eye stops here, the next phrase delivers a verdict. */
        .fleuron-break {
          margin: 4px 0 0;
          line-height: 1;
          opacity: 0;
          animation: manifestoFadeIn 1400ms 520ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }
        .fleuron-break .fleuron-glyph {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 24px;
          font-style: italic;
          color: rgba(58, 15, 61, 0.55);
          line-height: 1;
          letter-spacing: 0.4em;
          padding-left: 0.4em;
          user-select: none;
        }
        /* Plain emphasis — italic burgundy, weight 500. Subtle hover
           glow when the reader pauses on the phrase. */
        .manifesto p em {
          font-style: italic;
          font-weight: 500;
          color: #3a0f3d;
          letter-spacing: 0.01em;
          transition: text-shadow 320ms ease, color 320ms ease;
        }
        .manifesto p em:hover {
          text-shadow: 0 0 14px rgba(58, 15, 61, 0.32);
          color: #2a0a2d;
        }
        /* Strong emphasis — load-bearing phrases. Heavier italic with
           a hairline underline that fades from the burgundy. The line
           reads like an ink-pen stroke beneath a manuscript phrase. */
        .manifesto p em.em-strong {
          font-weight: 600;
          text-decoration: underline;
          text-decoration-color: rgba(58, 15, 61, 0.28);
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
        }
        .manifesto em {
          font-style: italic;
          color: #1a1318;
        }
        .fleuron {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 22px;
          color: rgba(58, 15, 61, 0.7);
          line-height: 1;
          user-select: none;
          font-style: italic;
        }
        /* Close — two voices, one line.
             faint setup: quiet manuscript marginalia (the broader fact)
             strong payoff: ink-dark italic with a confident underline
           The split is the whole point — the body argues; the close
           delivers the verdict, separated by a typographic pause. */
        .manifesto-close {
          font-style: normal;
          font-size: 18px !important;
          font-weight: 400;
          max-width: 820px;
          margin: 32px auto 0 !important;
          letter-spacing: 0.012em;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1;
        }
        .close-faint {
          color: rgba(26, 19, 24, 0.48);
          font-style: italic;
          font-weight: 300;
          letter-spacing: 0.02em;
        }
        /* Watermark — large faint italic 'a.' sitting behind everything,
           lower portion of the slide, off-centre to the left. Marks the
           page as alexandrian without shouting. */
        .watermark {
          position: fixed;
          bottom: 12%;
          left: 68%;
          transform: translateX(-50%);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: clamp(140px, 22vw, 320px);
          font-weight: 400;
          color: rgba(58, 15, 61, 0.05);
          letter-spacing: -0.02em;
          line-height: 1;
          user-select: none;
          pointer-events: none;
          z-index: 25;
        }
        /* Alpha mark — bottom-left colophon (place + year in
           lowercase Roman). Mirrors 'vol. i' on the right so the
           page is bracketed by manuscript marginalia. */
        .alpha-mark {
          position: absolute;
          bottom: 56px;
          left: 58px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 13px;
          color: rgba(26, 19, 24, 0.42);
          letter-spacing: 0.02em;
          user-select: none;
          z-index: 2;
        }
        /* Scroll cue — soft pulsing chevron beneath the close.
           Tells the reader where to go without saying it. */
        .scroll-cue {
          display: block;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 26px;
          color: #3a0f3d;
          margin-top: 18px;
          line-height: 1;
          animation: softPulse 2.4s ease-in-out infinite;
          user-select: none;
        }

        /* Nav CTA — pill that swaps to theme colors when on bottom. */
        .nav-links .nav-cta {
          color: #f4efe2;
          background: #3a0f3d;
          padding: 7px 16px;
          border-radius: 999px;
          font-weight: 500;
          transition:
            background 320ms ease,
            color 320ms ease;
        }
        .nav-links .nav-cta:hover {
          background: #6b2259;
          color: #f4efe2;
        }
        .nav.on-bottom .nav-links .nav-cta {
          color: var(--theme-bg);
          background: var(--theme-fg);
        }
        .nav.on-bottom .nav-links .nav-cta:hover {
          color: var(--theme-bg);
          opacity: 0.85;
        }

        /* CTA row — the conversion pair under the prose card. */
        /* Two CTAs. Sized for the eye to see them as the action moment. */
        .cta-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .cta-row a.cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 13px 28px;
          border-radius: 10px;
          text-decoration: none;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px;
          font-weight: 500;
          letter-spacing: 0.003em;
          transition:
            transform 160ms ease,
            background 180ms ease,
            border-color 180ms ease;
        }
        .cta-row a.cta-primary {
          background: #3a0f3d;
          color: #f4efe2;
          box-shadow:
            0 1px 0 rgba(58, 15, 61, 0.2),
            0 10px 26px -8px rgba(58, 15, 61, 0.35);
        }
        .cta-row a.cta-primary:hover {
          background: #6b2259;
          transform: translateY(-1px);
        }
        .cta-row a.cta-ghost {
          background: transparent;
          color: #1a1318;
          border: 1px solid rgba(26, 19, 24, 0.28);
        }
        .cta-row a.cta-ghost:hover {
          border-color: rgba(26, 19, 24, 0.55);
          background: rgba(26, 19, 24, 0.03);
        }

        /* ─── MIDDLE SLIDE (slides=3 mode) ─── */
        /* Sits between top-slide (z:20) and bottom-slide (z:10). Carries
           the 5 statement beats at full canvas width. JS translates it
           upward in the second 100vh of scroll, after top has fully
           peeled. Theme vars are set via inline style on the section
           element, so descendants inherit the middle slide's own
           palette (different from the bottom slide's). */
        .middle-slide {
          position: fixed;
          inset: 0;
          z-index: 15;
          overflow: hidden;
          will-change: transform;
          box-shadow: var(--peel-shadow, 0 0 0 rgba(0, 0, 0, 0));
          transition: background-color 400ms ease, color 400ms ease;
        }
        .stage-middle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 1600px;
          height: 1000px;
          transform: translate(-50%, -50%) scale(var(--stage-scale-bottom, 1));
          transform-origin: center center;
          padding: 56px 120px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* Slide 2 — the argument as a marginalia folio. Each beat is
           a named argument: the LABEL hangs in the left gutter (italic,
           faint, with the roman numeral above it), the BODY flows in
           the main column. Form is content — the gutter structure says
           "this is a structured argument with five named moves," each
           one anchored. Easier to read because the eye knows where each
           beat starts and what it's called before it begins.
             - Two-column anatomy per beat: ~220px gutter + body column
             - Numeral hangs above the label, small italic faint
             - Label is italic, slight tracking, faint — it names the
               beat, doesn't shout
             - Body is large serif (20px / 1.6) with generous breath
             - Hairline rule between beats — section break */
        .stage-middle .statement {
          align-self: center;
          margin: 0;
          padding: 0;
          max-width: 1180px;
          position: relative;
          gap: 36px;
          counter-reset: beat;
        }
        .stage-middle .statement > p {
          position: relative;
          margin: 0;
          padding: 0 0 36px 280px;
          font-size: 19px;
          line-height: 1.62;
          color: var(--theme-fg);
          min-height: 86px;
        }
        .stage-middle .statement > p:last-child {
          padding-bottom: 0;
        }
        /* Hairline section break between beats — sits in the body's
           left edge, not under the gutter, so the gutter reads as a
           continuous register down the page. */
        .stage-middle .statement > p:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 280px;
          bottom: 0;
          width: 64px;
          height: 1px;
          background: var(--theme-fg-faint);
          opacity: 0.55;
        }
        /* Numeral — sits at the top of the gutter, small italic
           LOWERCASE faint, marker-not-bullet. Specificity (0,2,3)
           beats the bottom-slide rule (0,1,3). */
        .stage-middle .statement > p:not(.statement-close):not(.continuation)::before {
          content: counter(beat, lower-roman) '.';
          position: absolute;
          left: 0;
          top: 0;
          font-size: 13px;
          font-style: italic;
          font-weight: 400;
          letter-spacing: 0.06em;
          color: var(--theme-fg-faint);
          line-height: 1;
          opacity: 1;
          font-variant-numeric: lining-nums;
        }
        /* Label — block-level italic in the gutter, sits below the
           numeral. Slightly larger than the numeral, body-muted. */
        .stage-middle .statement .beat-title {
          position: absolute;
          left: 0;
          top: 22px;
          width: 220px;
          display: block;
          margin: 0;
          font-size: 17px;
          letter-spacing: 0.04em;
          color: var(--theme-fg);
          font-style: italic;
          font-weight: 500;
        }
        .stage-middle .statement .beat-title::after {
          content: none;
        }
        /* In slides=3 mode the bottom-slide's right-col loses its
           statement block. right-lower (closer + CTAs) anchors at the
           top, paralleling Fleet's structure where the short copy and
           footer links sit top-right opposite the ornament, and the
           huge wordmark fills bottom-left alone. 120px matches the
           ornament's padding-top so the two columns share a top edge. */
        .right-col .right-lower {
          /* 2026-07-12: the column now SPANS the slide (founder: "move
             the 5 sections up, give the stuff under it room to breathe,
             bottom-align the CTAs with the left wordmark"). The box sits
             high (this margin-top), the column fills the height (flex 1),
             and the closing group is pushed to the bottom (2026-07-16,
             founder: sections up top, rule + close + CTAs bottom-aligned
             with the left wordmark; the flexible gap between them also
             absorbs an open section's body, so hover-expand never pushes
             the closing group off-stage). */
          margin-top: 0;
          flex: 1;
          min-height: 0;
          justify-content: flex-start;
          /* Lifts the closing group so the CTA row's bottom lands on the
             big wordmark's baseline across the slide (founder: "the bottom
             of the CTAs bottom aligned with the bottom of the alexandria
             text"); quiet-links keep the lower tier with the dict lines. */
          /* CTA bottom = wordmark bottom + exactly one pixel (founder). */
          padding-bottom: 83px;
          /* Squeeze the column — narrower text width pushes the left
             edge inward (right edge unchanged because right-lower is
             flex-end aligned). */
          width: 680px;
        }

        /* ─── BOTTOM SLIDE ─── */
        /* Two bands, Fleet structure.
             UPPER: ornament left, statement+columns right
             LOWER: HUGE wordmark+dict left, motto center, copyright right
           The wordmark anchors the bottom-left like Fleet's "fleet". */
        .bottom-slide {
          position: fixed;
          inset: 0;
          z-index: 10;
          background-color: var(--theme-bg);
          color: var(--theme-fg);
          overflow: hidden;
          transition: background-color 400ms ease, color 400ms ease;
        }
        /* Stage — pixel-locked 1600×1000 canvas, centred, uniformly scaled.
           Same proportions as the top-slide canvas so the bottom renders at
           the same scale (no shrinkage when peeling). JS sets
           --stage-scale-bottom. */
        .stage-bottom {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 1600px;
          height: 1000px;
          transform: translate(-50%, -50%) scale(var(--stage-scale-bottom, 1));
          transform-origin: center center;
          padding: 56px 96px 40px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .bottom-inner {
          --lower-block-bottom: 14px;
          max-width: 1700px;
          margin: 0 auto;
          width: 100%;
          flex: 1;
          display: flex;
          gap: 80px;
          align-items: stretch;
          min-height: 0;
        }
        .left-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-width: 0;
        }
        .right-col {
          flex: 0 0 auto;
          width: 880px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-width: 0;
        }
        .ornament-wrap {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          padding-top: 120px;
          padding-left: 0;
          /* Match the wordmark's negative offset below so ornament + wordmark
             share the same left edge — both sit further left than the
             stage-bottom padding suggests. */
          margin-left: -32px;
        }

        /* Statement — the argument. Roman beats in the margin (I–V); opening
           is plain prose starting with “ai” — no drop cap here so it does not
           compete with the front slide’s “t”. */
        .statement {
          counter-reset: beat;
          align-self: flex-end;
          max-width: 920px;
          margin: 124px -32px 0 -28px;
          padding-left: 64px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        /* Beat title — italic chapter label that sits inline at the
           start of each beat, followed by an em-dash and the body. */
        .statement .beat-title {
          font-style: italic;
          font-weight: 400;
          letter-spacing: 0.06em;
          color: var(--theme-fg-muted);
        }
        .statement .beat-title::after {
          content: ' — ';
          color: var(--theme-fg-faint);
        }
        .right-lower {
          align-self: flex-end;
          width: 752px;
          margin-right: -32px;
          display: flex;
          flex-direction: column;
          /* 14 → 11 (2026-07-12): tighter column spacing helps the open
             reveal panel + CTAs fit the fixed stage. */
          gap: 11px;
          /* No bottom margin — the block is vertically centred, so the
             air must be symmetric top and bottom. */
          margin-bottom: 0;
        }
        /* Roman numeral marginalia — four argument beats. The split's
           second half (.continuation) inherits the prior numeral by not
           incrementing or rendering one. Quiet, faint, hanging in the
           left margin — manuscript folio. */
        .statement > p:not(.statement-close):not(.continuation) {
          counter-increment: beat;
        }
        .statement > p:not(.statement-close):not(.continuation)::before {
          content: counter(beat, upper-roman) ".";
          position: absolute;
          left: -36px;
          top: 0.08em;
          font-size: 0.68em;
          font-style: italic;
          letter-spacing: 0.06em;
          color: var(--theme-fg-faint);
          font-variant-numeric: lining-nums;
        }
        .statement p {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 19px;
          line-height: 1.4;
          letter-spacing: 0.002em;
          color: var(--theme-fg);
          margin: 0;
          position: relative;
          hanging-punctuation: first last;
          text-wrap: pretty;
        }
        /* Inline emphasis — three voices: body (regular), soft em (muted
           italic — definitions, pull-phrases), strong em (full colour +
           weight — load-bearing claims). Soft em wakes to full colour on
           hover; the page becomes tactile under the cursor. */
        .statement em {
          font-style: italic;
          color: var(--theme-fg-muted);
          transition: color 280ms ease, text-shadow 280ms ease;
        }
        .statement em:hover {
          color: var(--theme-fg);
          text-shadow: 0 0 14px var(--theme-fg-faint);
        }
        /* Strong emphasis — the load-bearing claims. Full colour, heavier
           italic, never broken across lines. The eye lands here whether the
           reader skims or reads. Atomic phrase: wraps as a unit. */
        .statement em.em-strong {
          font-weight: 600;
          color: var(--theme-fg);
          white-space: nowrap;
        }
        .statement em.em-strong:hover {
          text-shadow: 0 0 18px var(--theme-fg-muted);
        }
        /* "hence, alexandria." — the reveal beat. The name carries the
           wordmark treatment from the nav: italic, slight weight, tight
           tracking. Period stays upright and breathes, like the nav-dot. */
        .statement .hence-name {
          font-style: italic;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--theme-fg);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-decoration-color: var(--theme-fg-muted);
          text-underline-offset: 0.16em;
        }
        .statement .hence-dot {
          font-style: normal;
          display: inline-block;
          animation: dotBreathe 3.2s ease-in-out infinite;
          text-decoration: none;
        }
        /* Republic coda — the name landing at the end of section V,
           rounding off the entire argument. Italic, full colour, slightly
           heavier — the noun for what alexandria is. */
        .statement .republic-coda {
          font-style: italic;
          font-weight: 500;
          color: var(--theme-fg);
          letter-spacing: 0.005em;
          white-space: nowrap;
        }
        /* Close — the deal-closing prose. Sits in natural flow inside
           .right-col, after the argument. Reads as straight prose with
           italic emphasis on the load-bearing claim and the destination.
           The spatial break from the upper argument is enough separation;
           keeping this block text-only makes the lower band feel less
           mechanically divided. */
        /* Epigraph — the WHY beat at the top of the right column.
           Larger italic register, distinct from the body prose below.
           Carries the visual top alignment offset (was on .statement-close)
           so the epigraph's first line aligns with the ornament's top. */
        .statement-epigraph {
          position: relative;
          margin: 0;
          padding-left: 0;
          padding-top: 6px;
          transform: translateY(-20px);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          /* Restored to 24 (letter-box pass) — the epigraph is the
             always-visible hook above the scroll window. */
          font-size: 24px;
          line-height: 1.4;
          font-style: italic;
          font-weight: 400;
          letter-spacing: 0.005em;
          color: var(--theme-fg);
          hanging-punctuation: first last;
        }
        .statement-close {
          position: relative;
          margin: 0;
          padding-left: 0;
          padding-top: 0;
          transform: none;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          /* Restored to 18/1.55 (2026-07-10, letter-box pass): the
             scroll window decouples letter length from the fold, so
             the crisis-era shrinks (17 → 16.5 → 16) are undone. */
          font-size: 18px;
          line-height: 1.55;
          font-style: normal;
          letter-spacing: 0.005em;
          color: var(--theme-fg);
          /* Book-typography subset: hanging punctuation + ligatures
             + old-style numerals at the character level. Dropped
             text-align: justify because at this column width (612px)
             with short lines, justification produced visible gaps
             between words — the eye reads it as broken spacing,
             not elite type. Left-aligned with the kerning + features
             still does the invisible-quality work. */
          hanging-punctuation: first last;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "onum" 1;
        }
        .statement-close::before {
          content: none;
        }
        /* The pulled-out beat — the one line carrying the community,
           set as its own typographic event between the paragraphs and
           the numbered ways. Italic, a half-step up, room around it. */
        .statement-beat .no-orphan { white-space: nowrap; }
        .statement-beat {
          /* The graceful final line — a touch larger and airier than the
             body, italic, with room above so it lands as the close of a
             letter rather than one more paragraph. */
          margin: 16px 0 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 18.5px;
          line-height: 1.58;
          font-style: italic;
          letter-spacing: 0.006em;
          color: var(--theme-fg);
          hanging-punctuation: first last;
        }
        /* Two ways — the numbered product/company split closing the letter,
           labelling the two buttons below. Accent numerals, italic labels. */
        .statement-close .way-num {
          color: var(--accent);
          font-weight: 600;
          margin-right: 0.15em;
          letter-spacing: 0.02em;
          font-variant-numeric: lining-nums;
          font-feature-settings: "lnum" 1, "kern" 1;
        }
        .statement-close .way-label {
          font-style: italic;
          color: var(--theme-fg);
        }
        /* Salutation — small italic intro, like a Renaissance epistle
           opener ("Lettore," "To the Reader,"). Letter-spaced lowercase
           reads as a museum plate — sets the genre as a letter, not
           a marketing block. */
        .statement-salutation {
          margin: 0;
          padding: 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px;
          font-style: italic;
          font-weight: 400;
          letter-spacing: 0.18em;
          /* fg-muted (was fg-faint) — readable salutation; the heavy
             tracking + lowercase already softens the visual weight, so
             muted reads as the right plate-credit register without
             dropping below AA contrast. */
          color: var(--theme-fg-muted);
          text-transform: lowercase;
          user-select: none;
        }
        /* COLUMNS — three branches, now in the bottom-right block.
           Compact, plain link text, no doormen. */
        .upper-cols {
          display: grid;
          grid-template-columns: repeat(3, minmax(96px, auto));
          gap: clamp(20px, 2.4vw, 40px);
        }
        .col {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .col-head {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 11px;
          color: var(--theme-fg-faint);
          margin-bottom: 2px;
          font-weight: 400;
          letter-spacing: 0.08em;
          text-transform: lowercase;
        }
        .col a {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 12.5px;
          color: var(--theme-fg);
          text-decoration: none;
          line-height: 1.42;
          transition: color 150ms ease;
        }
        .col a:hover {
          opacity: 0.72;
        }
        .col a.col-primary {
          color: var(--theme-fg);
          font-weight: 500;
          text-decoration: underline;
          text-decoration-color: var(--theme-border-soft);
          text-underline-offset: 3px;
        }

        /* LOWER BAND — two mirrored halves around page centre.
             LEFT  : wordmark + dict stack (anchors bottom-left)
             RIGHT : right-stack (dagger+CTAs+motto) anchored bottom-right
           Each half is exactly 1fr, so the wordmark's right edge and
           the right-stack's left edge sit at equal distances from the
           viewport centre. */
        .lower {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: clamp(24px, 3vw, 48px);
          padding-bottom: 0;
        }
        .wordmark-block {
          align-self: flex-start;
        }
        /* Two CTAs side by side. Each is a stack — button on top, italic
           subtitle below. Primary is filled (the action); secondary is a
           ghost outline (the alternative). Subtitles do the explaining,
           so the buttons themselves stay as terse two-word verbs. */
        .cta-pair {
          margin: 0;
          padding-left: 0;
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 36px;
        }
        /* Breathing room — separate the action from the welcome
           line so the close lands as a destination, not a button
           caption. Adds to the 18px flex gap on right-lower. */
        .right-lower > .cta-pair {
          margin-top: 26px;
        }

        /* ─── THE LETTER (scroll box) ─── */
        /* The hook lives on the front slide; here the whole argument
           (i–v) scrolls in one fixed-height box, section plates in the
           museum register, with the outro + close + CTAs pinned below. */
        /* Section plates — the museum register (echoing the dict block).
           Air above (separating sections), tight to the prose below. */
        .letter-sec {
          margin: 22px 0 7px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 12px;
          letter-spacing: 0.16em;
          color: var(--theme-fg-faint);
          user-select: none;
        }
        .letter-scroll .letter-sec:first-child {
          margin-top: 0;
        }
        /* Clean paragraph flow — a modest gap between paragraphs, no
           first-line indent (founder wasn't sure the indent looked good).
           Readable, elegant, un-blocky. */
        .letter-scroll .statement-close {
          margin: 0 0 13px;
          text-indent: 0;
        }
        .letter-scroll .statement-close:last-child {
          margin-bottom: 0;
        }
        /* The scroll box — only section i shows at rest (founder,
           2026-07-12); the fade + scrollbar + "keep reading" cue make
           the rest discoverable. The whole argument (i–v) scrolls here;
           the pinned outro + close + CTAs live below, always visible. */
        .letter-window {
          position: relative;
        }
        /* Read-on cue — a centered whisper below the reading column. No
           pill, no backing, no bob (2026-07-13): the bottom fade already
           carries "there's more"; this quietly names the choice and fades
           out the moment the reader scrolls into the letter. */
        .letter-more {
          display: block;
          text-align: center;
          margin-top: 13px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 12px;
          letter-spacing: 0.08em;
          color: var(--theme-fg-faint);
          pointer-events: none;
          user-select: none;
          transition: opacity 500ms ease;
        }
        .letter-more.is-gone {
          opacity: 0;
        }
        .letter-scroll {
          position: relative;
          /* 2026-07-12: shows section i at rest, with section ii ghosting
             under the fade (founder wants the ghost text). The void is
             solved by centring the whole block (see .right-lower
             justify-content), not by growing the box. */
          height: 330px;
          overflow-y: auto;
          padding-right: 18px;
          padding-bottom: 34px;
          display: block;
          /* Scrollbar hidden (2026-07-13) — a visible bar reads as a "box";
             the soft fade + the read-on cue carry the scroll affordance. */
          scrollbar-width: none;
          /* Soft bottom fade so section ii ghosts under it (the "ghost
             text" the founder wants) and the cue signals more. */
          -webkit-mask-image: linear-gradient(
            to bottom, #000 0, #000 calc(100% - 48px), transparent 100%
          );
          mask-image: linear-gradient(
            to bottom, #000 0, #000 calc(100% - 48px), transparent 100%
          );
        }
        /* Once scrolled in, the top edge fades too so the upper text
           dissolves instead of hard-cutting (2026-07-13). */
        .letter-scroll.is-scrolled {
          -webkit-mask-image: linear-gradient(
            to bottom, transparent 0, #000 30px, #000 calc(100% - 48px), transparent 100%
          );
          mask-image: linear-gradient(
            to bottom, transparent 0, #000 30px, #000 calc(100% - 48px), transparent 100%
          );
        }
        .letter-scroll::-webkit-scrollbar {
          display: none;
        }
        /* ─── WHY / WHAT / HOW pillars (2026-07-13 exploration) ─── */
        .secs {
          display: flex;
          flex-direction: column;
          /* Sections sit a third down the column, not jammed at the top
             (founder, 2026-07-17) — composed against the seal opposite. */
          margin-top: 112px;
        }
        /* Header — small title + rotating caret, a compact click target.
           No dividers between sections (they flow like the old letter). */
        .sec-head {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          align-self: flex-start;
          padding: 6px 6px 6px 0;
          margin: 30px 0 0 0;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
        }
        .sec:first-child .sec-head { margin-top: 0; }
        /* Titles back to the whisper register (founder, 2026-07-16 second
           note) — the LEADS carry the size instead: small plate over a
           big visible first line, echoing the front's mini headers. */
        .sec-title {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 12px;
          letter-spacing: 0.16em;
          color: var(--theme-fg-faint);
          transition: color 180ms ease;
        }
        .sec-head:hover .sec-title { color: var(--theme-fg-muted); }
        /* Rotating caret — points down collapsed, flips up open. Replaces
           the +/− (founder: more elegant). */
        .sec-caret {
          width: 6px;
          height: 6px;
          border-right: 1.4px solid var(--theme-fg-faint);
          border-bottom: 1.4px solid var(--theme-fg-faint);
          transform: translateY(-2px) rotate(45deg);
          transition: transform 520ms cubic-bezier(0.33, 0, 0.2, 1), border-color 200ms ease;
        }
        /* The openers as aphorisms (founder, 2026-07-16: "more interesting
           styling") — the letter's italic voice at display size, so each
           section opens on a spoken line rather than body text: faint
           plate → italic aphorism → small roman depth. */
        .sec-lead {
          margin: 8px 0 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 19px;
          line-height: 1.5;
          letter-spacing: 0.006em;
          color: var(--theme-fg);
        }
        /* Body reveal — grid-rows 0fr→1fr eases to the body's EXACT height
           (no max-height overshoot), so expand and collapse move at the same
           real rate. Fixes the cycle-jitter: the old collapse "snapped"
           because max-height overshot the content and idled through the gap
           before the real height fell. Slow + gentle so cycling reads fluid. */
        .sec-body {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 620ms cubic-bezier(0.33, 0, 0.2, 1);
        }
        .sec-body-inner {
          overflow: hidden;
          min-height: 0;
          opacity: 0;
          transition: opacity 500ms ease;
        }
        /* NO SCROLLING in the expand (founder, 2026-07-17: "i dont want
           scrolling… if we need to hide the other sections to make space
           then we do that, if we need to move the line break then we do
           that" — supersedes the scroll cap). Desktop strategy: the open
           body lays out in TWO columns at a quieter size (halving its
           height), the sibling sections' leads collapse to lend their
           room, and the rule below may slide within the stage. Mobile
           keeps the natural single-column flow. */
        @media (min-width: 900px) {
          /* Normal paragraphs (founder, 2026-07-17: "don't split it into
             two sections") — one column, quieter size, capped measure so
             the long lines stay readable. Higher specificity than the
             base body rule below it in the sheet (same selector in a
             media query loses on source order). */
          .secs .sec .sec-body-inner {
            max-width: 600px;
          }
          .secs .sec .sec-body-inner p {
            font-size: 14px;
            line-height: 1.55;
          }
          .sec-lead {
            max-height: 160px;
            overflow: hidden;
            transition:
              max-height 520ms cubic-bezier(0.33, 0, 0.2, 1),
              opacity 380ms ease,
              margin 520ms cubic-bezier(0.33, 0, 0.2, 1);
          }
        }
        @media (min-width: 900px) {
          /* Focus mode machinery — heads and the block's top margin get
             transitions so the whole move eases as one gesture. */
          .sec-head {
            max-height: 64px;
            overflow: hidden;
            transition:
              max-height 520ms cubic-bezier(0.33, 0, 0.2, 1),
              opacity 380ms ease,
              margin 520ms cubic-bezier(0.33, 0, 0.2, 1),
              padding 520ms cubic-bezier(0.33, 0, 0.2, 1);
          }
          .secs {
            transition: margin-top 520ms cubic-bezier(0.33, 0, 0.2, 1);
          }
        }
        /* FOCUS MODE (desktop) — driven by .is-open, NEVER by :hover:
           focus mode moves the layout, and a :hover that moves under the
           cursor revokes itself — the massive expand glitch of 2026-07-17.
           JS sets is-open on mouseenter; only leaving the whole .secs
           container (or tapping elsewhere) clears it, so layout shifts
           can't break the state. */
        @media (min-width: 900px) {
          /* CLICK-driven focus (2026-07-17, after every hover variant
             failed on real hardware — browsers dispatch hover-boundary
             events on layout shift, and hidden siblings left nothing to
             reach): heads stay VISIBLE as the switch targets; only the
             sibling leads collapse; the block rises to make room. Clicks
             have no cursor coupling, so movement can never cascade. */
          .secs:has(.sec.is-open) { margin-top: 28px; }
          .secs:has(.sec.is-open) .sec:not(.is-open) .sec-lead {
            max-height: 0;
            opacity: 0;
            margin: 0;
          }
          .sec { cursor: pointer; }
          /* The library·marketplace row is peripheral chrome — it yields
             during focus so a long open body's slide never collides. */
          .right-col:has(.sec.is-open) .quiet-links { opacity: 0; }
        }
        /* The expand itself — is-open on every input (mouseenter via JS on
           desktop, tap toggle on touch). */
        .sec.is-open .sec-body { grid-template-rows: 1fr; }
        .sec.is-open .sec-body-inner { opacity: 1; }
        .sec.is-open .sec-title { color: var(--theme-fg-muted); }
        .sec.is-open .sec-caret {
          border-color: var(--theme-fg-muted);
          transform: translateY(1px) rotate(-135deg);
        }
        .sec-body-inner p {
          margin: 10px 0 0;
          font-size: 15px;
          line-height: 1.62;
          letter-spacing: 0.004em;
          color: var(--theme-fg);
        }
        .secs-rule {
          height: 1px;
          background: var(--theme-border-soft);
          /* margin-top auto = the turn: everything above it (sections)
             anchors top, everything below (close + CTAs) sinks to the
             bottom of the column — the rule rides with the closing group
             so the break always sits naturally just above it. Bottom
             margin lifted (22→34, 2026-07-17): the rule sits higher and
             the closing sections breathe. */
          margin: auto 0 46px;
        }
        /* Extra air between the close beats and the buttons — the two
           closing sections read as separate breaths (2026-07-17), taking
           the space the lifted rule opens up. */
        .right-lower > .cta-pair {
          margin-top: 24px;
        }
        .action-beat {
          margin: 0;
        }
        /* The split close — three beats with air between them (frame /
           punch / action); the final beat gains a touch of ink so the
           action line lands strongest, right above the buttons. */
        .action-close {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .action-beat-final em {
          color: var(--theme-fg);
        }
        /* THE CLOSING MOVEMENT — set apart from the argument box above
           and given its own rhythm so it doesn't read as two more blocks
           of text (founder). A hairline rule marks the turn from argument
           to invitation; the outro is a quiet practical note, the close
           a graceful final line — the two registers give the zone air
           and hierarchy. */
        .letter-outro {
          /* Follows the box with a modest gap (no bottom-push) — the
             whole block is centred by .right-lower, so no void; the rule
             marks the turn from argument to invitation. */
          margin-top: 26px;
          padding-top: 24px;
          border-top: 1px solid var(--theme-border-soft);
          font-size: 15.5px;
          line-height: 1.66;
          font-style: normal;
          letter-spacing: 0.012em;
          color: var(--theme-fg-muted);
        }
        /* ─── FRONT-SLIDE OPENING ─── */
        /* "to the reader" + the calculator hook, set on the LEFT of the
           hero (founder, 2026-07-12: "on the left and elegant") in the
           open cream beside the arch, vertically centred, quiet ink.
           Left-aligned like the opening of a page; peels up with the
           slide. A hairline rule under the salutation gives it the
           frontispiece air. Anchored in the pixel-locked stage-top. */
        .front-epigraph {
          position: absolute;
          left: 118px;
          top: 50%;
          transform: translateY(-50%);
          width: 402px;
          text-align: left;
          z-index: 3;
        }
        /* Orientation robustness — the wall scales by cover while the stage
           scales by min(), so as the viewport squares up (below ~10:7) the
           arch drifts left under the stage's left-anchored epigraph
           (verified at 1280×1024 and 1080×1400: text lands on the window).
           In exactly those cases the stage is width-limited (spans the full
           viewport) and the clean cream sits RIGHT of the arch — so flip
           the epigraph to the right side of the stage. Text stays
           left-aligned; only the anchor moves. */
        @media (min-width: 900px) and (max-aspect-ratio: 10/7) {
          .front-epigraph {
            left: auto;
            right: 108px;
          }
        }
        .front-salutation {
          margin: 0 0 18px;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(26, 19, 24, 0.16);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 13px;
          letter-spacing: 0.2em;
          color: rgba(26, 19, 24, 0.5);
          text-transform: lowercase;
          user-select: none;
        }
        .front-epigraph-line {
          margin: 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 20px;
          line-height: 1.56;
          letter-spacing: 0.004em;
          /* Mellowed toward grey (2026-07-13, founder) — a lower-opacity ink
             reads as a warm grey over the cream, softer on the page than the
             near-black 0.85 without leaving the plum palette. */
          color: rgba(26, 19, 24, 0.66);
        }
        /* ─── The front trichotomy (2026-07-13) — form is content: the two
           losing doors dimmed, the way through alive. ─── */
        .front-lead {
          margin: 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 23px;
          line-height: 1.42;
          letter-spacing: 0.002em;
          color: rgba(26, 19, 24, 0.78);
          text-wrap: balance;
        }
        .front-fork { margin: 0; }
        .fork-line {
          margin: 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 18.5px;
          line-height: 1.5;
          letter-spacing: 0.004em;
          text-wrap: pretty;
        }
        /* The losing path — dimmed, half-faded out of the frame; sits
           close under the lead (same thought, fading). */
        .fork-lose { color: rgba(26, 19, 24, 0.32); }
        /* The turn — a full breath of air above marks the argument's
           pivot (rhythm does the work, not another rule); ink and the
           letter's italic voice lift it against the faded line above. */
        .fork-win {
          margin-top: 26px;
          color: rgba(26, 19, 24, 0.78);
          font-style: italic;
        }
        /* The offer line — the free-sample frame planted on slide one:
           quieter and smaller than the win line (it's the footnote-sized
           fact that shrinks the decision), set apart by a breath. */
        .fork-offer {
          margin-top: 16px;
          font-size: 16px;
          font-style: italic;
          color: rgba(26, 19, 24, 0.55);
        }
        /* The second plate — mirrors "the question" above it (same
           register, same hairline), a full breath apart so the front reads
           as two mini-sections; carries the name so no sentence has to. */
        .front-salutation-answer {
          margin-top: 64px;
        }
        /* The founding line — the quiet hinge between question and list:
           roman, a step smaller than the question, a full breath below
           it. */
        .front-alex {
          margin: 48px 0 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: normal;
          font-size: 17px;
          line-height: 1.58;
          letter-spacing: 0.006em;
          color: rgba(26, 19, 24, 0.6);
        }
        /* The three things — bare parallel verb-lines in the letter's
           italic voice; their parallelism is the only structure needed. */
        .fork-ans {
          margin: 11px 0 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 18.5px;
          line-height: 1.5;
          color: rgba(26, 19, 24, 0.72);
        }
        .front-alex + .fork-ans {
          margin-top: 26px;
        }
        .cta-block {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 7px;
        }
        /* Footer-cols — supplementary nav grouped by intent. Sits below
           the CTAs as a quiet link directory. Italic small-caps column
           heads, plain link text. Mirrors the back-slide register Fleet
           uses but tuned to the warm cream / burgundy palette. */
        /* The letter's last line — the post-CTA nudge, one line, its own
           beat. Slightly larger than the captions so it reads as prose,
           not chrome. */
        .low-agency {
          margin: 26px 0 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 15px;
          letter-spacing: 0.01em;
          color: var(--theme-fg-muted);
        }
        /* The places line — library. marketplace. under the CTAs, carrying
           the exact prod nav-shelf styling (period marks, 15px medium,
           spaced) now that it lives on the themed bottom slide instead of
           the nav — theme-toned like the shelf was when scrolled to the
           bottom. Mobile re-orders it to the colophon footer (order 7). */
        .quiet-links {
          display: flex;
          align-items: center;
          transition: opacity 320ms ease;
          gap: clamp(18px, 1.8vw, 26px);
          /* Bottom-pinned in right-col — its space-between drops this to the
             bottom. Matches right-lower's box (752px, flex-end, -32px) and
             the letter column's 64px left inset so it left-aligns with the
             CTAs; margin-bottom equals the wordmark-block's so both baselines
             align across the slide. */
          align-self: flex-end;
          width: 752px;
          padding-left: 72px;
          margin: 0 -32px var(--lower-block-bottom) 0;
        }
        .quiet-link {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: normal;
          font-weight: 500;
          font-size: 15px;
          letter-spacing: 0.02em;
          text-decoration: none;
          color: var(--theme-fg-faint);
          transition: color 180ms ease;
        }
        .quiet-link:hover { color: var(--theme-fg); }
        /* The mark — upright period, a breath tighter to the word than the
           tracking sets it, echoing the brand nav-dot (same as the shelf). */
        .quiet-link .shelf-dot { letter-spacing: 0; margin-left: 0.02em; }
        .cta-pair a.lr-cta {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          /* Matches button.install-cta exactly (font-size + padding) so the
             two CTAs are the same size and their captions align — standardized
             pair, not two slightly different boxes. */
          font-size: 17px;
          padding: 12px 26px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          font-style: normal;
          letter-spacing: 0.003em;
          transition:
            background 180ms ease,
            color 180ms ease,
            border-color 180ms ease,
            opacity 180ms ease;
        }
        .cta-pair a.lr-cta-primary {
          background: var(--theme-fg);
          color: var(--theme-bg);
        }
        .cta-pair a.lr-cta-primary:hover {
          opacity: 0.86;
        }
        /* Ghost — the alternative. Inset box-shadow draws the outline
           without consuming layout space, so the ghost button matches
           the primary's exact height to the pixel. A real border would
           add 2px to the ghost and shift its subtitle 2px below the
           primary's subtitle. Wakes on hover. */
        .cta-pair a.lr-cta-ghost {
          background: transparent;
          color: var(--theme-fg);
          box-shadow: inset 0 0 0 1px var(--theme-border-soft);
          transition:
            box-shadow 180ms ease,
            background 180ms ease;
        }
        .cta-pair a.lr-cta-ghost:hover {
          box-shadow: inset 0 0 0 1px var(--theme-fg-muted);
          background: rgba(0, 0, 0, 0.02);
        }
        /* Homepage primary CTA — looks exactly like the old "join the tribe"
           filled button (same fill, just a touch bigger), but copies the install
           command to the clipboard instead of navigating. The label stays the
           pretty words; the copy icon + caption say what it does. */
        .cta-pair .install-cta {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px;
          padding: 12px 26px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          font-style: normal;
          letter-spacing: 0.003em;
          background: var(--theme-fg);
          color: var(--theme-bg);
          text-decoration: none;
          transition: opacity 180ms ease;
        }
        .cta-pair .install-cta:hover { opacity: 0.86; }
        .install-cta-icon {
          display: inline-flex;
          align-items: center;
        }
        .install-cta-icon svg { display: block; }
        /* Subtitle — does the explanatory work so the buttons stay
           terse. Italic, faint. Hangs flush left from the button's
           outer edge — caption-from-box, not caption-from-text. */
        .cta-sub {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px;
          font-style: italic;
          /* fg-muted (was fg-faint) — explanatory caption next to the
             primary CTA must hit AA. The italic register already reads
             as quieter than the button label; muted vs faint is the
             contrast difference. */
          color: var(--theme-fg-muted);
          letter-spacing: 0.012em;
          line-height: 1.35;
          padding-left: 0;
        }
        /* WORDMARK + DICT STACK — Fleet's signature anchor block.
           Wordmark dominates, then phon, then numbered defs, then
           footnote. The stack creates visual gravity at bottom-left. */
        .wordmark-block {
          display: flex;
          flex-direction: column;
          align-self: flex-start;
          max-width: 540px;
          margin-left: -32px;
          margin-bottom: var(--lower-block-bottom);
        }
        .big-word {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 400;
          font-style: normal;
          font-size: 144px;
          line-height: 0.9;
          letter-spacing: -0.026em;
          color: var(--theme-fg);
          margin: 0;
          white-space: nowrap;
        }
        .big-word-dot {
          font-style: normal;
          color: var(--theme-fg);
          margin-left: -0.04em;
        }
        .big-word-sup {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 0.16em;
          color: var(--theme-fg-faint);
          vertical-align: super;
          margin-left: 0.04em;
          font-weight: 400;
          font-style: italic;
        }
        /* Phon — tucked tight under the wordmark, indented so it sits
           visually inside the word's footprint, not extending left.
           Colour uses fg-muted (was fg-faint) so the IPA passes WCAG
           AA contrast on every theme background; faint was ≈3:1 which
           failed for body-sized text. */
        .phon {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 12.5px;
          color: var(--theme-fg-muted);
          margin: -8px 0 10px 0;
          padding-left: 0;
        }
        .dict-line {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13.5px;
          line-height: 1.42;
          color: var(--theme-fg);
          margin: 0;
          max-width: 520px;
        }
        .dict-line + .dict-line {
          margin-top: 10px;
        }
        .dict-line em {
          font-style: italic;
          /* fg-muted (was fg-faint) — same WCAG AA reasoning as .phon:
             the "I. n." / "II. n." labels are 13.5px body text and
             need ≥ 4.5:1 contrast. */
          color: var(--theme-fg-muted);
          margin-right: 4px;
        }
        .dict-line a {
          color: var(--theme-fg);
          text-decoration: underline;
          text-decoration-color: var(--theme-border-soft);
          text-underline-offset: 2px;
          transition: text-decoration-color 180ms ease;
        }
        .dict-line a:hover {
          text-decoration-color: var(--theme-fg);
        }
        .footnote {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: clamp(10px, 0.78vw, 11.5px);
          line-height: 1.4;
          color: var(--theme-fg-muted);
          margin: 8px 0 0;
          max-width: 520px;
        }
        .footnote sup {
          font-size: 0.85em;
          margin-right: 2px;
          font-style: normal;
        }
        .footnote a {
          color: var(--theme-fg-muted);
          text-decoration: underline;
          text-decoration-color: var(--theme-border-soft);
          text-underline-offset: 2px;
        }
        .footnote a:hover {
          color: var(--theme-fg);
        }

        /* Motto sign-off — sits at the bottom of the right-stack,
           left-aligned so its left edge mirrors the wordmark's right
           edge around page centre. */
        .motto-center {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: clamp(13px, 1.05vw, 16px);
          color: var(--theme-fg-muted);
          letter-spacing: 0.005em;
          padding-bottom: 6px;
          white-space: nowrap;
        }
        .motto-center em {
          font-style: italic;
        }

        .copyright {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 12px;
          color: var(--theme-fg-muted);
          justify-self: end;
          padding-bottom: 4px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
          text-align: right;
        }
        .legal-row {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .legal-row a {
          color: var(--theme-fg-muted);
          text-decoration: none;
        }
        .legal-row a:hover {
          color: var(--theme-fg);
        }
        .legal-row .sep {
          color: var(--theme-fg-faint);
        }
        .footer-line {
          color: var(--theme-fg-muted);
        }
        /* Founder line — the human handle. Email link opens mail. */
        .founder-line {
          color: var(--theme-fg-muted);
        }
        .founder-line .sep {
          color: var(--theme-fg-faint);
          margin: 0 2px;
        }
        .founder-line a {
          color: var(--theme-fg);
          text-decoration: none;
          border-bottom: 1px solid var(--theme-border-soft);
          transition: border-color 180ms ease;
          padding-bottom: 1px;
        }
        .founder-line a:hover {
          border-bottom-color: var(--theme-fg);
        }

        /* ─── MOBILE & TABLET PORTRAIT ───
           The desktop peel mechanic relies on both slides being position:fixed
           and the runway providing scroll range. Below 900px (phones and tablet
           portrait) that traps content inside a too-narrow viewport, so we drop
           the peel: both slides flow naturally, the runway collapses, and the
           page becomes a single vertical scroll. Nav stays fixed (still useful),
           watermark is hidden (it overlaps content once everything stacks). */
        /* Mobile-only forced line breaks — desktop wraps these phrases
           naturally (the original rhythm); mobile needs them on their own
           lines because the narrow column otherwise mid-breaks awkwardly. */
        .mob-br { display: none; }
        @media (max-width: 899px) {
          .mob-br { display: inline; }
        }
        @media (max-width: 899px) {
          /* Body bg: cream for the top-slide region (first viewport-height of
             the document), theme bg for the rest. Hard-stop gradient so iOS
             overscroll at the top of page shows cream (matching top-slide
             paper) and overscroll past the bottom shows theme bg (matching
             back-slide). Without this, the body's theme bg leaks above the
             top-slide content (status bar / safe area) and below it. */
          body {
            /* svh, not dvh — dvh tracks the iOS address bar, so the
               cream→theme stop snaps every time the bar collapses or
               expands. svh holds the smallest stable height (chrome
               visible) so the seam is invariant during scroll. */
            background: linear-gradient(
              to bottom,
              #f7f2ec 0,
              #f7f2ec 100svh,
              var(--theme-bg) 100svh,
              var(--theme-bg) 100%
            ) !important;
          }
          .runway {
            display: none;
          }
          .top-slide,
          .middle-slide,
          .bottom-slide {
            position: relative;
            inset: auto;
            /* svh (small viewport height) is stable across iOS Safari's
               address-bar collapse/expand. dvh changes with chrome state,
               which rescales background-size: cover on .top-slide and
               reads as the painting "zooming" on scroll. svh holds. */
            min-height: 100svh;
            transform: none !important;
            box-shadow: none !important;
          }
          .top-slide {
            padding: 152px clamp(20px, 5vw, 64px) 96px;
            /* Mobile gets its OWN scene asset — the desktop 16:9 wall
               cropped to portrait made the window wider than the phone
               screen ("too big", founder 2026-07-08). The square asset
               is the same frame outpainted (wall continues above, floor
               and foliage below), so cover on portrait shows the window
               at ~59% of screen width with room to breathe. */
            background-image: url(/sea-arch-mobile.jpg);
            background-position: center center;
            /* No filter — the brightness(1.06) lift compensated for the
               old dark Adam niche; on the already-bright sea scene it
               washed the faint window out entirely. */
          }
          /* Breeze video sits on top of the PNG; same mobile recentre
             so the niche stays in the visual middle. Without this the
             desktop 75% crop pushes the painting halfway off the left. */
          .breeze-video {
            object-position: center center;
          }
          /* Mobile bypasses the desktop scaled canvases — display:contents
             makes the wrappers invisible to layout so children flow as if
             they weren't there, and the existing mobile rules below take
             over the inner elements directly. */
          .stage-top,
          .stage-middle,
          .stage-bottom {
            display: contents;
          }
          .middle-slide {
            padding: 60px clamp(20px, 5vw, 64px) 60px;
            display: flex;
            align-items: center;
          }
          /* Slide 2 marginalia on mobile — the desktop gutter layout
             (label absolute-positioned at left:0, body padded 280px)
             collapses on phone widths. Stack vertically: numeral + label
             on their own line above each body. */
          .middle-slide .statement {
            max-width: 100%;
            padding: 0;
            gap: 32px;
          }
          .middle-slide .statement > p {
            padding: 0 0 28px 0;
            font-size: 17px;
            line-height: 1.55;
            min-height: 0;
          }
          .middle-slide .statement > p:not(:last-child)::after {
            left: 0;
          }
          .middle-slide .statement > p:not(.statement-close):not(.continuation)::before {
            position: static;
            display: inline;
            margin-right: 6px;
          }
          .middle-slide .statement .beat-title {
            position: static;
            display: inline;
            width: auto;
            font-size: 14px;
          }
          .middle-slide .statement .beat-title::after {
            content: ' — ';
            color: var(--theme-fg-faint);
          }
          /* Drop the manuscript ruling — there's no gutter to anchor on. */
          .middle-slide .statement::before {
            content: none;
          }
          .bottom-slide {
            padding: 60px clamp(20px, 5vw, 64px) 36px;
          }
          /* Watermark — FIXED again, like desktop (founder 2026-07-08:
             "it's not a watermark, it doesn't persist… needs to be fixed
             when you scroll" — supersedes the 2026-07-01 absolute-in-hero
             call, which answered the glyph "bleeding over" the letter;
             the mitigation now is placement + faintness, not scrolling
             away). Desktop orientation: right of centre, lifted off the
             bottom edge. */
          .watermark {
            position: fixed;
            bottom: 16%;
            left: 66%;
            transform: translateX(-50%);
            font-size: clamp(150px, 40vw, 240px);
            /* Desktop's tyrian, one notch stronger — the mobile glyph is
               ~half desktop's size, and at a flat 5% it vanished into the
               letter's text (the "doesn't persist" report was partly
               this: it persisted but couldn't be seen). */
            color: rgba(58, 15, 61, 0.07);
            opacity: 1;
          }

          .nav {
            padding: 18px 18px;
            /* Two states. Default (front slide, .nav not .on-bottom):
               transparent so the nav reads as part of the painting —
               the wordmark + nav links sit on the marble wall, no
               cream bar floating in front. .on-bottom (set by the
               peel-midpoint toggle, mobile too): solid theme-bg with
               blur so back-slide prose scrolling under doesn't bleed
               through the brand. */
            background: transparent;
            transition: background 320ms ease;
          }
          .nav.on-bottom {
            background: color-mix(in srgb, var(--theme-bg, #f7f2ec) 94%, transparent);
            backdrop-filter: blur(14px) saturate(1.05);
            -webkit-backdrop-filter: blur(14px) saturate(1.05);
          }
          .nav-brand {
            font-size: 22px;
          }
          /* Mobile shows the reading group only; the places (library ·
             marketplace) live in the colophon footer line instead —
             four links + brand don't fit a phone header. */
          .nav-shelf {
            display: none;
          }
          .nav-links {
            display: flex;
            font-size: 13px;
            gap: 14px;
          }
          /* Tagline visible on mobile under the brand. */
          .nav-tagline {
            font-size: 12px;
          }
          /* TOP SLIDE — drop the glass bubble on mobile. The desktop
             bubble framed centered content beautifully; on mobile the
             content fills edge-to-edge and the bubble adds visual
             noise without earning its place. Let the cream paper +
             fresco watermark carry the front slide instead. */
          .top-inner::before {
            display: none;
          }
          .hero-h1 {
            font-size: clamp(30px, 7vw, 56px);
          }
          .alpha-mark {
            position: absolute;
            bottom: 64px;
            left: 20px;
            font-size: 10.5px;
          }
          /* Front-slide opening on mobile — over the square scene, lower
             third, sized to the viewport (the desktop 648px block would
             overflow). stage-top is display:contents here, so this
             anchors to .top-slide. */
          /* Mobile: centre it over the square scene (the desktop left
             offset overflows a narrow screen); no hairline rule —
             centred reads cleaner on phone. */
          .front-epigraph {
            left: 50%;
            top: 112px;
            transform: translateX(-50%);
            width: 84vw;
            max-width: 440px;
            text-align: center;
          }
          .front-salutation {
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 11px;
            font-size: 11px;
          }
          .front-epigraph-line {
            font-size: 16.5px;
            line-height: 1.52;
          }

          /* Mobile spacing — the two-slide peel format is gone here;
             everything flows naturally. Give every block more
             breathing room than desktop allows. */

          /* FRONT SLIDE breathing — manifesto and h1 stack with more
             air between them. */
          .top-inner {
            gap: 64px;
          }
          .manifesto {
            gap: 32px;
          }

          /* BOTTOM SLIDE — single column, ornament first as a decorative
             beat, then statement (the argument), then close + CTA, then
             wordmark + dict-lines as the closing identity block. Order is
             set via flex order so we don't have to touch JSX. */
          .bottom-inner {
            flex-direction: column;
            gap: 64px;
            align-items: stretch;
          }
          .left-col,
          .right-col {
            width: 100%;
            flex: 0 0 auto;
            gap: 32px;
          }
          /* Mobile flattens the entire two-column desktop structure
             into a single column at bottom-inner level. left-col,
             right-col, and right-lower all use display: contents,
             so their children become direct flex children of
             bottom-inner. Each element then orders itself. */
          .left-col,
          .right-col,
          .right-col .right-lower {
            display: contents;
          }
          .ornament-wrap {
            order: 1;
            justify-content: center;
            padding-top: 8px;
            padding-left: 0;
          }
          .statement-salutation {
            order: 2;
          }
          .statement-epigraph {
            order: 3;
          }
          .statement-close,
          .statement-beat,
          .letter-sec {
            order: 4;
            /* The letter's blocks are one thought — pull them back
               against the 64px flat flex gap (desktop uses 18px). The
               founder's phone screenshots read the 64px gaps as
               "spacing all off". Net ≈ 26px inside the letter. */
            margin-top: -38px;
          }
          /* The split close travels as ONE block: the wrapper takes the
             order and the gap-pull; the beats inside keep only their own
             12px rhythm (the per-beat -38px above would stack them into
             each other — that overlap shipped for a minute on 07-16). */
          .action-close {
            order: 4;
            margin-top: -38px;
          }
          .action-close .statement-beat {
            order: 0;
            margin-top: 0;
          }
          .letter-sec {
            margin-bottom: -44px;
          }
          .cta-pair {
            order: 5;
          }
          .low-agency {
            order: 5;
            margin-top: 4px;
          }
          .wordmark-block {
            order: 6;
            margin-left: 0;
            max-width: 100%;
            /* Extra breath above so the brand block reads as its
               own closing section, not as the next paragraph after
               the CTAs. Adds to the bottom-inner 64px flex gap. */
            margin-top: 96px;
          }
          .quiet-links {
            order: 7;
            width: auto;
            align-self: auto;
            padding-left: 0;
            margin: 0;
          }

          /* Film plate on mobile — geometry for the SQUARE mobile asset
             (sea-arch-mobile.jpg, bg center/center cover). Measured
             fractions of the full-dapple canvas (2026-07-09): window
             centre x 0.5045, y 0.4705; window 0.253w × 0.209h; ledge
             line 0.619; caption anchor 0.644. Wall units for a square
             image under cover: both dimensions = max(100vw, 100svh). */
          .film-invite {
            --wall-w: max(100vw, 100svh);
            --wall-h: max(100vw, 100svh);
            left: calc(50vw + 0.005 * var(--wall-w));
            top: calc(50svh + 0.144 * var(--wall-h));
            transform: translate(-50%, -50%);
          }
          .film-invite-btn {
            font-size: 13.5px;
          }
          /* Window hit-area on mobile — offsets from the plate's anchor
             in the same wall units. Tap-to-play; the hover cue is
             already display:none. */
          .film-window-hit {
            top: calc(50% - 0.1735 * var(--wall-h));
            width: calc(0.26 * var(--wall-w));
            height: calc(0.215 * var(--wall-h));
          }

          /* Statement — drop the absolute roman numerals (they hang in
             the left margin, no room for that here). More gap between
             the five beats so each one lands as its own breath. */
          .statement {
            align-self: stretch;
            max-width: 100%;
            margin: 0;
            padding-left: 0;
            gap: 32px;
          }
          .statement > p:not(.statement-close):not(.continuation)::before {
            position: static;
            display: inline;
            margin-right: 0.5em;
            font-size: 0.7em;
          }
          .statement p {
            font-size: clamp(17px, 2.1vw, 21px);
            line-height: 1.42;
          }
          .statement-close {
            padding-left: 0;
            padding-top: 18px;
            font-size: clamp(16px, 1.9vw, 19px);
            line-height: 1.5;
          }
          .statement-close::before {
            left: 0;
          }
          /* Mobile keeps the FULL flowing letter — no scroll box (page
             scroll on mobile isn't a fixed-stage commitment). The scroll
             box flattens via display: contents so its sections become
             direct flex children of bottom-inner and inherit the
             per-child order rules (an unflattened wrapper defaults to
             order 0 and jumps above the ornament — that bug shipped for
             ~a minute on 2026-07-10). Height/mask/scroll all drop with
             the box. */
          .letter-window,
          .letter-scroll {
            display: contents;
          }
          .letter-more {
            display: none;
          }
          .cta-pair {
            padding-left: 0;
            gap: 14px;
          }

          /* Wordmark scales by viewport so it fits on one line. At 12.5vw it
             clears 375px (≈47px), 414px (≈52px), 768px (≈96px); cap at 120px
             for tablet-portrait widths. Stays nowrap so it never breaks
             mid-word. */
          .big-word {
            font-size: clamp(44px, 12.5vw, 120px);
            white-space: nowrap;
            letter-spacing: -0.022em;
          }
          .dict-line {
            max-width: 100%;
            font-size: clamp(13.5px, 1.4vw, 15px);
          }
          .phon {
            font-size: clamp(11.5px, 1.1vw, 13px);
            margin-top: -4px;
          }

        }

        /* Short phones (≤700px tall): at max scroll the closing block
           (wordmark + quiet links + padding) fills the whole viewport and
           parks the primary CTA under the fixed nav wordmark (measured
           375×667: cta top 18px vs nav bottom 58px). Trim the closing
           block's breath only here so the resting state leaves the CTA
           clear. Spacing-only — order and peel untouched. */
        @media (max-width: 899px) and (max-height: 700px) {
          .wordmark-block {
            margin-top: 24px;
          }
          .bottom-slide {
            padding-bottom: 24px;
          }
        }

      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SEAL — rotating Greek + English text rings around the a.
   mark. The centerpiece of the front slide.
   ════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Seal() {
  return (
    <div className="seal">
      <svg viewBox="-150 -150 300 300" className="seal-svg">
        <defs>
          <path
            id="seal-outer"
            d="M 0,0 m -128, 0 a 128,128 0 1,1 256,0 a 128,128 0 1,1 -256,0"
          />
          <path
            id="seal-inner"
            d="M 0,0 m -98, 0 a 98,98 0 1,1 196,0 a 98,98 0 1,1 -196,0"
          />
          <radialGradient id="seal-halo" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#fff2c9" stopOpacity="0.95" />
            <stop offset="42%" stopColor="#f4d18a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d4a04f" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle r="144" fill="url(#seal-halo)" />

        <g className="ring ring-outer">
          <text className="seal-text">
            <textPath href="#seal-outer" startOffset="0">
              · ΜΕΝΤΕΣ ΑΕΤΕΡΝΑΕ · ΑΛΕΞΑΝΔΡΕΙΑ · ΒΙΒΛΙΟΘΗΚΗ ·
            </textPath>
          </text>
        </g>

        <circle
          r="116"
          fill="none"
          stroke="#b68a3c"
          strokeWidth="0.5"
          strokeDasharray="0.6 3"
        />
        <circle r="110" fill="none" stroke="#b68a3c" strokeWidth="0.35" />

        <g className="ring ring-inner">
          <text className="seal-text seal-text-en">
            <textPath href="#seal-inner" startOffset="0">
              · THE THINKING REPUBLIC · THE INTENT LAYER · YOURS ·
            </textPath>
          </text>
        </g>

        {[0, 90, 180, 270].map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <line
              x1="0"
              y1="-128"
              x2="0"
              y2="-118"
              stroke="#3a0f3d"
              strokeWidth="1"
            />
          </g>
        ))}

        <g className="seal-center">
          <circle r="46" fill="#3a0f3d" />
          <text
            x="0"
            y="12"
            textAnchor="middle"
            fill="#efe9e0"
            fontSize="44"
            fontFamily="var(--font-serif), serif"
            fontStyle="italic"
          >
            a.
          </text>
        </g>
      </svg>

      <style>{`
        .seal {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .seal-svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }
        .ring-outer {
          transform-origin: 0 0;
          animation: spinOuter 80s linear infinite;
        }
        .ring-inner {
          transform-origin: 0 0;
          animation: spinInner 55s linear infinite reverse;
        }
        @keyframes spinOuter {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes spinInner {
          to {
            transform: rotate(360deg);
          }
        }
        .seal-text {
          font-family: var(--font-serif), serif;
          font-size: 11.4px;
          font-style: italic;
          fill: #3a0f3d;
          letter-spacing: 0.22em;
        }
        .seal-text-en {
          font-size: 9px;
          letter-spacing: 0.36em;
          fill: #6b3a5a;
        }
        .seal-center {
          filter: drop-shadow(0 4px 12px rgba(58, 15, 61, 0.3));
        }
      `}</style>
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
      <style>{`
        .orn {
          width: clamp(340px, 46vh, 480px);
          aspect-ratio: 1;
          position: relative;
          overflow: hidden;
        }
        .orn-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          user-select: none;
          animation: ornFade 500ms ease-out;
        }
        @keyframes ornFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @media (max-width: 899px) {
          .orn {
            width: 320px;
            height: 320px;
          }
        }
        @media (max-width: 680px) {
          .orn {
            width: 240px;
            height: 240px;
          }
        }
      `}</style>
    </div>
  );
}
