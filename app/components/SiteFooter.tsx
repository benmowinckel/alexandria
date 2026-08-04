import Link from 'next/link';

/**
 * SiteFooter — the consistent page foot for the standalone collective surfaces
 * (/library, /marketplace) that would otherwise dead-end with no way home.
 * Two quiet links: a surface-fitting CTA (→ /start) and the wordmark home
 * (→ /, NOT /library — that was the bug the founder flagged: clicking
 * "alexandria." dumped you into the library instead of home).
 *
 * `cta` is the label — it MUST fit the surface (you don't "build your own"
 * on a directory of people or a shelf of modules). Library says "start your
 * own", marketplace "add your own". Both point at the one install funnel.
 */
export default function SiteFooter({
  cta = 'start your loop',
  ctaHref = '/start',
}: {
  cta?: string;
  ctaHref?: string;
}) {
  return (
    <footer style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '1rem 1.8rem', marginTop: '4.5rem', padding: '2.2rem 1.2rem 3rem', borderTop: '1px solid var(--border-light)' }}>
      <Link
        href={ctaHref}
        style={{ fontFamily: 'var(--font-eb-garamond)', color: 'var(--text-muted)', fontSize: '0.9rem', textDecoration: 'none' }}
        className="hover:opacity-60"
      >
        {cta}
      </Link>
      <Link
        href="/"
        style={{ fontFamily: 'var(--font-eb-garamond)', fontStyle: 'italic', color: 'var(--text-ghost)', fontSize: '0.9rem', letterSpacing: '0.01em', textDecoration: 'none' }}
        className="hover:opacity-60"
      >
        alexandria<span style={{ fontStyle: 'normal' }}>.</span>
      </Link>
      <Link
        href="/privacy"
        style={{ fontFamily: 'var(--font-eb-garamond)', color: 'var(--text-ghost)', fontSize: '0.82rem', textDecoration: 'none' }}
        className="hover:opacity-60"
      >
        privacy
      </Link>
      <Link
        href="/terms"
        style={{ fontFamily: 'var(--font-eb-garamond)', color: 'var(--text-ghost)', fontSize: '0.82rem', textDecoration: 'none' }}
        className="hover:opacity-60"
      >
        terms
      </Link>
    </footer>
  );
}
