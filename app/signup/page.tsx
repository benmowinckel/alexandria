import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import SignupCTA from './SignupCTA';

export const dynamic = 'force-dynamic';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; ref_source?: string }>;
}) {
  const sp = await searchParams;
  const urlRef = sp.ref;
  const refSource = sp.ref_source;

  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      <ThemeToggle />

      <header className="px-6 sm:px-8 pt-7 sm:pt-8">
        <Link href="/" className="no-underline">
          <p className="text-[1.3rem] sm:text-[1.5rem] font-normal leading-none tracking-tight" style={{ color: 'var(--text-primary)' }}>
            alexandria.
          </p>
        </Link>
      </header>

      <main className="primer-main px-6 sm:px-8">
        <article className="primer">
          <h1>alexandria is a folder, not an app.</h1>

          <p>
            one curl command, a folder appears at <code>~/alexandria/</code>, and your existing ai (claude code, cursor, codex) starts reading it at every session. plain markdown. you can read every file, change every file, delete the whole thing.
          </p>

          <h2>what you&rsquo;re joining</h2>

          <p>
            a tribe of high-agency people who think human thought has value &mdash; and who want to protect and sharpen their own. signing up gets you access to the collective signal of everyone else doing the same.
          </p>

          <p>
            your ai is a little living entity on your computer, eager to help. we&rsquo;ve just given it a new role it can sometimes adopt &mdash; thinking partner, biographer, helper, alexandria, alex, whatever you want to call it. we ship a starter version. if you never touch it, fine &mdash; but you will, naturally, over time, as you write and notice what it gets wrong about you. we handle the plumbing; what your thinking partner becomes is yours.
          </p>

          <p>
            don&rsquo;t like a tone? say so. find a topic boring? say so. anything you don&rsquo;t like, you literally just say so, and it changes. and if you want to rip out the infra and rebuild it, fine &mdash; it&rsquo;s all plain markdown, all on your disk.
          </p>

          <p className="motto">a republic of thought. similar uniqueness. we&rsquo;re all in this together.</p>

          <h2>the one thing we ask</h2>

          <p>participate in the collective. alexandria becomes the write path for your thoughts and your system of thoughts. get them out of your head and put them to work.</p>

          <h3>publish thoughts.</h3>

          <p>your folder syncs to a private repo on your github &mdash; you own it, we have no access.</p>

          <p>publish one live, evolving file. don&rsquo;t overthink it: imagine you just met a stranger in real life and chatted about whatever came up &mdash; every topic, all your thoughts. that&rsquo;s the file. logically, you&rsquo;d already say all of it out loud &mdash; so sharing it with a stranger is fine. that&rsquo;s the floor: the lower bound everyone should be ok with.</p>

          <p>ideally more. all your interesting thoughts. every file has its own permission gate &mdash; open to anyone, alexandrians only, paywalled, or invite-only for the people you pick. taste.md. an essay on where politics is going. analysis of the piece of technology you can&rsquo;t stop thinking about. thoughts packaged into files. owned and gated by you. drafted by you, sometimes with your thinking partner. a library of minds.</p>

          <p>you have interesting thoughts. alexandria helps you use your ai to make them more interesting. but the purpose of knowledge is action, not knowledge &mdash; the point is to do more interesting things, not sit around thinking interesting thoughts. go do things. all of it is downstream of thoughts. optimise root node.</p>

          <h3>share modules.</h3>

          <p>hyper-personalise. we want this.</p>

          <p>the more you tune your alexandria into something that works for you &mdash; your patterns, your prompts, your conventions &mdash; the sharper your thinking gets. your good ideas surface as candidates for modules. publish with one command. other alexandrians install yours; you install theirs.</p>

          <p>this is the compounding loop: better system &rarr; better thoughts &rarr; better files &rarr; others install your modules &rarr; their systems sharpen &rarr; their files sharpen &rarr; yours sharpens from theirs. better systems, better thoughts, better actions &mdash; all the way around.</p>

          <p className="motto">we work together. pure marginal value. keep thinking.</p>

          <h2>the deal</h2>

          <p className="deal-line"><strong>$10/month &mdash; or free if five friends sign up through you and keep their accounts active. we call them your kin.</strong></p>

          <p>after you sign up you&rsquo;ll get a kin link. send it to ten friends straight away. ten because some won&rsquo;t stick &mdash; five active is all you need. do it before you forget.</p>

          <p>we never see your private files. they live on your machine and your github. our server only knows what you publish to it. <Link href="/trust">trust &rarr;</Link> lists every byte that touches it.</p>

          <p>if alexandria disappears tomorrow, you keep everything on your disk.</p>
        </article>

        <SignupCTA urlRef={urlRef} refSource={refSource} />
      </main>

      <style>{`
        .primer-main {
          max-width: 640px;
          margin: 0 auto;
          padding-top: 3rem;
          padding-bottom: 5rem;
        }
        .primer h1 {
          font-size: 1.55rem;
          font-weight: 500;
          letter-spacing: -0.01em;
          line-height: 1.3;
          margin: 1rem 0 1.75rem;
          color: var(--text-primary);
        }
        @media (min-width: 640px) {
          .primer h1 { font-size: 1.75rem; }
        }
        .primer h2 {
          font-size: 1rem;
          font-weight: 500;
          letter-spacing: 0;
          margin: 3rem 0 1.25rem;
          color: var(--text-primary);
        }
        .primer h3 {
          font-size: 0.95rem;
          font-weight: 600;
          margin: 2rem 0 0.85rem;
          color: var(--text-primary);
        }
        .primer p {
          font-size: 0.95rem;
          line-height: 1.75;
          margin: 0 0 1.1rem;
          color: var(--text-secondary);
        }
        .primer code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.85em;
          padding: 0.1em 0.35em;
          border-radius: 3px;
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .primer .motto {
          font-style: italic;
          margin: 1.5rem 0 0.5rem;
          color: var(--text-muted);
        }
        .primer .deal-line {
          color: var(--text-primary);
        }
        .primer a {
          color: var(--text-primary);
          text-decoration: underline;
          text-underline-offset: 0.2em;
          text-decoration-thickness: 1px;
        }
        .primer a:hover {
          opacity: 0.6;
        }
        .primer strong {
          font-weight: 600;
          color: var(--text-primary);
        }
        .cta-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          padding: 3.5rem 0 1rem;
          margin-top: 2rem;
          border-top: 1px solid var(--bg-tertiary);
        }
        .primary-cta {
          font-size: 1.05rem;
          letter-spacing: 0.01em;
          font-weight: 500;
          text-decoration: none;
          color: var(--text-primary);
          transition: opacity 200ms;
          padding: 0.5rem 0;
        }
        @media (min-width: 640px) {
          .primary-cta { font-size: 1.15rem; }
        }
        .primary-cta:hover {
          opacity: 0.6;
        }
        .kin-via {
          font-size: 0.75rem;
          letter-spacing: 0.15em;
          text-align: center;
          color: var(--text-ghost);
        }
        .kin-input {
          font-size: 0.75rem;
          letter-spacing: 0.15em;
          text-align: center;
          background: transparent;
          border: none;
          outline: none;
          width: 140px;
          color: var(--text-ghost);
          caret-color: var(--text-ghost);
        }
        .kin-input::placeholder {
          color: var(--text-ghost);
        }
      `}</style>
    </div>
  );
}
