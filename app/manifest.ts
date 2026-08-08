import type { MetadataRoute } from 'next';

// Web App Manifest — controls PWA install behavior on mobile + desktop.
// Display "browser" because alexandria isn't a real app; the manifest
// exists so iOS/Android home-screen installs use the right icon, name,
// and theme color rather than platform defaults.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'alexandria — your mind, in files you own',
    short_name: 'alexandria',
    description:
      'Give your AI Alexandria’s instructions. It builds and reads an owned record of your thinking and how it changes.',
    start_url: '/',
    display: 'browser',
    background_color: '#f7f2ec',
    theme_color: '#f7f2ec',
    orientation: 'portrait',
    lang: 'en',
    icons: [
      {
        src: '/favicon.png?v=4',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png?v=4',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.svg?v=4',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
