import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import StartJoinCTA from '../components/StartJoinCTA';

export const metadata = {
  title: 'Alexandria — Demo',
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <>
      <ThemeToggle />
      <Link href="/" className="demo-home" aria-label="alexandria — home">
        alexandria<span className="demo-home-dot">.</span>
      </Link>
      <main className="demo-stage">
        <video
          controls
          playsInline
          preload="metadata"
          className="demo-video"
        >
          <source src="/demo-public.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </main>
      <section style={{ padding: '0 2rem 5rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <StartJoinCTA />
      </section>
      <style>{`
        /* Stage fills the viewport. Video sits centered, sized to fill
           as much of the viewport as possible while preserving its
           intrinsic aspect ratio. width:auto + max-width/max-height let
           the browser pick the binding axis and scale proportionally. */
        .demo-stage {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0;
          margin: 0;
        }
        .demo-video {
          width: 100%;
          height: auto;
          max-width: 72vw;
          max-height: 70vh;
          object-fit: contain;
          border-radius: 4px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18);
          background: #000;
          display: block;
        }
        /* Small brand wordmark anchored top-left so the page still feels
           like alexandria, not a bare video host. */
        .demo-home {
          position: fixed;
          top: 18px;
          left: 22px;
          z-index: 10;
          font-family: var(--font-eb-garamond), Georgia, serif;
          font-style: italic;
          font-weight: 500;
          font-size: 20px;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          text-decoration: none;
          line-height: 1;
        }
        .demo-home-dot {
          color: var(--accent);
        }
        .demo-home:hover {
          color: var(--accent);
        }
        /* Tablet — slightly looser than desktop since viewports are narrower
           and 72vw starts to feel cramped around iPad widths. */
        @media (max-width: 1024px) {
          .demo-video {
            max-width: 86vw;
            max-height: 72vh;
          }
        }
        /* Phone — viewport is narrow enough that 92vw still feels
           comfortably inset. Height capped at 70vh so portrait phones
           don't push the controls below the fold. */
        @media (max-width: 640px) {
          .demo-video {
            max-width: 92vw;
            max-height: 70vh;
          }
          .demo-home {
            top: 12px;
            left: 14px;
            font-size: 17px;
          }
        }
      `}</style>
    </>
  );
}
