'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SERVER_URL } from '../lib/config';

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
// Order matches `~/AlexandriaInc/public/brand/ornament 1-9.png` — the curated
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

export default function LandingPage({ brandClassName = '' }: Props) {
  const [themeIdx, setThemeIdx] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Mobile menu — close on outside click + ESC. Listeners only mount
  // while the menu is open so we don't leak handlers in steady state.
  useEffect(() => {
    if (!navOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.nav')) return;
      setNavOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

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
        // Dwell — phantom scroll between slide 2 landing and its peel
        // starting. Lets the reader settle on the argument before the
        // surface starts moving again.
        const dwellDistance = peelDistance * 0.4;
        const sy = window.scrollY;
        // Slide 1 peels in [0, peelDistance]. Slide 2 dwells through
        // [peelDistance, peelDistance + dwellDistance], then peels in
        // [peelDistance + dwellDistance, 2*peelDistance + dwellDistance].
        const y1 = Math.min(sy, peelDistance);
        const y2 = Math.max(0, Math.min(sy - peelDistance - dwellDistance, peelDistance));
        const progress = y1 / peelDistance;
        const progress2 = y2 / peelDistance;
        document.documentElement.style.setProperty('--peel-progress', String(progress));
        document.documentElement.style.setProperty('--peel-progress-2', String(progress2));
        if (mq.matches) return;
        if (topRef.current) {
          topRef.current.style.transform = `translate3d(0, ${-y1}px, 0)`;
        }
        if (middleRef.current) {
          middleRef.current.style.transform = `translate3d(0, ${-y2}px, 0)`;
        }
        // on-bottom flips once the FINAL slide is dominant (past midpoint
        // of the last peel — scrollY past slide-2's peel midpoint).
        navRef.current?.classList.toggle('on-bottom', progress2 > 0.5);
      });
    };

    const onModeChange = () => {
      if (mq.matches) {
        if (topRef.current) {
          topRef.current.style.transform = '';
        }
        if (middleRef.current) {
          middleRef.current.style.transform = '';
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

  // Decode every ornament into the image cache before first scroll so a peel
  // never waits on network (first ornament was already priority via next/image;
  // the rest were only fire-and-forget loaded before).
  useEffect(() => {
    void Promise.all(
      THEMES.map(
        (t) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            img.onload = () => {
              if (img.decode) {
                img.decode().then(resolve, resolve);
              } else {
                resolve();
              }
            };
            img.onerror = () => resolve();
            img.src = t.image;
          }),
      ),
    );
  }, []);

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
        <span className="beat-title">the augmentation</span>
        ai can&rsquo;t read minds, but it can read words. so if we
        translate our thoughts into words, our minds can be
        augmented, not replaced &mdash;{' '}
        <em>the symbolic layer of our minds transcribed into private
        files</em>, so the exponential intelligence{' '}
        <em className="em-strong">thinks with us, not for us</em>.
      </p>
      <p>
        <span className="beat-title">the system</span>
        but the files don&rsquo;t write themselves, so we need a
        system &mdash; <em>optimised for each individual</em>.
        impossible to perfect alone. hence,{' '}
        <span className="hence-name">alexandria<span className="hence-dot">.</span></span>
      </p>
      <p>
        <span className="beat-title">the protocol</span>
        we built{' '}
        <em className="em-strong">the protocol</em>{' '}for aggregating
        files and systems into a singular collective &mdash; a
        library of files and marketplace of systems where
        alexandrians learn from each other and{' '}
        <em>refine their own</em>.
      </p>
      <p>
        <span className="beat-title">the floor</span>
        alexandria distills this collective signal into a{' '}
        <em>canonical system</em>{' '}offered to new members: a{' '}
        <em className="em-strong">self-personalising floor</em>{' '}&mdash;{' '}
        <em>rides the exponential, continuously refined</em>. zero
        maintenance by default, the optimal foundation for
        your own system when you have time.
      </p>
      <p>
        <span className="beat-title">the republic</span>
        it seems we are first, but we didn&rsquo;t come to impose.
        we built the foundation others will build on &mdash; a
        founding republic modeled on athens, rome, and america:{' '}
        <em className="em-strong">natural law applied to thought</em>,
        tilting the pressures of evolution towards{' '}
        <em>human survival</em>. founded not on land, but on thought.{' '}
        <em className="republic-coda">the thinking republic.</em>
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
    <div className="landing-root" data-theme={theme.id} data-adam="1">
      {/* ═════ PERSISTENT NAV — fixed over both slides. Colors switch at
             the peel midpoint so it stays readable on top (cream) and on
             any bottom-slide theme. ═════ */}
      <nav className="nav" ref={navRef} aria-label="Primary" data-nav-open={navOpen ? '1' : undefined}>
        <div className="nav-inner">
          <div className="nav-brand-block">
            <Link href="/" className={`nav-brand ${brandClassName}`}>
              alexandria<span className="nav-dot">.</span>
            </Link>
            <span className="nav-tagline" aria-hidden>the thinking republic</span>
          </div>
          <div className="nav-links">
            <span className="nav-shelf">
              <Link href="/library" className="nav-shelf-link">library</Link>
              <span className="nav-shelf-sep">·</span>
              <Link href="/marketplace" className="nav-shelf-link">marketplace</Link>
            </span>
            <span className="nav-group">
              <a href="/docs/letter.pdf" target="_blank" rel="noopener noreferrer">letter</a>
              <span className="nav-sep">·</span>
              <Link href="/whitepaper">whitepaper</Link>
            </span>
          </div>
          {/* Mobile-only hamburger toggle. Three thin lines that morph
              into an × when navOpen is true. Hidden on desktop where
              the inline nav-links are visible. */}
          <button
            type="button"
            className="nav-toggle"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            aria-controls="nav-menu"
            onClick={() => setNavOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
        {/* Mobile menu panel — appears when the hamburger is toggled.
            Closes when any link is clicked. */}
        <div
          id="nav-menu"
          className="nav-menu"
          role="menu"
          aria-hidden={!navOpen}
          onClick={() => setNavOpen(false)}
        >
          <Link href="/library" className="nav-menu-link" role="menuitem">library</Link>
          <Link href="/marketplace" className="nav-menu-link" role="menuitem">marketplace</Link>
          <a href="/docs/letter.pdf" target="_blank" rel="noopener noreferrer" className="nav-menu-link" role="menuitem">letter</a>
          <Link href="/whitepaper" className="nav-menu-link" role="menuitem">whitepaper</Link>
        </div>
      </nav>

      {/* ═════ TOP SLIDE ═════
           Three blocks. Everything conversion-critical.
             H1    → the tribe pitch (locked public headline, from a4)
             lede  → mechanic + cost in one read
             CTAs  → the action moment
           Form is content: typography does the work. The italic rhythm
           carries the "voice inside your head" register. Whitespace
           is the only ornament. */}
      <div className="top-slide" ref={topRef}>
        {/* Stage canvas — pixel-locked 1440×900 frame uniformly scaled to
            the viewport via --stage-scale-top. Inside this wrapper everything
            is absolute pixels, so type, drop-caps, and corner marks never
            reflow with viewport changes. Mobile (<899px) sets this to
            display:contents so the existing flow layout takes over. */}
        <div className="stage-top">
        <span className="alpha-mark" aria-hidden>
          <a href="tel:+14155038178" className="alpha-cta">
            investor?{' '}<span className="alpha-cta-underline">call me</span>
          </a>
        </span>
        <span className="folio" aria-hidden>
          san francisco · MMXXVI
        </span>
        <div className="top-inner">
          {/* Three-line H1. Italic-normal-italic rhythm with the tribal
              line tinted in the house burgundy — the identity carries
              colour; the act is plain ink; the purpose returns to italic.
              Form is content: the first line is who we are, second is what
              we do, third is why it matters. */}
          <h1 className="hero-h1">
            <span className="hero-bracket bracket-left">
              we help humans
            </span>
            <span className="hero-main">
              build systems to keep thinking,
            </span>
            <span className="hero-bracket bracket-right">
              and not lose our minds&hellip;
            </span>
          </h1>

          {/* Alpha — the opening glyph. Italic Greek α, small and
              faint, sits between the headline and the manifesto as a
              section break. Echoes the wordmark's dot-after-letter
              motif (alexandria.) and signals "this is the start." */}
          <span className="alpha-glyph" aria-hidden>α.</span>

          {/* Manifesto body. Fleuron separates the stance from the
              civilisational closer — an old-book ornament earning its
              place as a rhetorical beat, not a decoration. */}
          <div className="manifesto">
            <p>
              thoughts are the root node.{' '}
              <em className="em-strong">
                if we stop thinking, we stop deciding.
              </em>{' '}
              if&nbsp;we&nbsp;stop&nbsp;deciding,{' '}
              <em className="em-strong">our minds atrophy</em>.
              so&nbsp;if&nbsp;we&nbsp;lose our thoughts,
              we&nbsp;lose&nbsp;our&nbsp;minds &mdash;
              and&nbsp;<em className="em-strong">our species</em>.
            </p>
            <p className="manifesto-close">
              <span className="close-faint">
                the singularity is humanity&rsquo;s last
                challenge&nbsp;&mdash;
              </span>{' '}
              <span className="close-strong">
                we offer a path through.
              </span>
            </p>
          </div>

        </div>
        </div>
      </div>

      {/* Persistent fresco — atmospheric layer across both slides, subtle
          like the watermark. Stays put when the peel runs. */}
      <div className="adam-bg" aria-hidden />

      {/* Persistent watermark — sits across both slides like the nav. */}
      <span className="watermark" aria-hidden>
        <em>a.</em>
      </span>



      {/* ═════ MIDDLE SLIDE — carries the 5 argument beats at full
             canvas width. Peels in the second 100vh of scroll (with a
             40vh dwell first), after the top slide has fully peeled. ═════ */}
      <section
        className="middle-slide"
        ref={middleRef}
        aria-label="Argument"
        style={themeVars(theme)}
      >
        <div className="stage-middle">
          {statementBlock}
        </div>
      </section>

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
                <em>II. n.</em> the thinking republic; a tribe of
                humans who put their minds into writing, so ai
                thinks with them, not for them; the path through
                the singularity.
              </p>
            </div>
          </div>

          <div className="right-col">
              <div className="right-lower">
                <p className="statement-close">
                  if you believe human thought matters through the
                  singularity,{' '}
                  <em className="close-em-strong">making it permanent is all
                  upside</em>. alexandria is the closed-loop system
                  &mdash;{' '}
                  <em>one curl command, five minutes, and the
                  compounding starts; tune it later</em>. low agency is
                  the only friction&nbsp;left.<br />
                  <em className="close-strong">welcome to alexandria.</em>
                </p>

                <div className="cta-pair">
                  <div className="cta-block">
                    <a
                      href={`${SERVER_URL}/auth/github?ref_source=landing`}
                      className="lr-cta lr-cta-primary"
                    >
                      join the tribe
                    </a>
                    <span className="cta-sub">
                      free with kin &middot; open source &mdash; works with any ai coding agent
                    </span>
                  </div>
                  <div className="cta-block">
                    <Link href="/follow" className="lr-cta lr-cta-ghost">
                      stay close
                    </Link>
                    <span className="cta-sub">
                      not ready to join, but want to follow along?
                    </span>
                  </div>
                </div>
              </div>
          </div>

        </div>
        </div>
      </section>

      {/* Runway gives scroll range for the peel */}
      <div className="runway" aria-hidden />

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
           + 40 (dwell) + 100 (peel2) + 100 (viewport) = 340vh. */
        .runway {
          height: 340vh;
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
        }
        .nav-brand .nav-dot {
          font-style: normal;
          display: inline-block;
          animation: dotBreathe 3.2s ease-in-out infinite;
        }
        @keyframes dotBreathe {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
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
        /* Tagline — italic slogan under the wordmark. Visible only on
           the front slide; fades out on peel because the bottom slide's
           dictionary already names "the thinking republic" twice. */
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
        /* Library — shelf entry: serif italic, quieter than letter/whitepaper */
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
          gap: 8px;
          font-family: inherit;
          font-size: 15px;
          font-weight: 400;
        }
        .nav-group .nav-sep {
          opacity: 0.45;
        }
        .nav-group a {
          font-size: 15px;
          color: rgba(26, 19, 24, 0.85);
          transition: color 180ms ease;
        }
        .nav-group a:hover {
          color: #1a1318;
        }
        /* Mobile hamburger toggle — three thin lines that morph into an
           × when navOpen is true. Hidden on desktop where inline links
           are visible. The pointer-events on the surrounding .nav are
           none, so we re-enable on this button. */
        .nav-toggle {
          display: none;
          background: none;
          border: none;
          padding: 8px;
          margin: -8px;
          cursor: pointer;
          pointer-events: auto;
          width: 36px;
          height: 36px;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 4px;
        }
        .nav-toggle span {
          display: block;
          width: 20px;
          height: 1.5px;
          background: rgba(26, 19, 24, 0.7);
          transition: transform 220ms ease, opacity 180ms ease, background 180ms ease;
          transform-origin: center;
        }
        .nav.on-bottom .nav-toggle span {
          background: var(--theme-fg);
        }
        /* Open state — top and bottom rotate to form an ×, middle fades. */
        .nav[data-nav-open='1'] .nav-toggle span:nth-child(1) {
          transform: translateY(5.5px) rotate(45deg);
        }
        .nav[data-nav-open='1'] .nav-toggle span:nth-child(2) {
          opacity: 0;
        }
        .nav[data-nav-open='1'] .nav-toggle span:nth-child(3) {
          transform: translateY(-5.5px) rotate(-45deg);
        }
        /* Mobile menu panel — slides in below the nav when open. Sits
           position:fixed at the same z-index as the nav so it floats
           above all slides. Closed state collapses height to 0 and
           hides via opacity + pointer-events. */
        .nav-menu {
          /* Always rendered (so opacity/transform can transition) but
             pointer-events disabled and opacity 0 by default so it's
             invisible. Toggling [data-nav-open='1'] on the nav fades it
             in. Hidden entirely on desktop where inline nav-links carry
             the navigation. */
          display: none;
          position: fixed;
          top: 64px;
          right: 18px;
          z-index: 100;
          flex-direction: column;
          gap: 14px;
          padding: 20px 28px;
          background: var(--theme-bg, #f7f2ec);
          border: 1px solid rgba(26, 19, 24, 0.10);
          border-radius: 12px;
          box-shadow: 0 18px 50px rgba(26, 19, 24, 0.10), 0 4px 12px rgba(26, 19, 24, 0.06);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px;
          letter-spacing: 0.01em;
          opacity: 0;
          transform: translateY(-8px);
          pointer-events: none;
          transition: opacity 220ms ease, transform 220ms ease;
        }
        .nav[data-nav-open='1'] .nav-menu {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .nav-menu-link {
          color: var(--theme-fg, #1a1318);
          text-decoration: none;
          padding: 4px 0;
          transition: color 160ms ease;
        }
        .nav-menu-link:hover {
          color: var(--theme-fg-muted, rgba(26, 19, 24, 0.6));
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
          color: var(--theme-fg-muted);
        }
        .nav.on-bottom .nav-group a:hover {
          color: var(--theme-fg);
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
          background: #f7f2ec;
          overflow: hidden;
          will-change: transform;
          box-shadow: var(--peel-shadow, 0 0 0 rgba(0, 0, 0, 0));
          color: #1a1318;
        }
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
        /* Vertical margin rule — like a printed manuscript with a
           ruling line down the left margin. Very faint, just a hint. */
        .stage-top::after {
          content: '';
          position: absolute;
          left: 72px;
          top: 99px;
          bottom: 54px;
          width: 1px;
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
          font-size: 11px;
          color: rgba(26, 19, 24, 0.32);
          letter-spacing: 0.18em;
          text-transform: lowercase;
          user-select: none;
          z-index: 2;
        }
        .top-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 980px;
          max-height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 48px;
        }
        /* Alpha glyph — italic Greek α as a section break between
           headline and manifesto. Tiny and faint; the eye registers it
           as a typographic ornament without it competing with the H1
           or the prose. */
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

        /* H1 — three lines, three jobs.
           Tribal line: italic, house burgundy, a hair of tracking.
           Middle line: roman, plain ink (the matter-of-fact act).
           Closing line: italic, plain ink (the purpose, the turn).
           The burgundy tint carries the identity colour through from
           the CTA; the roman middle is the anchor; the italics frame. */
        .hero-h1 {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-weight: 400;
          font-style: normal;
          font-size: 52px;
          line-height: 1.1;
          letter-spacing: -0.014em;
          color: #1a1318;
          text-align: center;
          margin: 0;
          max-width: 980px;
        }
        .hero-h1 em {
          font-style: italic;
        }
        /* H1 line variants — asymmetric bracketed layout.
           Brackets sit at the extremes (left, right), faint and small,
           framing the load-bearing middle line which gets the full
           visual weight. */
        .hero-h1 .hero-bracket {
          display: block;
          font-size: 22px;
          font-style: italic;
          font-weight: 400;
          color: rgba(26, 19, 24, 0.42);
          letter-spacing: 0.002em;
          line-height: 1.3;
        }
        .hero-h1 .bracket-left {
          text-align: left;
        }
        .hero-h1 .bracket-right {
          text-align: right;
        }
        .hero-h1 .hero-main {
          display: inline-block;
          font-style: normal;
          color: #1a1318;
          text-align: center;
          padding: 11px 0 4px;
          position: relative;
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
          max-width: 640px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 13px;
        }
        .manifesto p {
          margin: 0;
          font-size: 18px;
          line-height: 1.5;
        }
        /* Plain emphasis — italic burgundy, regular weight. Used for
           lighter accents like 'the lever'. */
        .manifesto p em {
          font-style: italic;
          color: #3a0f3d;
          transition: text-shadow 280ms ease, color 280ms ease;
        }
        .manifesto p em:hover {
          text-shadow: 0 0 14px rgba(58, 15, 61, 0.32);
          color: #2a0a2d;
        }
        /* Strong emphasis — load-bearing phrases. Bolder italic
           burgundy, no underline. Lets the weight do the work. */
        .manifesto p em.em-strong {
          font-weight: 600;
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
        /* Close — two voices in one line.
             faint setup: quiet, lighter color, regular weight
             strong payoff: bold, underlined, ink-dark
           Body shouts; close splits into setup + verdict. */
        .manifesto-close {
          font-style: normal;
          font-size: 17.5px !important;
          font-weight: 400;
          max-width: 820px;
          margin: 27px auto 0 !important;
          letter-spacing: 0.005em;
        }
        .close-faint {
          color: rgba(26, 19, 24, 0.5);
        }
        .close-strong {
          color: #3a0f3d;
          font-style: italic;
          font-weight: 500;
          letter-spacing: 0.004em;
          text-decoration: underline;
          text-decoration-color: rgba(58, 15, 61, 0.55);
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
        }
        /* Watermark — large faint italic 'a.' sitting behind everything,
           lower portion of the slide, off-centre to the left. Marks the
           page as alexandrian without shouting. */
        .watermark {
          position: fixed;
          bottom: 12%;
          left: 32%;
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
        /* Alpha mark — bottom-left founder colophon, with a quiet
           CTA tucked at the end. Mirrors 'vol. i' on the right so
           the page is bracketed by manuscript marginalia. */
        .alpha-mark {
          position: absolute;
          bottom: 27px;
          left: 58px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 13px;
          color: rgba(26, 19, 24, 0.42);
          letter-spacing: 0.02em;
          user-select: none;
          z-index: 2;
        }
        .alpha-mark a.alpha-cta {
          color: rgba(58, 15, 61, 0.75);
          text-decoration: none;
          transition: color 180ms ease;
        }
        .alpha-mark a.alpha-cta .alpha-cta-underline {
          text-decoration: underline;
          text-decoration-color: rgba(58, 15, 61, 0.35);
          text-underline-offset: 3px;
          transition: text-decoration-color 180ms ease;
        }
        .alpha-mark a.alpha-cta:hover {
          color: #3a0f3d;
        }
        .alpha-mark a.alpha-cta:hover .alpha-cta-underline {
          text-decoration-color: #3a0f3d;
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
        .statement-close {
          position: relative;
          margin: 0;
          padding-left: 0;
          padding-top: 14px;
          transform: translateY(-20px);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 23px;
          line-height: 1.45;
          font-style: normal;
          letter-spacing: 0.003em;
          color: var(--theme-fg);
          hanging-punctuation: first last;
        }
        .statement-close::before {
          content: none;
        }
        /* Forcing function — the single load-bearing claim that converts.
           Same vocabulary as .statement em.em-strong but tuned for the
           close (allowed to wrap, this phrase is too long for nowrap). */
        .statement-close .close-em-strong {
          font-style: italic;
          font-weight: 600;
          color: var(--theme-fg);
          transition: text-shadow 280ms ease;
        }
        .statement-close .close-em-strong:hover {
          text-shadow: 0 0 18px var(--theme-fg-muted);
        }
        /* Destination — "welcome to alexandria." The reader's eye arrival.
           Underlined like a place on a map, not a link. */
        .statement-close .close-strong {
          color: var(--theme-fg);
          font-style: italic;
          font-weight: 500;
          text-decoration: underline;
          text-decoration-color: var(--theme-fg-faint);
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
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
        .cta-block {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 7px;
        }
        .cta-pair a.lr-cta {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 16px;
          padding: 10px 22px;
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
        /* Subtitle — does the explanatory work so the buttons stay
           terse. Italic, faint. Hangs flush left from the button's
           outer edge — caption-from-box, not caption-from-text. */
        .cta-sub {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px;
          font-style: italic;
          color: var(--theme-fg-faint);
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
           visually inside the word's footprint, not extending left. */
        .phon {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 12.5px;
          color: var(--theme-fg-faint);
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
          color: var(--theme-fg-faint);
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
            background: linear-gradient(
              to bottom,
              #f7f2ec 0,
              #f7f2ec 100dvh,
              var(--theme-bg) 100dvh,
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
            min-height: 100vh;
            min-height: 100dvh;
            transform: none !important;
            box-shadow: none !important;
          }
          .top-slide {
            padding: 152px clamp(20px, 5vw, 64px) 96px;
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
            /* Frosted backdrop — on mobile the slides flow naturally
               (no peel), so prose scrolls up THROUGH the fixed nav.
               Without a backdrop the brand text overlaps the body
               text behind. Slight tint of the active theme bg + blur
               keeps the nav legible without committing to a hard bar. */
            background: color-mix(in srgb, var(--theme-bg, #f7f2ec) 78%, transparent);
            backdrop-filter: blur(10px) saturate(1.05);
            -webkit-backdrop-filter: blur(10px) saturate(1.05);
          }
          .nav-brand {
            font-size: 22px;
          }
          /* Mobile collapses the inline links into a hamburger menu.
             The nav-links stay in the DOM (still rendered for desktop)
             but hide visually; the toggle button appears in their place
             and reveals the panel below the nav. */
          .nav-links {
            display: none;
          }
          .nav-toggle {
            display: flex;
          }
          /* Mobile-only: render the menu panel so it can fade in when
             toggled. Display stays flex; opacity + pointer-events do
             the actual showing/hiding. */
          .nav-menu {
            display: flex;
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
          .alpha-mark,
          .folio {
            position: absolute;
            bottom: 24px;
            font-size: 10.5px;
          }
          .alpha-mark { left: 20px; }
          .folio { right: 20px; font-size: 9.5px; letter-spacing: 0.14em; }

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
          .left-col {
            display: contents;
          }
          .ornament-wrap {
            order: 1;
            justify-content: center;
            padding-top: 8px;
            padding-left: 0;
          }
          .right-col {
            order: 2;
            display: flex;
            flex-direction: column;
            gap: 32px;
            justify-content: flex-start;
            transform: none;
          }
          /* Selector includes .right-col so it beats the desktop
             .right-col .right-lower rule (squeezed 680px width +
             126px margin-top) — mobile reverts to full-width flow. */
          .right-col .right-lower {
            align-self: stretch;
            width: 100%;
            gap: 24px;
            margin: 0;
          }
          .wordmark-block {
            order: 3;
            margin-left: 0;
            max-width: 100%;
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
          .cta-pair a.lr-cta {
            font-size: 14px;
            padding: 10px 22px;
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
          /* Opacity tracks the peel: 0.18 on front (faint watermark — the
             fresco frames, doesn't compete with text), fades to 0.04 on
             back so the bottom-slide content reads cleanly. */
          opacity: calc(0.18 - var(--peel-progress, 0) * 0.14);
          filter: sepia(0.7) saturate(0.5) contrast(0.95);
          pointer-events: none;
          z-index: 22;
          /* Narrow horizontal band at upper portion. Top fades out so the
             nav sits on clean cream (no figures behind "letter · whitepaper").
             Mid is bright so the hands' meeting reads as the focal gesture.
             Lower fades out so the manifesto + closer sit on clean cream
             (no anatomy behind the conversion line). The vignette is the
             editorial decision: the iconic moment, nothing else. */
          -webkit-mask-image: radial-gradient(ellipse 70% 28% at 50% 32%, #000 0%, rgba(0,0,0,0.92) 40%, rgba(0,0,0,0) 100%);
          mask-image: radial-gradient(ellipse 70% 28% at 50% 32%, #000 0%, rgba(0,0,0,0.92) 40%, rgba(0,0,0,0) 100%);
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
        @media (max-width: 900px) {
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
