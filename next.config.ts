import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/patron', destination: '/follow', permanent: true },
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
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
