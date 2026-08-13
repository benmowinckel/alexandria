'use client';

import { useCallback, useEffect, useState } from 'react';

export function useDoorStep<T extends string>(allowed: readonly T[]): [T | null, (next: T) => void] {
  const parse = useCallback((): T | null => {
    if (typeof window === 'undefined') return null;
    const value = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    return (allowed as readonly string[]).includes(value) ? (value as T) : null;
  }, [allowed]);

  const [step, setStep] = useState<T | null>(null);

  useEffect(() => {
    const sync = () => setStep(parse());
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [parse]);

  const go = (next: T) => {
    if (typeof window === 'undefined') return;
    const current = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (current === next) {
      setStep(next);
      return;
    }
    const url = `${window.location.pathname}${window.location.search}#${encodeURIComponent(next)}`;
    window.history.pushState({ door: next }, '', url);
    setStep(next);
  };

  return [step, go];
}
