import type { Metadata, Viewport } from "next";
import { EB_Garamond, Spectral } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
import StyledJsxRegistry from "./components/StyledJsxRegistry";

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  // Load the true italic axis — the wordmark and the hero question set in
  // Garamond italic were previously faux-slanted (no italic file). True
  // italic gives the proper old-style letterforms (single-story a, etc.).
  style: ["normal", "italic"],
});

// Spectral is the website + primer face — modern literary serif. Bound
// globally so any route can use `var(--font-serif)`. Previously bound
// only on app/page.tsx, which silently fell through to ui-serif on
// /join; promoting it here fixes that and keeps the website unchanged.
const spectral = Spectral({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://alexandria-library.com";
const SITE_TITLE = "alexandria — your mind, in files you own";

// Canonical product sentence — used for SEO meta description because it's
// keyword-dense, classical, and reads well as a search snippet under the
// browser tab title.
const SEO_DESCRIPTION =
  "Give your ai a free Alexandria loop. It writes what it learns about you into private files you own, then reads them whenever they help.";

// Sharing-optimised description — punchier than the SEO sentence. Lands as
// the body of social previews (Twitter / Slack / iMessage / LinkedIn).
// Leads with the live homepage's own question (the 2026-07-16
// founder-written rebuild), then his answer and the free sample.
const SHARE_DESCRIPTION =
  "Your own ai writes what it learns about you into files you own, then reads them whenever they help. The complete loop is free.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SEO_DESCRIPTION,
  applicationName: "alexandria",
  authors: [{ name: "Benjamin a. Mowinckel", url: "https://x.com/benmowinckel" }],
  creator: "Benjamin a. Mowinckel",
  publisher: "alexandria",
  icons: {
    // Safari briefly renders the ICO, then replaces it with a visually larger
    // SVG when both are declared. Keep one favicon source so the small tab mark
    // stays unchanged after the page finishes loading.
    icon: [{ url: "/favicon.ico?v=8", type: "image/x-icon", sizes: "16x16 32x32 64x64" }],
    apple: [{ url: "/apple-touch-icon.png?v=8", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: SITE_TITLE,
    description: SHARE_DESCRIPTION,
    url: SITE,
    siteName: "alexandria",
    type: "website",
    locale: "en_US",
    // OG image is generated dynamically by app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
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
    { media: "(prefers-color-scheme: dark)", color: "#181512" },
  ],
};

// JSON-LD structured data for search-engine rich snippets. Identifies
// alexandria as an Organization with founder, logo, social profiles —
// lets Google show extended snippets and knowledge-panel data.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "alexandria",
      alternateName: "the library of human minds",
      url: SITE,
      logo: {
        "@type": "ImageObject",
        url: `${SITE}/logo_circle_dark.png`,
        width: 800,
        height: 800,
      },
      description: SEO_DESCRIPTION,
      founder: {
        "@type": "Person",
        name: "Benjamin a. Mowinckel",
        url: `${SITE}/library/benmowinckel`,
      },
      foundingDate: "2026",
      foundingLocation: { "@type": "Place", name: "San Francisco" },
      sameAs: [
        "https://x.com/benmowinckel",
        "https://github.com/benmowinckel/alexandria",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "alexandria",
      description: SEO_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": `${SITE}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${ebGaramond.variable} ${spectral.variable} antialiased`}
      >
        <StyledJsxRegistry>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </StyledJsxRegistry>
        <Analytics />
        <script
          id="org-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </body>
    </html>
  );
}
