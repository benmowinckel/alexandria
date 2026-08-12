import type { Metadata } from 'next';
import Link from 'next/link';
import { FOUNDER_EMAIL, pageMetadata } from '../lib/config';

export const metadata: Metadata = {
  ...pageMetadata({
    path: '/privacy',
    title: 'Privacy Policy — alexandria.',
    description: 'What Alexandria keeps, what stays on your computer, and how to remove your data.',
  }),
};

const section = { marginBottom: '2rem' };
const heading = { fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 } as const;
const detail = { marginTop: '0.65rem' };
const link = { color: 'var(--text-primary)' };

export default function Privacy() {
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
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 400 }}>Privacy Policy</h1>
      <p style={{ marginBottom: '2rem', fontSize: '0.85rem', opacity: 0.5 }}>Last updated: August 12, 2026</p>

      <section style={section}>
        <h2 style={heading}>What Alexandria is</h2>
        <p>Alexandria provides instructions that your own AI uses to build and read a detailed mirror of your thinking. The private mirror is stored as plain files on your computer. An optional hosted connector lets compatible loops use the Library, Marketplace, membership, and publishing features.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Your private mirror stays private</h2>
        <p>Your private files — including your constitution, vault, marginalia, transcripts, and notes — stay on your device. Alexandria has no endpoint that accepts them and cannot read or retrieve them. Backups are optional and go only to accounts you control if you choose to enable them.</p>
        <p style={detail}>This promise covers the private mirror. Information you deliberately publish, feedback you submit, and the connector records described below do reach services we operate.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>What the hosted connector stores</h2>
        <p><strong>Account and billing records.</strong> Your GitHub ID and login, email address, billing status, and Stripe customer or subscription identifiers. Account records are encrypted at rest.</p>
        <p style={detail}><strong>Authentication records.</strong> A SHA-256 hash of your Alexandria API key; the raw key stays on your machine. Short-lived browser session and onboarding tokens are also stored when those flows are used.</p>
        <p style={detail}><strong>Onboarding email.</strong> If you provide your email when you start Alexandria, we store it so we can send the matching setup message, help you finish, and occasionally send useful product notes. Every message has an unsubscribe link. Your private files and captures are never part of this email record.</p>
        <p style={detail}><strong>Service activity.</strong> A 60-day log of which Alexandria endpoints your account used and when; module IDs you explicitly approve reporting, with any notes you explicitly attach; Library publishing, access, purchase, account-connection events, and feedback you explicitly submit.</p>
        <p style={detail}><strong>Content you publish.</strong> Files, works, quizzes, profile details, and other material you deliberately send to the Library, together with their titles, access settings, prices, and file metadata.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Website analytics</h2>
        <p>We use Vercel Web Analytics for aggregate page views, referrers, country or region, browser, operating system, and device type. Vercel says this service uses no cookies, stores anonymised data, and resets its visitor-identification hash every 24 hours. We do not use advertising trackers or cross-site fingerprinting. Read <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer" style={link}>Vercel’s analytics privacy documentation</a>.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Payments</h2>
        <p>Stripe processes payments. Alexandria does not receive or store complete card numbers. Stripe receives the information needed to process the payment and keeps it under <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={link}>Stripe’s privacy policy</a>.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Retention</h2>
        <p>Account records stay while your account is active. Endpoint event logs expire after 60 days. Module-call, Library activity, transaction, and submitted-feedback records do not currently expire automatically. Published content stays until you unpublish it or delete your account; unpublishing cannot recall copies someone already downloaded or shared. We may retain records when required for security, fraud prevention, payments, disputes, or law.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Your choices and rights</h2>
        <p>Your private mirror is already portable: ordinary files you can read, edit, move, or delete. Deleting <code>~/alexandria/</code> removes the local loop but does not delete an optional hosted account.</p>
        <p style={detail}>Depending on where you live, you may have rights to know or access personal data, correct it, delete it, receive a portable copy, restrict or object to processing, and appeal a decision. We do not sell personal information or share it for cross-context behavioural advertising.</p>
        <p style={detail}>To exercise a right, delete an account, or ask us to remove submitted feedback, email <a href={`mailto:${FOUNDER_EMAIL}`} style={link}>{FOUNDER_EMAIL}</a>. We may need to verify your identity. We will answer within the period required by applicable law.</p>
        <p style={detail}>You can sign out of the website from the library. That ends the browser session on this device. It does not delete your account or the key on your computer.</p>
      </section>

      <section style={section}>
        <h2 style={heading}>Contact</h2>
        <p>Benjamin a. Mowinckel — <a href={`mailto:${FOUNDER_EMAIL}`} style={link}>{FOUNDER_EMAIL}</a></p>
        <p style={detail}><Link href="/terms" style={link}>Terms of Service</Link></p>
      </section>
    </main>
  );
}
