export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://api.alexandria-library.com';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://alexandria-library.com';
export const FETCH_TIMEOUT_MS = 8000;

// The single source for the library sign-in link. `intent=library` skips the
// signup/billing funnel; `next` returns the viewer to `nextPath`, signed in,
// instead of stranding them on the signup callback page. Every "sign in" link in
// the library goes through here: hand-building this string per page is exactly
// how the directory page silently dropped intent+next and dead-ended after
// GitHub. One builder = a new page can't diverge the same way.
export function librarySignInUrl(nextPath: string): string {
  return `${SERVER_URL}/auth/github?intent=library&next=${encodeURIComponent(nextPath)}`;
}

// Client convenience: return the viewer to the page they're on right now. Empty
// during SSR (no `window`); the href fills in on hydration, before any click can
// land. Call only from client components.
export function librarySignInUrlHere(): string {
  return librarySignInUrl(
    typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
  );
}

// The founder's Library id (his author slug). His profile lives at
// /library/{FOUNDER_LIBRARY_ID}; his public PLM ("ask this mind") answers at
// /api/library/{FOUNDER_LIBRARY_ID}/ask. Single source so every surface that
// points at "Benjamin's mind" — the whitepaper/letter reader, the funnel CTAs —
// stays in sync. His profile is the one canonical Library page we deep-link to
// (the /library directory is empty to a signed-out stranger).
export const FOUNDER_LIBRARY_ID = 'mowinckelb';
export const FOUNDER_PROFILE_PATH = `/library/${FOUNDER_LIBRARY_ID}`;

// The reader's "ask" (the letter/whitepaper via PublicDocReader) posts to
// /api/library/{FOUNDER_LIBRARY_ID}/ask — the founder's OWN public context twin,
// the same mind the public reaches on his profile. It replaced the old generic
// /api/ask → /guide relay: consolidated so a reader talks to Benjamin's actual
// mind (a live proof of the product), not a faceless company chatbot. The doc
// being read is passed as `focus`; inference runs on the device sidecar, the
// Worker only relays (plm.md § settled security model). The context twin loads
// only the PUBLIC tiered shadow + public product facts — no private substrate in
// this path's reach, prompt-injection-guarded server-side.

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

// Founder contact — used on /cancel, /join, and anywhere else a user needs the
// human at the other end (mailto / tel). Kept here so a single edit
// propagates to every surface and the value stays out of component code.
export const FOUNDER_PHONE = '+14155038178';
export const FOUNDER_EMAIL = 'benmowinckel@gmail.com';

// The iCloud Shortcut — phone-side capture. Single source for every surface
// that links it (/shortcut, mobile /start; the server's email templates carry
// their own copy in server/src/email.ts).
export const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337';
