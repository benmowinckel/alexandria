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

// The homepage primary action: the "join the tribe" button copies the install
// "join the tribe" navigates to /start on every device (the action page:
// open-in-claude-code + copy-command on desktop, shortcut + email on
// mobile). One scalable door instead of an inline copy that couldn't say
// where the command goes — new agents, deep links, and flows land on
// /start without ever touching this button again.
function HomeInstall() {
  return (
    <div className="cta-block">
      <Link href="/start" className="install-cta">
        join the tribe
      </Link>
      <span className="cta-sub install-cta-sub">
        free, five minutes.
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
    length: 'ten minutes',
  },
];

function FrontFilm() {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const film = FILMS[idx];
  const step = (d: number) => {
    setIdx((idx + d + FILMS.length) % FILMS.length);
    setOpen(false);
  };
  // Lightbox plumbing — Esc closes, page scroll locks while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open]);
  return (
    <figure className="film-frame">
      {/* Constant 16:9 canvas so the frame never resizes as the rotation
          swipes; each film plays at its own aspect inside the lightbox. */}
      <button
        type="button"
        className="film-canvas film-poster"
        onClick={() => setOpen(true)}
        aria-label={`play ${film.label}`}
      >
        <span className="film-title" aria-hidden>{film.label}</span>
        <span className="film-length" aria-hidden>{film.length}</span>
        <span className="film-play" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </button>
      {/* Rotation plate — only exists once there's something to rotate;
          the card itself carries title + length. */}
      {FILMS.length > 1 && (
        <figcaption className="film-plate">
          <button type="button" className="film-arrow" onClick={() => step(-1)} aria-label="previous film">&larr;</button>
          <span className="film-label"><em>{film.label}</em></span>
          <button type="button" className="film-arrow" onClick={() => step(1)} aria-label="next film">&rarr;</button>
        </figcaption>
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
  const topRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setShowBreeze(!rm.matches);
    sync();
    rm.addEventListener('change', sync);
    return () => rm.removeEventListener('change', sync);
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
  }, [showBreeze]);

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
        <span className="beat-title">The collective</span>
        <em className="em-strong">Five friends and your subscription
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
    <div className="landing-root" data-theme={theme.id} data-adam="1" data-centerpiece={centerpieceVariant ?? undefined}>
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
                roman small-caps subtitle. Tells the cold reader what
                alexandria IS in three words, without dominating. */}
            <span className="nav-subtitle nav-subtitle-front" aria-hidden>the library of human minds</span>
            <span className="nav-subtitle nav-subtitle-back" aria-hidden>mentes aeternae</span>
          </div>
          <div className="nav-links">
            {/* The two depth documents — the demo now lives on the front
                slide itself (the film frame), so the header carries only
                the reading: whitepaper (the argument) + letter (the soul). */}
            <span className="nav-group">
              {/* Two reading documents, differentiated by register:
                  whitepaper roman (the argument), founder's letter italic
                  (the author's hand). "founder's letter" over "letter" —
                  a genre everyone recognises, so the click decision is
                  legible; "manifesto" rejected (the connotations). */}
              <a href="/whitepaper">whitepaper</a>
              <span className="nav-sep" aria-hidden>·</span>
              <a href="/docs/letter.pdf" className="nav-letter" target="_blank" rel="noopener noreferrer">founder&rsquo;s letter</a>
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
            tree-leaf shadows swaying. PNG stays as the .top-slide
            background so first paint is instant; video fades in on top
            once it can play. Ping-pong loop (forward+reverse), so it's
            seamless with no visible cut. Reduced-motion users keep the
            still PNG (video is hidden via media query). */}
        {showBreeze && (
          <>
            <video
              ref={videoRef}
              className="adam-video"
              poster="/adam-arch-wide.png"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              aria-hidden
            >
              {/* WebM (137KB, VP9) first — Android Chrome and most
                  modern browsers pick it. Safari falls through to the
                  H.264 MP4 (923KB). preload="metadata" so cellular
                  users don't eat the full download until the canplay
                  event drives the fade-in. */}
              <source src="/adam-scene.webm" type="video/webm" />
              <source src="/adam-scene.mp4" type="video/mp4" />
            </video>
            {/* Veo watermark mask — Fast-plan output stamps "Veo" in
                the bottom-right; soft cream radial blend covers the
                corner. Only rendered with the video — the PNG poster
                has no watermark. */}
            <div className="veo-mask" aria-hidden />
          </>
        )}
        {/* Stage canvas — pixel-locked 1440×900 frame uniformly scaled to
            the viewport via --stage-scale-top. Inside this wrapper everything
            is absolute pixels, so type, drop-caps, and corner marks never
            reflow with viewport changes. Mobile (<899px) sets this to
            display:contents so the existing flow layout takes over. */}
        <div className="stage-top">
        <span className="alpha-mark">san francisco · mmxxvi</span>
        {/* Frontispiece composition — the wall scene is the slide; the
            film frame hangs where the fresco niche sits, a screen in a
            museum tableau. Poster + plate at rest (the painting's
            silence, kept); click plays in place. The FILMS rotation
            grows sideways as the launch film + ads ship. */}
        <FrontFilm />
        <div className="top-inner" />
        </div>
      </div>

      {/* Persistent fresco removed — replaced by .adam-centerpiece inside
          .top-inner so the Adam visual flows in the layout (no overlap
          with text), like Fleet's animated centerpiece. */}

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
                <em>II. n.</em> its rebuilding; a library of
                human minds, written by their authors so ai
                thinks with them, not for them; the path through
                the singularity.
              </p>
            </div>
          </div>

          <div className="right-col">
              <div className="right-lower">
                <p className="statement-salutation">
                  <em>to the reader.</em>
                </p>

                <p className="statement-epigraph">
                  this is humanity&rsquo;s greatest challenge
                  &mdash; and perhaps our last. soon, ai will do
                  most of the thinking. most minds will atrophy
                  quietly; a few will compound through every model
                  that comes.
                </p>

                <p className="statement-close">
                  alexandria is for those few. ai can&rsquo;t read your mind,
                  but it can read words &mdash; put your thoughts into words,
                  and it can think{' '}<em>with</em>{' '}you, not for you.
                  adding an <em>&ldquo;alexandria.md&rdquo;</em>{' '}to your ai
                  makes that automatic &mdash; it becomes a thought partner,
                  channelling its intelligence to improve yours, not replace
                  it.
                  <br /><br />
                  a working first version is the hard part, so take the
                  founder&rsquo;s &mdash; his whole system, open-sourced, free.
                  treat it like a good agents.md &mdash; it doesn&rsquo;t
                  matter if you have one, planned your own, or wouldn&rsquo;t
                  know where to start. five minutes, and it&rsquo;s yours to
                  reshape into any answer you like. not a system to download
                  &mdash; a culture to join.
                  <br /><br />
                  <span className="way-num">1</span>{' '}
                  <em className="way-label">the product</em>{' '}&mdash; the
                  founder&rsquo;s system, but make it your own.
                  <br />
                  <span className="way-num">2</span>{' '}
                  <em className="way-label">the company</em>{' '}&mdash; follow
                  along as we build it.
                </p>

                <div className="cta-pair">
                  <HomeInstall />
                  <div className="cta-block">
                    {/* Label echoes line 2 verbatim ("follow along as we
                        build it") — the scanner reads the numbered line,
                        sees the same words on the button, zero friction.
                        "stay close" was lovelier but opaque. */}
                    <Link href="/follow" className="lr-cta lr-cta-ghost">
                      follow along
                    </Link>
                    <span className="cta-sub">
                      friends, family, the curious
                    </span>
                  </div>
                </div>

                {/* The letter's true last line. */}
                <p className="low-agency">
                  <em>low agency is the only friction left.</em>
                </p>

                {/* One faint line instead of the old 3-column directory
                    (tried and rejected as noise — truth/website.md). The
                    library is the collective made visible; questions is the
                    objection-handler at the decision point. */}
                <p className="quiet-links">
                  <Link href="/library">library</Link>
                  <span className="quiet-sep" aria-hidden>&middot;</span>
                  <Link href="/marketplace">marketplace</Link>
                  <span className="quiet-sep" aria-hidden>&middot;</span>
                  <Link href="/questions">questions</Link>
                </p>
              </div>
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
        /* The founder's letter in italic — the author's hand against the
           whitepaper's roman argument. Same size, different voice. */
        .nav-links a.nav-letter {
          font-style: italic;
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
          font-family: inherit;
          font-style: italic;
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
        /* Frontispiece subtitle — Roman small-caps beneath the italic
           wordmark. Wide tracking, weight 500, faint colour. Sits as
           a quiet plaque beside the painting. Visible on top slide;
           fades out on peel since slide 2's dict carries the same role. */
        .nav-subtitle {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 6px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: normal;
          font-weight: 500;
          font-size: 10.5px;
          letter-spacing: 0.32em;
          text-transform: lowercase;
          font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1;
          color: rgba(26, 19, 24, 0.55);
          line-height: 1;
          white-space: nowrap;
          user-select: none;
          transition: color 320ms ease;
        }
        /* Front subtitle ("the library of human minds") fades OUT
           as you peel; back subtitle ("mentes aeternae") fades IN.
           Both stack at the same absolute position (top: 100%), so
           the swap is opacity-only — no layout shift. */
        .nav-subtitle-front {
          opacity: calc(1 - var(--peel-progress, 0) * 2);
        }
        .nav-subtitle-back {
          opacity: calc(var(--peel-progress, 0) * 2 - 1);
          font-style: italic;
          font-variant-caps: normal;
          font-feature-settings: "kern" 1;
          letter-spacing: 0.04em;
          font-size: 13px;
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
        /* Library — shelf entry: serif italic, quieter than the letter link */
        .nav-shelf {
          display: inline-flex;
          align-items: center;
          padding-right: clamp(16px, 2.2vw, 28px);
          margin-right: clamp(2px, 0.4vw, 6px);
          border-right: 1px solid rgba(26, 19, 24, 0.14);
        }
        .nav.on-bottom .nav-shelf {
          border-right-color: color-mix(in srgb, var(--theme-fg) 18%, transparent);
        }
        .nav-links .nav-shelf-link {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-weight: 400;
          font-size: 15px;
          letter-spacing: 0.04em;
          text-decoration: none;
          color: rgba(26, 19, 24, 0.5);
          transition: color 180ms ease;
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
        /* demo — uppercase in wax-seal accent. No underline (color +
           letterform carry the link affordance). Reads as a label against
           the italic letter (the work). Uppercase instead of small-caps
           because the smcp OpenType feature only activates after EB
           Garamond loads, which caused a visible reflow on first paint
           (lowercase fallback → small-caps). Plain uppercase renders
           identically in fallback and webfont, no flicker. */
        .nav-group .nav-demo {
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
        .nav-group .nav-demo:hover {
          color: var(--accent-hover);
          opacity: 1;
          text-decoration: none;
        }
        .nav.on-bottom .nav-group .nav-demo {
          color: var(--accent);
        }
        .nav.on-bottom .nav-group .nav-demo:hover {
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
          background-image: url(/adam-arch-wide.png);
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
        .adam-video {
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
        .adam-video.is-ready {
          opacity: 1;
        }
        /* Reduced-motion: keep the still frontispiece. */
        @media (prefers-reduced-motion: reduce) {
          .adam-video { display: none; }
        }
        /* Veo watermark mask — soft cream radial blob in the bottom-
           right covering the ~120×40px stamp on Fast-plan output. */
        .veo-mask {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 220px;
          height: 110px;
          background: radial-gradient(
            ellipse at 78% 70%,
            #d8ccb6 0%,
            rgba(216, 204, 182, 0.96) 32%,
            rgba(216, 204, 182, 0.65) 60%,
            rgba(216, 204, 182, 0) 100%
          );
          pointer-events: none;
          z-index: 1;
        }
        /* FILM FRAME — the screen hung on the wall where the fresco niche
           sits. Sized past the arch (~440×400 at stage scale) so it covers
           it at every reasonable crop; warm-tinted layered shadow so it
           reads as an object in the scene, not a UI card. */
        .film-frame {
          position: absolute;
          left: 50%;
          /* Canvas must fully cover the arch baked into the wall image
             (stage y 190–590): 760px wide at 16:9 = 427px tall, column
             centre 398 → canvas spans ~161–588 with the plate below. */
          top: 398px;
          transform: translate(-50%, -50%);
          width: 760px;
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
          z-index: 2;
        }
        /* The canvas at rest is a title card — mounted print, not a
           screenshot (a raw demo frame read as a floating browser; the
           fresco crop read as the one image every ai company reaches
           for). Constant 16:9 so the frame holds still as the rotation
           swipes; films play at their own aspect in the lightbox. */
        .film-canvas {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 22px;
          width: 100%;
          aspect-ratio: 16 / 9;
          padding: 0;
          cursor: pointer;
          background:
            radial-gradient(ellipse 120% 90% at 50% 30%, rgba(255, 252, 245, 0.55) 0%, transparent 60%),
            #efe8da;
          border: 1px solid rgba(26, 19, 24, 0.16);
          border-radius: 4px;
          overflow: hidden;
          box-shadow:
            0 1px 4px rgba(59, 47, 47, 0.12),
            0 12px 28px -10px rgba(59, 47, 47, 0.22),
            0 34px 64px -26px rgba(59, 47, 47, 0.18);
          transition: box-shadow 250ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .film-canvas:hover {
          box-shadow:
            0 2px 5px rgba(59, 47, 47, 0.14),
            0 16px 34px -10px rgba(59, 47, 47, 0.26),
            0 42px 76px -26px rgba(59, 47, 47, 0.2);
        }
        .film-title {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 30px;
          letter-spacing: 0.01em;
          color: #1a1318;
        }
        .film-length {
          margin-top: -14px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 13px;
          letter-spacing: 0.05em;
          color: rgba(26, 19, 24, 0.48);
        }
        .film-play {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 58px;
          height: 58px;
          border-radius: 50%;
          background: rgba(23, 19, 16, 0.82);
          color: #f5f0e8;
          transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), background 200ms ease;
        }
        .film-play svg { margin-left: 3px; }
        .film-canvas:hover .film-play {
          transform: scale(1.06);
          background: rgba(23, 19, 16, 1);
        }
        .film-canvas:active .film-play {
          transform: scale(0.98);
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
        /* Museum plate under the frame — label + (when the rotation has
           more than one film) the side arrows. */
        .film-plate {
          display: flex;
          align-items: center;
          gap: 18px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13.5px;
          letter-spacing: 0.04em;
          color: rgba(26, 19, 24, 0.55);
          user-select: none;
        }
        .film-label em { font-style: italic; }
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
           with the Adam fresco visible behind. The fresco's radial
           vignette already focuses above the text area, so the prose
           rests in clean cream. The vertical margin rule on .stage-top
           provides the manuscript anchor; the slide reads as one
           continuous folio rather than a card on a page. */

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
          /* Match ornament-wrap's padding-top (120px) + offset the
             statement-close's own -20px translateY + 14px padding-top
             so the visible top of the text aligns with the visible top
             of square ornaments (e.g. other-stone, alabaster). */
          margin-top: 126px;
          /* Squeeze the column — narrower text width pushes the left
             edge inward (right edge unchanged because right-lower is
             flex-end aligned). The closer + CTAs reflow to more lines
             but stay anchored to the right gutter. */
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
          gap: 18px;
          margin-bottom: var(--lower-block-bottom);
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
          padding-top: 14px;
          transform: translateY(-20px);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 26px;
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
          margin: 0 0 4px;
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
          margin-top: 30px;
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
        /* One faint link line — replaces the 3-column footer directory
           (rejected as noise, truth/website.md § tried-and-rejected). */
        .quiet-links {
          margin: 18px 0 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 12.5px;
          letter-spacing: 0.02em;
          color: var(--theme-fg-faint);
        }
        .quiet-links a {
          color: var(--theme-fg-muted);
          text-decoration: none;
          transition: opacity 180ms ease;
          /* Tap-target extension without shifting the line. */
          display: inline-block;
          padding: 6px 2px;
          margin: -6px -2px;
        }
        .quiet-links a:hover { opacity: 0.62; }
        .quiet-sep { padding: 0 9px; user-select: none; }
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
        /* Caption sits under the button's label (matching its left padding),
           not flush to the button's outer edge — reads as inside the box.
           Scoped to .cta-pair so it outranks .cta-sub's later padding-left:0. */
        .cta-pair .install-cta-sub { padding-left: 26px; }
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
            /* Compact hero — the film frame is the slide on mobile; no
               dead cream below it. min-height overrides the desktop-flow
               100svh set above. */
            min-height: auto;
            padding: 148px clamp(20px, 5vw, 64px) 72px;
            /* The baked-in arch would double-image behind the film frame
               here (on portrait it fills the whole width), so zoom the
               wall image past it: a clean wall-and-tree-shadow slice from
               left of the niche. 390% renders the image ~3.9× element
               width — window ends left of the arch (x≈0.35) at any
               phone width. */
            background-size: 390% auto;
            background-position: 2% 42%;
            filter: brightness(1.06) saturate(0.92);
          }
          /* Breeze video + its watermark mask are cut on mobile — the
             zoomed still IS the backdrop (no double image, no ~1MB
             download on cellular). */
          .adam-video,
          .veo-mask {
            display: none;
          }
          /* Breeze video sits on top of the PNG; same mobile recentre
             so the niche stays in the visual middle. Without this the
             desktop 75% crop pushes the painting halfway off the left. */
          .adam-video {
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
          /* Watermark — fixed so it persists across both slides as the user
             scrolls, mirroring the desktop intent. Color uses the active
             theme's fg with very low alpha so it reads faintly on both the
             cream front slide and any themed back slide (the desktop
             hardcoded purple was tuned for cream and disappears on dark
             themes). */
          .watermark {
            position: fixed;
            top: auto;
            bottom: 14%;
            left: 40%;
            transform: translateX(-50%);
            font-size: clamp(160px, 44vw, 260px);
            color: var(--theme-fg);
            opacity: 0.06;
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
          /* Mobile shows the same single letter link inline as desktop. */
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
          .statement-close {
            order: 4;
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
            margin-top: 0;
          }

          /* Film frame flows in the top-slide (the stage is
             display: contents here); full-width plate, generous
             breathing room inside the 152px/96px slide padding. */
          .film-frame {
            position: static;
            transform: none;
            width: 100%;
            max-width: 560px;
            margin: 0 auto;
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

        /* ?adam=1 — Creation-of-Adam fresco as an atmospheric layer.
           Goal: a wall with history, not a hero image. The figures bake
           INTO the cream paper via multiply blend rather than sitting on
           top. Sepia + low saturation collapse the original chroma toward
           the cream warmth so the fresco harmonises rather than competes.
           A radial vignette mask focuses the gesture (the hands) and
           fades to invisible at the edges, pulling the eye to the iconic
           moment and letting the rest decay into atmosphere. Vertically
           shifted up so the hands sit ABOVE the H1 — a blessing reaching
           down toward the words, not a body lying behind them. */
        .adam-bg {
          position: fixed;
          inset: 0;
          background-image: url(/adam.webp);
          background-position: 50% 30%;
          background-size: cover;
          background-repeat: no-repeat;
          /* Centerpiece, not watermark — the fresco IS the visual hero,
             like Fleet's world cluster. Opacity tracks the peel: 0.48 on
             front (visible enough to read as the focal gesture), fades to
             0.05 on back so the bottom-slide content reads cleanly. */
          opacity: calc(0.48 - var(--peel-progress, 0) * 0.43);
          filter: sepia(0.35) saturate(0.7) contrast(1) brightness(1.02);
          pointer-events: none;
          z-index: 22;
          /* Narrow horizontal band at upper portion. Top fades out so the
             nav sits on clean cream (no figures behind the letter link).
             Mid is bright so the hands' meeting reads as the focal gesture.
             Lower fades out so the manifesto + closer sit on clean cream
             (no anatomy behind the conversion line). The vignette is the
             editorial decision: the iconic moment, nothing else. */
          -webkit-mask-image: radial-gradient(ellipse 72% 30% at 50% 32%, #000 0%, rgba(0,0,0,0.95) 42%, rgba(0,0,0,0) 100%);
          mask-image: radial-gradient(ellipse 72% 30% at 50% 32%, #000 0%, rgba(0,0,0,0.95) 42%, rgba(0,0,0,0) 100%);
        }
        @media (max-width: 899px) {
          /* Mobile: shift the slice to favour Adam — his body fills the
             left half of the viewport, his arm reaches across to the
             right where the meeting fingertips appear. The reach IS the
             gesture; God is implied off-screen. Same upper-band vignette
             as desktop so the manifesto sits on clean cream below. */
          .adam-bg {
            background-position: 28% 50%;
            background-size: cover;
            opacity: calc(0.22 - var(--peel-progress, 0) * 0.18);
            -webkit-mask-image: radial-gradient(ellipse 100% 28% at 55% 30%, #000 0%, rgba(0,0,0,0.9) 45%, rgba(0,0,0,0) 100%);
            mask-image: radial-gradient(ellipse 100% 28% at 55% 30%, #000 0%, rgba(0,0,0,0.9) 45%, rgba(0,0,0,0) 100%);
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
