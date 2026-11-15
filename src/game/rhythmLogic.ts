import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  HIT_WINDOWS,
  LANDSCAPE_CANVAS_HEIGHT,
  LANDSCAPE_CANVAS_WIDTH,
  LANE_WIDTH,
} from './constants.ts';
import { laneCoordsToPixels } from './layoutConfig.ts';
import type { ChartNote, Difficulty, GameMode, LaneCoord, Song } from './types.ts';

export const getGrade = (p: number): string =>
  p >= 100 ? 'SSS' : p >= 97 ? 'S' : p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F';

export const getXpRequirement = (level: number): number => level * 1000;

export const normalizeChart = (chart: unknown): ChartNote[] =>
  (Array.isArray(chart) ? chart : [])
    .map((n: any) => {
      const time = Number(n?.time);
      const lane = Number(n?.lane);
      const type = n?.type === 'hold' ? 'hold' : n?.type === 'demon' ? 'demon' : 'normal';
      const clean: ChartNote = {
        time: Number.isFinite(time) ? Math.max(0, time) : 0,
        lane: Number.isFinite(lane) ? Math.max(0, Math.min(7, Math.round(lane))) : 0,
        type,
      };
      if (type === 'hold') {
        clean.duration = Number.isFinite(Number(n?.duration)) ? Math.max(100, Number(n.duration)) : 500;
      }
      return clean;
    })
    .sort((a, b) => a.time - b.time);

export const createAltChart = (chart: ChartNote[]): ChartNote[] => {
  const out = normalizeChart(chart).map((n) => ({ ...n }));
  const groups = new Map<string, Array<{ n: ChartNote; i: number; side: number }>>();
  out.forEach((n, i) => {
    const side = n.lane >= 4 ? 4 : 0;
    const key = `${Math.round(n.time)}_${side}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ n, i, side });
  });
  const previous = [-1, -1];
  groups.forEach((group) => {
    const side = group[0].side;
    const sideIdx = side ? 1 : 0;
    const lanes = [0, 1, 2, 3];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    if (group.length === 1 && lanes[0] === previous[sideIdx]) {
      [lanes[0], lanes[1]] = [lanes[1], lanes[0]];
    }
    group.forEach((item, k) => {
      item.n.lane = side + lanes[k % 4];
    });
    previous[sideIdx] = lanes[Math.min(group.length - 1, 3)];
  });
  return out;
};

export const applyNerfChart = (
  chart: ChartNote[],
  percent: number,
  seed: string | number = 'track'
): ChartNote[] => {
  const clean = normalizeChart(chart);
  const clamped = Math.max(0, Math.min(90, Number(percent) || 0));
  if (!clamped || !clean.length) return clean;
  let state = String(seed)
    .split('')
    .reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
  const ranked = clean
    .map((_, i) => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return { i, key: state };
    })
    .sort((a, b) => a.key - b.key);
  const remove = new Set(ranked.slice(0, Math.floor((clean.length * clamped) / 100)).map((x) => x.i));
  return clean.filter((_, i) => !remove.has(i));
};

export const generateBeatmap = (
  bpm: number,
  startSeconds: number,
  lengthSeconds: number,
  difficultyStr: Difficulty,
  gameMode: GameMode = 'standard'
): ChartNote[] => {
  const notes: ChartNote[] = [];
  const bps = bpm / 60;
  const beatDur = 1000 / bps;
  const diffMult = difficultyStr === 'normal' ? 2 : difficultyStr === 'hard' ? 4 : difficultyStr === 'insane' ? 8 : 1;
  const isVS = gameMode === 'online_vs';

  for (let beat = Math.floor(startSeconds * bps); beat < Math.floor((startSeconds + lengthSeconds) * bps); beat++) {
    for (let sub = 0; sub < diffMult; sub++) {
      if (Math.random() > 0.4 + diffMult * 0.05) {
        const time = beat * beatDur + sub * (beatDur / diffMult);
        const numNotes =
          Math.random() > 0.8
            ? Math.floor(Math.random() * (difficultyStr === 'normal' ? 2 : difficultyStr === 'hard' ? 3 : 4)) + 1
            : 1;

        const availableLanes = [0, 1, 2, 3];
        for (let i = 0; i < numNotes; i++) {
          if (availableLanes.length === 0) break;
          const lane = availableLanes.splice(Math.floor(Math.random() * availableLanes.length), 1)[0];
          const isDemon = Math.random() > 0.92;

          if (isVS) {
            notes.push({ time, lane, hit: false, missed: false, isBot: true, type: 'normal' });
            notes.push({ time, lane: lane + 4, hit: false, missed: false, isBot: false, type: isDemon ? 'demon' : 'normal' });
          } else {
            notes.push({ time, lane, hit: false, missed: false, isBot: false, type: isDemon ? 'demon' : 'normal' });
          }
        }
      }
    }
  }
  return notes.sort((a, b) => a.time - b.time);
};

export const getDurationString = (song?: Song | null): string => {
  if (!song) return '0:00';
  let durationMs = 180000;
  if (song.customMap) {
    durationMs = song.customMap.length > 0 ? song.customMap[song.customMap.length - 1].time + 2500 : 0;
  }
  const totalSeconds = Math.ceil(durationMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const getCleanedUrl = (url?: string | null): string | null => {
  if (!url) return null;
  let cleanUrl = url.trim();
  if (cleanUrl.includes('dropbox.com')) {
    cleanUrl = cleanUrl
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '')
      .replace('?dl=1', '');
  }
  return cleanUrl;
};

export interface HitEvaluation {
  judgment: 'SICK!!' | 'GOOD!' | 'BAD' | 'MISS';
  addScore: number;
  heal: number;
  color: string;
  breaksCombo: boolean;
  hitWeight: number;
  bucket: 'sick' | 'good' | 'bad' | 'miss';
}

export const evaluateHitTiming = (diffMs: number, perfectLockScale = 0): HitEvaluation => {
  const adjustedDiff = Math.max(0, diffMs) * (1 - Math.max(0, Math.min(1, perfectLockScale)) * 0.55);
  if (adjustedDiff <= HIT_WINDOWS.sick) {
    return { judgment: 'SICK!!', addScore: 350, heal: 2, color: '#00ffff', breaksCombo: false, hitWeight: 1, bucket: 'sick' };
  }
  if (adjustedDiff <= HIT_WINDOWS.good) {
    return { judgment: 'GOOD!', addScore: 200, heal: 1, color: '#4ade80', breaksCombo: false, hitWeight: 1, bucket: 'good' };
  }
  if (adjustedDiff <= HIT_WINDOWS.bad) {
    return { judgment: 'BAD', addScore: 50, heal: -2.5, color: '#facc15', breaksCombo: true, hitWeight: 0.5, bucket: 'bad' };
  }
  return { judgment: 'MISS', addScore: -50, heal: -4.5, color: '#ef4444', breaksCombo: true, hitWeight: 0, bucket: 'miss' };
};

export interface PlayfieldLayout {
  width: number;
  height: number;
  noteSize: number;
  receptorY: number;
  playerLaneXs: number[];
  playerLaneYs: number[];
  opponentLaneXs: number[];
  isVS: boolean;
  isLandscape: boolean;
  heroMode: boolean;
}

export const getPlayfieldLayout = ({
  isLandscape,
  isVS = false,
  downscroll = true,
  heroMode = false,
  customLanes = null,
}: {
  isLandscape: boolean;
  isVS?: boolean;
  downscroll?: boolean;
  heroMode?: boolean;
  customLanes?: LaneCoord[] | null;
}): PlayfieldLayout => {
  if (isLandscape && !heroMode) {
    const width = LANDSCAPE_CANVAS_WIDTH;
    const height = LANDSCAPE_CANVAS_HEIGHT;
    if (isVS) {
      const noteSize = 62;
      const receptorY = downscroll ? height - 88 : 26;
      return {
        width,
        height,
        noteSize,
        receptorY,
        playerLaneXs: [30, 122, 214, 306],
        playerLaneYs: [receptorY, receptorY, receptorY, receptorY],
        opponentLaneXs: [492, 584, 676, 768],
        isVS: true,
        isLandscape: true,
        heroMode: false,
      };
    }
    const noteSize = 74;
    const receptorY = downscroll ? height - 96 : 24;
    if (Array.isArray(customLanes) && customLanes.length === 4) {
      const resolved = laneCoordsToPixels(customLanes, true, noteSize);
      return {
        width,
        height,
        noteSize,
        receptorY: resolved.ys[0] ?? receptorY,
        playerLaneXs: resolved.xs,
        playerLaneYs: resolved.ys,
        opponentLaneXs: [],
        isVS: false,
        isLandscape: true,
        heroMode: false,
      };
    }
    return {
      width,
      height,
      noteSize,
      receptorY,
      playerLaneXs: [103, 296, 490, 683],
      playerLaneYs: [receptorY, receptorY, receptorY, receptorY],
      opponentLaneXs: [],
      isVS: false,
      isLandscape: true,
      heroMode: false,
    };
  }

  const width = isVS ? LANE_WIDTH * 8 + 40 : CANVAS_WIDTH;
  const height = isLandscape && heroMode ? LANDSCAPE_CANVAS_HEIGHT : CANVAS_HEIGHT;

  if (heroMode) {
    const noteSize = 60;
    const receptorY = height - 105;
    const nearHalf = width * 0.47;
    const laneW = (nearHalf * 2) / 4;
    const playerLaneXs = [0, 1, 2, 3].map((i) => width / 2 - nearHalf + i * laneW + (laneW - noteSize) / 2);
    return {
      width,
      height,
      noteSize,
      receptorY,
      playerLaneXs,
      playerLaneYs: [receptorY, receptorY, receptorY, receptorY],
      opponentLaneXs: [],
      isVS: false,
      isLandscape,
      heroMode: true,
    };
  }

  if (isVS) {
    const noteSize = 58;
    const receptorY = downscroll ? height - 100 - noteSize : 90;
    const playerLaneXs = [20, 114, 208, 302];
    const opponentLaneXs = [480, 574, 668, 762];
    return {
      width,
      height,
      noteSize,
      receptorY,
      playerLaneXs,
      playerLaneYs: [receptorY, receptorY, receptorY, receptorY],
      opponentLaneXs,
      isVS: true,
      isLandscape,
      heroMode: false,
    };
  }

  const noteSize = 66;
  const receptorY = downscroll ? height - 100 - noteSize : 90;
  if (Array.isArray(customLanes) && customLanes.length === 4) {
    const resolved = laneCoordsToPixels(customLanes, false, noteSize);
    return {
      width,
      height,
      noteSize,
      receptorY: resolved.ys[0] ?? receptorY,
      playerLaneXs: resolved.xs,
      playerLaneYs: resolved.ys,
      opponentLaneXs: [],
      isVS: false,
      isLandscape,
      heroMode: false,
    };
  }

  // Wider 440px portrait playfield with generous 44px spacing between gray receptors
  const playerLaneXs = [24, 134, 244, 354];

  return {
    width,
    height,
    noteSize,
    receptorY,
    playerLaneXs,
    playerLaneYs: [receptorY, receptorY, receptorY, receptorY],
    opponentLaneXs: [],
    isVS: false,
    isLandscape,
    heroMode: false,
  };
};

export const getLaneFromPlayfieldX = (canvasX: number, layout: PlayfieldLayout): number | null => {
  if (!Number.isFinite(canvasX) || canvasX < 0 || canvasX > layout.width) return null;
  if (layout.isVS && layout.opponentLaneXs.length > 0) {
    const playerRightEdge = layout.playerLaneXs[layout.playerLaneXs.length - 1] + layout.noteSize;
    const opponentLeftEdge = layout.opponentLaneXs[0];
    const dividerX = (playerRightEdge + opponentLeftEdge) / 2;
    if (canvasX > dividerX) return null;
  }

  let bestLane = 0;
  let bestDist = Infinity;
  for (let i = 0; i < layout.playerLaneXs.length; i++) {
    const center = layout.playerLaneXs[i] + layout.noteSize / 2;
    const dist = Math.abs(canvasX - center);
    if (dist < bestDist) {
      bestDist = dist;
      bestLane = i;
    }
  }
  return bestLane;
};

export const getLaneFromPlayfieldPoint = (
  canvasX: number,
  canvasY: number,
  layout: PlayfieldLayout
): number | null => {
  if (!Number.isFinite(canvasX) || !Number.isFinite(canvasY)) return null;
  if (canvasX < 0 || canvasX > layout.width || canvasY < 0 || canvasY > layout.height) return null;
  if (layout.isVS && layout.opponentLaneXs.length > 0) {
    const playerRightEdge = layout.playerLaneXs[layout.playerLaneXs.length - 1] + layout.noteSize;
    const opponentLeftEdge = layout.opponentLaneXs[0];
    const dividerX = (playerRightEdge + opponentLeftEdge) / 2;
    if (canvasX > dividerX) return null;
  }

  // First check direct 2D proximity to any gray receptor (supports stacked or rearranged lanes)
  const hitRadius = layout.noteSize * 0.92;
  let directLane: number | null = null;
  let bestDirectDist = Infinity;
  for (let i = 0; i < layout.playerLaneXs.length; i++) {
    const cx = layout.playerLaneXs[i] + layout.noteSize / 2;
    const cy = (layout.playerLaneYs[i] ?? layout.receptorY) + layout.noteSize / 2;
    const dist = Math.hypot(canvasX - cx, canvasY - cy);
    if (dist <= hitRadius && dist < bestDirectDist) {
      bestDirectDist = dist;
      directLane = i;
    }
  }
  if (directLane !== null) return directLane;

  return getLaneFromPlayfieldX(canvasX, layout);
};

export const getLaneFromClientX = (clientX: number, rectLeft: number, rectWidth: number, isVS = false): number | null => {
  if (rectWidth <= 0) return null;
  const relX = clientX - rectLeft;
  if (relX < 0 || relX > rectWidth) return null;
  const laneCount = 4;
  if (isVS) {
    const ratio = relX / rectWidth;
    if (ratio < 0.5) return Math.min(3, Math.max(0, Math.floor((ratio / 0.5) * 4)));
    return Math.min(3, Math.max(0, Math.floor(((ratio - 0.5) / 0.5) * 4)));
  }
  const lane = Math.floor((relX / rectWidth) * laneCount);
  return Math.max(0, Math.min(3, lane));
};

export const addRewardsCalc = (
  prev: { xp: number; level: number; coins: number },
  xpToAdd: number,
  coinsToAdd: number
): { xp: number; level: number; coins: number } => {
  let newXp = prev.xp + xpToAdd;
  let newLevel = prev.level;
  const newCoins = prev.coins + coinsToAdd;
  let xpNeeded = getXpRequirement(newLevel);
  while (newXp >= xpNeeded) {
    newXp -= xpNeeded;
    newLevel++;
    xpNeeded = getXpRequirement(newLevel);
  }
  return { xp: newXp, level: newLevel, coins: newCoins };
};
