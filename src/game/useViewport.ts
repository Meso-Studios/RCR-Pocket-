import { useEffect, useState } from 'react';

export const isCompactLandscapeViewport = (width: number, height: number): boolean =>
  width > height && height > 0 && height <= 560;

export const useIsCompactLandscape = (): boolean => {
  const [compactLandscape, setCompactLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isCompactLandscapeViewport(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    const update = () => {
      const next = isCompactLandscapeViewport(window.innerWidth, window.innerHeight);
      setCompactLandscape((prev) => (prev === next ? prev : next));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return compactLandscape;
};
