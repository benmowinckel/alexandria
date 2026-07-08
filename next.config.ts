import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/patron', destination: '/follow', permanent: true },
      // The install one-liner: `curl -fsSL alexandria-library.com/a | bash`.
      // `/a` is the protocol's name (lowercase, like git). Redirects to the raw
      // setup.sh on GitHub; curl -fsSL follows it (-L). NON-permanent (307) so the
      // target stays changeable without breaking the command everyone copied.
      // Humans land on /start (the primer); `/a` is the machine target only.
      {
        source: '/a',
        destination: 'https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh',
        permanent: false,
      },
      // Tokenized install — the command emailed by the mobile "send it to my
      // computer" flow: `curl -fsSL alexandria-library.com/a/TOKEN | bash`.
      // Routes through the API so the fetch marks that email as installed
      // (follow-ups stop), then the API 302s to the same raw setup.sh above.
      // The public copy-paste command stays the clean, tokenless /a.
      {
        source: '/a/:token',
        destination: 'https://api.alexandria-library.com/a/:token',
        permanent: false,
      },
      // Two doors, by intent. /start is the keyless primer (the FREE tool — one
      // copy-paste, no account). /join is the founding-member JOIN (the paid
      // collective: GitHub sign-in → Stripe trial → alexandrian #N). Homepage +
      // library pages link to /signup with a ?ref= invite code; /signup is the
      // legacy alias that now lands on /join (Next forwards the query, so the ref
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
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
