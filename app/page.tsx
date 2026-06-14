import LandingPage from './components/LandingPage';

// Spectral is bound globally on the body (see app/layout.tsx). Brand
// className is inherited via var(--font-serif) where used in CSS;
// LandingPage's brandClassName is now empty since the font cascades.
export default function Home() {
  return <LandingPage brandClassName="" />;
}
