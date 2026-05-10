'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from './ThemeToggle';

type Props = {
  src: string;
  header: string;
  homeHref?: string;
  /** When true, strip the manual `## contents.` block, inject hierarchical
   *  part.chapter numbers into headings, and render an auto-generated TOC
   *  in its place. Designed for the whitepaper's parts → chapters structure. */
  numbered?: boolean;
};

type TocEntry = {
  level: 1 | 2;
  text: string;
  slug: string;
  num: string;
};

// Recursively extract plain text from React children — handles nested
// elements like <em> from markdown emphasis, so a heading containing
// `*why.*` slugifies to the same value as the markdown source.
function flattenText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props: { children?: React.ReactNode } }).props;
    return flattenText(props.children);
  }
  return '';
}

function slugify(node: React.ReactNode): string {
  return flattenText(node).toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

const TOC_MARKER = '\n%%MDOC_TOC%%\n';

function processNumbered(md: string): { pre: string; post: string; toc: TocEntry[] } {
  const lines = md.split('\n');
  const out: string[] = [];
  const toc: TocEntry[] = [];
  let part = 0;
  let chapter = 0;
  let isFirstH1 = true;
  let inFence = false;
  let inContents = false;
  let tocInserted = false;

  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;

    if (!inFence) {
      // Strip the manual `## contents.` block — runs until the next H1.
      if (/^##\s+\*?contents\.?\*?\s*$/i.test(line)) {
        inContents = true;
        if (!tocInserted) {
          out.push(TOC_MARKER);
          tocInserted = true;
        }
        continue;
      }
      if (inContents) {
        if (/^# /.test(line)) {
          inContents = false;
          // Fall through — process this H1 below.
        } else {
          continue;
        }
      }

      const h1 = /^# (.+)$/.exec(line);
      const h2 = /^## (.+)$/.exec(line);

      if (h1) {
        if (isFirstH1) {
          // Document title — keep as-is, no number.
          isFirstH1 = false;
          out.push(line);
          continue;
        }
        const text = h1[1];
        part++;
        chapter = 0;
        const num = String(part);
        out.push(`# ${num} ${text}`);
        toc.push({ level: 1, text, slug: slugify(`${num} ${text}`), num });
        continue;
      }

      if (h2 && part > 0) {
        chapter++;
        const text = h2[1];
        const num = `${part}.${chapter}`;
        out.push(`## ${num} ${text}`);
        toc.push({ level: 2, text, slug: slugify(`${num} ${text}`), num });
        continue;
      }
    }

    out.push(line);
  }

  const full = out.join('\n');
  const [pre, post = ''] = full.split(TOC_MARKER);
  return { pre, post, toc };
}

function TocBlock({ entries }: { entries: TocEntry[] }) {
  return (
    <nav className="mdoc-toc" aria-label="Contents">
      <p className="mdoc-toc-label">contents.</p>
      <ol className="mdoc-toc-list">
        {entries.map((e) => (
          <li key={e.slug} className={`mdoc-toc-item lvl-${e.level}`}>
            <a href={`#${e.slug}`}>
              <span className="mdoc-toc-num">{e.num}</span>
              <span className="mdoc-toc-text">{e.text.replace(/\*/g, '')}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Right-edge chapter rail. Faint dots, one per chapter (h2). Numbers appear on
// hover. Active chapter highlighted by IntersectionObserver on the rendered
// h2 elements. Fades in once the reader has scrolled past the abstract.
function ChapterRail({ entries }: { entries: TocEntry[] }) {
  // Only chapters (level 2) get rail dots; parts are too coarse and would
  // crowd the rail. The rail is the chapter-level skim navigator.
  const chapters = entries.filter((e) => e.level === 2);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (chapters.length === 0) return;
    const headings = chapters
      .map((c) => document.getElementById(c.slug))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;

    // Use rootMargin to define an "active band" — a heading is current
    // when it sits in the upper third of the viewport. Topmost heading
    // in the band wins.
    const obs = new IntersectionObserver(
      (entries) => {
        const inBand = entries.filter((e) => e.isIntersecting);
        if (inBand.length > 0) {
          // Pick the top-most heading currently in the band.
          inBand.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveSlug(inBand[0].target.id);
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [chapters]);

  useEffect(() => {
    // Fade the rail in once the reader has crossed roughly one viewport —
    // i.e., past the abstract. Before that, the rail would distract from
    // the hero composition.
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (chapters.length === 0) return null;

  return (
    <nav
      className={`mdoc-rail ${visible ? 'is-visible' : ''}`}
      aria-label="Chapter navigation"
    >
      <ol className="mdoc-rail-list">
        {chapters.map((c) => (
          <li
            key={c.slug}
            className={`mdoc-rail-item ${activeSlug === c.slug ? 'is-active' : ''}`}
          >
            <a href={`#${c.slug}`} aria-label={`Chapter ${c.num} — ${c.text.replace(/\*/g, '')}`}>
              <span className="mdoc-rail-dot" aria-hidden />
              <span className="mdoc-rail-label">
                <span className="mdoc-rail-num">{c.num}</span>
                <span className="mdoc-rail-text">{c.text.replace(/\*/g, '')}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Reading-progress hairline at the very top of the viewport. Fills as the
// reader descends. Faint enough to be felt, not seen.
function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        if (ref.current) ref.current.style.transform = `scaleX(${pct})`;
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, []);
  return <div className="mdoc-progress" aria-hidden><div ref={ref} /></div>;
}

// Cycle through manuscript-style ornament glyphs for section breaks so
// the page reads as a typeset book (different ornaments at different
// rhythms) rather than a wall of identical horizontal rules.
const FLEURONS = ['❦', '❧', '※', '§', '⁂'];
let fleuronIdx = 0;

const MD_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 id={slugify(children)} className="pdoc-h1">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => <h2 id={slugify(children)} className="pdoc-h2">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 id={slugify(children)} className="pdoc-h3">{children}</h3>,
  h4: ({ children }: { children?: React.ReactNode }) => <h4 id={slugify(children)} className="pdoc-h4">{children}</h4>,
  hr: () => {
    const glyph = FLEURONS[fleuronIdx % FLEURONS.length];
    fleuronIdx++;
    return (
      <div className="pdoc-hr" aria-hidden>
        <span className="pdoc-fleuron">{glyph}</span>
      </div>
    );
  },
  p: ({ children }: { children?: React.ReactNode }) => <p className="pdoc-p">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="pdoc-strong">{children}</strong>,
  table: ({ children }: { children?: React.ReactNode }) => <table className="pdoc-table">{children}</table>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="pdoc-bq">{children}</blockquote>,
};

export default function MarkdownDoc({ src, header, homeHref = '/', numbered = false }: Props) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetch(src).then(r => r.text()).then(setContent);
  }, [src]);

  const parsed = useMemo(() => {
    if (content === null) return null;
    return numbered ? processNumbered(content) : null;
  }, [content, numbered]);

  // Reset the fleuron index each render so the cycle starts fresh and
  // is deterministic from the top of the document.
  fleuronIdx = 0;

  return (
    <>
      {numbered && <ReadingProgress />}
      <ThemeToggle />
      <Link href={homeHref} className="mdoc-shelf-link">
        alexandria<span className="mdoc-shelf-dot">.</span>
      </Link>
      {numbered && parsed && parsed.toc.length > 0 && (
        <ChapterRail entries={parsed.toc} />
      )}
      <main className="mdoc">
        {header && <div className="mdoc-frame mdoc-header">{header}</div>}

        <article className="mdoc-frame mdoc-article pdoc pdoc-longform">
          {content === null ? (
            <p className="pdoc-p" style={{ color: 'var(--text-ghost)', fontSize: '0.85rem', letterSpacing: '0.08em' }}>...</p>
          ) : parsed ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {parsed.pre}
              </ReactMarkdown>
              {parsed.toc.length > 0 && <TocBlock entries={parsed.toc} />}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {parsed.post}
              </ReactMarkdown>
            </>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {content}
            </ReactMarkdown>
          )}
        </article>

        <nav className="mdoc-frame mdoc-footnav">
          <Link href={homeHref} className="mdoc-home">a.</Link>
        </nav>
      </main>
    </>
  );
}
