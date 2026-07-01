'use client';

import { useState, useEffect, useMemo, useRef, isValidElement } from 'react';
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
  /** Casual variant — drops the manuscript dress (justified text, fleurons,
   *  per-section initials, italic-accent bold) for a clean, plain setting.
   *  Scoped via .pdoc-plain so other docs keep the formal book look. */
  plain?: boolean;
  /** FAQ accordion — render the doc as a collapsible Q&A list: the intro
   *  (everything before the first H2) renders normally, then each
   *  `## question` becomes a clickable summary whose answer expands below.
   *  First item open by default. */
  faq?: boolean;
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
const ABSTRACT_MARKER = '\n%%MDOC_ABSTRACT%%\n';
const FRONTISPIECE_MARKER = '\n%%MDOC_FRONTISPIECE%%\n';

function processNumbered(md: string): { pre: string; frontispiece: string; abstract: string; post: string; toc: TocEntry[] } {
  const lines = md.split('\n');
  const out: string[] = [];
  const toc: TocEntry[] = [];
  let part = 0;
  let chapter = 0;
  let isFirstH1 = true;
  let inFence = false;
  let inContents = false;
  let inAbstract = false;
  let inFrontispiece = false;
  let tocInserted = false;
  let abstractInserted = false;
  let frontispieceInserted = false;

  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;

    if (!inFence) {
      // Strip the manual `## contents.` block — runs until the next H1.
      if (/^##\s+\*?contents\.?\*?\s*$/i.test(line)) {
        if (inAbstract) {
          inAbstract = false;
          out.push(ABSTRACT_MARKER);
        }
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

      // Frontispiece section — `## *in brief.*` (the elevator pitch
      // above the abstract). Capture content until the next H1/H2.
      // The H2 itself stays in the captured content so it renders inside
      // the frontispiece section (unlike the abstract, whose label is
      // reconstructed in JSX). This sits BEFORE the abstract detection
      // because both are H2 — order matters for the close-on-next-heading
      // logic. Detected only on entry, not as a closing trigger for itself.
      if (/^##\s+\*?in brief\.?\*?\s*$/i.test(line)) {
        if (!frontispieceInserted) {
          out.push(FRONTISPIECE_MARKER);
          frontispieceInserted = true;
        }
        inFrontispiece = true;
        // Fall through so the H2 is pushed inside the marker bounds.
      } else if (inFrontispiece && /^(# |## )/.test(line)) {
        inFrontispiece = false;
        out.push(FRONTISPIECE_MARKER);
        // Fall through — process this heading (likely `## abstract.`).
      }

      // Abstract section — capture content between `## abstract.` and the
      // next heading. Heading itself is dropped; content gets wrapped in a
      // distinct block at render time so CSS can give the abstract its
      // own visual treatment without polluting body paragraphs.
      if (/^##\s+\*?abstract\.?\*?\s*$/i.test(line)) {
        inAbstract = true;
        if (!abstractInserted) {
          out.push(ABSTRACT_MARKER);
          abstractInserted = true;
        }
        continue;
      }
      if (inAbstract && /^(# |## )/.test(line)) {
        inAbstract = false;
        out.push(ABSTRACT_MARKER);
        // Fall through — process this heading below.
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
  // Pull the abstract block out of the pre stream, then pull the
  // frontispiece block out of what's left. Both sit before the TOC.
  let pre = '';
  let frontispiece = '';
  let abstract = '';
  let post = '';
  const [beforeToc, afterToc = ''] = full.split(TOC_MARKER);
  post = afterToc;
  const absParts = beforeToc.split(ABSTRACT_MARKER);
  let preBefore = '';
  if (absParts.length >= 3) {
    preBefore = absParts[0];
    abstract = absParts[1].trim();
    if (absParts[2].trim()) preBefore = preBefore + '\n' + absParts[2];
  } else {
    preBefore = beforeToc;
  }
  const frontParts = preBefore.split(FRONTISPIECE_MARKER);
  if (frontParts.length >= 3) {
    pre = frontParts[0];
    frontispiece = frontParts[1].trim();
    if (frontParts[2].trim()) pre = pre + '\n' + frontParts[2];
  } else {
    pre = preBefore;
  }
  return { pre, frontispiece, abstract, post, toc };
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
  // Markdown links carry no class by default, so the .pdoc-a brand style
  // (quiet underline) never landed — links read as plain text and didn't
  // look clickable. Apply pdoc-a here so every link in every doc (letter,
  // mechanics, shortcut, the FAQ's cross-links) is visibly clickable.
  // External (http) links open in a new tab; internal/mailto stay in place.
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const external = !!href && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className="pdoc-a"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    );
  },
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="pdoc-strong">{children}</strong>,
  table: ({ children }: { children?: React.ReactNode }) => <table className="pdoc-table">{children}</table>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="pdoc-bq">{children}</blockquote>,
};

// Numbered-doc headings — split the injected "1.2 " prefix so the numeral
// can hang in the margin as quiet marginalia while the title stays flush
// with the text block. The id keeps the full "1.2 title" slug so TOC and
// rail anchors are unchanged. An h1 with no numeral is the document title.
function NumberedHeading({ level, children }: { level: 1 | 2; children?: React.ReactNode }) {
  const id = slugify(children);
  const text = flattenText(children);
  const m = /^(\d+(?:\.\d+)?)\s+(.*)$/.exec(text);
  const Tag = level === 1 ? 'h1' : 'h2';
  const base = level === 1 ? 'pdoc-h1' : 'pdoc-h2';
  if (!m) {
    return <Tag id={id} className={`${base}${level === 1 ? ' pdoc-title' : ''}`}>{children}</Tag>;
  }
  return (
    <Tag id={id} className={base}>
      <span className="pdoc-hnum" aria-hidden>{m[1]}</span>
      {m[2]}
    </Tag>
  );
}

// Numbered docs (the whitepaper): headings hang their numerals; everything
// else renders as standard. The pre map additionally marks the preamble
// paragraphs (between title and contents) as the lede.
const MD_COMPONENTS_NUMBERED = {
  ...MD_COMPONENTS,
  h1: ({ children }: { children?: React.ReactNode }) => <NumberedHeading level={1}>{children}</NumberedHeading>,
  h2: ({ children }: { children?: React.ReactNode }) => <NumberedHeading level={2}>{children}</NumberedHeading>,
};
const MD_COMPONENTS_NUMBERED_PRE = {
  ...MD_COMPONENTS_NUMBERED,
  p: ({ children }: { children?: React.ReactNode }) => <p className="pdoc-p pdoc-lede">{children}</p>,
};

// Abstract paragraphs follow a named-beat structure: each paragraph leads
// with a bolded beat name (`**the augmentation.**`), then prose. We split
// that into a hanging gutter label + body column, echoing the marginalia
// folio the website originally used.
function AbstractParagraph({ children }: { children?: React.ReactNode }) {
  const kids = Array.isArray(children) ? children : [children];
  // Skip leading whitespace-only text nodes, then expect a React element
  // (the strong lead). When ReactMarkdown maps strong → a custom component,
  // the child's `type` is the component function and the className lives
  // inside the function — so check element-ness, not className.
  let labelIdx = -1;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (typeof k === 'string' && k.trim() === '') continue;
    if (isValidElement(k)) {
      labelIdx = i;
    }
    break;
  }
  if (labelIdx === -1) return <p className="pdoc-p">{children}</p>;

  const labelEl = kids[labelIdx] as React.ReactElement<{ children?: React.ReactNode }>;
  const label = labelEl.props.children;
  const rest = kids.slice(labelIdx + 1);
  // Strip the single space markdown emits between **bold** lead and body.
  const body = rest.length > 0 && typeof rest[0] === 'string'
    ? [rest[0].replace(/^\s+/, ''), ...rest.slice(1)]
    : rest;
  return (
    <p className="pdoc-p pdoc-abstract-beat">
      <span className="pdoc-abstract-beat-label">{label}</span>
      <span className="pdoc-abstract-beat-body">{body}</span>
    </p>
  );
}

const MD_COMPONENTS_ABSTRACT = {
  ...MD_COMPONENTS,
  p: AbstractParagraph,
};

// FAQ accordion parsing — split a Q&A doc into the intro (everything before
// the first H2) and a list of {q, a} items (each `## question` plus the body
// that follows it, up to the next H2).
function parseFaq(md: string): { intro: string; items: { q: string; a: string }[] } {
  const i = md.indexOf('\n## ');
  const intro = i === -1 ? md : md.slice(0, i);
  const rest = i === -1 ? '' : md.slice(i + 1);
  const chunks = rest ? rest.split(/\n(?=## )/) : [];
  const items = chunks.map((chunk) => {
    const nl = chunk.indexOf('\n');
    const q = (nl === -1 ? chunk : chunk.slice(0, nl)).replace(/^##\s*/, '').trim();
    const a = nl === -1 ? '' : chunk.slice(nl + 1).trim();
    return { q, a };
  });
  return { intro, items };
}

function FaqBody({ content }: { content: string }) {
  const { intro, items } = parseFaq(content);
  return (
    <>
      {intro.trim() && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{intro}</ReactMarkdown>
      )}
      <div className="pdoc-faq">
        {items.map((it, idx) => (
          <details className="pdoc-faq-item" key={idx} open={idx === 0}>
            <summary className="pdoc-faq-q">{it.q}</summary>
            <div className="pdoc-faq-a">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{it.a}</ReactMarkdown>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

export default function MarkdownDoc({ src, header, homeHref = '/', numbered = false, plain = false, faq = false }: Props) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`${src} → HTTP ${r.status}`);
        return r.text();
      })
      .then(setContent)
      .catch(() => {
        // Source missing — surface loudly rather than render the Next.js
        // 404 HTML body as garbled markdown. A deleted .md should fail
        // visibly so the route gets removed too (the only reason this
        // ever 404s is a stale route after a docs cleanup).
        setContent(
          '# this document is being prepared\n\n' +
            "the page you're looking for is on the shelf but hasn't been put back yet. " +
            '[return to alexandria.](/)',
        );
      });
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

        <article className={`mdoc-frame mdoc-article pdoc pdoc-longform${plain ? ' pdoc-plain' : ''}${numbered ? ' pdoc-numbered' : ''}`}>
          {content === null ? (
            <p className="pdoc-p" style={{ color: 'var(--text-ghost)', fontSize: '0.85rem', letterSpacing: '0.08em' }}>...</p>
          ) : parsed ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS_NUMBERED_PRE}>
                {parsed.pre}
              </ReactMarkdown>
              {parsed.frontispiece && (
                <section className="pdoc-frontispiece" aria-label="In brief">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                    {parsed.frontispiece}
                  </ReactMarkdown>
                </section>
              )}
              {parsed.abstract && (
                <section className="pdoc-abstract" aria-label="Abstract">
                  <p className="pdoc-abstract-label">abstract.</p>
                  <div className="pdoc-abstract-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS_ABSTRACT}>
                      {parsed.abstract}
                    </ReactMarkdown>
                  </div>
                </section>
              )}
              {parsed.toc.length > 0 && <TocBlock entries={parsed.toc} />}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS_NUMBERED}>
                {parsed.post}
              </ReactMarkdown>
            </>
          ) : faq ? (
            <FaqBody content={content} />
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
