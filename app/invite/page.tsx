import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import InviteClient from './InviteClient';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/invite',
  title: 'an invitation — alexandria.',
  description:
    'A friend sent you Alexandria — free instructions that help your own AI build and use a living record in files you own.',
});

// The referral landing (founder 2026-07-17): the link members share. Before
// this, invite links dropped a cold recipient straight onto /start — a
// command-line install page with zero context ("they've got no idea what that
// is"). This page is the self-contained first touch: who sent you, what this
// is in one line, one action. The ref rides through to /start (install →
// eventual join) so kin attribution is unchanged.
function cleanRef(raw: string | undefined): string {
  return (raw || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  const ref = cleanRef(params.ref) || undefined;
  return (
    <div className="primer-page">
      <ThemeToggle />
      <InviteClient refCode={ref} />
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .primer-page {
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    background-image:
      radial-gradient(ellipse 120% 80% at 30% 20%, rgba(91, 31, 71, 0.025) 0%, transparent 60%),
      radial-gradient(ellipse 100% 70% at 70% 80%, rgba(74, 50, 30, 0.020) 0%, transparent 60%);
    animation: primerFadeIn 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  @keyframes primerFadeIn {
    0% { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .primer-header { padding: 28px 32px 0; }
  .primer-brand {
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-style: italic; font-weight: 400; font-size: 21px;
    color: var(--text-primary); text-decoration: none;
    letter-spacing: 0.005em; transition: opacity 220ms ease;
    display: inline-block; padding: 10px 8px; margin: -10px -8px;
  }
  .primer-brand:hover { opacity: 0.6; }
  .primer-brand-dot { font-style: normal; }

  .primer-main {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: flex-start; justify-content: center;
    max-width: 620px; margin: 0 auto; padding: 3rem 40px 6rem; width: 100%;
    text-align: left;
  }
  .primer-eyebrow {
    margin: 0 0 18px; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-weight: 500; font-size: 11.5px; letter-spacing: 0.3em;
    text-transform: lowercase; font-variant-caps: all-small-caps;
    font-feature-settings: "smcp" 1, "kern" 1;
    color: var(--accent); line-height: 1;
  }
  .invite-hero {
    margin: 0 0 24px; max-width: 560px;
    font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
    font-style: italic; font-weight: 500;
    font-size: clamp(28px, 1.5rem + 1.6vw, 36px); line-height: 1.2;
    letter-spacing: -0.01em; color: var(--text-primary); text-wrap: balance;
    font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "calt" 1, "swsh" 1;
  }
  /* The one grammar (the /join law): bold words — muted why, boxes for
     every actionable thing. Styles mirror /join's act-box set. */
  .invite-vouch {
    margin: 0 0 28px; max-width: 560px;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 17px; line-height: 1.55; letter-spacing: 0.005em;
    color: var(--text-primary); text-wrap: pretty;
  }
  .door-btn {
    display: block; width: 100%; max-width: 486px; text-align: left;
    background: var(--bg-secondary);
    border: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.14)); border-radius: 10px;
    padding: 17px 20px; cursor: pointer;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 17px; letter-spacing: 0.01em; color: var(--text-primary);
    text-decoration: none;
    transition: border-color 220ms, transform 120ms;
  }
  .door-btn:hover { border-color: var(--text-muted, rgba(26, 19, 24, 0.42)); }
  .door-btn:active { transform: scale(0.992); }
  .act-box { display: block; }
  .act-why { color: var(--text-muted, rgba(26, 19, 24, 0.55)); }
  .act-primary {
    background: var(--text-primary); color: var(--bg-primary);
    border-color: var(--text-primary); margin-top: 4px;
  }
  .act-primary:hover { opacity: 0.9; border-color: var(--text-primary); }
  .act-why-inverse { color: var(--bg-primary); opacity: 0.65; }
  .invite-terms {
    margin: 14px 0 0; max-width: 486px;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 13.5px; line-height: 1.6; letter-spacing: 0.01em;
    color: var(--text-muted, rgba(26, 19, 24, 0.55));
  }
  .invite-terms + .invite-terms { margin-top: 4px; }
  .invite-exits {
    margin: 40px 0 0; padding-top: 30px; width: 100%; max-width: 486px;
    border-top: 1px solid var(--bg-tertiary, rgba(26, 19, 24, 0.10));
    display: flex; flex-direction: column; gap: 10px;
  }
  @media (max-width: 640px) {
    .primer-main { padding: 2rem 24px 4rem; }
    .invite-hero { font-size: 26px; }
  }
`;
