import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self'",
  "worker-src 'self' blob:",
  `connect-src 'self' blob: https://api.alexandria-library.com https://vitals.vercel-insights.com${development ? ' ws: wss:' : ''}`,
  "frame-src https://www.youtube-nocookie.com https://checkout.stripe.com",
  "form-action 'self' https://github.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
].join('; ');

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /start owns both onboarding doors. Keep old /chat links working without
      // maintaining a second copy of the same experience.
      { source: '/chat', destination: '/start#chat', permanent: false },
      { source: '/patron', destination: '/follow', permanent: true },
      // The standardized ask-my-mind door: alexandria-library.com/ask/{author}
      // is the one recognizable URL an Author pastes into every bio — X,
      // Instagram, their website (a2 § Library V1: the mirror is why the link
      // spreads). Lands on the profile, which leads with the ask box.
      // NON-permanent so the landing surface stays movable (e.g. straight to
      // the chat later) without breaking the link everyone already pasted.
      { source: '/ask/:author', destination: '/library/:author', permanent: false },
      // Two doors, by intent. /start is the keyless primer (the FREE tool — one
      // copy-paste, no account). /join is the founding-member JOIN (the paid
      // collective: GitHub sign-in → Stripe trial → alexandrian #N). Homepage +
      // Every live path links directly to /join. /signup is the legacy alias
      // that still lands there (Next forwards the query, so an old ref
      // survives the hop and auto-fills on the join page). NON-permanent so the
      // alias stays movable.
      { source: '/signup', destination: '/join', permanent: false },
      // Marketplace detail pages were retired in favour of linking straight to
      // github (the markdown source is rendered there with full file tree, forks,
      // history, and comments — no point rebuilding any of it). Old inbound links
      // permanently route to the github source.
      {
        source: '/marketplace/:user/:repo/:path*',
        destination: 'https://github.com/:user/:repo/blob/HEAD/:path*.md',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/docs/Memo.md',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/docs/:file(confidential[^/]*)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ];
  },
};

export default nextConfig;
