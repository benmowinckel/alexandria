'use client';

// styled-jsx SSR registry (the Next app-router CSS-in-JS pattern). Without
// it, every <style jsx> block in a client component attaches only after
// hydration, so a refresh paints raw unstyled HTML for a beat — on the
// landing page the stacked rotation frames all showed at once as plain
// text (founder, 2026-07-24: "the hero text all jams together with the
// other rotation text for a split second… has to look elegant on
// refresh"). This inserts each page's styled-jsx CSS into the SSR HTML so
// the first paint is already styled, site-wide.
import { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { StyleRegistry, createStyleRegistry } from 'styled-jsx';

export default function StyledJsxRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [registry] = useState(() => createStyleRegistry());
  useServerInsertedHTML(() => {
    const styles = registry.styles();
    registry.flush();
    return <>{styles}</>;
  });
  return <StyleRegistry registry={registry}>{children}</StyleRegistry>;
}
