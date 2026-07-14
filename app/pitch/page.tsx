import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import StartJoinCTA from '../components/StartJoinCTA';

export const metadata = {
  title: 'Alexandria — Pitch',
  robots: { index: false, follow: false },
};

export default function PitchPage() {
  return (
    <>
      <ThemeToggle />
      <Link href="/" className="mdoc-shelf-link">
        alexandria<span className="mdoc-shelf-dot">.</span>
      </Link>
      <main className="mdoc">
        <article className="mdoc-frame mdoc-article pdoc">
          <div className="pitch-video-frame">
            <video
              controls
              playsInline
              preload="metadata"
              className="pitch-video"
            >
              <source src="/pitch.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </article>
        <div className="mdoc-frame" style={{ margin: '1rem 0 2rem' }}>
          <StartJoinCTA />
        </div>
        <nav className="mdoc-frame mdoc-footnav">
          <Link href="/" className="mdoc-home">a.</Link>
        </nav>
      </main>
      <style>{`
        .pitch-video-frame {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2rem 0;
        }
        .pitch-video {
          max-height: 85vh;
          max-width: 100%;
          width: auto;
          border-radius: 4px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
          background: #000;
        }
        @media (max-width: 640px) {
          .pitch-video-frame { padding: 1rem 0; }
          .pitch-video { max-height: 80vh; }
        }
      `}</style>
    </>
  );
}
