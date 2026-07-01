export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://api.alexandria-library.com';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://alexandria-library.com';
export const FETCH_TIMEOUT_MS = 8000;

// Shared social/openGraph fields. Next.js metadata merging is **shallow**:
// any page that sets `openGraph` at all replaces the parent layout's
// openGraph entirely (siteName, locale, type all vanish; og:title and
// og:description do NOT fall back to top-level title/description). So
// per-page canonical/og:url overrides must re-declare the full block.
const OG_BASE = {
  siteName: 'alexandria',
  locale: 'en_US',
  type: 'website' as const,
};

// Per-page canonical + og:url + full openGraph block. The root layout sets
// canonical and og:url to SITE_URL, and `alternates`/`openGraph` are
// shallow-merged, so every child page inherits canonical=root and
// og:url=root — Google then collapses them all into the homepage. Each
// indexable route must call this with its own pathname (and its own
// og:title / og:description, which won't fall back to top-level title /
// description after a shallow replace).
export function pageMetadata(opts: {
  path: string;
  title: string;
  description: string;
}) {
  const { path, title, description } = opts;
  const url = path === '/' ? SITE_URL : `${SITE_URL}${path}`;
  return {
    alternates: { canonical: url },
    openGraph: { ...OG_BASE, title, description, url },
  };
}

// Founder contact — used on /cancel and anywhere else a user needs the
// human at the other end (mailto / tel). Kept here so a single edit
// propagates to every surface and the value stays out of component code.
export const FOUNDER_PHONE = '+14155038178';

// The iCloud Shortcut — phone-side capture. Single source for every surface
// that links it (/shortcut, mobile /start; the server's email templates carry
// their own copy in server/src/email.ts).
export const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337';
