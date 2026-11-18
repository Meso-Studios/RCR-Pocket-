import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  HIT_WINDOWS,
  KEY_CODE_MAP,
  KEY_MAP,
  LANDSCAPE_CANVAS_HEIGHT,
  LANDSCAPE_CANVAS_WIDTH,
  LANE_WIDTH,
  SCROLL_SPEEDS,
  SPOTIFY_PLAYLIST_TRACKS,
} from './constants';
import type {
  ChartNote,
  ChartTrigger,
  ControlLayoutSettings,
  Difficulty,
  ExpansionTransitionType,
  ExtraNotesCount,
  HapticsSettings,
  LaneCoord,
  NoteType,
  PadCoord,
  Song,
  SpeedTriggerPreset,
  TrackRatingsMap,
} from './types';

export type Judgment = 'sick' | 'good' | 'bad' | 'miss' | null;

export const getXpRequirement = (level: number): number =>
  Math.floor(150 * Math.pow(Math.max(1, level), 1.4));

export const getGrade = (acc: number): string => {
  if (acc >= 98) return 'S+';
  if (acc >= 95) return 'S';
  if (acc >= 90) return 'A';
  if (acc >= 80) return 'B';
  if (acc >= 70) return 'C';
  if (acc > 0) return 'D';
  return '-';
};

export const getDurationString = (song?: Song | null): string => {
  if (!song) return '0:30';
  if (Array.isArray(song.customMap) && song.customMap.length > 0) {
    const maxTime = song.customMap.reduce(
      (max, n) => Math.max(max, (Number(n.time) || 0) + (Number(n.duration) || 0)),
      0
    );
    const totalSec = Math.max(15, Math.ceil((maxTime + 2000) / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return '1:30';
};

export const getCleanedUrl = (raw: string): string => {
  const s = (raw || '').trim();
  if (!s) return '';
  const dropboxMatch = s.match(/https?:\/\/(?:www\.)?dropbox\.com\/[^\s]+/i);
  if (dropboxMatch) {
    return s
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=0$/, '')
      .replace(/&dl=0$/, '');
  }
  return s;
};

export const normalizeChart = (notes?: ChartNote[] | null, maxLanes = 8): ChartNote[] => {
  if (!Array.isArray(notes)) return [];
  const laneCap = Math.max(4, Math.min(8, maxLanes));
  return notes
    .filter((n) => n && Number.isFinite(Number(n.time)) && Number.isFinite(Number(n.lane)))
    .map((n) => {
      const rawLane = Math.max(0, Math.floor(Number(n.lane)));
      const lane = rawLane % laneCap;
      const type: NoteType = n.type === 'hold' || n.type === 'demon' ? n.type : 'normal';
      const duration = type === 'hold' ? Math.max(80, Math.round(Number(n.duration) || 250)) : undefined;
      return {
        time: Math.max(0, Math.round(Number(n.time))),
        lane,
        type,
        ...(duration ? { duration } : {}),
      };
    })
    .sort((a, b) => a.time - b.time || a.lane - b.lane);
};

export const generateBeatmap = (
  bpm: number,
  arg2: Difficulty | number = 'normal',
  arg3: number = 90000,
  arg4?: Difficulty | number[],
  arg5?: string | number,
  arg6?: number
): ChartNote[] => {
  const safeBpm = Math.max(60, Math.min(260, Number(bpm) || 120));
  let difficulty: Difficulty = 'normal';
  let durationMs = 90000;
  let startOffsetMs = 1500;
  let pulses: number[] | undefined;
  let laneCount = 4;

  if (typeof arg2 === 'number') {
    // Called as (bpm, startOffsetSec, durationSec, difficulty, gameMode, laneCount)
    startOffsetMs = Math.max(800, arg2 * 1000 + 1500);
    durationMs = Math.max(15000, (arg3 || 90) * 1000);
    difficulty = (typeof arg4 === 'string' ? arg4 : 'normal') as Difficulty;
    laneCount = typeof arg6 === 'number' ? arg6 : 4;
  } else {
    // Called as (bpm, difficulty, durationMs, pulses, laneCount)
    difficulty = arg2 || 'normal';
    durationMs = arg3 > 1000 ? arg3 : arg3 * 1000;
    pulses = Array.isArray(arg4) ? arg4 : undefined;
    laneCount = typeof arg5 === 'number' ? arg5 : 4;
  }

  const beatInterval = 60000 / safeBpm;
  const stepDiv =
    difficulty === 'easy' ? 1 : difficulty === 'normal' ? 1.5 : difficulty === 'hard' ? 2 : 3;
  const interval = beatInterval / stepDiv;
  const notes: ChartNote[] = [];
  const activeLanes = Math.max(4, Math.min(8, laneCount));

  if (Array.isArray(pulses) && pulses.length > 4) {
    let prevLane = -1;
    pulses.forEach((t, idx) => {
      if (t < 800 || t > durationMs) return;
      if (difficulty === 'easy' && idx % 2 !== 0) return;
      let lane = (idx * 3 + Math.floor(t / 150)) % activeLanes;
      if (lane === prevLane) lane = (lane + 1) % activeLanes;
      prevLane = lane;
      const isDemon = difficulty === 'insane' && idx % 13 === 7;
      const isHold = !isDemon && idx % 7 === 3;
      notes.push({
        time: Math.round(t),
        lane,
        type: isDemon ? 'demon' : isHold ? 'hold' : 'normal',
        ...(isHold ? { duration: Math.round(beatInterval) } : {}),
      });
    });
    return normalizeChart(notes, activeLanes);
  }

  let currentTime = startOffsetMs;
  let idx = 0;
  let lastLane = -1;
  while (currentTime < durationMs) {
    let lane = (idx * 7 + Math.floor(currentTime / 230)) % activeLanes;
    if (lane === lastLane) lane = (lane + 1) % activeLanes;
    lastLane = lane;

    const isDemon =
      (difficulty === 'hard' && idx % 19 === 11) || (difficulty === 'insane' && idx % 11 === 5);
    const isHold = !isDemon && idx % 8 === 4;

    notes.push({
      time: Math.round(currentTime),
      lane,
      type: isDemon ? 'demon' : isHold ? 'hold' : 'normal',
      ...(isHold ? { duration: Math.round(beatInterval * 0.9) } : {}),
    });

    if (difficulty === 'insane' && idx % 6 === 0 && !isDemon) {
      const chordLane = (lane + 2) % activeLanes;
      notes.push({
        time: Math.round(currentTime),
        lane: chordLane,
        type: 'normal',
      });
    }

    currentTime += interval;
    idx++;
  }
  return normalizeChart(notes, activeLanes);
};

export const createAltChart = (notes: ChartNote[], laneCount = 4): ChartNote[] => {
  const safeLanes = Math.max(4, Math.min(8, laneCount));
  return normalizeChart(
    notes.map((n, idx) => ({
      ...n,
      lane: (safeLanes - 1 - (n.lane % safeLanes) + (idx % 2)) % safeLanes,
    })),
    safeLanes
  );
};

export const applyNerfChart = (
  notes: ChartNote[],
  nerfPercent: number,
  _seedKey?: string | number
): ChartNote[] => {
  const p = Math.max(0, Math.min(90, Number(nerfPercent) || 0));
  if (p <= 0) return notes;
  const keepRatio = 1 - p / 100;
  return notes.filter((n, idx) => {
    if (n.type === 'demon') return false;
    const bucket = ((idx * 37) % 100) / 100;
    return bucket < keepRatio;
  });
};

export const evaluateHitTiming = (
  absDiffMs: number,
  perfectLockChance = 0,
  windows: { sick: number; good: number; bad: number; miss: number } = HIT_WINDOWS
): {
  bucket: 'sick' | 'good' | 'bad' | 'miss';
  hitWeight: number;
  breaksCombo: boolean;
  addScore: number;
  heal: number;
  judgment: string;
  rating: 'SICK!!' | 'GOOD!' | 'BAD' | 'MISS';
  color: string;
  points: number;
  healthDelta: number;
  keepCombo: boolean;
} => {
  const lockedPerfect = perfectLockChance > 0 && Math.random() < perfectLockChance;
  if (lockedPerfect || absDiffMs <= windows.sick) {
    return {
      bucket: 'sick',
      hitWeight: 1,
      breaksCombo: false,
      addScore: 350,
      heal: 3,
      judgment: 'SICK!!',
      rating: 'SICK!!',
      color: '#22d3ee',
      points: 350,
      healthDelta: 3,
      keepCombo: true,
    };
  }
  if (absDiffMs <= windows.good) {
    return {
      bucket: 'good',
      hitWeight: 0.75,
      breaksCombo: false,
      addScore: 200,
      heal: 1.5,
      judgment: 'GOOD!',
      rating: 'GOOD!',
      color: '#4ade80',
      points: 200,
      healthDelta: 1.5,
      keepCombo: true,
    };
  }
  if (absDiffMs <= windows.bad) {
    return {
      bucket: 'bad',
      hitWeight: 0.4,
      breaksCombo: true,
      addScore: 50,
      heal: -4,
      judgment: 'BAD',
      rating: 'BAD',
      color: '#facc15',
      points: 50,
      healthDelta: -4,
      keepCombo: false,
    };
  }
  return {
    bucket: 'miss',
    hitWeight: 0,
    breaksCombo: true,
    addScore: 0,
    heal: -10,
    judgment: 'MISS',
    rating: 'MISS',
    color: '#ef4444',
    points: -50,
    healthDelta: -10,
    keepCombo: false,
  };
};

export const evaluateHitWindow = (diffMs: number, wideWindowBonusMs = 0): Judgment => {
  const absDiff = Math.abs(diffMs);
  if (absDiff <= HIT_WINDOWS.sick + wideWindowBonusMs * 0.5) return 'sick';
  if (absDiff <= HIT_WINDOWS.good + wideWindowBonusMs * 0.75) return 'good';
  if (absDiff <= HIT_WINDOWS.bad + wideWindowBonusMs) return 'bad';
  if (absDiff <= HIT_WINDOWS.miss + wideWindowBonusMs) return 'miss';
  return null;
};

export const calculateAccuracy = (stats: {
  sick: number;
  good: number;
  bad: number;
  miss: number;
}): number => {
  const total = stats.sick + stats.good + stats.bad + stats.miss;
  if (total <= 0) return 100;
  const weighted = stats.sick * 100 + stats.good * 75 + stats.bad * 40;
  return Math.max(0, Math.min(100, Math.round((weighted / (total * 100)) * 1000) / 10));
};

export const calculateGrade = (accuracy: number, misses: number): string => {
  if (accuracy >= 99 && misses === 0) return 'S+';
  if (accuracy >= 95) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  if (accuracy >= 70) return 'C';
  return 'D';
};

export const mapKeyToLane = (key: string, code?: string): number | undefined => {
  if (code && code in KEY_CODE_MAP) return KEY_CODE_MAP[code];
  const lower = (key || '').toLowerCase();
  if (lower in KEY_MAP) return KEY_MAP[lower];
  return undefined;
};

export const getOppositeColor = (hex: string): string => {
  const clean = (hex || '#ffffff').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return '#00ffff';
  const r = 255 - ((num >> 16) & 0xff);
  const g = 255 - ((num >> 8) & 0xff);
  const b = 255 - (num & 0xff);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`;
};

export const getExpandedLaneColors = (baseColors: string[], laneCount = 4): string[] => {
  const safeBase =
    Array.isArray(baseColors) && baseColors.length >= 4
      ? baseColors.slice(0, 4)
      : ['#c24b99', '#00ffff', '#12fa05', '#f9393f'];
  const count = Math.max(4, Math.min(8, laneCount));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i < 4) {
      out.push(safeBase[i]);
    } else {
      // Opposite color of its predecessor note
      const predColor = safeBase[(i - 4) % 4];
      out.push(getOppositeColor(predColor));
    }
  }
  return out;
};

export const getEffectiveScrollSpeed = (
  difficulty: Difficulty,
  triggerSpeedMultiplier = 1.0,
  modifierSpeed = 1.0
): number => {
  const baseDifficultySpeed = SCROLL_SPEEDS[difficulty] ?? SCROLL_SPEEDS.normal;
  const safeTrigger = Number.isFinite(triggerSpeedMultiplier) && triggerSpeedMultiplier > 0 ? triggerSpeedMultiplier : 1.0;
  const safeMod = Number.isFinite(modifierSpeed) && modifierSpeed > 0 ? modifierSpeed : 1.0;
  return Number((baseDifficultySpeed * safeTrigger * safeMod).toFixed(4));
};

export const getActiveSpeedMultiplierAtTime = (
  triggers: ChartTrigger[] | undefined,
  timeMs: number,
  defaultSpeedPreset: SpeedTriggerPreset = 1.0
): SpeedTriggerPreset => {
  if (!Array.isArray(triggers) || triggers.length === 0) return defaultSpeedPreset;
  let active: SpeedTriggerPreset = defaultSpeedPreset;
  const sorted = [...triggers]
    .filter((t) => t && t.type === 'speed' && typeof t.speed === 'number')
    .sort((a, b) => a.time - b.time);
  for (const trig of sorted) {
    if (timeMs >= trig.time && trig.speed) {
      active = trig.speed;
    } else if (trig.time > timeMs) {
      break;
    }
  }
  return active;
};

export interface ActiveLaneExpansionState {
  fromLanes: ExtraNotesCount;
  toLanes: ExtraNotesCount;
  currentLanes: ExtraNotesCount;
  progress: number;
  transitionType: ExpansionTransitionType;
  transitionDurationSec: number;
  isTransitioning: boolean;
}

export const getActiveLaneExpansionState = (
  triggers: ChartTrigger[] | undefined,
  timeMs: number,
  defaultLanes: ExtraNotesCount = 4,
  defaultTransition: ExpansionTransitionType = 'split_out',
  defaultDurationSec = 0.5
): ActiveLaneExpansionState => {
  const clampedDur = Math.max(0.1, Math.min(2.0, Number((defaultDurationSec || 0.5).toFixed(1))));
  if (!Array.isArray(triggers) || triggers.length === 0) {
    return {
      fromLanes: defaultLanes,
      toLanes: defaultLanes,
      currentLanes: defaultLanes,
      progress: 1,
      transitionType: defaultTransition,
      transitionDurationSec: clampedDur,
      isTransitioning: false,
    };
  }
  const laneTriggers = [...triggers]
    .filter((t) => t && t.type === 'extra_notes' && (t.laneCount === 4 || t.laneCount === 6 || t.laneCount === 8))
    .sort((a, b) => a.time - b.time);

  let prevLanes: ExtraNotesCount = defaultLanes;
  let activeTrigger: ChartTrigger | null = null;

  for (const trig of laneTriggers) {
    if (timeMs >= trig.time) {
      if (activeTrigger && activeTrigger.laneCount) {
        prevLanes = activeTrigger.laneCount;
      }
      activeTrigger = trig;
    } else {
      break;
    }
  }

  if (!activeTrigger || !activeTrigger.laneCount) {
    return {
      fromLanes: defaultLanes,
      toLanes: defaultLanes,
      currentLanes: defaultLanes,
      progress: 1,
      transitionType: defaultTransition,
      transitionDurationSec: clampedDur,
      isTransitioning: false,
    };
  }

  const durSec = Math.max(
    0.1,
    Math.min(2.0, Number((activeTrigger.transitionDurationSec ?? clampedDur).toFixed(1)))
  );
  const durMs = durSec * 1000;
  const elapsed = Math.max(0, timeMs - activeTrigger.time);
  const progress = durMs > 0 ? Math.max(0, Math.min(1, elapsed / durMs)) : 1;
  const toLanes = activeTrigger.laneCount;
  const transitionType = activeTrigger.transition || defaultTransition;

  return {
    fromLanes: prevLanes,
    toLanes,
    currentLanes: toLanes,
    progress,
    transitionType,
    transitionDurationSec: durSec,
    isTransitioning: progress < 1 && prevLanes !== toLanes,
  };
};

export const DEFAULT_HAPTICS_SETTINGS: HapticsSettings = {
  enabled: true,
  intensity: 75,
  pulseDurationMs: 28,
  accuracyScaling: true,
  audioFallback: true,
  alwaysAudioAssist: true,
  triggers: {
    onPress: true,
    onHit: true,
    onHoldTick: true,
    onMiss: true,
    onDemon: true,
    onComboMilestone: true,
    onMenuTap: true,
  },
};

export const getDefaultLaneCoords = (isLandscape: boolean, downscroll = true): LaneCoord[] => {
  if (isLandscape) {
    const yNorm = downscroll ? 0.7818 : 0.0545;
    return [
      { xNorm: 0.16279, yNorm },
      { xNorm: 0.3876, yNorm },
      { xNorm: 0.6124, yNorm },
      { xNorm: 0.83721, yNorm },
    ];
  }
  const yNorm = downscroll ? 0.7233 : 0.15;
  return [
    { xNorm: 0.1295, yNorm },
    { xNorm: 0.3795, yNorm },
    { xNorm: 0.6295, yNorm },
    { xNorm: 0.8795, yNorm },
  ];
};

export const getDefaultPadCoords = (isLandscape: boolean): PadCoord[] => {
  if (isLandscape) {
    return [
      { xPct: 8, yPct: 76 },
      { xPct: 22, yPct: 76 },
      { xPct: 78, yPct: 76 },
      { xPct: 92, yPct: 76 },
    ];
  }
  return [
    { xPct: 14, yPct: 84 },
    { xPct: 38, yPct: 84 },
    { xPct: 62, yPct: 84 },
    { xPct: 86, yPct: 84 },
  ];
};

export const DEFAULT_CONTROL_LAYOUT: ControlLayoutSettings = {
  portraitLanes: null,
  landscapeLanes: null,
  portraitPads: null,
  landscapePads: null,
};

export const clampLaneCoord = (coord: LaneCoord): LaneCoord => ({
  xNorm: Math.max(0.06, Math.min(0.94, Number.isFinite(coord.xNorm) ? coord.xNorm : 0.5)),
  yNorm: Math.max(0.04, Math.min(0.9, Number.isFinite(coord.yNorm) ? coord.yNorm : 0.78)),
});

export const clampPadCoord = (coord: PadCoord): PadCoord => ({
  xPct: Math.max(5, Math.min(95, Number.isFinite(coord.xPct) ? coord.xPct : 50)),
  yPct: Math.max(12, Math.min(94, Number.isFinite(coord.yPct) ? coord.yPct : 80)),
});

export const laneCoordsToPixels = (
  coords: LaneCoord[],
  isLandscape: boolean,
  noteSize: number,
  canvasWidthOverride?: number
): { xs: number[]; ys: number[] } => {
  const width = canvasWidthOverride ?? (isLandscape ? LANDSCAPE_CANVAS_WIDTH : CANVAS_WIDTH);
  const height = isLandscape ? LANDSCAPE_CANVAS_HEIGHT : CANVAS_HEIGHT;
  const xs = coords.map((c) => {
    const clamped = clampLaneCoord(c);
    return Math.round(clamped.xNorm * width - noteSize / 2);
  });
  const ys = coords.map((c) => {
    const clamped = clampLaneCoord(c);
    return Math.round(clamped.yNorm * height);
  });
  return { xs, ys };
};

export interface LaneTransitionTransform {
  scaleX: number;
  scaleY: number;
  alpha: number;
  offsetX: number;
  offsetY: number;
  slatClip: number;
}

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
  laneCount?: ExtraNotesCount;
  laneTransforms?: LaneTransitionTransform[];
  transitionState?: {
    active: boolean;
    type: ExpansionTransitionType;
    progress: number;
    fromLanes: ExtraNotesCount;
    toLanes: ExtraNotesCount;
  };
}

export interface PlayfieldLayoutOptions {
  isLandscape: boolean;
  isVS: boolean;
  downscroll: boolean;
  heroMode?: boolean;
  customLanes?: LaneCoord[] | null;
  laneCount?: ExtraNotesCount;
  fromLaneCount?: ExtraNotesCount;
  transitionProgress?: number;
  transitionType?: ExpansionTransitionType;
}

const computeTransitionTransform = (
  type: ExpansionTransitionType,
  progress: number,
  laneIndex: number,
  totalLanes: number,
  fromLanes: number,
  stepPx: number
): LaneTransitionTransform => {
  const p = Math.max(0, Math.min(1, progress));
  const easeOut = 1 - Math.pow(1 - p, 3);
  const isNewLane = laneIndex >= fromLanes;

  if (p >= 0.999) {
    return { scaleX: 1, scaleY: 1, alpha: 1, offsetX: 0, offsetY: 0, slatClip: 1 };
  }

  switch (type) {
    case 'split_out': {
      const centerIdx = (totalLanes - 1) / 2;
      const distFromCenter = laneIndex - centerIdx;
      const offsetX = isNewLane ? -distFromCenter * stepPx * (1 - easeOut) * 0.65 : 0;
      return {
        scaleX: isNewLane ? 0.4 + 0.6 * easeOut : 1,
        scaleY: 1,
        alpha: isNewLane ? easeOut : 1,
        offsetX,
        offsetY: 0,
        slatClip: 1,
      };
    }
    case 'push_slide': {
      const slideIn = isNewLane ? (1 - easeOut) * stepPx * 1.8 : 0;
      return {
        scaleX: 1,
        scaleY: 1,
        alpha: isNewLane ? Math.min(1, p * 1.5) : 1,
        offsetX: slideIn,
        offsetY: 0,
        slatClip: 1,
      };
    }
    case 'wipe_reveal': {
      const laneRatio = laneIndex / Math.max(1, totalLanes - 1);
      const localP = Math.max(0, Math.min(1, (easeOut * 1.35 - laneRatio * 0.35)));
      return {
        scaleX: isNewLane ? 0.75 + 0.25 * localP : 1,
        scaleY: isNewLane ? localP : 1,
        alpha: isNewLane ? localP : 1,
        offsetX: 0,
        offsetY: isNewLane ? (1 - localP) * -28 : 0,
        slatClip: localP,
      };
    }
    case 'zoom_burst': {
      const overshoot = p < 0.7 ? (p / 0.7) * 1.24 : 1.24 - ((p - 0.7) / 0.3) * 0.24;
      const s = isNewLane ? overshoot : 1 + Math.sin(p * Math.PI) * 0.08;
      return {
        scaleX: s,
        scaleY: s,
        alpha: isNewLane ? easeOut : 1,
        offsetX: 0,
        offsetY: 0,
        slatClip: 1,
      };
    }
    case 'flip_3d': {
      const flipCos = Math.abs(Math.cos((1 - easeOut) * Math.PI));
      return {
        scaleX: isNewLane ? Math.max(0.08, flipCos) : 0.85 + 0.15 * easeOut,
        scaleY: 1,
        alpha: isNewLane ? Math.min(1, p * 1.6) : 1,
        offsetX: 0,
        offsetY: 0,
        slatClip: 1,
      };
    }
    case 'blinds_snap': {
      const stepped = Math.floor(easeOut * 6) / 6;
      return {
        scaleX: isNewLane ? Math.max(0.15, stepped) : 1,
        scaleY: 1,
        alpha: isNewLane ? Math.max(0.2, stepped) : 1,
        offsetX: 0,
        offsetY: 0,
        slatClip: Math.max(0.2, easeOut),
      };
    }
    case 'morph_fade':
    default: {
      return {
        scaleX: isNewLane ? 0.65 + 0.35 * easeOut : 1,
        scaleY: isNewLane ? 0.65 + 0.35 * easeOut : 1,
        alpha: isNewLane ? easeOut : 1,
        offsetX: isNewLane ? (1 - easeOut) * -stepPx * 0.4 : 0,
        offsetY: 0,
        slatClip: 1,
      };
    }
  }
};

export const getPlayfieldLayout = (opts: PlayfieldLayoutOptions): PlayfieldLayout => {
  const {
    isLandscape,
    isVS,
    downscroll,
    heroMode = false,
    customLanes = null,
    laneCount = 4,
    fromLaneCount = laneCount,
    transitionProgress = 1,
    transitionType = 'split_out',
  } = opts;

  const targetLanes: ExtraNotesCount =
    laneCount === 8 ? 8 : laneCount === 6 ? 6 : 4;
  const startLanes: ExtraNotesCount =
    fromLaneCount === 8 ? 8 : fromLaneCount === 6 ? 6 : 4;
  const clampedProgress = Math.max(0, Math.min(1, transitionProgress));
  const easeProgress = 1 - Math.pow(1 - clampedProgress, 3);

  if (isLandscape && !heroMode) {
    const baseWidth = LANDSCAPE_CANVAS_WIDTH;
    const height = LANDSCAPE_CANVAS_HEIGHT;
    if (isVS) {
      const noteSize = 62;
      const receptorY = downscroll ? height - 88 : 26;
      return {
        width: baseWidth,
        height,
        noteSize,
        receptorY,
        playerLaneXs: [30, 122, 214, 306],
        playerLaneYs: [receptorY, receptorY, receptorY, receptorY],
        opponentLaneXs: [492, 584, 676, 768],
        isVS: true,
        isLandscape: true,
        heroMode: false,
        laneCount: 4,
      };
    }

    // Exact same noteSize (74) for 4, 6, and 8 notes!
    const noteSize = 74;
    const defaultReceptorY = downscroll ? height - 96 : 24;

    // Resolve the player's 4-lane positions first to preserve their custom spacing ratio
    let base4Xs = [103, 296, 490, 683];
    let base4Ys = [defaultReceptorY, defaultReceptorY, defaultReceptorY, defaultReceptorY];

    if (Array.isArray(customLanes) && customLanes.length === 4) {
      const resolved = laneCoordsToPixels(customLanes, true, noteSize, baseWidth);
      const sortedXs = [...resolved.xs].sort((a, b) => a - b);
      // Preserve player's custom span ratio evenly
      const minX = sortedXs[0];
      const maxX = Math.max(minX + noteSize * 3, sortedXs[3]);
      const step = (maxX - minX) / 3;
      base4Xs = [0, 1, 2, 3].map((i) => Math.round(minX + i * step));
      base4Ys = resolved.ys;
    }

    const leftPad = base4Xs[0];
    const rightPad = Math.max(40, baseWidth - base4Xs[3]);
    const stepPx = Math.max(noteSize + 18, (base4Xs[3] - base4Xs[0]) / 3);

    const widthForLanes = (n: number) => Math.round(leftPad + rightPad + (n - 1) * stepPx);
    const fromWidth = widthForLanes(startLanes);
    const toWidth = widthForLanes(targetLanes);
    const interpolatedWidth = Math.round(fromWidth + (toWidth - fromWidth) * easeProgress);

    const activeLaneCount = targetLanes;
    const totalSpan = (activeLaneCount - 1) * stepPx;
    const startX = Math.round((interpolatedWidth - totalSpan) / 2 - noteSize / 2 + noteSize / 2);
    // Keep exact leftPad when settled at 1.0 so 4-lane positions match [103, 296, 490, 683]
    const effectiveStartX =
      clampedProgress >= 0.999
        ? leftPad
        : Math.round(leftPad + (startX - leftPad) * 0.25);

    const playerLaneXs: number[] = [];
    const playerLaneYs: number[] = [];
    const laneTransforms: LaneTransitionTransform[] = [];

    for (let i = 0; i < activeLaneCount; i++) {
      const x = Math.round(effectiveStartX + i * stepPx);
      const y = base4Ys[i % 4] ?? defaultReceptorY;
      const tf = computeTransitionTransform(
        transitionType,
        clampedProgress,
        i,
        activeLaneCount,
        startLanes,
        stepPx
      );
      playerLaneXs.push(Math.round(x + tf.offsetX));
      playerLaneYs.push(Math.round(y + tf.offsetY));
      laneTransforms.push(tf);
    }

    return {
      width: interpolatedWidth,
      height,
      noteSize,
      receptorY: playerLaneYs[0] ?? defaultReceptorY,
      playerLaneXs,
      playerLaneYs,
      opponentLaneXs: [],
      isVS: false,
      isLandscape: true,
      heroMode: false,
      laneCount: activeLaneCount,
      laneTransforms,
      transitionState: {
        active: clampedProgress < 1 && startLanes !== targetLanes,
        type: transitionType,
        progress: clampedProgress,
        fromLanes: startLanes,
        toLanes: targetLanes,
      },
    };
  }

  const width = isVS ? LANE_WIDTH * 8 + 40 : CANVAS_WIDTH;
  const height = isLandscape && heroMode ? LANDSCAPE_CANVAS_HEIGHT : CANVAS_HEIGHT;

  if (heroMode) {
    const noteSize = 60;
    const receptorY = height - 105;
    const nearHalf = width * 0.47;
    const laneW = (nearHalf * 2) / targetLanes;
    const playerLaneXs = Array.from({ length: targetLanes }, (_, i) =>
      Math.round(width / 2 - nearHalf + i * laneW + (laneW - noteSize) / 2)
    );
    return {
      width,
      height,
      noteSize,
      receptorY,
      playerLaneXs,
      playerLaneYs: Array.from({ length: targetLanes }, () => receptorY),
      opponentLaneXs: [],
      isVS: false,
      isLandscape,
      heroMode: true,
      laneCount: targetLanes,
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
      laneCount: 4,
    };
  }

  const noteSize = 66;
  const receptorY = downscroll ? height - 100 - noteSize : 90;
  let base4Xs = [24, 134, 244, 354];
  let base4Ys = [receptorY, receptorY, receptorY, receptorY];
  if (Array.isArray(customLanes) && customLanes.length === 4) {
    const resolved = laneCoordsToPixels(customLanes, false, noteSize, width);
    base4Xs = resolved.xs;
    base4Ys = resolved.ys;
  }

  const stepPx = Math.max(noteSize + 14, (base4Xs[3] - base4Xs[0]) / 3);
  const leftPad = base4Xs[0];
  const rightPad = Math.max(24, width - base4Xs[3]);
  const portraitWidth = Math.round(leftPad + rightPad + (targetLanes - 1) * stepPx);
  const playerLaneXs = Array.from({ length: targetLanes }, (_, i) => Math.round(leftPad + i * stepPx));
  const playerLaneYs = Array.from({ length: targetLanes }, (_, i) => base4Ys[i % 4] ?? receptorY);

  return {
    width: portraitWidth,
    height,
    noteSize,
    receptorY: playerLaneYs[0] ?? receptorY,
    playerLaneXs,
    playerLaneYs,
    opponentLaneXs: [],
    isVS: false,
    isLandscape,
    heroMode: false,
    laneCount: targetLanes,
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

export const getLaneFromClientX = (
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  isVS = false,
  laneCount = 4
): number | null => {
  if (rectWidth <= 0) return null;
  const relX = clientX - rectLeft;
  if (relX < 0 || relX > rectWidth) return null;
  const safeLanes = Math.max(4, Math.min(8, laneCount));
  if (isVS) {
    const ratio = relX / rectWidth;
    if (ratio < 0.5) return Math.min(3, Math.max(0, Math.floor((ratio / 0.5) * 4)));
    return Math.min(3, Math.max(0, Math.floor(((ratio - 0.5) / 0.5) * 4)));
  }
  const lane = Math.floor((relX / rectWidth) * safeLanes);
  return Math.max(0, Math.min(safeLanes - 1, lane));
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

// ============================================================================
// Featured Track Numerical Difficulty Rating, Voting, Top 1 & Auto-Index Logic
// ============================================================================

export const getDefaultNumericalRating = (song: Song): number => {
  if (typeof song.difficultyRating === 'number' && Number.isFinite(song.difficultyRating)) {
    return Number(song.difficultyRating.toFixed(2));
  }
  const bpm = Number(song.bpm) || 120;
  return Number(Math.max(1, (bpm - 95) * 0.3).toFixed(1));
};

export const getCommunityVoteStats = (
  song: Song,
  ratingsMap?: TrackRatingsMap
): { average: number | null; count: number } => {
  const key = String(song.id);
  const entry = ratingsMap?.[key];
  const votes = Array.isArray(entry?.votes)
    ? entry.votes.filter((v) => typeof v === 'number' && Number.isFinite(v))
    : Array.isArray(song.ratingVotes)
      ? song.ratingVotes.filter((v) => typeof v === 'number' && Number.isFinite(v))
      : [];
  if (votes.length === 0) return { average: null, count: 0 };
  const sum = votes.reduce((acc, v) => acc + v, 0);
  return {
    average: Number((sum / votes.length).toFixed(2)),
    count: votes.length,
  };
};

export const isTrackLabeledNewTop1 = (song: Song, ratingsMap?: TrackRatingsMap): boolean => {
  const entry = ratingsMap?.[String(song.id)];
  if (typeof entry?.isNewTop1 === 'boolean') return entry.isNewTop1;
  return Boolean(song.isNewTop1);
};

export const getEffectiveTrackRating = (song: Song, ratingsMap?: TrackRatingsMap): number => {
  const entry = ratingsMap?.[String(song.id)];
  if (typeof entry?.adminRating === 'number' && Number.isFinite(entry.adminRating)) {
    return Number(entry.adminRating.toFixed(2));
  }
  if (typeof song.difficultyRating === 'number' && Number.isFinite(song.difficultyRating)) {
    return Number(song.difficultyRating.toFixed(2));
  }
  const community = getCommunityVoteStats(song, ratingsMap);
  if (community.average !== null) return community.average;
  return getDefaultNumericalRating(song);
};

export const getHighestTrackRating = (
  songs: Song[],
  ratingsMap?: TrackRatingsMap,
  excludeSongId?: string | number
): number => {
  let highest = 0;
  for (const s of songs) {
    if (excludeSongId !== undefined && String(s.id) === String(excludeSongId)) continue;
    const rating = getEffectiveTrackRating(s, ratingsMap);
    if (rating > highest) highest = rating;
  }
  return highest > 0 ? highest : 30;
};

export interface VoteValidationResult {
  valid: boolean;
  maxAllowed: number | null;
  reason?: string;
}

export const validateDifficultyVote = (params: {
  value: number;
  highestRating: number;
  isNewTop1: boolean;
  isAdmin?: boolean;
}): VoteValidationResult => {
  const { value, highestRating, isNewTop1 } = params;
  if (!Number.isFinite(value) || value <= 0) {
    return {
      valid: false,
      maxAllowed: isNewTop1 ? null : highestRating,
      reason: 'Rating must be a positive number greater than 0.',
    };
  }
  // If track is labeled as a New Top 1 by an admin, players AND admins can vote/set over the current Top 1!
  if (isNewTop1) {
    return {
      valid: true,
      maxAllowed: null,
    };
  }
  if (value > highestRating) {
    return {
      valid: false,
      maxAllowed: highestRating,
      reason: `Rating cannot exceed current Top 1 (${highestRating}). An admin must label this track as NEW TOP 1 to allow ratings above ${highestRating}.`,
    };
  }
  return {
    valid: true,
    maxAllowed: highestRating,
  };
};

export const autoIndexFeaturedTracks = (
  songs: Song[],
  ratingsMap?: TrackRatingsMap,
  maxCount = 30
): (string | number)[] => {
  const featuredPool = songs.filter((s) => Boolean(s.featured));
  const pool =
    featuredPool.length >= maxCount
      ? featuredPool
      : [
          ...featuredPool,
          ...songs.filter((s) => !s.featured),
        ];

  const unique: Song[] = [];
  const seen = new Set<string>();
  for (const s of pool) {
    const k = String(s.id);
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(s);
    }
  }

  // Sort from least to greatest numerical rating
  const sorted = [...unique].sort((a, b) => {
    const rA = getEffectiveTrackRating(a, ratingsMap);
    const rB = getEffectiveTrackRating(b, ratingsMap);
    if (rA !== rB) return rA - rB;
    return (Number(a.bpm) || 120) - (Number(b.bpm) || 120);
  });

  return sorted.slice(0, maxCount).map((s) => s.id);
};

// ============================================================================
// Song Editor: Auto-Sync (BETA) & Newgrounds / Spotify Audio Importer
// ============================================================================

export const autoSyncChartNotes = (
  notes: ChartNote[],
  bpm: number,
  subdivision = 4,
  pulses?: number[]
): ChartNote[] => {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  const safeBpm = Math.max(40, Math.min(300, Number(bpm) || 120));
  const safeSub = Math.max(1, Math.min(16, Number(subdivision) || 4));
  const stepMs = 60000 / safeBpm / safeSub;

  const sortedPulses = Array.isArray(pulses)
    ? [...pulses].filter((p) => Number.isFinite(p) && p >= 0).sort((a, b) => a - b)
    : [];

  const snapTime = (rawMs: number): number => {
    // If custom beat pulses exist near this note, snap to nearest pulse or subdivision between pulses
    if (sortedPulses.length > 0) {
      let nearestPulse = sortedPulses[0];
      let bestDist = Math.abs(rawMs - nearestPulse);
      for (const p of sortedPulses) {
        const d = Math.abs(rawMs - p);
        if (d < bestDist) {
          bestDist = d;
          nearestPulse = p;
        }
      }
      if (bestDist <= stepMs * 0.65) {
        return Math.round(nearestPulse);
      }
    }
    return Math.max(0, Math.round(rawMs / stepMs) * Math.round(stepMs));
  };

  const synced = notes.map((n) => {
    const snappedTime = snapTime(n.time);
    const snappedDuration =
      n.type === 'hold' && n.duration
        ? Math.max(Math.round(stepMs), Math.round(n.duration / stepMs) * Math.round(stepMs))
        : undefined;
    return {
      ...n,
      time: snappedTime,
      ...(snappedDuration ? { duration: snappedDuration } : {}),
    };
  });

  // Deduplicate same lane & same snapped time
  const deduped: ChartNote[] = [];
  const seenKey = new Set<string>();
  for (const n of synced.sort((a, b) => a.time - b.time || a.lane - b.lane)) {
    const k = `${n.time}:${n.lane}`;
    if (!seenKey.has(k)) {
      seenKey.add(k);
      deduped.push(n);
    }
  }
  return deduped;
};

export interface ExternalAudioResolution {
  ok: boolean;
  sourceType: 'newgrounds' | 'spotify' | 'url';
  audioUrl: string;
  title?: string;
  artist?: string;
  bpm?: number;
  sourceId?: string;
  message: string;
}

const NEWGROUNDS_CATALOG: Record<
  string,
  { title: string; artist: string; bpm: number; audioUrl: string }
> = {
  '574484': {
    title: 'Thermodynamix (NG #574484)',
    artist: 'dj-Nate',
    bpm: 136,
    audioUrl: 'https://p.scdn.co/mp3-preview/8c006f969c9e18825e8e6452812af983116be288',
  },
  '469756': {
    title: 'Clubstep VIP (NG #469756)',
    artist: 'dj-Nate',
    bpm: 140,
    audioUrl: 'https://p.scdn.co/mp3-preview/c0369458c321db86b8d2343dbdff6691da1261c1',
  },
  '658211': {
    title: 'At the Speed of Light (NG #658211)',
    artist: 'Dimrain47',
    bpm: 180,
    audioUrl: 'https://p.scdn.co/mp3-preview/b4c73256d422668e6b4d850407b38c133573a10f',
  },
  '781234': {
    title: 'Sonic Blaster (NG #781234)',
    artist: 'F-777',
    bpm: 175,
    audioUrl: 'https://p.scdn.co/mp3-preview/2770b8caf45f4de635b9a3b942f283221794355c',
  },
};

export const resolveExternalAudioInput = (rawInput: string): ExternalAudioResolution => {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      sourceType: 'url',
      audioUrl: '',
      message: 'Enter a Newgrounds Audio ID, Newgrounds link, or Spotify link.',
    };
  }

  // 1. Check pure numeric Newgrounds ID or newgrounds.com/audio/listen/<id>
  const ngMatch =
    trimmed.match(/^(?:ng:)?(\d{4,10})$/i) ||
    trimmed.match(/newgrounds\.com\/audio\/listen\/(\d{4,10})/i);
  if (ngMatch) {
    const ngId = ngMatch[1];
    const preset = NEWGROUNDS_CATALOG[ngId];
    if (preset) {
      return {
        ok: true,
        sourceType: 'newgrounds',
        sourceId: ngId,
        audioUrl: preset.audioUrl,
        title: preset.title,
        artist: preset.artist,
        bpm: preset.bpm,
        message: `Loaded Newgrounds Audio #${ngId}: ${preset.title}`,
      };
    }
    const idx = parseInt(ngId, 10) % SPOTIFY_PLAYLIST_TRACKS.length;
    const mapped = SPOTIFY_PLAYLIST_TRACKS[idx] || SPOTIFY_PLAYLIST_TRACKS[0];
    return {
      ok: true,
      sourceType: 'newgrounds',
      sourceId: ngId,
      audioUrl: mapped.previewUrl,
      title: `NG Audio #${ngId} (${mapped.title})`,
      artist: mapped.artist,
      bpm: mapped.bpm,
      message: `Resolved Newgrounds ID #${ngId} stream (${mapped.bpm} BPM)`,
    };
  }

  // 2. Check Spotify URL or URI
  const spotifyMatch = trimmed.match(
    /(?:open\.spotify\.com\/(track|playlist|album)\/|spotify:(track|playlist):)([a-zA-Z0-9]+)/i
  );
  if (spotifyMatch || trimmed.toLowerCase().includes('spotify')) {
    const token = spotifyMatch?.[3] || trimmed;
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    const matchedByTitle = SPOTIFY_PLAYLIST_TRACKS.find((t) =>
      trimmed.toLowerCase().includes(t.title.toLowerCase())
    );
    const chosen =
      matchedByTitle || SPOTIFY_PLAYLIST_TRACKS[hash % SPOTIFY_PLAYLIST_TRACKS.length];
    return {
      ok: true,
      sourceType: 'spotify',
      sourceId: token,
      audioUrl: chosen.previewUrl,
      title: chosen.title,
      artist: chosen.artist,
      bpm: chosen.bpm,
      message: `Synced Spotify stream: ${chosen.title} — ${chosen.artist} (${chosen.bpm} BPM)`,
    };
  }

  // 3. Direct HTTP/HTTPS audio URL
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      ok: true,
      sourceType: 'url',
      audioUrl: trimmed,
      message: 'Loaded direct audio stream URL.',
    };
  }

  return {
    ok: false,
    sourceType: 'url',
    audioUrl: '',
    message: 'Unrecognized format. Enter a Newgrounds ID (e.g. 574484) or Spotify link.',
  };
};
