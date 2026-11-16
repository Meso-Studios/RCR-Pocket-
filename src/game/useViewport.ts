import { useEffect, useState } from 'react';

export const isCompactLandscapeViewport = (width: number, height: number): boolean =>
  width > height && height > 0 && height <= 560;

export const isPortraitViewport = (width: number, height: number): boolean =>
  width > 0 && height > 0 && height > width;

export const isLandscapeViewport = (width: number, height: number): boolean =>
  width > 0 && height > 0 && width >= height;

export interface ViewportState {
  width: number;
  height: number;
  isPortrait: boolean;
  isLandscapeCompact: boolean;
}

const readViewport = (): ViewportState => {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720, isPortrait: false, isLandscapeCompact: false };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    isPortrait: isPortraitViewport(width, height),
    isLandscapeCompact: isCompactLandscapeViewport(width, height),
  };
};

export const useViewportOrientation = (): ViewportState => {
  const [viewport, setViewport] = useState<ViewportState>(readViewport);

  useEffect(() => {
    const update = () => {
      const next = readViewport();
      setViewport((prev) =>
        prev.width === next.width &&
        prev.height === next.height &&
        prev.isPortrait === next.isPortrait &&
        prev.isLandscapeCompact === next.isLandscapeCompact
          ? prev
          : next
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return viewport;
};

export const useIsCompactLandscape = (): boolean => {
  return useViewportOrientation().isLandscapeCompact;
};
