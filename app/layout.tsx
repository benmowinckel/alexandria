import type { Metadata, Viewport } from "next";
import { EB_Garamond, Spectral } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
});

// Spectral is the website + primer face — modern literary serif. Bound
// globally so any route can use `var(--font-serif)`. Previously bound
// only on app/page.tsx, which silently fell through to ui-serif on
// /signup; promoting it here fixes that and keeps the website unchanged.
const spectral = Spectral({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://alexandria-library.com";

// Canonical product sentence — used for SEO meta description because it's
// keyword-dense, classical, and reads well as a search snippet under the
// browser tab title.
const SEO_DESCRIPTION =
  "a tribe of humans who put their minds into writing, so ai thinks with them, not for them. the path through the singularity.";

// Sharing-optimised description — punchier than the SEO sentence. Lands as
// the body of social previews (Twitter / Slack / iMessage / LinkedIn).
// Leads with the existential stakes from the back-slide, then states the
// practice. More compelling for click-through than a noun definition.
const SHARE_DESCRIPTION =
  "humanity's greatest challenge — and perhaps our last. write yourself into plain files, so every ai you ever use thinks with you, not for you.";

export const metadata: Metadata = {
  title: "alexandria — the library of human minds",
  description: SEO_DESCRIPTION,
  applicationName: "alexandria",
  authors: [{ name: "Benjamin a. Mowinckel", url: "https://x.com/benmowinckel" }],
  creator: "Benjamin a. Mowinckel",
  publisher: "alexandria",
  keywords: [
    "alexandria",
    "library of human minds",
    "ai personalization",
    "sovereign cognitive substrate",
    "ai thinks with you",
    "singularity",
    "writing protocol",
    "claude code",
    "cursor",
    "personal ai",
  ],
  icons: {
    // Opaque cream square + upright black "a." — matches brand mark.
    // Opaque means no platform default backdrop ever leaks through;
    // iOS/Android home screens round the cream square into the brand circle.
    icon: [
      { url: "/favicon.png?v=4", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg?v=4", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png?v=4",
    shortcut: "/favicon.png?v=4",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "alexandria — the library of human minds",
    description: SHARE_DESCRIPTION,
    url: SITE,
    siteName: "alexandria",
    type: "website",
    locale: "en_US",
    // OG image is generated dynamically by app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "alexandria — the library of human minds",
    description: SHARE_DESCRIPTION,
    site: "@benmowinckel",
    creator: "@benmowinckel",
  },
  appleWebApp: {
    capable: true,
    title: "alexandria",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  metadataBase: new URL(SITE),
  alternates: {
    canonical: SITE,
  },
  category: "technology",
};

// Theme color — cream in light, deep burgundy in dark. Sets the mobile
// browser chrome (Safari address bar tint, Chrome status bar). Matches
// the active --theme-bg so the chrome blends into the page.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1014" },
  ],
};

// JSON-LD structured data for search-engine rich snippets. Identifies
// alexandria as an Organization with founder, logo, social profiles —
// lets Google show extended snippets and knowledge-panel data.
const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "alexandria",
  alternateName: ["the library of human minds", "the thinking republic"],
  url: SITE,
  logo: `${SITE}/logo_circle_dark.png`,
  description: SEO_DESCRIPTION,
  founder: {
    "@type": "Person",
    name: "Benjamin a. Mowinckel",
    url: "https://x.com/benmowinckel",
  },
  foundingDate: "2026",
  foundingLocation: {
    "@type": "Place",
    name: "San Francisco",
  },
  sameAs: [
    "https://x.com/benmowinckel",
    "https://github.com/mowinckelb/alexandria",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${ebGaramond.variable} ${spectral.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Script
          id="org-jsonld"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSONLD) }}
        />
      </body>
    </html>
  );
}
