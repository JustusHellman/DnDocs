import { useEffect, useState } from 'react';

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** ≥1024px: persistent sidebar + side peek panel. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
/** <768px: bottom navigation. */
export const useIsPhone = () => useMediaQuery('(max-width: 767px)');
