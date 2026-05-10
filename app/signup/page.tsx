import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import SignupCTA from './SignupCTA';
import MechanicsCopy from '../components/MechanicsCopy';

export const dynamic = 'force-dynamic';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; ref_source?: string }>;
}) {
  const sp = await searchParams;
  const urlRef = sp.ref;
  const refSource = sp.ref_source;

  const mechanicsContent = await readFile(
    path.join(process.cwd(), 'public', 'docs', 'Mechanics.md'),
    'utf8',
  );

  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        <article className="primer">
          <p className="primer-salutation">to the new alexandrian.</p>

          <h1 className="primer-h1">
            you have crossed the threshold. read this once before signing up &mdash; what we ask, what we promise, and how to begin.
          </h1>

          <section className="primer-section">
            <p className="primer-label">the covenant.</p>
            <p>
              alexandria is a folder on your own machine; plain
              markdown, your files, your shape. every ai you ever
              use reads it and thinks <em>with</em> you, not for
              you.
            </p>
            <p>
              the one thing we ask: participate in the collective.
              publish a single living file &mdash; what you&rsquo;d
              say to a stranger, plus a table of contents to the
              rest (gated however you choose). and share the
              modules you build for yourself. the library compounds
              when minds reach across.
            </p>
          </section>

          <section className="primer-section">
            <p className="primer-label">the mindset.</p>
            <p>
              agency is the input. you ask, it answers; you shape,
              it sharpens. wait passively and you get average;
              participate actively and you get something
              specifically yours. you should never sit there
              wondering &mdash; just ask.
            </p>
          </section>

          <section className="primer-section">
            <p className="primer-label">the deal.</p>
            <p>
              free if five friends sign up through you and stay
              active &mdash; we call them your kin. after signup
              you will get a kin link; send it to ten people
              straight away, knowing some will not stick. any
              month with fewer than five active kin is $10 &mdash;
              the fee waives automatically the moment you have
              five again.
            </p>
          </section>

          <section className="primer-section">
            <p className="primer-label">the sovereignty.</p>
            <p>
              your files live on your own machine and your
              github. we never see what you do not publish. if
              alexandria disappears tomorrow, you keep everything.{' '}
              <MechanicsCopy content={mechanicsContent} /> lists every byte that touches our server.
            </p>
          </section>

          <section className="primer-section">
            <p className="primer-label">what happens next.</p>
            <p>
              one click below for github. one curl command in your
              terminal after. the folder appears at <code>~/alexandria/</code>,
              your ai picks it up at the next session, and you are
              in. five minutes to your first session.
            </p>
          </section>
        </article>

        <SignupCTA urlRef={urlRef} refSource={refSource} />

        <p className="primer-coda"><em>welcome to alexandria.</em></p>
      </main>

      <style>{`
        /* PAGE — covenant register. Cream substrate, classical
           literary serif, gentle paper grain, soft fade-in on first
           paint. The page is the deal made visible; the typography
           does the work of "this is serious." */
        .primer-page {
          background: var(--bg-primary);
          color: var(--text-primary);
          min-height: 100vh;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          /* Two faint radial gradients give the page a barely-there
             paper warmth — uneven, unpressed, alive. Not visible as
             texture; felt as substrate. Same recipe as .mdoc on the
             whitepaper so the brand reads as one printed object
             across surfaces. */
          background-image:
            radial-gradient(ellipse 120% 80% at 30% 20%, rgba(91, 31, 71, 0.025) 0%, transparent 60%),
            radial-gradient(ellipse 100% 70% at 70% 80%, rgba(74, 50, 30, 0.020) 0%, transparent 60%);
          /* Wake up gently. The reader has just crossed a threshold;
             snapping in would feel transactional. */
          animation: primerFadeIn 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        @keyframes primerFadeIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* BRAND — top-left, italic wordmark, quiet hover. The
           reader's anchor home. */
        .primer-header {
          padding: 28px 32px 0;
        }
        .primer-brand {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-weight: 400;
          font-size: 21px;
          color: var(--text-primary);
          text-decoration: none;
          letter-spacing: 0.005em;
          transition: opacity 220ms ease;
          display: inline-block;
          padding: 10px 8px;
          margin: -10px -8px;
        }
        .primer-brand:hover {
          opacity: 0.6;
        }
        .primer-brand-dot {
          font-style: normal;
        }

        .primer-main {
          max-width: 580px;
          margin: 0 auto;
          padding: 5rem 24px 6rem;
        }

        /* SALUTATION — museum-plate opener, lowercase letter-spaced
           italic. The Renaissance epistolary register: "to the new
           alexandrian." reads as "to the reader" did on the front
           slide. Sits above the threshold sentence as a small chip. */
        .primer-salutation {
          margin: 0 0 28px;
          font-style: italic;
          font-size: 12px;
          font-weight: 400;
          letter-spacing: 0.22em;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
          text-transform: lowercase;
        }

        /* H1 — the threshold sentence. The covenant's headline
           sentence has to *feel* like a threshold, not a paragraph
           with extra weight. Bumped up; given more line height; sits
           with proper presence. */
        .primer-h1 {
          margin: 0 0 64px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-weight: 400;
          font-size: 27px;
          line-height: 1.42;
          letter-spacing: -0.005em;
          color: var(--text-primary);
          text-wrap: pretty;
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1;
        }

        /* SECTIONS — five short articles of the covenant. Each opens
           with an italic letter-spaced lowercase label (matching the
           salutation register), then 1-2 short paragraphs. Spacing
           is the divider; the rhythm IS the structure. */
        .primer-section {
          margin: 0 0 48px;
        }
        .primer-section:last-of-type {
          margin-bottom: 56px;
        }

        .primer-label {
          margin: 0 0 14px;
          font-style: italic;
          font-size: 12px;
          font-weight: 400;
          letter-spacing: 0.22em;
          text-transform: lowercase;
          color: var(--text-muted, rgba(26, 19, 24, 0.55));
        }

        .primer p:not(.primer-label):not(.primer-salutation):not(.primer-coda) {
          margin: 0 0 16px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 17px;
          line-height: 1.7;
          color: var(--text-secondary, rgba(26, 19, 24, 0.85));
          letter-spacing: 0.005em;
          /* Old-style figures + common ligatures + kerning. Body type
             that reads as printed, not transmitted. */
          font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
          text-wrap: pretty;
        }
        .primer p:last-child {
          margin-bottom: 0;
        }

        .primer em {
          font-style: italic;
          color: var(--text-primary);
        }

        .primer code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.88em;
          padding: 0.08em 0.4em;
          border-radius: 3px;
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        /* MECHANICS LINK — inline mechanics.md link with copy icon. Reads as
           part of the prose, with a quiet underline that strengthens
           on hover. */
        .primer button.mechanics-copy {
          display: inline-flex;
          align-items: baseline;
          gap: 0.3em;
          background: transparent;
          border: none;
          padding: 0;
          margin: 0;
          font: inherit;
          font-family: inherit;
          font-size: inherit;
          color: var(--text-primary);
          cursor: pointer;
          text-decoration: underline;
          text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.45));
          text-underline-offset: 3px;
          text-decoration-thickness: 1px;
          transition: opacity 200ms, text-decoration-color 200ms;
        }
        .primer button.mechanics-copy:hover {
          text-decoration-color: var(--text-primary);
          opacity: 0.85;
        }
        .primer .mechanics-copy-icon {
          display: inline-flex;
          align-items: center;
          opacity: 0.55;
        }

        /* CTA — fleuron divider + italic text-button. No filled
           buttons; the literary register holds through the action.
           The fleuron replaces the hairline rule because the rule
           read as "thin grey line on cream"; the fleuron reads as
           "rhetorical pause before the close." Same ornament as the
           whitepaper's section breaks — the brand cohering. */
        .cta-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          padding: 56px 0 0;
          margin-top: 24px;
          position: relative;
        }
        .cta-section::before {
          content: '❦';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translate(-50%, -50%);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 18px;
          color: var(--accent);
          opacity: 0.45;
          line-height: 1;
          padding: 0 14px;
          background: var(--bg-primary);
          letter-spacing: 0.3em;
        }

        .primary-cta {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-weight: 500;
          font-size: 23px;
          letter-spacing: 0;
          color: var(--text-primary);
          text-decoration: underline;
          text-decoration-color: var(--text-muted, rgba(26, 19, 24, 0.4));
          text-decoration-thickness: 1px;
          text-underline-offset: 6px;
          padding: 4px 0;
          transition: text-decoration-color 200ms, opacity 200ms;
        }
        .primary-cta:hover {
          text-decoration-color: var(--text-primary);
          opacity: 0.92;
        }

        .kin-form {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .kin-via {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 12px;
          letter-spacing: 0.22em;
          text-align: center;
          text-transform: lowercase;
          color: var(--text-ghost, rgba(26, 19, 24, 0.45));
          margin: 0;
        }

        .kin-input {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 13px;
          letter-spacing: 0.12em;
          text-align: center;
          text-transform: lowercase;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.18));
          outline: none;
          width: 160px;
          padding: 4px 0;
          color: var(--text-ghost, rgba(26, 19, 24, 0.55));
          caret-color: var(--text-ghost, rgba(26, 19, 24, 0.55));
          transition: border-bottom-color 200ms, color 200ms;
        }
        .kin-input:focus {
          border-bottom-color: var(--text-primary);
          color: var(--text-primary);
        }
        .kin-input::placeholder {
          color: var(--text-ghost, rgba(26, 19, 24, 0.4));
          font-style: italic;
        }

        .kin-status {
          display: inline-flex;
          align-items: center;
          padding: 0;
          margin: 0;
          background: transparent;
          border: none;
          font: inherit;
        }
        .kin-status.valid {
          color: var(--accent, #6b3a4a);
        }
        button.kin-status.invalid {
          color: var(--text-muted, rgba(26, 19, 24, 0.5));
          cursor: pointer;
          transition: color 200ms;
        }
        button.kin-status.invalid:hover {
          color: var(--text-primary);
        }
        .kin-feedback {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 12px;
          letter-spacing: 0.04em;
          text-align: center;
          margin: 8px 0 0;
          max-width: 320px;
        }
        .kin-feedback.valid {
          color: var(--accent, #6b3a4a);
        }
        .kin-feedback.invalid {
          color: var(--text-muted, rgba(26, 19, 24, 0.5));
        }
        .webview-notice {
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 12px;
          letter-spacing: 0.04em;
          text-align: center;
          margin: 0 0 12px;
          max-width: 320px;
          color: var(--text-muted, rgba(26, 19, 24, 0.5));
        }

        /* CODA — destination beat. "welcome to alexandria." closes
           the covenant the way the front slide closes the pitch.
           Larger than the body's small text; sits with weight as the
           last word; centred italic, gentle accent. */
        .primer-coda {
          margin: 64px 0 0;
          text-align: center;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 21px;
          font-style: italic;
          color: var(--text-primary);
          letter-spacing: 0.005em;
          opacity: 0.78;
        }

        @media (max-width: 640px) {
          .primer-main {
            padding: 3rem 20px 4rem;
          }
          .primer-h1 {
            font-size: 22px;
            line-height: 1.42;
            margin-bottom: 48px;
          }
          .primer p:not(.primer-label):not(.primer-salutation):not(.primer-coda) {
            font-size: 16px;
            line-height: 1.7;
          }
          .primer-section {
            margin-bottom: 40px;
          }
          .cta-section {
            padding-top: 48px;
          }
          .primary-cta {
            font-size: 20px;
          }
          .primer-coda {
            font-size: 19px;
            margin-top: 56px;
          }
        }
      `}</style>
    </div>
  );
}
