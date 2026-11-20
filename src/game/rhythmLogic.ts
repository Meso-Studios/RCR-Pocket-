import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_CUSTOM_KEYBINDS,
  HIT_WINDOWS,
  KEY_CODE_MAP,
  KEY_MAP,
  LANDSCAPE_CANVAS_HEIGHT,
  LANDSCAPE_CANVAS_WIDTH,
  LANE_COLORS_8,
  SCROLL_SPEEDS,
} from './constants';
import { getDefaultLaneCoords, laneCoordsToPixels } from './layoutConfig';
import type {
  ChartNote,
  ChartTrigger,
  ControlLayoutSettings,
  Difficulty,
  ExpansionTransitionType,
  ExtraNotesCount,
  GameMode,
  NoteVelocityEffect,
  PlayerInfo,
  Song,
  SpeedTriggerPreset,
  TrackRatingsMap,
} from './types';

export const MAX_LEVEL_XP_THRESHOLD = 100000;

/**
 * Level 1 requires 1000 XP to pass.
 * Each subsequent level multiplies the XP threshold by 1.1, then 1.2, then 1.3 in a repeating sequence
 * until it maxes out at MAX_LEVEL_XP_THRESHOLD (100,000 XP).
 */
export const getXpRequirement = (level: number): number => {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const multipliers = [1.1, 1.2, 1.3];
  let threshold = 1000;
  for (let i = 1; i < safeLevel; i++) {
    const mult = multipliers[(i - 1) % multipliers.length];
    threshold = Math.round(threshold * mult);
    if (threshold >= MAX_LEVEL_XP_THRESHOLD) {
      return MAX_LEVEL_XP_THRESHOLD;
    }
  }
  return Math.min(MAX_LEVEL_XP_THRESHOLD, threshold);
};

export interface TrackXpCalculationInput {
  trackRating: number | null | undefined;
  score: number;
  previousHighScore?: number;
  isFirstPlay?: boolean;
}

export interface TrackXpCalculationResult {
  xpEarned: number;
  eligible: boolean;
  isNewHighScore: boolean;
  isFirstPlay: boolean;
  effectiveHighScore: number;
  reason: string;
}

/**
 * Formula: (Track Numerical Rating * 10) + (Highscore / 150)
 * - Only awarded if the track IS difficulty rated (rating !== null && rating > 0).
 * - Only awarded if the player got a new highscore OR it is their first play on the track.
 */
export const calculateTrackXpReward = (
  input: TrackXpCalculationInput
): TrackXpCalculationResult => {
  const { trackRating, score, previousHighScore = 0, isFirstPlay = false } = input;
  const cleanScore = Math.max(0, Math.floor(Number(score) || 0));
  const prevBest = Math.max(0, Math.floor(Number(previousHighScore) || 0));
  const firstPlay = Boolean(isFirstPlay || prevBest === 0);
  const isNewHighScore = cleanScore > prevBest;
  const effectiveHighScore = Math.max(cleanScore, prevBest);

  if (
    trackRating === null ||
    trackRating === undefined ||
    !Number.isFinite(Number(trackRating)) ||
    Number(trackRating) <= 0
  ) {
    return {
      xpEarned: 0,
      eligible: false,
      isNewHighScore,
      isFirstPlay: firstPlay,
      effectiveHighScore,
      reason: 'Track is NOT difficulty rated (★ N/A) — cannot level up from unrated tracks.',
    };
  }

  if (!firstPlay && !isNewHighScore) {
    return {
      xpEarned: 0,
      eligible: false,
      isNewHighScore: false,
      isFirstPlay: false,
      effectiveHighScore,
      reason: `Did not beat your high score (${prevBest.toLocaleString()}) — new highscore or first play required for XP.`,
    };
  }

  const numRating = Number(trackRating);
  const xpEarned = Math.max(1, Math.round(numRating * 10 + cleanScore / 150));
  return {
    xpEarned,
    eligible: true,
    isNewHighScore,
    isFirstPlay: firstPlay,
    effectiveHighScore,
    reason: firstPlay
      ? `First Play XP! (★ ${numRating} × 10) + (${cleanScore.toLocaleString()} / 150) = +${xpEarned} XP`
      : `New High Score XP! (★ ${numRating} × 10) + (${cleanScore.toLocaleString()} / 150) = +${xpEarned} XP`,
  };
};

/**
 * Each time you level up, the game gives you 25% of the coins you currently have.
 */
export const addRewardsCalc = (
  info: PlayerInfo,
  xpToAdd: number,
  coinsToAdd: number
): { next: PlayerInfo; leveledUp: boolean; levelsGained: number; levelUpBonusCoins: number } => {
  let level = info.level || 1;
  let xp = (info.xp || 0) + Math.max(0, Math.round(xpToAdd));
  let coins = (info.coins || 0) + Math.max(0, Math.round(coinsToAdd));
  let leveledUp = false;
  let levelsGained = 0;
  let levelUpBonusCoins = 0;

  while (xp >= getXpRequirement(level)) {
    xp -= getXpRequirement(level);
    level += 1;
    leveledUp = true;
    levelsGained += 1;
    const bonus = Math.round(coins * 0.25);
    coins += bonus;
    levelUpBonusCoins += bonus;
  }

  return {
    next: { ...info, level, xp, coins },
    leveledUp,
    levelsGained,
    levelUpBonusCoins,
  };
};

/**
 * Slot machine spin cost starts at 1,200 coins and increases by 1.5x each time you spin.
 */
export const getSlotMachineSpinCost = (spinCount = 0): number => {
  const safeCount = Math.max(0, Math.floor(Number(spinCount) || 0));
  return Math.round(1200 * Math.pow(1.5, safeCount));
};

export const normalizeChart = (rawNotes?: ChartNote[] | null): ChartNote[] => {
  if (!Array.isArray(rawNotes)) return [];
  return rawNotes
    .map((n) => ({
      time: Math.max(0, Number(n.time) || 0),
      lane: Math.max(0, Math.min(7, Number(n.lane) || 0)),
      type: n.type || 'normal',
      duration:
        n.type === 'hold' || (n.duration && n.duration > 0)
          ? Math.max(150, Number(n.duration) || 500)
          : 0,
      hit: false,
      missed: false,
      holding: false,
      holdCompleted: false,
    }))
    .sort((a, b) => a.time - b.time || a.lane - b.lane);
};

export const generateBeatmap = (
  bpm: number,
  offsetSec = 0,
  durationSec = 90,
  difficulty: Difficulty | string | number = 'normal',
  gameMode: GameMode | string | number = 'standard',
  triggers: ChartTrigger[] = []
): ChartNote[] => {
  const safeBpm = Math.max(60, Math.min(300, Number(bpm) || 128));
  const beatMs = 60000 / safeBpm;
  const diffLower = String(difficulty).toLowerCase();
  const stepDiv =
    diffLower === 'insane' || diffLower === 'death' || diffLower === 'expert'
      ? 2
      : diffLower === 'hard'
      ? 1.5
      : diffLower === 'easy'
      ? 0.5
      : 1;
  const stepMs = beatMs / stepDiv;
  const startTimeMs = Math.max(1200, Math.round(offsetSec * 1000) + 1200);
  const endTimeMs = Math.max(startTimeMs + 10000, Math.round(durationSec * 1000) - 1500);

  const notes: ChartNote[] = [];
  let idx = 0;

  for (let t = startTimeMs; t <= endTimeMs; t += stepMs) {
    const timeMs = Math.round(t);
    const activeLanes = getActiveLaneExpansionState(triggers, timeMs, 4, 'split_out', 0.5)
      .targetLanes;
    const lane = (idx * 3 + Math.floor(idx / 4)) % activeLanes;

    const isLongHold = idx % 10 === 4;
    const isDemon =
      (diffLower === 'insane' || String(gameMode) === 'battle_royale') && idx % 17 === 11;

    notes.push({
      time: timeMs,
      lane,
      type: isDemon ? 'demon' : isLongHold ? 'hold' : 'normal',
      duration: isLongHold ? Math.max(1150, Math.round(beatMs * 3)) : 0,
      hit: false,
      missed: false,
    });

    if (isLongHold) {
      t += beatMs * 1.5;
    }
    idx++;
  }

  return normalizeChart(notes);
};

export const createAltChart = (notes: ChartNote[]): ChartNote[] =>
  normalizeChart(
    notes.map((n, idx) => ({
      ...n,
      lane: 3 - (n.lane % 4) + (n.lane >= 4 ? 4 : 0),
      type: n.type === 'normal' && idx % 11 === 5 ? 'hold' : n.type,
      duration: n.type === 'normal' && idx % 11 === 5 ? 1150 : n.duration,
    }))
  );

export const applyNerfChart = (notes: ChartNote[], nerfPct: number, seed = 1): ChartNote[] => {
  if (!nerfPct || nerfPct <= 0) return notes;
  const keepRatio = Math.max(0.25, 1 - nerfPct / 100);
  return notes.filter((_, i) => ((i * 37 + seed * 13) % 100) / 100 < keepRatio);
};

export const evaluateHitTiming = (
  diffMs: number,
  perfectLockBonus = 0
): {
  rating: 'SICK!' | 'GOOD' | 'BAD' | 'MISS';
  judgment: 'SICK!' | 'GOOD' | 'BAD' | 'MISS';
  scoreDelta: number;
  addScore: number;
  healthDelta: number;
  heal: number;
  bucket: 'sick' | 'good' | 'bad' | 'miss';
  color: string;
  hitWeight: number;
  breaksCombo: boolean;
} => {
  const abs = Math.max(0, Math.abs(diffMs) - perfectLockBonus);
  if (abs <= HIT_WINDOWS.sick) {
    return {
      rating: 'SICK!',
      judgment: 'SICK!',
      scoreDelta: 350,
      addScore: 350,
      healthDelta: 3.5,
      heal: 3.5,
      bucket: 'sick',
      color: '#36e2ff',
      hitWeight: 1.0,
      breaksCombo: false,
    };
  }
  if (abs <= HIT_WINDOWS.good) {
    return {
      rating: 'GOOD',
      judgment: 'GOOD',
      scoreDelta: 200,
      addScore: 200,
      healthDelta: 1.5,
      heal: 1.5,
      bucket: 'good',
      color: '#34d399',
      hitWeight: 0.75,
      breaksCombo: false,
    };
  }
  if (abs <= HIT_WINDOWS.bad) {
    return {
      rating: 'BAD',
      judgment: 'BAD',
      scoreDelta: 80,
      addScore: 80,
      healthDelta: -2,
      heal: -2,
      bucket: 'bad',
      color: '#facc15',
      hitWeight: 0.35,
      breaksCombo: false,
    };
  }
  return {
    rating: 'MISS',
    judgment: 'MISS',
    scoreDelta: 0,
    addScore: 0,
    healthDelta: -10,
    heal: -10,
    bucket: 'miss',
    color: '#ef4444',
    hitWeight: 0,
    breaksCombo: true,
  };
};

export const getGrade = (percent: number): string => {
  if (percent >= 98) return 'SS';
  if (percent >= 93) return 'S';
  if (percent >= 85) return 'A';
  if (percent >= 72) return 'B';
  if (percent >= 55) return 'C';
  return 'D';
};

export const getDurationString = (song: Song): string => {
  const sec = Math.max(
    15,
    song.duration ||
      (song.customMap && song.customMap.length > 0
        ? Math.ceil(Math.max(...song.customMap.map((n) => n.time + (n.duration || 0))) / 1000) + 3
        : 95)
  );
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export function invertHexColor(hex: string): string {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length !== 6) return '#ffffff';
  const r = 255 - parseInt(clean.slice(0, 2), 16);
  const g = 255 - parseInt(clean.slice(2, 4), 16);
  const b = 255 - parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return '#ffffff';
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function getLaneColor(laneIndex: number, base4Colors?: string[]): string {
  const base =
    base4Colors && base4Colors.length >= 4 ? base4Colors : LANE_COLORS_8.slice(0, 4);
  if (laneIndex < 4) {
    return base[laneIndex] || LANE_COLORS_8[laneIndex] || '#00f0ff';
  }
  const pred = base[laneIndex % 4] || LANE_COLORS_8[laneIndex % 4] || '#00f0ff';
  return invertHexColor(pred);
}

export const getExpandedLaneColors = (baseColors: string[], targetCount: number): string[] => {
  const base4 = [
    baseColors[0] || LANE_COLORS_8[0],
    baseColors[1] || LANE_COLORS_8[1],
    baseColors[2] || LANE_COLORS_8[2],
    baseColors[3] || LANE_COLORS_8[3],
  ];
  const opposite4 = base4.map((c) => invertHexColor(c));
  const all8 = [...base4, ...opposite4];
  return all8.slice(0, Math.max(4, Math.min(8, targetCount)));
};

export const getPlayfieldLayout = (params: {
  isLandscape: boolean;
  downscroll: boolean;
  laneCount?: ExtraNotesCount;
  fromLaneCount?: ExtraNotesCount;
  transitionProgress?: number;
  transitionType?: ExpansionTransitionType;
  controlLayout?: ControlLayoutSettings | null;
  isVS?: boolean;
  heroMode?: boolean;
}) => {
  const {
    isLandscape,
    downscroll,
    laneCount = 4,
    fromLaneCount = 4,
    transitionProgress = 1,
    transitionType = 'split_out',
    controlLayout,
    isVS = false,
    heroMode = false,
  } = params;

  const baseWidth = isLandscape ? LANDSCAPE_CANVAS_WIDTH : CANVAS_WIDTH;
  const baseHeight = isLandscape ? LANDSCAPE_CANVAS_HEIGHT : CANVAS_HEIGHT;
  const noteSize = isLandscape ? 74 : 66;

  const savedCoords = isLandscape
    ? controlLayout?.landscapeLanes || getDefaultLaneCoords(true, downscroll)
    : controlLayout?.portraitLanes || getDefaultLaneCoords(false, downscroll);
  const basePixels = laneCoordsToPixels(savedCoords, isLandscape, noteSize);

  const xs4 = [...basePixels.xs].sort((a, b) => a - b);
  const rawStep =
    xs4.length >= 2
      ? (xs4[xs4.length - 1] - xs4[0]) / Math.max(1, xs4.length - 1)
      : isLandscape
      ? 193
      : 110;
  const stepPx = Math.max(noteSize + 14, Math.round(rawStep));
  const leftMargin = Math.max(24, xs4[0] ?? 103);

  const p = Math.max(0, Math.min(1, transitionProgress));
  const easedP = 1 - Math.pow(1 - p, 3);
  const effectiveLanesFloat = fromLaneCount + (laneCount - fromLaneCount) * easedP;

  const targetSpan = (laneCount - 1) * stepPx + noteSize + leftMargin * 2;
  const fromSpan = (fromLaneCount - 1) * stepPx + noteSize + leftMargin * 2;
  const targetWidth = Math.max(baseWidth, Math.round(targetSpan));
  const fromWidth = Math.max(baseWidth, Math.round(fromSpan));
  const canvasWidth = Math.round(fromWidth + (targetWidth - fromWidth) * easedP);
  const canvasHeight = baseHeight;

  const totalRowSpan = (laneCount - 1) * stepPx + noteSize;
  const startX = Math.round((canvasWidth - totalRowSpan) / 2);

  const baseReceptorY = basePixels.ys[0] ?? (downscroll ? canvasHeight - 96 : 24);

  const laneXs: number[] = [];
  const laneYs: number[] = [];
  const laneTransforms: { scaleX: number; scaleY: number; alpha: number; slatClip?: number }[] = [];

  for (let i = 0; i < laneCount; i++) {
    const finalX = startX + i * stepPx;
    const finalY = basePixels.ys[i % 4] ?? baseReceptorY;
    const isExtraLane = i >= fromLaneCount;
    const isTransitioning = fromLaneCount !== laneCount && p < 0.999;

    let x = finalX;
    let scaleX = 1;
    let scaleY = 1;
    let alpha = 1;

    if (isTransitioning) {
      const centerX = canvasWidth / 2 - noteSize / 2;
      if (isExtraLane) {
        alpha = easedP;
        if (transitionType === 'split_out' || transitionType === 'split') {
          x = Math.round(centerX + (finalX - centerX) * easedP);
        } else if (
          transitionType === 'edge_slide' ||
          transitionType === 'push' ||
          transitionType === 'cover_slide'
        ) {
          x = Math.round(finalX + (1 - easedP) * stepPx * 1.5);
        } else if (transitionType === 'zoom_burst' || transitionType === 'fade_zoom') {
          scaleX = 0.25 + 0.75 * easedP;
          scaleY = 0.25 + 0.75 * easedP;
        } else if (transitionType === 'flip_3d' || transitionType === 'cube_rotate') {
          scaleX = Math.max(0.08, Math.sin(easedP * Math.PI * 0.5));
        } else if (transitionType === 'blinds_snap') {
          scaleY = Math.max(0.1, easedP);
        } else if (transitionType === 'wipe_reveal' || transitionType === 'wipe') {
          const laneTriggerP = (i - fromLaneCount) / Math.max(1, laneCount - fromLaneCount);
          alpha = Math.max(0, Math.min(1, (p - laneTriggerP * 0.4) / 0.6));
        } else if (transitionType === 'flash_cut' || transitionType === 'cut') {
          alpha = p > 0.15 ? 1 : 0;
        }
      } else {
        // Core lanes smoothly glide from their previous centered position to their new position
        const prevTotalRowSpan = (fromLaneCount - 1) * stepPx + noteSize;
        const prevStartX = Math.round((canvasWidth - prevTotalRowSpan) / 2);
        const prevX = prevStartX + i * stepPx;
        x = Math.round(prevX + (finalX - prevX) * easedP);
      }
    }

    laneXs.push(x);
    laneYs.push(finalY);
    laneTransforms.push({ scaleX, scaleY, alpha });
  }

  const vsStep = Math.max(44, Math.round((canvasWidth * 0.42) / Math.max(4, laneCount)));
  const playerLaneXs = isVS
    ? laneXs.map((_, i) => Math.round(canvasWidth * 0.05 + i * vsStep))
    : laneXs;
  const opponentLaneXs = isVS
    ? laneXs.map((_, i) => Math.round(canvasWidth * 0.54 + i * vsStep))
    : laneXs.map((x) => Math.round(x * 0.45));

  return {
    width: canvasWidth,
    height: canvasHeight,
    canvasWidth,
    canvasHeight,
    noteSize,
    stepPx,
    laneCount,
    effectiveLanesFloat,
    receptorY: baseReceptorY,
    isLandscape,
    isVS,
    heroMode,
    laneXs,
    laneYs,
    playerLaneXs,
    playerLaneYs: laneYs,
    opponentLaneXs,
    laneTransforms,
  };
};

export function computeExpandedPlayfieldLayout(params: {
  baseWidth: number;
  baseLaneCount?: number;
  targetLaneCount: number;
  horizontalSpreadPct?: number;
  transitionProgress?: number;
}): {
  noteSizePx: number;
  laneSpacingPx: number;
  expandedWidthPx: number;
  laneCentersPx: number[];
} {
  const baseLanes = params.baseLaneCount || 4;
  const targetLanes = Math.max(4, Math.min(8, params.targetLaneCount));
  const spreadMultiplier = Math.max(0.6, Math.min(1.5, (params.horizontalSpreadPct ?? 100) / 100));
  const progress = Math.max(0, Math.min(1, params.transitionProgress ?? 1));

  const noteSizePx = 74;
  const baseLaneSpacingPx = ((params.baseWidth * 0.72) / baseLanes) * spreadMultiplier;
  const effectiveLaneCount = baseLanes + (targetLanes - baseLanes) * progress;
  const sidePaddingPx = params.baseWidth * 0.14;
  const expandedWidthPx = Math.round(sidePaddingPx * 2 + effectiveLaneCount * baseLaneSpacingPx);

  const totalSpan = (targetLanes - 1) * baseLaneSpacingPx;
  const centerX = expandedWidthPx / 2;
  const startX = centerX - totalSpan / 2;

  const laneCentersPx: number[] = [];
  for (let i = 0; i < targetLanes; i++) {
    laneCentersPx.push(Math.round(startX + i * baseLaneSpacingPx));
  }

  return {
    noteSizePx,
    laneSpacingPx: Math.round(baseLaneSpacingPx),
    expandedWidthPx,
    laneCentersPx,
  };
}

export const getLaneFromPlayfieldPoint = (
  canvasX: number,
  _canvasY: number,
  layout: { laneXs: number[]; noteSize: number; laneCount: number }
): number => {
  let bestLane = 0;
  let bestDist = Infinity;
  for (let i = 0; i < layout.laneCount; i++) {
    const center = (layout.laneXs[i] ?? 0) + layout.noteSize / 2;
    const dist = Math.abs(canvasX - center);
    if (dist < bestDist) {
      bestDist = dist;
      bestLane = i;
    }
  }
  return bestLane;
};

export const getActiveSpeedMultiplierAtTime = (
  triggers: ChartTrigger[] | undefined,
  currentTimeMs: number,
  fallbackPreset: SpeedTriggerPreset = 1.0
): SpeedTriggerPreset => {
  if (!Array.isArray(triggers) || triggers.length === 0) return fallbackPreset;
  const sorted = [...triggers]
    .filter((t) => t.type === 'speed' && typeof t.speed === 'number')
    .sort((a, b) => a.time - b.time);
  let current: SpeedTriggerPreset = fallbackPreset;
  for (const t of sorted) {
    if (t.time <= currentTimeMs && t.speed) {
      current = t.speed;
    }
  }
  return current;
};

/**
 * Smoothly interpolates speed trigger changes over rampDurationMs using a cubic smoothstep curve
 * so speed triggers feel smooth and never cause janky instant note jumps.
 */
export const getSmoothedSpeedMultiplierAtTime = (
  triggers: ChartTrigger[] | undefined,
  currentTimeMs: number,
  fallbackPreset: SpeedTriggerPreset = 1.0,
  rampDurationMs = 360
): number => {
  if (!Array.isArray(triggers) || triggers.length === 0) return fallbackPreset;
  const sorted = [...triggers]
    .filter((t) => t.type === 'speed' && typeof t.speed === 'number')
    .sort((a, b) => a.time - b.time);

  if (sorted.length === 0) return fallbackPreset;

  let prevSpeed: number = fallbackPreset;
  let currentSpeed: number = fallbackPreset;
  let activeTriggerTime = -Infinity;

  for (const t of sorted) {
    if (t.time <= currentTimeMs && typeof t.speed === 'number') {
      prevSpeed = currentSpeed;
      currentSpeed = t.speed;
      activeTriggerTime = t.time;
    } else if (t.time > currentTimeMs) {
      break;
    }
  }

  if (activeTriggerTime === -Infinity || rampDurationMs <= 0) {
    return currentSpeed;
  }

  const elapsed = currentTimeMs - activeTriggerTime;
  if (elapsed >= rampDurationMs) {
    return currentSpeed;
  }

  const u = Math.max(0, Math.min(1, elapsed / rampDurationMs));
  const smoothU = u * u * (3 - 2 * u);
  return Number((prevSpeed + (currentSpeed - prevSpeed) * smoothU).toFixed(4));
};

export const getEffectiveScrollSpeed = (
  difficulty: Difficulty | string | number,
  speedMultiplier: number,
  extraMultiplier = 1.0
): number => {
  const baseSpeed =
    typeof difficulty === 'number'
      ? difficulty
      : SCROLL_SPEEDS[difficulty] ?? SCROLL_SPEEDS.normal;
  return Number((baseSpeed * Math.max(0.1, speedMultiplier) * extraMultiplier).toFixed(4));
};

export const computeEffectiveScrollSpeed = getEffectiveScrollSpeed;

export const getActiveLaneExpansionState = (
  triggers: ChartTrigger[] | undefined,
  currentTimeMs: number,
  fallbackLanes: ExtraNotesCount = 4,
  fallbackTransition: ExpansionTransitionType = 'split_out',
  fallbackDurationSec = 0.5
): {
  fromLanes: ExtraNotesCount;
  toLanes: ExtraNotesCount;
  targetLanes: ExtraNotesCount;
  currentLanes: ExtraNotesCount;
  transition: ExpansionTransitionType;
  transitionType: ExpansionTransitionType;
  durationSec: number;
  progress: number;
} => {
  if (!Array.isArray(triggers) || triggers.length === 0) {
    return {
      fromLanes: fallbackLanes,
      toLanes: fallbackLanes,
      targetLanes: fallbackLanes,
      currentLanes: fallbackLanes,
      transition: fallbackTransition,
      transitionType: fallbackTransition,
      durationSec: fallbackDurationSec,
      progress: 1,
    };
  }

  const laneTriggers = triggers
    .filter((t) => t.type === 'extra_notes' && t.lanes)
    .sort((a, b) => a.time - b.time);

  let fromLanes: ExtraNotesCount = fallbackLanes;
  let targetLanes: ExtraNotesCount = fallbackLanes;
  let transition: ExpansionTransitionType = fallbackTransition;
  let durationSec = fallbackDurationSec;
  let progress = 1;

  for (const trig of laneTriggers) {
    if (trig.time <= currentTimeMs) {
      fromLanes = targetLanes;
      targetLanes = trig.lanes || 4;
      transition = trig.transition || fallbackTransition;
      durationSec = Math.max(
        0.1,
        Math.min(2.0, Number(trig.transitionDuration) || fallbackDurationSec)
      );
      const elapsedSec = (currentTimeMs - trig.time) / 1000;
      progress = Math.max(0, Math.min(1, elapsedSec / durationSec));
    }
  }

  return {
    fromLanes,
    toLanes: targetLanes,
    targetLanes,
    currentLanes: targetLanes,
    transition,
    transitionType: transition,
    durationSec,
    progress,
  };
};

export function evaluateActiveTriggers(
  triggers: ChartTrigger[] | undefined,
  currentTimeMs: number,
  defaultSpeedPreset: SpeedTriggerPreset = 1.0,
  defaultLaneCount: ExtraNotesCount = 4,
  defaultTransition: ExpansionTransitionType = 'split_out',
  defaultTransitionDuration = 0.5
) {
  const speed = getActiveSpeedMultiplierAtTime(triggers, currentTimeMs, defaultSpeedPreset);
  const smoothedSpeed = getSmoothedSpeedMultiplierAtTime(
    triggers,
    currentTimeMs,
    defaultSpeedPreset,
    360
  );
  const exp = getActiveLaneExpansionState(
    triggers,
    currentTimeMs,
    defaultLaneCount,
    defaultTransition,
    defaultTransitionDuration
  );
  const inv = isInvisibleTriggerActiveAtTime(triggers, currentTimeMs);
  const vel = getActiveVelocityEffectAtTime(triggers, currentTimeMs);
  return {
    activeSpeedMultiplier: speed,
    smoothedSpeedMultiplier: smoothedSpeed,
    targetLaneCount: exp.targetLanes,
    previousLaneCount: exp.fromLanes,
    activeTransition: exp.transition,
    transitionDurationSec: exp.durationSec,
    transitionProgress: exp.progress,
    isDjStopped: false,
    djStopFactor: 1,
    invisibleActive: inv,
    velocityEffect: vel.effect,
    velocityIntensity: vel.intensity,
  };
}

export function computeTrackProgressPercent(
  currentTimeMs: number,
  totalDurationMs: number
): number {
  if (!totalDurationMs || totalDurationMs <= 0) return 0;
  const pct = (Math.max(0, currentTimeMs) / totalDurationMs) * 100;
  return Math.max(0, Math.min(100, Number(pct.toFixed(1))));
}

export function isInvisibleTriggerActiveAtTime(
  triggers: ChartTrigger[] | undefined,
  timeMs: number
): boolean {
  if (!Array.isArray(triggers) || triggers.length === 0) return false;
  const invTriggers = triggers
    .filter((t) => t.type === 'invisible_notes')
    .sort((a, b) => a.time - b.time);

  let active = false;
  for (const t of invTriggers) {
    if (timeMs >= t.time) {
      if (t.invisibleEnabled === false) {
        active = false;
      } else {
        const dur = t.invisibleDurationMs ?? 10000;
        active = timeMs <= t.time + dur;
      }
    }
  }
  return active;
}

export function computeInvisibleNoteVisibility(travelProgress01: number): {
  alpha: number;
  flashGlow: number;
  flashBoost: number;
} {
  const p = Math.max(0, Math.min(1.2, travelProgress01));
  if (p < 0.08) {
    const ramp = p / 0.08;
    const glow = ramp * 0.6;
    return { alpha: 0.4 + ramp * 0.6, flashGlow: glow, flashBoost: glow };
  }
  if (p <= 0.36) {
    const midPulse = Math.sin(((p - 0.08) / 0.28) * Math.PI);
    const glow = 0.5 + midPulse * 0.5;
    return { alpha: 1.0, flashGlow: glow, flashBoost: glow };
  }
  if (p <= 0.52) {
    const fade = 1 - (p - 0.36) / 0.16;
    const glow = Math.max(0, fade * 0.4);
    return { alpha: Math.max(0, fade * fade), flashGlow: glow, flashBoost: glow };
  }
  return { alpha: 0, flashGlow: 0, flashBoost: 0 };
}

export function getActiveVelocityEffectAtTime(
  triggers: ChartTrigger[] | undefined,
  timeMs: number
): { effect: NoteVelocityEffect; intensity: number } {
  if (!Array.isArray(triggers) || triggers.length === 0) {
    return { effect: 'linear', intensity: 1.0 };
  }
  const velTriggers = triggers
    .filter((t) => t.type === 'note_velocity' && t.velocityEffect)
    .sort((a, b) => a.time - b.time);

  let effect: NoteVelocityEffect = 'linear';
  let intensity = 1.0;
  for (const t of velTriggers) {
    if (t.time <= timeMs && t.velocityEffect) {
      effect = t.velocityEffect;
      intensity = typeof t.velocityIntensity === 'number' ? t.velocityIntensity : 1.0;
    }
  }
  return { effect, intensity };
}

export function computeVelocityNoteScroll(
  travelProgress01: number,
  effect: NoteVelocityEffect = 'linear',
  intensity = 1.0
): { visualProgress: number; lateralOffsetPx: number } {
  const p = Math.max(0, Math.min(1.25, travelProgress01));
  const k = Math.max(0.1, Math.min(2.0, intensity));

  if (effect === 'linear' || p >= 1.0) {
    return { visualProgress: p, lateralOffsetPx: 0 };
  }

  let curved = p;
  let lateral = 0;

  switch (effect) {
    case 'ease_in_rush':
      curved = Math.pow(p, 1 + 1.15 * k);
      break;
    case 'ease_out_brake':
      curved = 1 - Math.pow(1 - p, 1 + 1.15 * k);
      break;
    case 'elastic_bounce':
      curved = p + Math.sin(p * Math.PI * 4) * 0.08 * k * (1 - p);
      break;
    case 'sine_wave_flow':
      curved = p + Math.sin(p * Math.PI * 2) * 0.14 * k * (1 - p * 0.5);
      break;
    case 'stutter_step': {
      const steps = 6;
      const stepped = Math.floor(p * steps) / steps;
      const frac = p * steps - Math.floor(p * steps);
      const snap = Math.pow(frac, 3);
      curved = p * (1 - 0.7 * k) + (stepped + snap / steps) * (0.7 * k);
      break;
    }
    case 'boomerang_pull':
      curved = p - Math.sin(p * Math.PI) * 0.18 * k * (1 - p);
      break;
    case 'heartbeat_pulse':
      curved = p + Math.pow(Math.sin(p * Math.PI * 3), 3) * 0.11 * k * (1 - p);
      break;
    case 'hyper_warp':
      curved = p < 0.65 ? p * 0.25 : 0.1625 + ((p - 0.65) / 0.35) * 0.8375;
      curved = p * (1 - k * 0.8) + curved * (k * 0.8);
      break;
    case 'spiral_sway':
      curved = p + Math.sin(p * Math.PI * 2) * 0.08 * k * (1 - p);
      lateral = Math.sin(p * Math.PI * 3) * 22 * k * (1 - p);
      break;
    case 'gravity_drop':
      curved = p * p * (0.65 + 0.35 * p);
      break;
    case 'pendulum_swing':
      curved = p;
      lateral = Math.sin(p * Math.PI * 2) * 28 * k * (1 - p);
      break;
  }

  return {
    visualProgress: Math.max(0, Math.min(1.15, curved)),
    lateralOffsetPx: lateral,
  };
}

export function mapCustomKeyToLane(
  key: string,
  code: string,
  customKeybinds?: string[] | null
): number {
  const binds =
    Array.isArray(customKeybinds) && customKeybinds.length >= 4
      ? customKeybinds
      : DEFAULT_CUSTOM_KEYBINDS;

  const lowerKey = (key || '').toLowerCase();
  for (let i = 0; i < Math.min(8, binds.length); i++) {
    const bind = binds[i];
    if (!bind) continue;
    if (bind === code || bind.toLowerCase() === lowerKey) {
      return i;
    }
    if (bind.startsWith('Key') && bind.slice(3).toLowerCase() === lowerKey) {
      return i;
    }
    if (bind.startsWith('Digit') && bind.slice(5) === lowerKey) {
      return i;
    }
  }

  if (code && KEY_CODE_MAP[code] !== undefined) return KEY_CODE_MAP[code];
  if (lowerKey && KEY_MAP[lowerKey] !== undefined) return KEY_MAP[lowerKey];
  return -1;
}

function extractVotesArray(votes?: number[] | Record<string, number>): number[] {
  if (!votes) return [];
  if (Array.isArray(votes)) return votes.map(Number).filter(Number.isFinite);
  return Object.values(votes).map(Number).filter(Number.isFinite);
}

/**
 * Featured Levels Difficulty Rating Rules:
 * ALL featured levels default to `N/A` (`null`) EXCEPT for:
 * 1) Tracks in the Rhythm List (`rhythmList`), OR
 * 2) Tracks already rated by an admin (`ratingsMap[id]?.adminRating != null` or `song.difficultyRating != null`).
 */
export function getDisplayTrackRating(
  song: Song,
  ratingsMap: TrackRatingsMap = {},
  rhythmList: string[] = []
): number | null {
  const idStr = String(song.id);
  const entry = ratingsMap[idStr];

  if (entry && typeof entry.adminRating === 'number' && Number.isFinite(entry.adminRating)) {
    return Number(entry.adminRating);
  }
  if (typeof song.difficultyRating === 'number' && Number.isFinite(song.difficultyRating)) {
    return Number(song.difficultyRating);
  }

  const votesArr = extractVotesArray(entry?.votes);
  const inRhythmList = Array.isArray(rhythmList) && rhythmList.map(String).includes(idStr);
  if (inRhythmList) {
    if (votesArr.length > 0) {
      const avg = votesArr.reduce((a, b) => a + b, 0) / votesArr.length;
      return Math.round(avg * 10) / 10;
    }
    const diffFallback: Record<string, number> = {
      easy: 4,
      normal: 9,
      medium: 9,
      hard: 16,
      expert: 21,
      insane: 25,
      death: 30,
    };
    return diffFallback[String(song.difficulty || 'normal').toLowerCase()] ?? 10;
  }

  if (!song.featured && votesArr.length > 0) {
    const avg = votesArr.reduce((a, b) => a + b, 0) / votesArr.length;
    return Math.round(avg * 10) / 10;
  }

  return null;
}

export function formatTrackRatingBadge(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) {
    return 'N/A';
  }
  const num = Number(rating);
  return Number.isInteger(num) ? `${num}` : num.toFixed(1);
}

export const getEffectiveTrackRating = (
  song: Song,
  ratingsMap: TrackRatingsMap = {},
  rhythmList: string[] = []
): number | null => getDisplayTrackRating(song, ratingsMap, rhythmList);

export const getHighestTrackRating = (
  songs: Song[],
  ratingsMap: TrackRatingsMap = {},
  excludeSongId?: string | number
): number => {
  let highest = 10;
  for (const s of songs) {
    if (excludeSongId !== undefined && String(s.id) === String(excludeSongId)) continue;
    const r = getDisplayTrackRating(s, ratingsMap);
    if (typeof r === 'number' && r > highest) {
      highest = r;
    }
  }
  for (const [k, entry] of Object.entries(ratingsMap)) {
    if (excludeSongId !== undefined && k === String(excludeSongId)) continue;
    if (typeof entry?.adminRating === 'number' && entry.adminRating > highest) {
      highest = entry.adminRating;
    }
  }
  return highest;
};

export const isTrackLabeledNewTop1 = (
  song: Song,
  ratingsMap: TrackRatingsMap = {}
): boolean => {
  const entry = ratingsMap[String(song.id)];
  return Boolean(entry?.isNewTop1 || song.isNewTop1);
};

export const getCommunityVoteStats = (
  song: Song,
  ratingsMap: TrackRatingsMap = {}
): { count: number; average: number | null } => {
  const votes = extractVotesArray(ratingsMap[String(song.id)]?.votes);
  if (votes.length === 0) {
    return { count: 0, average: null };
  }
  const sum = votes.reduce((a, b) => a + Number(b || 0), 0);
  return {
    count: votes.length,
    average: Math.round((sum / votes.length) * 10) / 10,
  };
};

export function validateDifficultyVote(params: {
  value?: number;
  proposedRating?: number;
  highestRating?: number;
  currentHighestRating?: number;
  isNewTop1: boolean;
  isAdmin?: boolean;
}): {
  valid: boolean;
  error?: string;
  reason?: string;
  normalizedValue?: number;
  clampedRating?: number;
} {
  const rawVal = params.value !== undefined ? params.value : params.proposedRating;
  const val = Number(rawVal);
  const maxAllowed =
    params.highestRating !== undefined
      ? params.highestRating
      : params.currentHighestRating !== undefined
      ? params.currentHighestRating
      : 10;

  if (!Number.isFinite(val) || val < 1) {
    const msg = 'Difficulty rating must be a number >= 1.';
    return { valid: false, error: msg, reason: msg };
  }

  const rounded = Math.round(val * 10) / 10;
  if (params.isAdmin || params.isNewTop1) {
    return { valid: true, normalizedValue: rounded, clampedRating: rounded };
  }

  if (val > maxAllowed) {
    const msg = `Max community vote is ★ ${maxAllowed} unless an Admin labels this track NEW TOP 1.`;
    return { valid: false, error: msg, reason: msg };
  }

  return { valid: true, normalizedValue: rounded, clampedRating: rounded };
}

export function autoIndexFeaturedTracks(
  songs: Song[],
  ratingsMap: TrackRatingsMap = {},
  limit = 30
): string[] {
  const featuredPool = songs.filter((s) => s.featured !== false);
  const scored = featuredPool.map((s) => {
    const idStr = String(s.id);
    const entry = ratingsMap[idStr];
    const votesArr = extractVotesArray(entry?.votes);
    const explicit =
      typeof entry?.adminRating === 'number'
        ? entry.adminRating
        : typeof s.difficultyRating === 'number'
        ? s.difficultyRating
        : votesArr.length > 0
        ? votesArr.reduce((a, b) => a + b, 0) / votesArr.length
        : null;
    return {
      id: idStr,
      rating: explicit,
      bpm: s.bpm || 120,
    };
  });

  scored.sort((a, b) => {
    if (a.rating !== null && b.rating !== null) return a.rating - b.rating;
    if (a.rating !== null) return -1;
    if (b.rating !== null) return 1;
    return a.bpm - b.bpm;
  });

  return scored.slice(0, limit).map((item) => item.id);
}

export function resolveExternalAudioInput(rawInput: string): {
  sourceType: 'newgrounds' | 'spotify' | 'direct' | 'invalid';
  cleanId: string;
  audioUrl: string;
  suggestedTitle?: string;
  suggestedArtist?: string;
  suggestedBpm?: number;
} {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { sourceType: 'invalid', cleanId: '', audioUrl: '' };
  }

  const ngMatch =
    trimmed.match(/^(?:ng:)?(\d{4,10})$/i) ||
    trimmed.match(/newgrounds\.com\/audio\/listen\/(\d+)/i);
  if (ngMatch) {
    const id = ngMatch[1];
    const num = parseInt(id, 10) || 1;
    const fallbackPool = ['synth:rave', 'synth:dubstep', 'synth:hardtekk'];
    const audioUrl = fallbackPool[num % fallbackPool.length];
    const bpms = [140, 160, 175];
    return {
      sourceType: 'newgrounds',
      cleanId: id,
      audioUrl,
      suggestedTitle: `NG Audio #${id}`,
      suggestedArtist: 'Newgrounds Creator',
      suggestedBpm: bpms[num % bpms.length],
    };
  }

  const spMatch =
    trimmed.match(/open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/i) ||
    trimmed.match(/^spotify:(track|playlist|album):([a-zA-Z0-9]+)/i);
  if (spMatch) {
    const kind = spMatch[1].toLowerCase();
    const id = spMatch[2];
    const hash = id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const fallbackPool = ['synth:spotify', 'synth:rave', 'synth:dubstep'];
    return {
      sourceType: 'spotify',
      cleanId: id,
      audioUrl: fallbackPool[hash % fallbackPool.length],
      suggestedTitle: `Spotify ${kind.toUpperCase()} (${id.slice(0, 6)})`,
      suggestedArtist: 'Spotify Stream',
      suggestedBpm: [128, 150, 172][hash % 3],
    };
  }

  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('data:audio') ||
    trimmed.startsWith('blob:')
  ) {
    return {
      sourceType: 'direct',
      cleanId: trimmed,
      audioUrl: trimmed,
    };
  }

  return { sourceType: 'invalid', cleanId: '', audioUrl: '' };
}

export function snapTimeToBeatGrid(timeMs: number, bpm: number, subdivision = 4): number {
  const safeBpm = Math.max(30, Math.min(400, Number(bpm) || 120));
  const stepMs = 60000 / safeBpm / Math.max(1, subdivision);
  return Math.max(0, Math.round(timeMs / stepMs) * Math.round(stepMs));
}

export function autoSyncNotesToBpm(
  notes: ChartNote[],
  bpm: number,
  subdivision = 4
): ChartNote[] {
  return normalizeChart(
    notes.map((n) => ({
      ...n,
      time: snapTimeToBeatGrid(n.time, bpm, subdivision),
    }))
  );
}
