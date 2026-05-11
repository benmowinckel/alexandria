import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';

export const metadata = {
  title: 'Alexandria — Walkthrough',
  robots: { index: false, follow: false },
};

export default function WalkthroughPage() {
  return (
    <>
      <ThemeToggle />
      <Link href="/" className="mdoc-shelf-link">
        alexandria<span className="mdoc-shelf-dot">.</span>
      </Link>
      <main className="mdoc">
        <article className="mdoc-frame mdoc-article pdoc">
          <div className="walkthrough-video-frame">
            <video
              controls
              playsInline
              preload="metadata"
              className="walkthrough-video"
            >
              <source src="/demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </article>
        <nav className="mdoc-frame mdoc-footnav">
          <Link href="/" className="mdoc-home">a.</Link>
        </nav>
      </main>
      <style>{`
        .walkthrough-video-frame {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2rem 0;
        }
        .walkthrough-video {
          width: 100%;
          max-width: 1200px;
          height: auto;
          border-radius: 4px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
          background: #000;
        }
        @media (max-width: 640px) {
          .walkthrough-video-frame { padding: 1rem 0; }
        }
      `}</style>
    </>
  );
}
