import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — alexandria.",
};

export default function Terms() {
  return (
    <main style={{
      maxWidth: '640px',
      margin: '0 auto',
      padding: '4rem 1.5rem',
      fontFamily: 'var(--font-eb-garamond)',
      color: 'var(--text-primary)',
      lineHeight: 1.7,
    }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '2rem', fontWeight: 400 }}>Terms of Service</h1>
      <p style={{ marginBottom: '1rem', fontSize: '0.85rem', opacity: 0.5 }}>Last updated: May 11, 2026</p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>What this is</h2>
        <p>Alexandria is Greek philosophy infrastructure. It distributes a canonical machine — modular parts (skills, hooks, scripts, methodology) on our public GitHub repository — that you install into your ai environment (Claude Code, Cursor, Codex, or any compatible tool). After installation, your machine is yours: it runs on your hardware against your files using credentials you control. We host a Protocol endpoint, the Library where Authors publish files, and a private cross-Author signal layer used to evolve the canonical machine over time. Nothing personal to you flows through us unless you publish it. These terms govern your use of the Alexandria server, website, and Library at alexandria-library.com.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Your data</h2>
        <p>You own your cognitive data. Your Constitution, Vault, notepad, feedback log, and ontology are local files at <code>~/alexandria/</code> on your machine. Alexandria does not store, access, or claim any rights to this data. If you stop using Alexandria, your files remain on your machine, unchanged and fully yours. If Alexandria the company shuts down entirely, your files and your local machine continue to function — what ends is your access to the Library and other collective surfaces, which are by definition hosted by us.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Published content</h2>
        <p>If you publish to the Library — shadow MDs, works, quizzes, or other content — that published content is stored on Alexandria&apos;s infrastructure. Publishing is always explicit: you review and approve before anything leaves your machine. You can unpublish or update at any time. Alexandria stores what you publish, never what you think. Published content may be accessed by other users and their ai agents according to the access tiers you set.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>The service</h2>
        <p>Alexandria is provided as-is. Things may change, break, or be discontinued. We will give reasonable notice before changes that affect your data or access. Pricing: free while Alexandria is in its early stage. When paid plans begin we will give reasonable notice; the intended model is one tier, slider pricing — pay what it is worth to you, no ceiling.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Accounts</h2>
        <p>Accounts are created via GitHub OAuth. One account per person. Your API key authenticates access to the protocol and Library. Do not share your API key.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Acceptable use</h2>
        <p>Use Alexandria for its intended purpose: developing your cognitive profile through ai conversations and publishing to the Library. Do not attempt to access other Authors&apos; private data, reverse-engineer the methodology, abuse the API, or use the service to harm others.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Liability</h2>
        <p>Alexandria is not liable for data loss on your machine, ai outputs generated using your Constitution, service interruptions, or the content of published Library material. Your data sovereignty means your data responsibility. Published content is your responsibility — Alexandria does not moderate Library content but reserves the right to remove material that violates these terms.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Governing law</h2>
        <p>These terms are governed by the laws of the State of California, United States. Any disputes will be resolved in the state or federal courts located in San Francisco, California. If you are in the EU/EEA, this does not affect your rights under GDPR or local consumer protection laws.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Changes</h2>
        <p>These terms may be updated. Material changes will be communicated via email or the website. Continued use after changes constitutes acceptance.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 400 }}>Contact</h2>
        <p>Benjamin Mowinckel — <a href="mailto:mowinckel.b@gmail.com" style={{ color: 'var(--text-primary)' }}>mowinckel.b@gmail.com</a></p>
      </section>
    </main>
  );
}
