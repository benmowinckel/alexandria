import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import InviteClient from './InviteClient';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/invite',
  title: 'an invitation — alexandria.',
  description:
    'a friend sent you alexandria — a free tool that makes your ai think with you, not for you, and a community around it.',
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
  .invite-lede {
    margin: 0 0 32px; max-width: 500px;
    font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 17px; line-height: 1.6; color: var(--text-secondary);
    text-wrap: pretty;
  }
  /* Italic correction (founder 2026-07-17): the serif italic's slant
     overhangs its advance width, so the space after an inline italic word
     reads as missing. A small margin restores the visual gap. */
  .invite-lede em, .invite-more em {
    font-style: italic; color: var(--text-primary); margin-right: 0.06em;
  }
  .invite-btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 13px 28px; border-radius: 9px;
    background: var(--text-primary); color: var(--bg-primary);
    font-family: var(--font-serif), ui-serif, Georgia, serif; font-size: 16px;
    letter-spacing: 0.01em; text-decoration: none; cursor: pointer;
    transition: opacity 200ms, transform 120ms;
  }
  .invite-btn:hover { opacity: 0.88; }
  .invite-btn:active { transform: scale(0.99); }
  .invite-hint {
    margin: 14px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-style: italic; font-size: 13px; letter-spacing: 0.02em;
    color: var(--text-muted);
  }
  .invite-more {
    margin: 36px 0 0; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 14px; line-height: 1.6; color: var(--text-muted);
  }
  .invite-more a {
    color: var(--text-secondary, rgba(61, 54, 48, 0.82));
    text-decoration: underline; text-decoration-color: var(--text-muted, rgba(61, 54, 48, 0.4));
    text-underline-offset: 3px; text-decoration-thickness: 1px;
    transition: color 200ms, text-decoration-color 200ms;
  }
  .invite-more a:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }
  .primer-coda {
    margin: 52px 0 0; text-align: left; font-family: var(--font-serif), ui-serif, Georgia, serif;
    font-size: 20px; font-style: italic; color: var(--text-primary);
    letter-spacing: 0.005em; opacity: 0.72;
  }
  @media (max-width: 640px) {
    .primer-main { padding: 2rem 24px 4rem; }
    .invite-hero { font-size: 26px; }
    .invite-lede { font-size: 16px; }
    .primer-coda { font-size: 18px; margin-top: 44px; }
  }
`;
