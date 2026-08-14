import type { Metadata } from 'next';
import Link from 'next/link';
import { FOUNDER_EMAIL, pageMetadata } from '../lib/config';

export const metadata: Metadata = {
  ...pageMetadata({
    path: '/terms',
    title: 'Terms of Service — alexandria.',
    description: 'Terms for the free Alexandria loop and the optional hosted connector.',
  }),
};

const section = { marginBottom: '2rem' };
const heading = { fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 } as const;
const detail = { marginTop: '0.65rem' };
const link = { color: 'var(--text-primary)' };

export default function Terms() {
  return (
    <main style={{
      maxWidth: '680px',
      margin: '0 auto',
      padding: '4rem 1.5rem',
      fontFamily: 'var(--font-eb-garamond)',
      color: 'var(--text-primary)',
      lineHeight: 1.7,
    }}>
      <Link href="/" style={{ ...link, display: 'inline-block', marginBottom: '2.5rem', fontStyle: 'italic', textDecoration: 'none' }}>
        alexandria.
      </Link>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 400 }}>Terms of Service</h1>
      <p style={{ marginBottom: '2rem', fontSize: '0.85rem', opacity: 0.5 }}>Last updated: August 12, 2026</p>

      <section style={section}>
        <h2 style={heading}>What this is</h2>
        <p>Alexandria provides instructions and support files that your own AI can use to build and read a private mirror of your thinking. The free loop runs on your machine or, for the chat version, through your AI provider’s personalisation and documents in your own Google Drive when available. Alexandria also offers an optional hosted connector: accounts, membership, the Library, the Marketplace, publishing, and related payment features.</p>
        <p style={detail}>These terms govern the website and hosted connector. The public source and files on your own machine remain subject to any notices included with them.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Your private files</h2>
        <p>You own your private mirror. Alexandria does not claim rights to your constitution, vault, notes, transcripts, or other private local files. If you stop using Alexandria, those files remain yours. The local loop can continue without the company; hosted connector features cannot.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Content you publish</h2>
        <p>You keep ownership of anything you publish to the Library or Marketplace. You give Alexandria a limited, worldwide licence to host, copy, format, and display that material only as needed to provide the access settings and features you choose.</p>
        <p style={detail}>You must have the right to publish what you submit. You can update or unpublish it, but removing it from Alexandria cannot recall copies already downloaded, cached, forked, or shared by other people.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Membership and payments</h2>
        <p>The complete loop is free. The connector is optional. The current founding-membership offer is $30 per month after a 30-day trial, free while three qualifying friends remain active through your referral, or waived when we agree to cover it. The price, trial, and renewal terms shown at checkout control your purchase.</p>
        <p style={detail}>Paid memberships renew monthly until cancelled. Cancel before the next renewal to avoid the next charge. Except where law requires otherwise, completed charges are non-refundable. Individual Authors may separately price Library files or works; those prices and any platform fee are shown before purchase.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Accounts</h2>
        <p>Hosted features use GitHub OAuth and may issue an API key or browser session. Keep those credentials private and tell us if you believe they were compromised. You are responsible for activity performed through your account until it is secured or deleted. Sign out ends the browser session on this device; it does not revoke the API key or delete the account.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Acceptable use</h2>
        <p>Do not bypass access controls, access another person’s private or paid material without permission, upload malware or unlawful content, interfere with the service, automate abusive traffic, impersonate another person, or use Alexandria to harm others or violate law. We may suspend accounts or remove published material that violates these terms.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>AI and third-party services</h2>
        <p>Your AI provider, GitHub, Google Drive, Stripe, Cloudflare, Vercel, and any tools you connect have their own terms and privacy practices. AI output can be wrong. You decide what to run, publish, buy, or act on, and you remain responsible for reviewing those decisions.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Availability and liability</h2>
        <p>Alexandria is provided as-is and as available. Features may change, break, or end. To the fullest extent allowed by law, Alexandria is not liable for indirect, incidental, special, consequential, or punitive damages, lost data, lost profits, AI output, service interruptions, or material published by users. Nothing here excludes liability that law does not allow us to exclude.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Governing law</h2>
        <p>These terms are governed by California law, without regard to conflict-of-law rules. Disputes will be brought in state or federal courts in San Francisco, California, unless applicable consumer law gives you the right to bring them elsewhere.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Changes</h2>
        <p>We may update these terms. If a change materially affects a paid service or your data, we will give reasonable notice by email or on the website. Continued use after the effective date means you accept the updated terms.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Contact</h2>
        <p>Benjamin a. Mowinckel — <a href={`mailto:${FOUNDER_EMAIL}`} style={link}>{FOUNDER_EMAIL}</a></p>
        <p style={detail}><Link href="/privacy" style={link}>Privacy Policy</Link></p>
      </section>
    </main>
  );
}
