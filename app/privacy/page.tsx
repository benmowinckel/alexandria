import type { Metadata } from "next";
import { pageMetadata } from "../lib/config";

export const metadata: Metadata = {
  title: "Privacy Policy — alexandria.",
  ...pageMetadata({
    path: "/privacy",
    title: "Privacy Policy — alexandria.",
    description: "alexandria privacy policy.",
  }),
};

export default function Privacy() {
  return (
    <main style={{
      maxWidth: '640px',
      margin: '0 auto',
      padding: '4rem 1.5rem',
      fontFamily: 'var(--font-eb-garamond)',
      color: 'var(--text-primary)',
      lineHeight: 1.7,
    }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '2rem', fontWeight: 400 }}>Privacy Policy</h1>
      <p style={{ marginBottom: '1rem', fontSize: '0.85rem', opacity: 0.5 }}>Last updated: April 3, 2026</p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>What Alexandria is</h2>
        <p>Alexandria is Greek philosophy infrastructure. It helps you build a structured picture of how you think — your Constitution — stored as markdown files on your own machine at <code>~/alexandria/</code>. Alexandria does not host, store, or retain your cognitive data.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Your data stays on your machine</h2>
        <p>Your Constitution, Vault, feedback log, notepad, and ontology are local markdown files on your device. They never leave your machine. Alexandria&apos;s server cannot access, read, or retrieve them. This is not a policy — it is architecture. There is no mechanism in the system for your private cognitive data to reach our servers.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>What we store</h2>
        <p>Alexandria&apos;s server stores three categories of data, all on Cloudflare infrastructure:</p>
        <p style={{ marginTop: '0.5rem' }}><strong>Account records</strong> (KV) — your GitHub username, email address, API key, and billing status. Created when you sign up via GitHub OAuth.</p>
        <p style={{ marginTop: '0.5rem' }}><strong>Anonymous session metadata</strong> (KV) — when sessions start and end, constitution file size, vault entry count, platform type. Never content. Never personal information. Used to verify the product is working and to improve the methodology.</p>
        <p style={{ marginTop: '0.5rem' }}><strong>Published Library content</strong> (D1 + R2) — if you choose to publish shadow MDs, works, or quizzes to the Library, that published content is stored on our infrastructure. Publishing is an explicit, deliberate act — you review and approve everything before it leaves your machine. You can unpublish at any time.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Authentication</h2>
        <p>Account creation uses GitHub OAuth. Ongoing authentication uses an API key issued at signup. Only a SHA-256 hash of your API key is stored on the server; the raw key lives only on your machine at <code>~/alexandria/system/.api_key</code>. The key authenticates your access to Alexandria and the Library APIs.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>The canon</h2>
        <p>Every session, your ai fetches Alexandria&apos;s canon — the methodology that guides cognitive extraction and development. This is a text document served publicly from GitHub (<code>factory/canon/methodology.md</code>). It contains no personal data. It is the same for all Authors. The canon is readable — you can inspect exactly what instructions your ai receives.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Payments</h2>
        <p>Payments are processed by Stripe. Alexandria does not store credit card numbers or financial credentials. Stripe&apos;s privacy policy governs payment data.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Data retention</h2>
        <p>Account records are stored indefinitely while your account is active. Anonymous session metadata is stored in daily event logs with no expiration. User feedback submitted via the product is stored for 90 days. Published Library content is stored until you unpublish it or request deletion. There is no hidden retention beyond what is described here.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Your rights</h2>
        <p>Your cognitive data is yours. It lives on your machine. You can read, edit, move, or delete it at any time — it is markdown files in a folder. Deleting <code>~/alexandria/</code> removes everything local.</p>
        <p style={{ marginTop: '0.5rem' }}>Under GDPR, CCPA, and equivalent data protection laws, you have the right to:</p>
        <p style={{ marginTop: '0.5rem' }}><strong>Access</strong> — request a copy of all data we hold about you (account record, session metadata, published Library content).</p>
        <p style={{ marginTop: '0.5rem' }}><strong>Rectification</strong> — correct any inaccurate data in your account record.</p>
        <p style={{ marginTop: '0.5rem' }}><strong>Erasure</strong> — request deletion of your account and all associated data. Email us and we will delete your account record, session metadata, and any published Library content within 30 days.</p>
        <p style={{ marginTop: '0.5rem' }}><strong>Portability</strong> — your cognitive data is already on your machine in open markdown format. For server-side data, we will provide your account record and published content in JSON/markdown format on request.</p>
        <p style={{ marginTop: '0.5rem' }}><strong>Objection</strong> — you may object to processing of your session metadata. Email us and we will stop collecting it for your account.</p>
        <p style={{ marginTop: '0.5rem' }}>To exercise any of these rights, email <a href="mailto:mowinckel.b@gmail.com" style={{ color: 'var(--text-primary)' }}>mowinckel.b@gmail.com</a>.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>No tracking</h2>
        <p>Alexandria does not use cookies, third-party analytics, advertising trackers, or fingerprinting on any surface. The website, the server, and the product are tracking-free.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Contact</h2>
        <p>Benjamin Mowinckel — <a href="mailto:mowinckel.b@gmail.com" style={{ color: 'var(--text-primary)' }}>mowinckel.b@gmail.com</a></p>
      </section>
    </main>
  );
}
