import MarkdownDoc from '../components/MarkdownDoc';

export const metadata = {
  title: 'Alexandria — Brief',
  robots: { index: false, follow: false },
};

export default function BriefPage() {
  return (
    <MarkdownDoc
      src="/docs/Brief.md"
      header=""
      homeHref="/"
    />
  );
}
