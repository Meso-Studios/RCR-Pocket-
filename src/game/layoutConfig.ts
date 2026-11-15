import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  LANDSCAPE_CANVAS_HEIGHT,
  LANDSCAPE_CANVAS_WIDTH,
} from './constants.ts';
import type { ControlLayoutSettings, LaneCoord, PadCoord } from './types.ts';

export const PAD_BUTTON_WIDTH_PCT = 20;
export const PAD_BUTTON_HEIGHT_PCT = 44;
export const LANE_BOUNDARY_MARGIN = 16;

export const DEFAULT_CONTROL_LAYOUT: ControlLayoutSettings = {
  portraitLanes: null,
  landscapeLanes: null,
  portraitPads: null,
  landscapePads: null,
};

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export const clampLaneCoord = (coord: Partial<LaneCoord> | null | undefined, fallback: LaneCoord): LaneCoord => ({
  xNorm: coord && Number.isFinite(Number(coord.xNorm)) ? clamp01(Number(coord.xNorm)) : fallback.xNorm,
  yNorm: coord && Number.isFinite(Number(coord.yNorm)) ? clamp01(Number(coord.yNorm)) : fallback.yNorm,
});

export const clampPadCoord = (coord: Partial<PadCoord> | null | undefined, fallback: PadCoord): PadCoord => {
  const maxX = 100 - PAD_BUTTON_WIDTH_PCT - 1;
  const maxY = 100 - PAD_BUTTON_HEIGHT_PCT - 2;
  const rawX = Number(coord?.xPct);
  const rawY = Number(coord?.yPct);
  return {
    xPct: Number.isFinite(rawX) ? Math.max(1, Math.min(maxX, Math.round(rawX * 10) / 10)) : fallback.xPct,
    yPct: Number.isFinite(rawY) ? Math.max(2, Math.min(maxY, Math.round(rawY * 10) / 10)) : fallback.yPct,
  };
};

export const getLaneBoundaryBounds = (isLandscape: boolean, noteSize: number) => {
  const width = isLandscape ? LANDSCAPE_CANVAS_WIDTH : CANVAS_WIDTH;
  const height = isLandscape ? LANDSCAPE_CANVAS_HEIGHT : CANVAS_HEIGHT;
  const minX = LANE_BOUNDARY_MARGIN;
  const maxX = Math.max(minX, width - noteSize - LANE_BOUNDARY_MARGIN);
  const minY = LANE_BOUNDARY_MARGIN;
  const maxY = Math.max(minY, height - noteSize - LANE_BOUNDARY_MARGIN);
  return { width, height, minX, maxX, minY, maxY };
};

export const getDefaultLaneCoords = (isLandscape: boolean, downscroll = true): LaneCoord[] => {
  const noteSize = isLandscape ? 74 : 66;
  const defaultXs = isLandscape ? [103, 296, 490, 683] : [24, 134, 244, 354];
  const defaultY = isLandscape
    ? downscroll
      ? LANDSCAPE_CANVAS_HEIGHT - 96
      : 24
    : downscroll
    ? CANVAS_HEIGHT - 100 - noteSize
    : 90;
  const bounds = getLaneBoundaryBounds(isLandscape, noteSize);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const yNorm = clamp01((defaultY - bounds.minY) / spanY);
  return defaultXs.map((x) => ({
    xNorm: clamp01((x - bounds.minX) / spanX),
    yNorm,
  }));
};

export const getDefaultPadCoords = (preset: 'row' | 'split' | 'arc' = 'row'): PadCoord[] => {
  if (preset === 'split') {
    return [
      { xPct: 2, yPct: 30 },
      { xPct: 23, yPct: 48 },
      { xPct: 57, yPct: 48 },
      { xPct: 78, yPct: 30 },
    ];
  }
  if (preset === 'arc') {
    return [
      { xPct: 4, yPct: 42 },
      { xPct: 28, yPct: 14 },
      { xPct: 52, yPct: 14 },
      { xPct: 76, yPct: 42 },
    ];
  }
  return [
    { xPct: 4, yPct: 28 },
    { xPct: 28, yPct: 28 },
    { xPct: 52, yPct: 28 },
    { xPct: 76, yPct: 28 },
  ];
};

const normalizeCoordList = <T>(
  raw: unknown,
  defaults: T[],
  clampFn: (item: Partial<T> | null | undefined, fb: T) => T
): T[] | null => {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  return defaults.map((fb, idx) => clampFn(raw[idx] as Partial<T>, fb));
};

export const normalizeControlLayout = (raw?: Partial<ControlLayoutSettings> | null): ControlLayoutSettings => ({
  portraitLanes: normalizeCoordList(raw?.portraitLanes, getDefaultLaneCoords(false, true), clampLaneCoord),
  landscapeLanes: normalizeCoordList(raw?.landscapeLanes, getDefaultLaneCoords(true, true), clampLaneCoord),
  portraitPads: normalizeCoordList(raw?.portraitPads, getDefaultPadCoords('row'), clampPadCoord),
  landscapePads: normalizeCoordList(raw?.landscapePads, getDefaultPadCoords('row'), clampPadCoord),
});

export const laneCoordsToPixels = (
  coords: LaneCoord[],
  isLandscape: boolean,
  noteSize: number
): { xs: number[]; ys: number[] } => {
  const bounds = getLaneBoundaryBounds(isLandscape, noteSize);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const xs = coords.map((c) => Math.round(bounds.minX + clamp01(c.xNorm) * spanX));
  const ys = coords.map((c) => Math.round(bounds.minY + clamp01(c.yNorm) * spanY));
  return { xs, ys };
};

export const pixelToLaneCoord = (
  x: number,
  y: number,
  isLandscape: boolean,
  noteSize: number
): LaneCoord => {
  const bounds = getLaneBoundaryBounds(isLandscape, noteSize);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  return {
    xNorm: clamp01((x - bounds.minX) / spanX),
    yNorm: clamp01((y - bounds.minY) / spanY),
  };
};
