import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "alexandria. Your AI should know how you think. A free loop, in private files you own.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Fetches a single TTF file referenced by a Google Fonts CSS URL.
// Satori (the engine behind next/og) only accepts TTF/OTF, not WOFF2,
// so we send an older User-Agent that triggers Google's TTF fallback.
async function loadGoogleFont(cssUrl: string): Promise<ArrayBuffer> {
  const css = await fetch(cssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
  }).then((r) => r.text());
  const url = css.match(/src:\s*url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error("Could not resolve TTF URL from Google Fonts CSS");
  return fetch(url).then((r) => r.arrayBuffer());
}

export default async function OpengraphImage() {
  const [spectralItalic, spectralRegular] = await Promise.all([
    loadGoogleFont(
      "https://fonts.googleapis.com/css2?family=Spectral:ital,wght@1,500&display=swap",
    ),
    loadGoogleFont(
      "https://fonts.googleapis.com/css2?family=Spectral:wght@500&display=swap",
    ),
  ]);

  return new ImageResponse(
    (
      // A shared link has to carry the idea without the page around it:
      // one mark, one felt benefit, one concrete ownership line. The card
      // keeps the homepage's pale fresco field and spends its one accent on
      // the human-facing thesis rather than another product diagram.
      <div
        style={{
          background: "#f1ede2",
          backgroundImage:
            "radial-gradient(ellipse 80% 65% at 50% 20%, rgba(255, 253, 246, 0.7), rgba(255, 253, 246, 0) 70%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Spectral",
          color: "#1a1318",
          padding: "72px 96px 80px",
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontStyle: "normal",
            fontWeight: 500,
            letterSpacing: "-0.015em",
            lineHeight: 0.9,
            display: "flex",
          }}
        >
          alexandria
          <span style={{ marginLeft: "-0.02em" }}>.</span>
        </div>
        <div
          style={{
            marginTop: 58,
            maxWidth: 940,
            fontSize: 76,
            fontStyle: "italic",
            fontWeight: 500,
            lineHeight: 1.08,
            textAlign: "center",
            letterSpacing: "-0.025em",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span>Your AI should know</span>
          <span>how you think.</span>
        </div>
        <div
          style={{
            marginTop: 34,
            fontSize: 32,
            fontStyle: "normal",
            fontWeight: 500,
            color: "rgba(26, 19, 24, 0.56)",
            letterSpacing: "0.01em",
          }}
        >
          A free loop, in private files you own.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Spectral",
          data: spectralItalic,
          style: "italic",
          weight: 500,
        },
        {
          name: "Spectral",
          data: spectralRegular,
          style: "normal",
          weight: 500,
        },
      ],
    },
  );
}
