import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Disc3, Layers, Move, Smartphone, Trophy, Vibrate, X, Zap } from 'lucide-react';
import { AudioEngine, MenuMusicEngine, WaveformPulse } from '../game/audio';
import {
  EXPANSION_TRANSITIONS,
  EXTRA_NOTES_PRESETS,
  HIT_WINDOWS,
  KEY_CODE_MAP,
  KEY_MAP,
  SCROLL_SPEEDS,
  SKINS,
  SPEED_TRIGGER_PRESETS,
} from '../game/constants';
import { pollActiveGamepadLanes, type LaneTuple } from '../game/gamepad';
import { normalizeHapticsSettings, triggerHaptic } from '../game/haptics';
import { normalizeControlLayout } from '../game/layoutConfig';
import {
  drawExpansionTransitionOverlay,
  drawHoldTail,
  drawNote,
  getHeroHighway,
  prewarmNoteSprites,
} from '../game/renderer';
import {
  applyNerfChart,
  createAltChart,
  evaluateHitTiming,
  generateBeatmap,
  getActiveLaneExpansionState,
  getActiveSpeedMultiplierAtTime,
  getEffectiveScrollSpeed,
  getEffectiveTrackRating,
  getExpandedLaneColors,
  getGrade,
  getLaneFromPlayfieldPoint,
  getPlayfieldLayout,
  normalizeChart,
} from '../game/rhythmLogic';
import { safeGetStorage, safeSetStorage } from '../game/storage';
import type {
  ChartNote,
  ControlLayoutSettings,
  Difficulty,
  ExpansionTransitionType,
  ExtraNotesCount,
  GameMode,
  HapticsSettings,
  MenuGenre,
  Modifiers,
  PeerConnectionLike,
  PlayerInfo,
  ScreenId,
  Song,
  SpeedTriggerPreset,
} from '../game/types';
import { useIsCompactLandscape } from '../game/useViewport';
import { ControlLayoutModal } from './ControlLayoutModal';
import { HapticsSettingsModal } from './HapticsSettingsModal';
import { TouchLanePads } from './TouchControls';

interface GameEngineProps {
  song: Song;
  difficulty: Difficulty;
  gameMode: GameMode;
  setScreen: (s: ScreenId) => void;
  customBeatmap: ChartNote[] | null;
  playerInfo: PlayerInfo;
  setPlayerInfo?: React.Dispatch<React.SetStateAction<PlayerInfo>>;
  onUpdateHaptics?: (next: HapticsSettings) => void;
  onUpdateControlLayout?: (next: ControlLayoutSettings) => void;
  addRewards: (xp: number, coins: number) => void;
  networkConnection?: PeerConnectionLike | null;
  modifiers: Modifiers;
  recordGrade?: (songId: string | number, percent: number) => void;
  onGradeUpdate?: (grade: string) => void;
  interruptionActive?: boolean;
  initialStartTimeMs?: number;
  onExitPlaytest?: () => void;
}

interface BRBot {
  id: number;
  name: string;
  rating: number;
  score: number;
  health: number;
  alive: boolean;
  index: number;
  misses: number;
  hits: number;
  pressed: number[];
  nextOffset: number | null;
  lastLane?: number;
  lastJudgment: string;
  lastJudgeAt: number;
  resolved: Uint8Array;
  resolvedAt: Float64Array;
}

interface BRBoardRow {
  id: number | string;
  name: string;
  rating?: number;
  score: number;
  health: number;
  isPlayer: boolean;
  alive: boolean;
}

export const GameEngine: React.FC<GameEngineProps> = ({
  song,
  difficulty,
  gameMode,
  setScreen,
  customBeatmap,
  playerInfo,
  onUpdateHaptics,
  onUpdateControlLayout,
  addRewards,
  networkConnection = null,
  modifiers,
  recordGrade,
  onGradeUpdate,
  interruptionActive = false,
  initialStartTimeMs = 0,
  onExitPlaytest,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [gameState, setGameState] = useState<'countdown' | 'playing' | 'finished' | 'interrupted'>('countdown');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [health, setHealth] = useState(50);
  const [accuracy, setAccuracy] = useState(100);
  const [songProgressPct, setSongProgressPct] = useState(0);
  const lastProgressSyncRef = useRef(0);

  // Live Gameplay Mechanics: Speed Trigger (6 presets), Extra Notes (4/6/8), 7 Transitions, Transition Speed (0.1s-2.0s), DJ Stop
  const [liveSpeedTrigger, setLiveSpeedTrigger] = useState<SpeedTriggerPreset>(
    () => (modifiers?.speedTrigger as SpeedTriggerPreset) || 1.0
  );
  const [liveExtraNotes, setLiveExtraNotes] = useState<ExtraNotesCount>(
    () => (modifiers?.extraNotes as ExtraNotesCount) || 4
  );
  const [liveTransitionType, setLiveTransitionType] = useState<ExpansionTransitionType>(
    () => modifiers?.expansionTransition || 'split_out'
  );
  const [liveTransitionSpeed, setLiveTransitionSpeed] = useState<number>(
    () => Number(modifiers?.transitionSpeed ?? 0.6)
  );
  const [djStopActive, setDjStopActive] = useState(false);
  const [showTriggersBar, setShowTriggersBar] = useState(false);

  const liveSpeedTriggerRef = useRef<SpeedTriggerPreset>(liveSpeedTrigger);
  liveSpeedTriggerRef.current = liveSpeedTrigger;
  const liveExtraNotesRef = useRef<ExtraNotesCount>(liveExtraNotes);
  liveExtraNotesRef.current = liveExtraNotes;
  const liveTransitionTypeRef = useRef<ExpansionTransitionType>(liveTransitionType);
  liveTransitionTypeRef.current = liveTransitionType;
  const liveTransitionSpeedRef = useRef<number>(liveTransitionSpeed);
  liveTransitionSpeedRef.current = liveTransitionSpeed;

  const manualExpansionRef = useRef<{
    fromLanes: ExtraNotesCount;
    toLanes: ExtraNotesCount;
    startedAtMs: number;
    durationMs: number;
    transitionType: ExpansionTransitionType;
  } | null>(null);

  const djBrakeRef = useRef<{
    active: boolean;
    startedAtMs: number;
    durationMs: number;
  }>({ active: false, startedAtMs: 0, durationMs: 1400 });
  const firedDjTriggerIdsRef = useRef<Set<string>>(new Set());

  const synthGenre: MenuGenre | null = song.audioUrl?.startsWith('synth:')
    ? ((song.audioUrl.replace('synth:', '') as MenuGenre) || 'rave')
    : null;
  const [audioStatus, setAudioStatus] = useState<'loading' | 'ready' | 'buffering' | 'error'>(() =>
    song.audioUrl?.startsWith('synth:') || !song.audioUrl ? 'ready' : 'loading'
  );
  const [displayScore, setDisplayScore] = useState(0);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [previousHigh, setPreviousHigh] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const [brAlive, setBrAlive] = useState(50);
  const [brBoard, setBrBoard] = useState<BRBoardRow[]>([]);
  const [playerEliminated, setPlayerEliminated] = useState(false);
  const [spectateBotId, setSpectateBotId] = useState<number | null>(null);
  const [showBrDrawer, setShowBrDrawer] = useState(false);
  const [showHapticsModal, setShowHapticsModal] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [localHaptics, setLocalHaptics] = useState<HapticsSettings>(() =>
    normalizeHapticsSettings(playerInfo.haptics)
  );
  const [localControlLayout, setLocalControlLayout] = useState<ControlLayoutSettings>(() =>
    normalizeControlLayout(playerInfo.controlLayout)
  );
  const isLandscapeCompact = useIsCompactLandscape();
  // Direct tapping on the gray receptor notes is enabled by default; extra TouchLanePads stay optional via HUD toggle
  const [showTouchPads, setShowTouchPads] = useState(false);

  const effectiveHaptics = playerInfo.haptics ? normalizeHapticsSettings(playerInfo.haptics) : localHaptics;
  const hapticsRef = useRef<HapticsSettings>(effectiveHaptics);
  hapticsRef.current = effectiveHaptics;
  const effectiveControlLayout = normalizeControlLayout(playerInfo.controlLayout || localControlLayout);
  const modalPausedRef = useRef(false);
  modalPausedRef.current = showHapticsModal || showLayoutModal;

  const brBots = useRef<BRBot[]>([]);
  const brLoopRef = useRef(0);
  const playerScoreRef = useRef(0);
  const playerHealthRef = useRef(50);
  const comboRef = useRef(0);
  playerScoreRef.current = score;
  playerHealthRef.current = health;
  comboRef.current = combo;

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const playerEliminatedRef = useRef(playerEliminated);
  playerEliminatedRef.current = playerEliminated;

  const loopCountRef = useRef(0);
  const hitBursts = useRef<Array<{ lane: number; time: number; color: string }>>([]);
  const lanePressAtRef = useRef<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const laneHitAtRef = useRef<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);

  const [opponentScore, setOpponentScore] = useState(0);
  const [shake, setShake] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);

  const stats = useRef({ hits: 0, total: 0, sick: 0, good: 0, bad: 0, miss: 0 });
  const mapRef = useRef<ChartNote[]>([]);
  const startTime = useRef(0);
  const keysPressed = useRef<boolean[]>([false, false, false, false, false, false, false, false]);
  const prevGamepadLanesRef = useRef<LaneTuple>([false, false, false, false]);
  const prevGamepadStartRef = useRef(false);
  const lastHoldHapticAtRef = useRef(0);
  const activeJudgments = useRef<
    Array<{ text: string; time: number; x: number; y: number; color: string; compact: boolean }>
  >([]);
  const reqRef = useRef(0);
  const rewardsProcessed = useRef(false);
  const demonEndTime = useRef(0);
  const lastPulseIdx = useRef(0);
  const resultPulseDetach = useRef<(() => void) | null>(null);
  const lastStepClickRef = useRef(-1);
  const lastAccuracyRef = useRef(100);

  const virtualTimeRef = useRef(0);
  const smoothAudioTimeRef = useRef(0);
  const lastRawAudioTimeRef = useRef(-1);
  const filteredDriftRef = useRef(0);
  const audioClockInitializedRef = useRef(false);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    document.body.dataset.gameState = gameState;
    document.body.dataset.downscroll = playerInfo.downscroll ? 'true' : 'false';
    document.body.dataset.landscape = 'true';
    return () => {
      delete document.body.dataset.gameState;
      delete document.body.dataset.downscroll;
      delete document.body.dataset.landscape;
    };
  }, [gameState, playerInfo.downscroll]);

  useEffect(() => {
    return () => {
      if (synthGenre) {
        MenuMusicEngine.stop();
      }
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.src = '';
      }
    };
  }, [synthGenre]);

  // Pre-decode equipped custom hit sound into Web Audio API for zero-latency mobile touch playback
  useEffect(() => {
    const p = playerInfo.equippedHitSound;
    if (!p) return;
    if (p.kind === 'pack' && Array.isArray(p.sounds)) {
      p.sounds.forEach((url) => {
        if (url) void AudioEngine.preloadBuffer(url);
      });
    } else if (p.sound) {
      void AudioEngine.preloadBuffer(p.sound);
    }
  }, [playerInfo.equippedHitSound]);

  const stateBeforeInterruption = useRef<'countdown' | 'playing' | 'finished' | null>(null);
  useEffect(() => {
    if (interruptionActive && gameState !== 'interrupted') {
      stateBeforeInterruption.current = gameState;
      if (synthGenre) MenuMusicEngine.stop();
      bgmRef.current?.pause();
      setGameState('interrupted');
    } else if (!interruptionActive && gameState === 'interrupted') {
      const resumeState = stateBeforeInterruption.current || 'playing';
      stateBeforeInterruption.current = null;
      lastTimeRef.current = performance.now();
      setGameState(resumeState);
      if (resumeState === 'playing') {
        if (synthGenre) {
          MenuMusicEngine.start(synthGenre, modifiers?.speed || 1);
        } else if (bgmRef.current && song.audioUrl) {
          bgmRef.current.play().catch(() => {});
        }
      }
    }
  }, [interruptionActive, gameState, song.audioUrl, synthGenre, modifiers?.speed]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    if (showHapticsModal || showLayoutModal) {
      if (synthGenre) MenuMusicEngine.stop();
      bgmRef.current?.pause();
    } else {
      lastTimeRef.current = performance.now();
      filteredDriftRef.current = 0;
      if (synthGenre) {
        MenuMusicEngine.start(synthGenre, modifiers?.speed || 1);
      } else if (bgmRef.current && song.audioUrl && bgmRef.current.paused) {
        bgmRef.current.play().catch(() => {});
      }
    }
  }, [showHapticsModal, showLayoutModal, gameState, song.audioUrl, synthGenre, modifiers?.speed]);

  const isVS = gameMode === 'online_vs';
  const isBattleRoyale = gameMode === 'battle_royale';

  useEffect(() => {
    if (!isBattleRoyale || gameState !== 'playing') return;
    const names = [
      'Nova', 'Pixel', 'Rift', 'Tempo', 'Volt', 'Echo', 'Luna', 'Dash',
      'Beat', 'Flux', 'Zen', 'Koi', 'Aero', 'Vex', 'Mira', 'Jinx',
    ];
    if (!brBots.current.length) {
      brBots.current = Array.from({ length: 49 }, (_, i) => {
        const rating = 1 + Math.floor(Math.random() * 9) * 0.5;
        return {
          id: i + 1,
          name: `${names[i % names.length]}-${String(i + 1).padStart(2, '0')}`,
          rating,
          score: 0,
          health: 100,
          alive: true,
          index: 0,
          misses: 0,
          hits: 0,
          pressed: [0, 0, 0, 0],
          nextOffset: null,
          lastJudgment: '',
          lastJudgeAt: 0,
          resolved: new Uint8Array(0),
          resolvedAt: new Float64Array(0),
        };
      });
    }
    let lastBrUiSyncAt = 0;
    const tick = setInterval(() => {
      if (modalPausedRef.current) return;
      const audioTime = smoothAudioTimeRef.current || virtualTimeRef.current;
      const chart = mapRef.current;
      for (const bot of brBots.current) {
        if (!bot.alive) continue;
        while (bot.index < chart.length) {
          if (bot.resolved.length !== chart.length) {
            bot.resolved = new Uint8Array(chart.length);
            bot.resolvedAt = new Float64Array(chart.length);
          }
          const upcoming = chart[bot.index];
          if (bot.nextOffset === null) {
            bot.nextOffset =
              (Math.random() * 2 - 1) * (235 - Math.max(1, bot.rating - brLoopRef.current * 0.035) * 38);
          }
          if (upcoming.time + bot.nextOffset > audioTime) break;
          const noteIndex = bot.index;
          const n = chart[bot.index++];
          if (n.type === 'demon') {
            bot.resolved[noteIndex] = 1;
            bot.nextOffset = null;
            continue;
          }
          const fatigue = brLoopRef.current * 0.035;
          const effectiveRating = Math.max(1, bot.rating - fatigue);
          const acc = Math.min(0.992, 0.47 + effectiveRating * 0.102);
          const hit = Math.random() < acc;
          const error = Math.abs(bot.nextOffset || 0);
          bot.nextOffset = null;
          if (hit) {
            const sick = error <= HIT_WINDOWS.sick;
            const good = error <= HIT_WINDOWS.good;
            const award = sick ? 350 : good ? 200 : 50;
            bot.score += award;
            bot.health = Math.min(100, bot.health + (sick ? 0.12 : 0.04));
            bot.hits++;
            bot.pressed[n.lane % 4] = performance.now() + (n.type === 'hold' ? Math.min(900, n.duration || 500) : 145);
            bot.lastLane = n.lane % 4;
            bot.lastJudgment = sick ? 'SICK!!' : good ? 'GOOD' : 'BAD';
            bot.lastJudgeAt = performance.now();
            bot.resolved[noteIndex] = 1;
            bot.resolvedAt[noteIndex] = bot.lastJudgeAt;
          } else {
            bot.health -= 7 + brLoopRef.current * 1.8 + (5 - effectiveRating) * 1.8;
            bot.misses++;
            bot.resolved[noteIndex] = 2;
            bot.lastJudgment = 'MISS';
            bot.lastJudgeAt = performance.now();
            bot.resolvedAt[noteIndex] = bot.lastJudgeAt;
            if (bot.health <= 0) bot.alive = false;
          }
        }
      }
      const alive = brBots.current.filter((b) => b.alive).length + (playerEliminated ? 0 : 1);
      const nowTick = performance.now();
      if (nowTick - lastBrUiSyncAt >= 250 || alive <= 1) {
        lastBrUiSyncAt = nowTick;
        setBrAlive(alive);
        const rows: BRBoardRow[] = [
          ...brBots.current.filter((b) => b.alive).map((b) => ({ ...b, isPlayer: false })),
          ...(playerEliminated
            ? []
            : [
                {
                  id: 'you',
                  name: 'YOU',
                  score: playerScoreRef.current,
                  health: playerHealthRef.current,
                  isPlayer: true,
                  alive: true,
                },
              ]),
        ].sort((a, b) => b.score - a.score);
        setBrBoard(rows.slice(0, 8));
      }
      if (alive <= 1) setGameState('finished');
    }, 90);
    return () => clearInterval(tick);
  }, [isBattleRoyale, gameState, playerEliminated]);

  const heroMode = !isVS && (playerInfo.activeGameMods || []).includes('rhythm_hero');
  const activeCustomLanes = !isVS && !heroMode ? effectiveControlLayout.landscapeLanes : null;
  const activeCustomLanesRef = useRef(activeCustomLanes);
  activeCustomLanesRef.current = activeCustomLanes;

  const playfieldLayout = useMemo(
    () =>
      getPlayfieldLayout({
        isLandscape: true,
        isVS,
        downscroll: playerInfo.downscroll,
        heroMode,
        customLanes: activeCustomLanes,
        laneCount: isVS ? 4 : liveExtraNotes,
        fromLaneCount: isVS ? 4 : liveExtraNotes,
        transitionProgress: 1,
        transitionType: liveTransitionType,
      }),
    [isVS, playerInfo.downscroll, heroMode, activeCustomLanes, liveExtraNotes, liveTransitionType]
  );
  const playfieldLayoutRef = useRef(playfieldLayout);
  playfieldLayoutRef.current = playfieldLayout;

  const currentSkinColors =
    playerInfo.equippedSkin === 'custom'
      ? playerInfo.customColors
      : SKINS[playerInfo.equippedSkin]?.colors || SKINS.default.colors;
  const currentSkinShape = playerInfo.equippedShape || 'arrow';
  const baseGameplaySkinColors = isBattleRoyale ? SKINS.default.colors : currentSkinColors;
  // Expanded 8-lane colors where lanes 4..7 are the exact opposite RGB color of their predecessor 0..3
  const gameplaySkinColors = useMemo(
    () => getExpandedLaneColors(baseGameplaySkinColors, 8),
    [baseGameplaySkinColors]
  );
  const gameplaySkinShape = isBattleRoyale ? 'arrow' : currentSkinShape;
  const gameplayNoteProduct = isBattleRoyale ? null : playerInfo.equippedNoteProduct;

  useEffect(() => {
    prewarmNoteSprites(
      playfieldLayout.noteSize,
      gameplaySkinColors,
      gameplaySkinShape,
      gameplayNoteProduct
    );
  }, [playfieldLayout.noteSize, gameplaySkinColors, gameplaySkinShape, gameplayNoteProduct]);

  const handleSelectExtraNotes = useCallback(
    (nextLanes: ExtraNotesCount) => {
      const prevLanes = liveExtraNotesRef.current;
      if (prevLanes !== nextLanes) {
        manualExpansionRef.current = {
          fromLanes: prevLanes,
          toLanes: nextLanes,
          startedAtMs: performance.now(),
          durationMs: Math.max(100, Math.round(liveTransitionSpeedRef.current * 1000)),
          transitionType: liveTransitionTypeRef.current,
        };
      }
      setLiveExtraNotes(nextLanes);
    },
    []
  );

  const triggerDjRecordStop = useCallback((durationSec = 1.4) => {
    const durMs = Math.max(400, Math.round(durationSec * 1000));
    djBrakeRef.current = {
      active: true,
      startedAtMs: performance.now(),
      durationMs: durMs,
    };
    setDjStopActive(true);
    AudioEngine.playVinylStopSound(durationSec);
    setTimeout(() => {
      setDjStopActive(false);
    }, durMs + 150);
  }, []);

  const updateAccuracySafe = useCallback(() => {
    const nextAcc = Math.floor((stats.current.hits / Math.max(1, stats.current.total)) * 100);
    if (nextAcc !== lastAccuracyRef.current) {
      lastAccuracyRef.current = nextAcc;
      setAccuracy(nextAcc);
    }
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 200);
  }, []);

  const customSoundCache = useRef<Record<string, HTMLAudioElement>>({});
  const playGameplayHit = useCallback(
    (lane: number) => {
      const p = playerInfo.equippedHitSound;
      const url = p ? (p.kind === 'pack' ? p.sounds?.[lane % 4] : p.sound) : null;
      if (!url) {
        AudioEngine.playHitSound();
        return;
      }
      // Web Audio pre-decoded playback eliminates <audio> clone touch latency on iOS/Android
      if (AudioEngine.playCachedBuffer(url, 0.7)) return;
      try {
        let a = customSoundCache.current[url];
        if (!a) {
          a = new Audio(url);
          a.preload = 'auto';
          customSoundCache.current[url] = a;
        }
        const clone = a.cloneNode() as HTMLAudioElement;
        clone.volume = 0.7;
        clone.play().catch(() => AudioEngine.playHitSound());
      } catch {
        AudioEngine.playHitSound();
      }
    },
    [playerInfo.equippedHitSound]
  );

  const productEffect = useCallback(
    (id: string) => {
      if (isBattleRoyale) return 0;
      const f = playerInfo.equippedNoteProduct?.effects?.find((x) => x.id === id);
      return f ? Math.max(0.01, (f.intensity || 50) / 100) : 0;
    },
    [isBattleRoyale, playerInfo.equippedNoteProduct]
  );

  const spawnJudgment = useCallback(
    (text: string, color: string, isPlayer = true) => {
      const layout = playfieldLayoutRef.current;
      const playerCenter =
        layout.playerLaneXs.length >= 4
          ? (layout.playerLaneXs[0] + layout.playerLaneXs[3] + layout.noteSize) / 2
          : layout.width / 2;
      const oppCenter =
        layout.opponentLaneXs.length >= 4
          ? (layout.opponentLaneXs[0] + layout.opponentLaneXs[3] + layout.noteSize) / 2
          : layout.width * 0.75;
      const targetX = heroMode ? layout.width - 58 : isPlayer ? playerCenter : oppCenter;
      activeJudgments.current.push({
        text,
        time: performance.now(),
        x: targetX,
        y: heroMode ? layout.height * 0.34 : layout.height * 0.46,
        color,
        compact: heroMode,
      });
    },
    [heroMode]
  );

  const effectCooldowns = useRef<Record<string, number>>({});
  const triggerProductEffects = useCallback(
    (baseScore = 350, note: ChartNote | null = null) => {
      const product = isBattleRoyale ? null : playerInfo.equippedNoteProduct;
      if (!product?.effects) return 0;
      let bonus = 0;
      const visual = (label: string, color = product.fill || '#fff', freq = 700) => {
        spawnJudgment(label, color, true);
        hitBursts.current.push({
          lane: note?.lane ?? Math.floor(Math.random() * 4),
          time: performance.now(),
          color,
        });
        AudioEngine.playTone(freq, 'triangle', 0.07, 0.028);
      };
      const once = (id: string, ms: number, fn: () => void) => {
        const now = performance.now();
        if ((effectCooldowns.current[id] || 0) <= now) {
          effectCooldowns.current[id] = now + ms;
          fn();
        }
      };
      const curCombo = comboRef.current;
      const curHealth = playerHealthRef.current;
      product.effects.forEach((f) => {
        const k = Math.max(0.01, (f.intensity || 50) / 100);
        switch (f.id) {
          case 'score_boost':
            bonus += Math.round(baseScore * k);
            break;
          case 'heal':
            setHealth((h) => Math.min(100, h + 10 * k));
            visual('HEAL', '#4ade80', 620);
            break;
          case 'combo_guard':
            once(f.id, 2500, () => visual('COMBO GUARD', '#67e8f9', 880));
            break;
          case 'coin_bonus':
            addRewards(0, Math.max(1, Math.round(2 * k)));
            visual('+COIN', '#facc15', 980);
            break;
          case 'xp_bonus':
            addRewards(Math.max(1, Math.round(5 * k)), 0);
            visual('+XP', '#a78bfa', 760);
            break;
          case 'wide_window':
            bonus += Math.round(25 * k);
            visual('WIDE', '#38bdf8', 540);
            break;
          case 'perfect_lock':
            bonus += Math.round(70 * k);
            visual('LOCK', '#22d3ee', 1080);
            break;
          case 'double_hit':
            bonus += Math.round(baseScore * 0.65 * k);
            setTimeout(() => AudioEngine.playHitSound(), 70);
            visual('ECHO', '#f0abfc', 820);
            break;
          case 'shield':
            setHealth((h) => Math.min(100, h + 4 * k));
            visual('SHIELD', '#60a5fa', 500);
            break;
          case 'life_steal':
            setHealth((h) => Math.min(100, h + (baseScore * k) / 100));
            visual('DRAIN', '#fb7185', 420);
            break;
          case 'fever':
            bonus += Math.round((curCombo + 1) * 12 * k);
            setIsPulsing(true);
            setTimeout(() => setIsPulsing(false), 180);
            visual('FEVER', '#fb3bc7', 920);
            break;
          case 'slow_time':
            once(f.id, 5000, () => {
              if (bgmRef.current) {
                const r = bgmRef.current.playbackRate;
                bgmRef.current.playbackRate = Math.max(0.25, r * (1 - 0.18 * k));
                setTimeout(() => {
                  if (bgmRef.current) bgmRef.current.playbackRate = r;
                }, 350 + 650 * k);
              }
              visual('TIME BEND', '#818cf8', 330);
            });
            break;
          case 'speed_burst':
            once(f.id, 5000, () => {
              if (bgmRef.current) {
                const r = bgmRef.current.playbackRate;
                bgmRef.current.playbackRate = Math.min(4, r * (1 + 0.2 * k));
                setTimeout(() => {
                  if (bgmRef.current) bgmRef.current.playbackRate = r;
                }, 300 + 500 * k);
              }
              visual('OVERDRIVE', '#f97316', 1200);
            });
            break;
          case 'gravity':
            setShake(true);
            setTimeout(() => setShake(false), 120 + 250 * k);
            visual('GRAVITY FLIP', '#c084fc', 280);
            break;
          case 'lane_shuffle':
            once(f.id, 3500, () => {
              mapRef.current
                .filter((n) => !n.hit && !n.missed && n.time > (bgmRef.current?.currentTime || 0) * 1000)
                .slice(0, Math.ceil(3 + 5 * k))
                .forEach((n) => {
                  n.lane = n.lane < 4 ? Math.floor(Math.random() * 4) : n.lane;
                });
              visual('LANE WARP', '#2dd4bf', 670);
            });
            break;
          case 'rainbow':
            ['#ef4444', '#facc15', '#4ade80', '#38bdf8', '#c084fc'].forEach((c, i) =>
              setTimeout(
                () =>
                  hitBursts.current.push({
                    lane: ((note?.lane ?? 0) + i) % 4,
                    time: performance.now(),
                    color: c,
                  }),
                i * 25
              )
            );
            break;
          case 'explosion':
            for (let i = 0; i < Math.ceil(3 + 8 * k); i++) {
              hitBursts.current.push({ lane: i % 4, time: performance.now() - i * 12, color: '#fb923c' });
            }
            visual('NOVA', '#fb923c', 180);
            break;
          case 'freeze':
            once(f.id, 4500, () => {
              if (bgmRef.current) {
                bgmRef.current.pause();
                setTimeout(() => bgmRef.current?.play().catch(() => {}), 80 + 180 * k);
              }
              visual('FREEZE', '#bae6fd', 1400);
            });
            break;
          case 'screen_pulse':
            setIsPulsing(true);
            setTimeout(() => setIsPulsing(false), 130 + 350 * k);
            break;
          case 'shake':
            setShake(true);
            setTimeout(() => setShake(false), 100 + 300 * k);
            break;
          case 'ghost':
            bonus += Math.round(40 * k);
            visual('GHOST', '#d1d5db', 390);
            break;
          case 'spark':
            for (let i = 0; i < 4; i++) {
              setTimeout(
                () =>
                  hitBursts.current.push({
                    lane: Math.floor(Math.random() * 4),
                    time: performance.now(),
                    color: '#fff',
                  }),
                i * 30
              );
            }
            break;
          case 'flame':
            visual('FLAME', '#ef4444', 240);
            setHealth((h) => Math.min(100, h + 3 * k));
            break;
          case 'ice':
            visual('ICE', '#7dd3fc', 1350);
            bonus += Math.round(45 * k);
            break;
          case 'lightning':
            visual('ZAP', '#fef08a', 1550);
            bonus += Math.round(80 * k);
            break;
          case 'void':
            visual('VOID', '#6d28d9', 90);
            bonus += Math.round(100 * k);
            break;
          case 'gold_rush':
            bonus += Math.round(150 * k);
            visual('GOLD', '#facc15', 1100);
            break;
          case 'accuracy_save':
            bonus += Math.round(30 * k);
            visual('STABLE', '#34d399', 610);
            break;
          case 'hold_power':
            if (note?.type === 'hold') {
              bonus += Math.round(baseScore * 1.5 * k);
              visual('HOLD POWER', '#a78bfa', 740);
            }
            break;
          case 'chord_power': {
            const chord = mapRef.current.filter((n) => Math.abs(n.time - (note?.time ?? -999)) < 2).length;
            if (chord > 1) {
              bonus += Math.round(baseScore * k * chord);
              visual('CHORD x' + chord, '#22d3ee', 900);
            }
            break;
          }
          case 'streak_heal':
            if ((curCombo + 1) % 10 === 0) {
              setHealth((h) => Math.min(100, h + 15 * k));
              visual('STREAK HEAL', '#86efac', 640);
            }
            break;
          case 'streak_score':
            bonus += Math.round(Math.min(500, curCombo * 3) * k);
            break;
          case 'risk_reward':
            bonus += Math.round(baseScore * 1.8 * k);
            setHealth((h) => Math.max(1, h - 3 * k));
            visual('RISK', '#f43f5e', 260);
            break;
          case 'last_stand':
            if (curHealth < 20) {
              setHealth((h) => Math.max(h, 5 + 15 * k));
              visual('LAST STAND', '#f97316', 200);
            }
            break;
          case 'auto_sick':
            bonus += Math.random() < k * 0.35 ? Math.round(200 * k) : 0;
            visual('LUCK', '#e879f9', 1000);
            break;
          case 'demon_ward':
            setHealth((h) => Math.min(100, h + 2 * k));
            visual('WARD', '#ddd6fe', 460);
            break;
          case 'pulse_blast':
            setIsPulsing(true);
            setTimeout(() => setIsPulsing(false), 200 + 400 * k);
            bonus += Math.round(60 * k);
            break;
          case 'mirror_flash':
            setShake(true);
            setTimeout(() => setShake(false), 80);
            visual('MIRROR', '#f9a8d4', 830);
            break;
          case 'tiny_notes':
            bonus += Math.round(35 * k);
            visual('MINI', '#93c5fd', 1250);
            break;
          case 'giant_notes':
            bonus += Math.round(90 * k);
            visual('GIANT', '#fdba74', 160);
            break;
          case 'jackpot':
            if (Math.random() < 0.06 + 0.12 * k) {
              bonus += Math.round(3000 * k);
              visual('JACKPOT!', '#fde047', 1600);
            }
            break;
          case 'revive':
            if (curHealth < 10 && Math.random() < 0.25 + 0.5 * k) {
              setHealth(30 + 30 * k);
              visual('PHOENIX', '#fb923c', 520);
            }
            break;
        }
      });
      return bonus;
    },
    [addRewards, isBattleRoyale, playerInfo.equippedNoteProduct, spawnJudgment]
  );

  useEffect(() => {
    if (networkConnection && isVS) {
      const onData = (data: any) => {
        if (data?.type === 'score_update') setOpponentScore(data.score);
      };
      networkConnection.on('data', onData);
      return () => networkConnection.off?.('data', onData);
    }
  }, [networkConnection, isVS]);

  // Zero-delay imperative lane input handler shared by keyboard, gamepad, direct receptor canvas touch, and optional pads
  const handleLaneInput = useCallback(
    (laneIdx: number, isDown: boolean) => {
      if (isBattleRoyale && playerEliminatedRef.current) return;
      if (laneIdx < 0 || laneIdx > 7) return;
      if (isDown && keysPressed.current[laneIdx]) return;
      keysPressed.current[laneIdx] = isDown;
      if (isDown) {
        lanePressAtRef.current[laneIdx] = performance.now();
      }
      if (gameStateRef.current !== 'playing') return;

      const loopBoost = gameMode === 'endless' || isBattleRoyale ? Math.pow(1.15, loopCountRef.current) : 1;
      const targetRate = Math.min(4, (modifiers?.speed || 1) * loopBoost);
      const inDemonMode = performance.now() < demonEndTime.current;
      const frameDeltaMs = Math.max(0, Math.min(25, performance.now() - lastTimeRef.current));
      const currentAudioTime =
        smoothAudioTimeRef.current + frameDeltaMs * targetRate * (inDemonMode ? 0.5 : 1);

      if (!isDown) {
        const held = mapRef.current.find(
          (n) => n.lane === laneIdx && n.type === 'hold' && n.holding && !n.hit && !n.missed
        );
        if (held && currentAudioTime < held.time + (held.duration || 500) - HIT_WINDOWS.sick) {
          held.holding = false;
          held.missed = true;
          stats.current.total++;
          stats.current.miss++;
          setCombo(0);
          setHealth((h) =>
            modifiers?.noFail ? Math.max(1, h - 8) : modifiers?.extreme ? 0 : Math.max(0, h - 8)
          );
          updateAccuracySafe();
          spawnJudgment('LET GO!', '#ef4444', true);
          triggerShake();
          triggerHaptic('miss', hapticsRef.current);
        }
        return;
      }

      if (playerInfo.botplay) return;
      const activeHitWindow = HIT_WINDOWS.miss * (1 + productEffect('wide_window') * 0.8);
      const targetNote = mapRef.current.find(
        (n) =>
          n.lane === laneIdx &&
          !n.hit &&
          !n.missed &&
          !n.holding &&
          Math.abs(n.time - currentAudioTime) < activeHitWindow
      );

      if (targetNote) {
        laneHitAtRef.current[laneIdx] = performance.now();
        if (targetNote.type === 'hold') {
          targetNote.holding = true;
          targetNote.holdStartedAt = currentAudioTime;
          spawnJudgment('HOLD', '#a78bfa', true);
          AudioEngine.playTone(520, 'sine', 0.08, 0.04);
          if (hapticsRef.current.triggers.onHoldTick) {
            triggerHaptic('holdTick', hapticsRef.current);
          } else {
            triggerHaptic('press', hapticsRef.current);
          }
          return;
        }
        targetNote.hit = true;

        if (targetNote.type === 'demon') {
          if (productEffect('demon_ward') && Math.random() < productEffect('demon_ward')) {
            spawnJudgment('WARD!', '#ddd6fe', true);
            triggerHaptic('press', hapticsRef.current);
            return;
          }
          // Never kill or drop below 10 HP in No Fail mode when hitting a demon note
          setHealth((h) => (modifiers?.noFail ? Math.max(10, h - 25) : 1));
          setCombo(0);
          demonEndTime.current = performance.now() + 5000;
          spawnJudgment(modifiers?.noFail ? 'DEMON (NO FAIL)' : 'DEMON!', '#ef4444', true);
          AudioEngine.playDemonSound();
          triggerShake();
          triggerHaptic('demon', hapticsRef.current);
        } else {
          stats.current.total++;
          const diff = Math.abs(targetNote.time - currentAudioTime);
          const evaluated = evaluateHitTiming(diff, productEffect('perfect_lock'));
          stats.current[evaluated.bucket]++;
          stats.current.hits += evaluated.hitWeight;

          if (evaluated.breaksCombo) setCombo(0);
          if (evaluated.bucket === 'miss') triggerShake();

          const bonusScore = triggerProductEffects(evaluated.addScore, targetNote);
          const totalAdd = evaluated.addScore + bonusScore;
          setScore((s) => {
            const newScore = s + totalAdd;
            if (isVS && networkConnection) networkConnection.send({ type: 'score_update', score: newScore });
            return newScore;
          });

          setHealth((h) =>
            modifiers?.noFail
              ? Math.max(1, Math.min(100, h + evaluated.heal))
              : modifiers?.extreme && evaluated.bucket === 'miss'
              ? 0
              : Math.min(100, Math.max(0, h + evaluated.heal))
          );

          let milestoneHit = false;
          if (!evaluated.breaksCombo) {
            const nextCombo = comboRef.current + 1;
            milestoneHit = nextCombo > 0 && nextCombo % 25 === 0;
            setCombo((c) => {
              const nc = c + 1;
              setMaxCombo((p) => (nc > p ? nc : p));
              return nc;
            });
          }

          updateAccuracySafe();
          spawnJudgment(evaluated.judgment, evaluated.color, true);
          hitBursts.current.push({ lane: laneIdx, time: performance.now(), color: evaluated.color });
          playGameplayHit(laneIdx);

          if (evaluated.bucket === 'miss') {
            triggerHaptic('miss', hapticsRef.current);
          } else if (milestoneHit && hapticsRef.current.triggers.onComboMilestone) {
            triggerHaptic('comboMilestone', hapticsRef.current);
          } else if (hapticsRef.current.triggers.onHit) {
            triggerHaptic('hit', hapticsRef.current, evaluated.bucket);
          } else {
            triggerHaptic('press', hapticsRef.current);
          }
        }
      } else {
        triggerHaptic('press', hapticsRef.current);
        setHealth((h) => (modifiers?.noFail ? Math.max(1, h - 1) : Math.max(0, h - 1)));
      }
    },
    [
      gameMode,
      isBattleRoyale,
      isVS,
      modifiers,
      networkConnection,
      playGameplayHit,
      playerInfo.botplay,
      productEffect,
      spawnJudgment,
      triggerProductEffects,
      triggerShake,
      updateAccuracySafe,
    ]
  );

  const handleLaneDown = useCallback((lane: number) => handleLaneInput(lane, true), [handleLaneInput]);
  const handleLaneUp = useCallback((lane: number) => handleLaneInput(lane, false), [handleLaneInput]);

  // Wireless / Bluetooth / Hardware Keyboard listener (Arrow, WASD, IJKL, ZXCV via e.code & e.key for up to 8 lanes)
  useEffect(() => {
    const resolveKeyLane = (e: KeyboardEvent): number | undefined => {
      const byCode = KEY_CODE_MAP[e.code];
      if (byCode !== undefined) return byCode;
      return KEY_MAP[e.key.toLowerCase()];
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Enter', 'Backspace'].includes(e.key) ||
        e.altKey ||
        e.ctrlKey
      ) {
        e.preventDefault();
      }
      const laneIdx = resolveKeyLane(e);
      if (laneIdx !== undefined) handleLaneInput(laneIdx, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const laneIdx = resolveKeyLane(e);
      if (laneIdx !== undefined) handleLaneInput(laneIdx, false);
    };
    const releaseAll = () => {
      for (let i = 0; i < 8; i++) {
        if (keysPressed.current[i]) handleLaneInput(i, false);
      }
    };
    const onVisChange = () => {
      if (document.hidden) releaseAll();
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [handleLaneInput]);

  // Direct zero-latency multi-touch tapping on the gray receptor notes & canvas lanes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointerToLane = new Map<number, number>();

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      AudioEngine.init();
      const rect = canvas.getBoundingClientRect();
      const layout = playfieldLayoutRef.current;
      const canvasX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * layout.width;
      const canvasY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * layout.height;
      const lane = getLaneFromPlayfieldPoint(canvasX, canvasY, layout);
      if (lane === null) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      pointerToLane.set(e.pointerId, lane);
      handleLaneInput(lane, true);
    };

    const onPointerRelease = (e: PointerEvent) => {
      const lane = pointerToLane.get(e.pointerId);
      if (lane === undefined) return;
      pointerToLane.delete(e.pointerId);
      handleLaneInput(lane, false);
    };

    const blockTouch = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointerup', onPointerRelease);
    window.addEventListener('pointercancel', onPointerRelease);
    canvas.addEventListener('touchstart', blockTouch, { passive: false });
    canvas.addEventListener('touchmove', blockTouch, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
      canvas.removeEventListener('touchstart', blockTouch);
      canvas.removeEventListener('touchmove', blockTouch);
    };
  }, [gameState, handleLaneInput, isVS]);

  useEffect(() => {
    if (health <= 0 && gameState === 'playing' && !modifiers?.noFail) {
      if (isBattleRoyale) {
        activeJudgments.current = [];
        hitBursts.current = [];
        keysPressed.current = [false, false, false, false, false, false, false, false];
        setPlayerEliminated(true);
        const first = brBots.current.find((b) => b.alive);
        setSpectateBotId(first?.id || null);
      } else {
        setGameState('finished');
      }
    }
  }, [health, gameState, isBattleRoyale, modifiers?.noFail]);

  useEffect(() => {
    if (gameState === 'countdown') {
      const delayMs = initialStartTimeMs > 0 || onExitPlaytest ? 450 : 3000;
      const timer = setTimeout(() => {
        setGameState('playing');
        const now = performance.now();
        startTime.current = now;
        lastTimeRef.current = now;
        const startOffsetMs = Math.max(0, Number(initialStartTimeMs) || 0);
        smoothAudioTimeRef.current = startOffsetMs;
        lastRawAudioTimeRef.current = startOffsetMs > 0 ? startOffsetMs : -1;
        filteredDriftRef.current = 0;
        audioClockInitializedRef.current = startOffsetMs > 0;
        virtualTimeRef.current = startOffsetMs;
        lastStepClickRef.current = -1;
        firedDjTriggerIdsRef.current.clear();
        AudioEngine.init();
        if (synthGenre) {
          MenuMusicEngine.start(synthGenre, modifiers?.speed || 1);
        } else if (bgmRef.current && song.audioUrl) {
          bgmRef.current.volume = 0.5;
          bgmRef.current.playbackRate = modifiers?.speed || 1;
          if (startOffsetMs > 0) {
            try {
              bgmRef.current.currentTime = startOffsetMs / 1000;
            } catch {}
          }
          (bgmRef.current as any).preservesPitch = false;
          bgmRef.current.play().catch(() => {});
        }

        const hasAuthoredChart = Array.isArray(song?.customMap) || Array.isArray(customBeatmap);
        const authoredSource = Array.isArray(song?.customMap) ? song.customMap : customBeatmap;
        if (hasAuthoredChart) {
          let map: ChartNote[] = normalizeChart(authoredSource).map((n) => ({
            ...n,
            hit: startOffsetMs > 0 && n.time < startOffsetMs - 80,
            missed: false,
          }));
          if (map.length === 0) {
            console.error('Authored chart contains no valid notes', authoredSource);
            spawnJudgment('EMPTY CHART', '#ef4444', true);
          }
          if (isVS) {
            const vsMap: ChartNote[] = [];
            map.forEach((n) => {
              vsMap.push({ ...n, lane: n.lane % 4, isBot: true });
              vsMap.push({ ...n, lane: (n.lane % 4) + 4, isBot: false });
            });
            map = vsMap;
          }
          mapRef.current = map;
        } else {
          const generated = generateBeatmap(Number(song.bpm) || 120, 0, 180, difficulty, gameMode);
          mapRef.current = generated.map((n) => ({
            ...n,
            hit: startOffsetMs > 0 && n.time < startOffsetMs - 80,
          }));
        }
        if (modifiers?.altChart) mapRef.current = createAltChart(mapRef.current);
        if (modifiers?.nerf) mapRef.current = applyNerfChart(mapRef.current, modifiers.nerf, song.id || song.title);
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, [
    gameState,
    customBeatmap,
    difficulty,
    gameMode,
    isVS,
    song,
    modifiers,
    spawnJudgment,
    synthGenre,
    initialStartTimeMs,
    onExitPlaytest,
  ]);

  useEffect(() => {
    if (gameState === 'finished') {
      if (!rewardsProcessed.current) {
        rewardsProcessed.current = true;
        addRewards(Math.floor(score / 200), Math.floor(score / 500));
        recordGrade?.(song.id, accuracy);
        onGradeUpdate?.(getGrade(accuracy));
      }
      if (synthGenre) {
        MenuMusicEngine.stop();
      }
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.playbackRate = 1;
      }
      return () => {
        if (bgmRef.current) bgmRef.current.playbackRate = 1;
      };
    }
  }, [gameState, accuracy, addRewards, recordGrade, onGradeUpdate, score, song.id, synthGenre]);

  useEffect(() => {
    if (gameState !== 'finished') return;
    const highKey = `rhythmCanvasHigh_${song.id}_${difficulty}`;
    const oldHigh = Number(safeGetStorage(highKey) || 0);
    setPreviousHigh(oldHigh);
    const fresh = score > oldHigh;
    setIsNewHigh(fresh);
    if (fresh) safeSetStorage(highKey, String(score));
    setDisplayScore(0);
    const steps = 36;
    const increment = Math.max(1, Math.ceil(Math.max(0, score) / steps));
    let resultsAudioStarted = false;
    const startResultsAudio = () => {
      if (resultsAudioStarted) return;
      resultsAudioStarted = true;
      const resultTrack = bgmRef.current;
      if (resultTrack && song.audioUrl && !synthGenre) {
        resultTrack.pause();
        (resultTrack as any).preservesPitch = false;
        (resultTrack as any).mozPreservesPitch = false;
        (resultTrack as any).webkitPreservesPitch = false;
        resultTrack.playbackRate = 0.6;
        resultTrack.currentTime = 0;
        resultTrack.volume = 0.34;
        if (song.coverUrl) {
          resultPulseDetach.current?.();
          resultPulseDetach.current = WaveformPulse.attach(
            resultTrack,
            `[data-results-wave-cover="${String(song.id)}"]`
          );
        }
        resultTrack.play().catch((e) => console.warn('Slowed results audio could not play', e));
      }
    };
    const counter = setInterval(() => {
      setDisplayScore((v) => {
        const next = Math.min(score, v + increment);
        AudioEngine.playTone(280 + Math.min(500, (next / Math.max(1, score)) * 500), 'square', 0.025, 0.018);
        if (next >= score) {
          clearInterval(counter);
          setTimeout(startResultsAudio, 180);
        }
        return next;
      });
    }, 35);
    return () => {
      clearInterval(counter);
      resultsAudioStarted = true;
      resultPulseDetach.current?.();
      resultPulseDetach.current = null;
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.playbackRate = 1;
      }
    };
  }, [gameState, score, song.id, song.audioUrl, song.coverUrl, difficulty, synthGenre]);

  const retryTrack = () => {
    if (synthGenre) {
      MenuMusicEngine.stop();
    }
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = Math.max(0, Number(initialStartTimeMs) || 0) / 1000;
      bgmRef.current.volume = 0.5;
    }
    stats.current = { hits: 0, total: 0, sick: 0, good: 0, bad: 0, miss: 0 };
    rewardsProcessed.current = false;
    lastPulseIdx.current = 0;
    lastStepClickRef.current = -1;
    lastAccuracyRef.current = 100;
    virtualTimeRef.current = Math.max(0, Number(initialStartTimeMs) || 0);
    smoothAudioTimeRef.current = Math.max(0, Number(initialStartTimeMs) || 0);
    lastRawAudioTimeRef.current = -1;
    filteredDriftRef.current = 0;
    audioClockInitializedRef.current = false;
    loopCountRef.current = 0;
    djBrakeRef.current = { active: false, startedAtMs: 0, durationMs: 1400 };
    firedDjTriggerIdsRef.current.clear();
    brBots.current = [];
    setBrBoard([]);
    setPlayerEliminated(false);
    setSpectateBotId(null);
    setBrAlive(50);
    setScore(0);
    setDisplayScore(0);
    setCombo(0);
    setMaxCombo(0);
    setHealth(50);
    setAccuracy(100);
    setSongProgressPct(0);
    setLoopCount(0);
    setIsNewHigh(false);
    setGameState('countdown');
  };

  const handleLaneInputRef = useRef(handleLaneInput);
  handleLaneInputRef.current = handleLaneInput;
  const modifiersRef = useRef(modifiers);
  modifiersRef.current = modifiers;
  const songRef = useRef(song);
  songRef.current = song;
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;
  const botplayRef = useRef(playerInfo.botplay);
  botplayRef.current = playerInfo.botplay;
  const downscrollRef = useRef(playerInfo.downscroll);
  downscrollRef.current = playerInfo.downscroll;
  const skinColorsRef = useRef(gameplaySkinColors);
  skinColorsRef.current = gameplaySkinColors;
  const skinShapeRef = useRef(gameplaySkinShape);
  skinShapeRef.current = gameplaySkinShape;
  const noteProductRef = useRef(gameplayNoteProduct);
  noteProductRef.current = gameplayNoteProduct;
  const playGameplayHitRef = useRef(playGameplayHit);
  playGameplayHitRef.current = playGameplayHit;
  const productEffectRef = useRef(productEffect);
  productEffectRef.current = productEffect;
  const spawnJudgmentRef = useRef(spawnJudgment);
  spawnJudgmentRef.current = spawnJudgment;
  const triggerProductEffectsRef = useRef(triggerProductEffects);
  triggerProductEffectsRef.current = triggerProductEffects;
  const triggerShakeRef = useRef(triggerShake);
  triggerShakeRef.current = triggerShake;
  const updateAccuracySafeRef = useRef(updateAccuracySafe);
  updateAccuracySafeRef.current = updateAccuracySafe;
  const setScreenRef = useRef(setScreen);
  setScreenRef.current = setScreen;
  const spectateBotIdRef = useRef(spectateBotId);
  spectateBotIdRef.current = spectateBotId;
  const triggerDjRecordStopRef = useRef(triggerDjRecordStop);
  triggerDjRecordStopRef.current = triggerDjRecordStop;

  useEffect(() => {
    if (gameState !== 'playing') return;
    let activeCanvas: HTMLCanvasElement | null = canvasRef.current;
    let activeCtx = activeCanvas
      ? (activeCanvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null)
      : null;
    if (!activeCtx) return;

    const loop = () => {
      const currentCanvas = canvasRef.current;
      if (currentCanvas && currentCanvas !== activeCanvas) {
        activeCanvas = currentCanvas;
        activeCtx = currentCanvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
      }
      if (!activeCtx) {
        reqRef.current = requestAnimationFrame(loop);
        return;
      }
      const ctx = activeCtx;
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;
      if (modalPausedRef.current) {
        reqRef.current = requestAnimationFrame(loop);
        return;
      }
      const clampedDt = Math.max(0, Math.min(50, dt));

      // Poll wireless/USB Gamepads every 60fps frame with edge detection
      const gp = pollActiveGamepadLanes();
      for (let gi = 0; gi < 4; gi++) {
        if (gp.lanes[gi] !== prevGamepadLanesRef.current[gi]) {
          prevGamepadLanesRef.current[gi] = gp.lanes[gi];
          handleLaneInputRef.current(gi, gp.lanes[gi]);
        }
      }
      if (gp.startPressed && !prevGamepadStartRef.current && now - startTime.current > 800) {
        prevGamepadStartRef.current = true;
        setScreenRef.current('freeplay');
        return;
      }
      prevGamepadStartRef.current = gp.startPressed;

      const curMods = modifiersRef.current;
      const curSong = songRef.current;
      const curDifficulty = difficultyRef.current;
      const curBotplay = botplayRef.current;
      const curDownscroll = downscrollRef.current;
      const curSkinColors = skinColorsRef.current;
      const curSkinShape = skinShapeRef.current;
      const curNoteProduct = noteProductRef.current;
      const curEliminated = playerEliminatedRef.current;
      const curSpectateBotId = spectateBotIdRef.current;

      // DJ Record Stopping brake factor (decelerates both audio playback AND chart scroll speed in sync)
      let vinylBrakeFactor = 1;
      if (djBrakeRef.current.active) {
        const brakeElapsed = now - djBrakeRef.current.startedAtMs;
        const brakeDur = djBrakeRef.current.durationMs;
        if (brakeElapsed < brakeDur) {
          const p = brakeElapsed / brakeDur;
          // Smooth vinyl brake curve down to 0.06x then spin-back recovery in final 20%
          if (p < 0.78) {
            const k = p / 0.78;
            vinylBrakeFactor = Math.max(0.06, Math.pow(1 - k, 2.2));
          } else {
            const k = (p - 0.78) / 0.22;
            vinylBrakeFactor = 0.06 + 0.94 * (k * k);
          }
        } else {
          djBrakeRef.current.active = false;
          vinylBrakeFactor = 1;
        }
      }

      const inDemonMode = now < demonEndTime.current;
      const loopBoost = gameMode === 'endless' || isBattleRoyale ? Math.pow(1.15, loopCountRef.current) : 1;
      const targetRate = Math.min(4, (curMods?.speed || 1) * loopBoost);
      const effectiveRate = Math.max(0.06, targetRate * (inDemonMode ? 0.5 : 1) * vinylBrakeFactor);

      let currentAudioTime = 0;
      const bgm = bgmRef.current;
      if (!synthGenre && bgm && curSong.audioUrl && bgm.readyState >= 2 && !bgm.paused) {
        if (Math.abs(bgm.playbackRate - effectiveRate) > 0.002) {
          (bgm as any).preservesPitch = false;
          (bgm as any).mozPreservesPitch = false;
          (bgm as any).webkitPreservesPitch = false;
          bgm.playbackRate = effectiveRate;
        }
        // Monotonic frame-rate clock with heavily damped low-pass slew eliminates mobile audio currentTime 30Hz sawtooth stutter
        smoothAudioTimeRef.current += clampedDt * effectiveRate;
        const rawAudioTime = bgm.currentTime * 1000;
        if (!audioClockInitializedRef.current && rawAudioTime > 0) {
          audioClockInitializedRef.current = true;
          smoothAudioTimeRef.current = rawAudioTime;
          lastRawAudioTimeRef.current = rawAudioTime;
          filteredDriftRef.current = 0;
        } else if (Math.abs(rawAudioTime - lastRawAudioTimeRef.current) > 0.5) {
          lastRawAudioTimeRef.current = rawAudioTime;
          const drift = rawAudioTime - smoothAudioTimeRef.current;
          if (Math.abs(drift) > 180) {
            smoothAudioTimeRef.current = rawAudioTime;
            filteredDriftRef.current = 0;
          } else {
            filteredDriftRef.current = filteredDriftRef.current * 0.85 + drift * 0.15;
          }
        }
        const maxSlew = 0.55;
        const slew = Math.max(-maxSlew, Math.min(maxSlew, filteredDriftRef.current * 0.08));
        smoothAudioTimeRef.current += slew;
        filteredDriftRef.current -= slew;
        currentAudioTime = smoothAudioTimeRef.current;
      } else {
        if (synthGenre) {
          MenuMusicEngine.setPlaybackRate(effectiveRate);
        }
        virtualTimeRef.current += clampedDt * effectiveRate;
        smoothAudioTimeRef.current = virtualTimeRef.current;
        currentAudioTime = virtualTimeRef.current;
      }

      // Check chart-authored DJ Record Stop triggers
      if (Array.isArray(curSong.triggers)) {
        for (const trig of curSong.triggers) {
          if (
            trig.type === 'dj_stop' &&
            currentAudioTime >= trig.time &&
            currentAudioTime <= trig.time + 250 &&
            !firedDjTriggerIdsRef.current.has(trig.id)
          ) {
            firedDjTriggerIdsRef.current.add(trig.id);
            triggerDjRecordStopRef.current(trig.djStopDuration || 1.4);
            spawnJudgmentRef.current('DJ RECORD STOP!', '#f43f5e', true);
          }
        }
      }

      // Update Song Completion Percentage Bar (0% -> 100%)
      const lastChartNoteTime = mapRef.current.length > 0 ? mapRef.current[mapRef.current.length - 1].time : 60000;
      const audioDurMs =
        bgm && Number.isFinite(bgm.duration) && bgm.duration > 1 ? bgm.duration * 1000 : lastChartNoteTime + 2000;
      const totalTrackMs = Math.max(1000, Math.min(audioDurMs, lastChartNoteTime + 2500));
      const rawPct = Math.max(0, Math.min(100, (currentAudioTime / totalTrackMs) * 100));
      if (now - lastProgressSyncRef.current > 90 || rawPct >= 99.9) {
        lastProgressSyncRef.current = now;
        setSongProgressPct(Number(rawPct.toFixed(1)));
      }

      if (curSong.stepClick) {
        const subdiv = Math.max(1, Number(curSong.stepSubdivision) || 4);
        const stepMs = 60000 / (Math.max(1, Number(curSong.bpm) || 120) * subdiv);
        const step = Math.floor(currentAudioTime / stepMs);
        if (step !== lastStepClickRef.current) {
          lastStepClickRef.current = step;
          const accent = step % subdiv === 0;
          AudioEngine.playTone(accent ? 1050 : 720, 'square', accent ? 0.035 : 0.018, accent ? 0.035 : 0.018);
        }
      }

      if (curSong.pulses && lastPulseIdx.current < curSong.pulses.length) {
        if (currentAudioTime >= curSong.pulses[lastPulseIdx.current]) {
          setIsPulsing(true);
          setTimeout(() => setIsPulsing(false), 150);
          lastPulseIdx.current++;
        }
      }

      // Compute active Extra Notes expansion state (4, 6, or 8 lanes) + PowerPoint transition progress
      let expansionState = getActiveLaneExpansionState(
        curSong.triggers,
        currentAudioTime,
        liveExtraNotesRef.current,
        liveTransitionTypeRef.current,
        liveTransitionSpeedRef.current
      );
      if (manualExpansionRef.current) {
        const man = manualExpansionRef.current;
        const elapsed = now - man.startedAtMs;
        if (elapsed < man.durationMs) {
          expansionState = {
            laneCount: man.toLanes,
            fromLaneCount: man.fromLanes,
            transitionProgress: Math.max(0, Math.min(1, elapsed / man.durationMs)),
            transitionType: man.transitionType,
            transitionSpeedSec: man.durationMs / 1000,
          };
        } else {
          manualExpansionRef.current = null;
        }
      }

      const activePlayerLaneCount: ExtraNotesCount = isVS ? 4 : expansionState.laneCount;

      // Dynamically widen playscreen while keeping noteSize = 74 identical to 4-note default and preserving player's lane spacing ratio
      const dynamicLayout = getPlayfieldLayout({
        isLandscape: true,
        isVS,
        downscroll: curDownscroll,
        heroMode,
        customLanes: activeCustomLanesRef.current,
        laneCount: activePlayerLaneCount,
        fromLaneCount: isVS ? 4 : expansionState.fromLaneCount,
        transitionProgress: expansionState.transitionProgress,
        transitionType: expansionState.transitionType,
      });
      playfieldLayoutRef.current = dynamicLayout;
      if (activeCanvas && (activeCanvas.width !== dynamicLayout.width || activeCanvas.height !== dynamicLayout.height)) {
        activeCanvas.width = dynamicLayout.width;
        activeCanvas.height = dynamicLayout.height;
        activeCanvas.style.aspectRatio = `${dynamicLayout.width} / ${dynamicLayout.height}`;
      }

      const layout = dynamicLayout;
      const songBpm = Math.max(60, Number(curSong.bpm) || 120);
      const beatMs = 60000 / songBpm;
      const beatPhase = ((currentAudioTime % beatMs) + beatMs) % beatMs / beatMs;
      const beatPulse = Math.pow(Math.max(0, 1 - beatPhase * 1.8), 2);

      ctx.fillStyle = '#060811';
      ctx.fillRect(0, 0, layout.width, layout.height);

      // Subtle BPM-reactive background pulse & horizon grid
      if (!heroMode) {
        ctx.save();
        ctx.strokeStyle = curSong.color || '#36e2ff';
        ctx.globalAlpha = 0.06 + beatPulse * 0.09;
        ctx.lineWidth = 1.5;
        const gridSpacing = 56;
        const gridOffset = ((currentAudioTime * 0.18) % gridSpacing) * (curDownscroll ? 1 : -1);
        for (let gy = -gridSpacing; gy < layout.height + gridSpacing; gy += gridSpacing) {
          const yLine = gy + gridOffset;
          ctx.beginPath();
          ctx.moveTo(0, yLine);
          ctx.lineTo(layout.width, yLine);
          ctx.stroke();
        }
        // High-combo neon edge aura (10x / 25x / 50x+)
        if (comboRef.current >= 10) {
          const streakIntensity = Math.min(1, (comboRef.current - 5) / 45);
          ctx.strokeStyle = comboRef.current >= 25 ? '#ff2e88' : '#36e2ff';
          ctx.globalAlpha = (0.2 + beatPulse * 0.35) * streakIntensity;
          ctx.lineWidth = 4 + beatPulse * 4;
          ctx.strokeRect(2, 2, layout.width - 4, layout.height - 4);
        }
        ctx.restore();
      } else {
        ctx.drawImage(getHeroHighway(layout.width, layout.height), 0, 0);
      }

      // Draw PowerPoint-style lane expansion transition overlay on playscreen widening
      if (!heroMode && expansionState.transitionProgress < 1) {
        drawExpansionTransitionOverlay(
          ctx,
          layout.width,
          layout.height,
          expansionState.transitionType,
          expansionState.transitionProgress,
          curSong.color || '#36e2ff'
        );
      }

      // Speed Trigger multiplier preserves exact difficulty speed ratio AND syncs with DJ Record Stop brake
      const activeSpeedMultiplier = getActiveSpeedMultiplierAtTime(
        curSong.triggers,
        currentAudioTime,
        liveSpeedTriggerRef.current
      );
      const visualSpeed = getEffectiveScrollSpeed(curDifficulty, activeSpeedMultiplier) * vinylBrakeFactor;

      let activeNotesRemaining = false;
      let anyHolding = false;
      const laneHolding = [false, false, false, false, false, false, false, false];
      if (!(curEliminated && isBattleRoyale)) {
        mapRef.current.forEach((note, noteIndex) => {
          // If Extra Notes (6 or 8 lanes) is active on a 4-lane chart, deterministically expand select notes into lanes 4..7
          if (!isVS && activePlayerLaneCount > 4 && note.lane < 4 && (note as any)._baseLane === undefined) {
            (note as any)._baseLane = note.lane;
          }
          if (!isVS && (note as any)._baseLane !== undefined) {
            const baseL = (note as any)._baseLane as number;
            if (activePlayerLaneCount > 4 && noteIndex % 3 === 1) {
              note.lane = (baseL + 4) % activePlayerLaneCount;
            } else {
              note.lane = baseL;
            }
          }

          if (!note.hit && !note.missed) {
            activeNotesRemaining = true;
            const isPlayerNote = isVS ? note.lane < 4 : note.lane < activePlayerLaneCount;
            if (note.holding && isPlayerNote) {
              anyHolding = true;
              laneHolding[note.lane] = true;
            }

            if (
              note.type === 'hold' &&
              note.holding &&
              isPlayerNote &&
              currentAudioTime >= note.time + (note.duration || 500) - HIT_WINDOWS.sick
            ) {
              note.holding = false;
              note.hit = true;
              laneHitAtRef.current[note.lane] = now;
              if (curBotplay) keysPressed.current[note.lane] = false;
              stats.current.total++;
              stats.current.hits++;
              stats.current.sick++;
              const holdAward = 500 + triggerProductEffectsRef.current(500, note);
              setScore((v) => v + holdAward);
              setHealth((h) => Math.min(100, h + 3));
              setCombo((c) => {
                const nc = c + 1;
                setMaxCombo((p) => Math.max(p, nc));
                return nc;
              });
              updateAccuracySafeRef.current();
              spawnJudgmentRef.current('SICK!!', '#a78bfa', true);
              hitBursts.current.push({ lane: note.lane, time: performance.now(), color: '#a78bfa' });
              playGameplayHitRef.current(note.lane);
              triggerHaptic('hit', hapticsRef.current, 'sick');
            }
            if (
              curBotplay &&
              note.type === 'hold' &&
              isPlayerNote &&
              currentAudioTime >= note.time &&
              !note.holding
            ) {
              note.holding = true;
              laneHolding[note.lane] = true;
              laneHitAtRef.current[note.lane] = now;
              keysPressed.current[note.lane] = true;
            }

            if (
              curBotplay &&
              note.type !== 'hold' &&
              note.type !== 'demon' &&
              isPlayerNote &&
              currentAudioTime >= note.time
            ) {
              note.hit = true;
              laneHitAtRef.current[note.lane] = now;
              stats.current.total++;
              stats.current.hits++;
              stats.current.sick++;
              const botAward = 350 + triggerProductEffectsRef.current(350, note);
              setScore((s) => s + botAward);
              setHealth((h) => Math.min(100, h + 2));
              setCombo((c) => {
                const nc = c + 1;
                setMaxCombo((p) => (nc > p ? nc : p));
                return nc;
              });
              if (lastAccuracyRef.current !== 100) {
                lastAccuracyRef.current = 100;
                setAccuracy(100);
              }
              spawnJudgmentRef.current('BOT SICK!!', '#facc15', true);
              hitBursts.current.push({ lane: note.lane, time: performance.now(), color: '#facc15' });
              playGameplayHitRef.current(note.lane);
              keysPressed.current[note.lane] = true;
              setTimeout(() => {
                if (!mapRef.current.some((n) => n.lane === note.lane && n.holding && !n.hit && !n.missed)) {
                  keysPressed.current[note.lane] = false;
                }
              }, 70);
            }

            if (isVS && note.lane >= 4 && currentAudioTime >= note.time) {
              if (note.type !== 'demon') {
                note.hit = true;
                spawnJudgmentRef.current('SICK!!', '#00ffff', false);
              }
            }
            if (note.hit) return;

            const noteDeadline = note.time + (note.type === 'hold' ? note.duration || 500 : 0) + HIT_WINDOWS.miss;
            if (isPlayerNote && !note.holding && currentAudioTime > noteDeadline) {
              note.missed = true;
              if (note.type === 'demon') {
                spawnJudgmentRef.current('DODGED', '#a855f7', true);
              } else {
                // Demon mode never kills the player when No Fail mode is active!
                if (inDemonMode) {
                  setHealth((h) => (curMods?.noFail ? Math.max(1, h - 10) : 0));
                } else {
                  const reduction = Math.min(
                    0.9,
                    productEffectRef.current('shield') * 0.65 + productEffectRef.current('accuracy_save') * 0.35
                  );
                  setHealth((h) =>
                    curMods?.noFail
                      ? Math.max(1, h - 4 * (1 - reduction))
                      : curMods?.extreme
                      ? 0
                      : Math.max(0, h - 4 * (1 - reduction))
                  );
                }
                if (!productEffectRef.current('combo_guard') || Math.random() > productEffectRef.current('combo_guard'))
                  setCombo(0);

                stats.current.total++;
                stats.current.miss++;
                updateAccuracySafeRef.current();

                spawnJudgmentRef.current('MISS', '#ef4444', true);
                triggerShakeRef.current();
                triggerHaptic('miss', hapticsRef.current);
              }
            }
          }
        });
      }

      if (anyHolding && now - lastHoldHapticAtRef.current >= 115) {
        lastHoldHapticAtRef.current = now;
        triggerHaptic('holdTick', hapticsRef.current);
      }

      const lastNoteTime = mapRef.current.length > 0 ? mapRef.current[mapRef.current.length - 1].time : 0;
      if (gameMode !== 'endless' && !isBattleRoyale && !activeNotesRemaining && currentAudioTime > lastNoteTime + 2500) {
        setSongProgressPct(100);
        setGameState('finished');
        return;
      }

      const watchedBot =
        curEliminated && isBattleRoyale ? brBots.current.find((b) => b.id === curSpectateBotId) : null;

      // FNF lane tracks + pressed receptor laser beams + hit-pop flash (supports 4, 6, or 8 lanes)
      if (!heroMode) {
        for (let i = 0; i < activePlayerLaneCount; i++) {
          const lx = layout.playerLaneXs[i];
          const ly = layout.playerLaneYs[i] ?? layout.receptorY;
          if (lx === undefined) continue;
          const isPressed =
            curEliminated && isBattleRoyale ? (watchedBot?.pressed?.[i % 4] || 0) > now : keysPressed.current[i];
          const hitAge = now - (laneHitAtRef.current[i] || 0);
          const hitGlow = hitAge >= 0 && hitAge < 180 ? 1 - hitAge / 180 : 0;
          const laneCol = curSkinColors[i % curSkinColors.length] || '#ffffff';

          if (layout.isLandscape) {
            ctx.fillStyle = isPressed || hitGlow > 0 ? laneCol : '#ffffff';
            ctx.globalAlpha = isPressed ? 0.18 + hitGlow * 0.14 : 0.035 + beatPulse * 0.015;
            ctx.fillRect(lx - 6, 0, layout.noteSize + 12, layout.height);
          } else if (isPressed || hitGlow > 0) {
            ctx.fillStyle = laneCol;
            ctx.globalAlpha = 0.16 + hitGlow * 0.12;
            ctx.fillRect(lx - 4, 0, layout.noteSize + 8, layout.height);
          }
          if (isPressed || hitGlow > 0) {
            ctx.globalAlpha = Math.max(isPressed ? 0.55 : 0, hitGlow * 0.85);
            ctx.strokeStyle = laneCol;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(
              lx + layout.noteSize / 2,
              ly + layout.noteSize / 2,
              layout.noteSize * (0.56 + hitGlow * 0.18),
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }
        }
        if (layout.isVS && layout.opponentLaneXs.length === 4) {
          const splitX = (layout.playerLaneXs[3] + layout.noteSize + layout.opponentLaneXs[0]) / 2;
          ctx.globalAlpha = 0.25;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(splitX, 16);
          ctx.lineTo(splitX, layout.height - 16);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Draw Receptors with elastic press-squash, hit-pop spring animation & PowerPoint expansion transforms
      const numLanes = isVS ? 8 : activePlayerLaneCount;
      for (let i = 0; i < numLanes; i++) {
        const isOpponentLane = isVS && i >= 4;
        const x = isOpponentLane ? layout.opponentLaneXs[i - 4] : layout.playerLaneXs[i];
        const y = isOpponentLane ? layout.receptorY : layout.playerLaneYs[i] ?? layout.receptorY;
        if (x === undefined) continue;
        const laneIdx = isOpponentLane ? i - 4 : i;
        const isPressed = isOpponentLane
          ? false
          : curEliminated && isBattleRoyale
          ? (watchedBot?.pressed?.[laneIdx % 4] || 0) > now
          : keysPressed.current[laneIdx];

        let receptorScale = 1 + beatPulse * 0.03;
        if (!isOpponentLane) {
          const hitAge = now - (laneHitAtRef.current[laneIdx] || 0);
          const pressAge = now - (lanePressAtRef.current[laneIdx] || 0);
          if (hitAge >= 0 && hitAge < 190) {
            const p = hitAge / 190;
            receptorScale = 1 + Math.sin(p * Math.PI) * 0.34 * (1 - p * 0.4);
          } else if (pressAge >= 0 && pressAge < 130) {
            const p = pressAge / 130;
            receptorScale = 1 - Math.sin(p * Math.PI) * 0.16;
          }
        }

        const hitColorActive =
          !isOpponentLane && (now - (laneHitAtRef.current[laneIdx] || 0) < 95 || laneHolding[laneIdx]);
        const laneColor = curSkinColors[laneIdx % curSkinColors.length];
        const laneTransform = !isOpponentLane ? layout.laneTransforms?.[laneIdx] : undefined;
        drawNote(
          ctx,
          x,
          y,
          layout.noteSize,
          laneIdx,
          hitColorActive ? laneColor : null,
          isPressed,
          curSkinShape,
          'normal',
          curNoteProduct,
          receptorScale,
          laneTransform
        );
      }

      if (watchedBot && now - (watchedBot.lastJudgeAt || 0) < 360 && watchedBot.lastLane !== undefined) {
        const life = (now - watchedBot.lastJudgeAt) / 360;
        const lane = watchedBot.lastLane;
        const x = (layout.playerLaneXs[lane] ?? 20) + layout.noteSize / 2;
        const y = (layout.playerLaneYs[lane] ?? layout.receptorY) + layout.noteSize / 2;
        ctx.save();
        ctx.globalAlpha = 1 - life;
        ctx.strokeStyle = watchedBot.lastJudgment === 'MISS' ? '#ef4444' : '#22d3ee';
        ctx.lineWidth = 7 * (1 - life) + 2;
        ctx.beginPath();
        ctx.arc(x, y, 18 + life * 45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.globalAlpha = (1 - life) * 0.28;
        ctx.beginPath();
        ctx.arc(x, y, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const renderLeadMs = heroMode ? 1450 : (layout.height + 160) / Math.max(0.15, visualSpeed);
      mapRef.current.forEach((note, noteIndex) => {
        if (!isVS && note.lane >= activePlayerLaneCount) return;
        if (
          (watchedBot?.resolved?.[noteIndex] &&
            !(watchedBot.resolved[noteIndex] === 1 && now - (watchedBot.resolvedAt?.[noteIndex] || 0) < 180)) ||
          (!curEliminated && (note.hit || note.missed)) ||
          (!note.holding &&
            (note.time - currentAudioTime > renderLeadMs ||
              currentAudioTime - note.time > Math.max(HIT_WINDOWS.miss + 80, note.duration || 0)))
        ) {
          return;
        }
        const isOppNote = isVS && note.lane >= 4;
        const laneY = isOppNote ? layout.receptorY : layout.playerLaneYs[note.lane] ?? layout.receptorY;
        let y =
          watchedBot?.resolved?.[noteIndex] === 1 && now - (watchedBot.resolvedAt?.[noteIndex] || 0) < 180
            ? laneY
            : note.holding
            ? laneY
            : curDownscroll
            ? laneY - (note.time - currentAudioTime) * visualSpeed
            : laneY + (note.time - currentAudioTime) * visualSpeed;
        let heroScale = 1;
        if (heroMode) {
          const farY = 55;
          const nearY = layout.height - 105;
          const travel = Math.max(0, Math.min(1, 1 - (note.time - currentAudioTime) / 1100));
          y = farY + (nearY - farY) * travel * travel;
          heroScale = 0.38 + 0.62 * travel;
        }
        if (y > -100 && y < layout.height + 100) {
          let x = isOppNote
            ? layout.opponentLaneXs[note.lane - 4] ?? 400
            : layout.playerLaneXs[note.lane] ?? 20;
          if (heroMode) {
            const cx = layout.width / 2;
            const farHalf = layout.width * 0.14;
            const nearHalf = layout.width * 0.47;
            const q = Math.max(0, Math.min(1, (y - 55) / (layout.height - 160)));
            const half = farHalf + (nearHalf - farHalf) * q;
            const laneW = (half * 2) / activePlayerLaneCount;
            const size = layout.noteSize * heroScale;
            x = cx - half + (note.lane % activePlayerLaneCount) * laneW + (laneW - size) / 2;
          }
          const colorIdx = isOppNote ? (note.lane - 4) % 4 : note.lane % curSkinColors.length;
          const noteColor = curSkinColors[colorIdx];
          if (note.type === 'hold') {
            const remain = note.holding
              ? Math.max(0, note.time + (note.duration || 500) - currentAudioTime)
              : note.duration || 500;
            const tail = remain * visualSpeed * (curDownscroll ? -1 : 1);
            drawHoldTail(
              ctx,
              x,
              y,
              layout.noteSize,
              tail,
              noteColor,
              Boolean(note.holding),
              currentAudioTime
            );
          }

          // Subtle BPM-synced note pulse + approach pop when entering perfect hit zone
          const timeDist = Math.abs(note.time - currentAudioTime);
          const approachPop = timeDist < HIT_WINDOWS.sick ? (1 - timeDist / HIT_WINDOWS.sick) * 0.08 : 0;
          const noteAnimScale = note.holding
            ? 1.1 + 0.06 * Math.sin(currentAudioTime * 0.03)
            : 1 + beatPulse * 0.045 + approachPop;
          const laneTransform = !isOppNote ? layout.laneTransforms?.[note.lane] : undefined;

          drawNote(
            ctx,
            x,
            y,
            heroMode ? layout.noteSize * heroScale : layout.noteSize,
            isOppNote ? note.lane - 4 : note.lane,
            noteColor,
            false,
            curSkinShape,
            note.type,
            curNoteProduct,
            noteAnimScale,
            laneTransform
          );
        }
      });

      if (heroMode) {
        if (hitBursts.current.length) hitBursts.current = [];
      } else if (hitBursts.current.length) {
        hitBursts.current = hitBursts.current.filter((b) => now - b.time < 440);
        hitBursts.current.forEach((b) => {
          const life = (now - b.time) / 440;
          const easeOut = 1 - Math.pow(1 - life, 2.4);
          const laneIdx = b.lane % activePlayerLaneCount;
          const x = (layout.playerLaneXs[laneIdx] ?? 20) + layout.noteSize / 2;
          const y = (layout.playerLaneYs[laneIdx] ?? layout.receptorY) + layout.noteSize / 2;
          ctx.save();
          // Outer neon shockwave ring
          ctx.strokeStyle = b.color;
          ctx.globalAlpha = (1 - life) * 0.95;
          ctx.lineWidth = 8 * (1 - life) + 2;
          ctx.beginPath();
          ctx.arc(x, y, 20 + easeOut * 68, 0, Math.PI * 2);
          ctx.stroke();

          // Inner white flash ring
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = Math.max(0, 1 - life * 1.45) * 0.85;
          ctx.lineWidth = 4 * (1 - life) + 1;
          ctx.beginPath();
          ctx.arc(x, y, 12 + easeOut * 44, 0, Math.PI * 2);
          ctx.stroke();

          // 8 directional diamond/chevron shards + rays
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4 + life * 0.35;
            const innerR = 22 + easeOut * 28;
            const outerR = 36 + easeOut * 64;
            ctx.strokeStyle = i % 2 === 0 ? '#ffffff' : b.color;
            ctx.globalAlpha = 1 - life;
            ctx.lineWidth = i % 2 === 0 ? 3.5 : 2.5;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * innerR, y + Math.sin(a) * innerR);
            ctx.lineTo(x + Math.cos(a) * outerR, y + Math.sin(a) * outerR);
            ctx.stroke();

            // Diamond shard at tip
            const sx = x + Math.cos(a) * (outerR + 5);
            const sy = y + Math.sin(a) * (outerR + 5);
            const shardSize = Math.max(1.5, (1 - life) * 5.5);
            ctx.fillStyle = i % 2 === 0 ? b.color : '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, shardSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        });
      }

      if (watchedBot && now - (watchedBot.lastJudgeAt || 0) < 520) {
        const life = (now - watchedBot.lastJudgeAt) / 520;
        ctx.save();
        ctx.globalAlpha = 1 - life;
        ctx.textAlign = 'center';
        ctx.font = '900 italic 42px Saira, sans-serif';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#000';
        ctx.fillStyle =
          watchedBot.lastJudgment === 'MISS'
            ? '#ef4444'
            : watchedBot.lastJudgment === 'SICK!!'
            ? '#22d3ee'
            : '#facc15';
        ctx.strokeText(watchedBot.lastJudgment, layout.width / 2, layout.height * 0.42 - life * 25);
        ctx.fillText(watchedBot.lastJudgment, layout.width / 2, layout.height * 0.42 - life * 25);
        ctx.restore();
      }

      if (activeJudgments.current.length) {
        activeJudgments.current = activeJudgments.current.filter((j) => now - j.time < 800);
        activeJudgments.current.forEach((j) => {
          const age = now - j.time;
          const life = age / 800;
          const yOffset = life * 48;
          // Elastic pop-in scale in the first 120ms (1.42 -> 1.0)
          const popScale = age < 120 ? 1 + 0.42 * (1 - age / 120) : 1;
          ctx.save();
          ctx.translate(j.x, j.y - yOffset);
          ctx.scale(popScale, popScale);
          ctx.globalAlpha = 1 - Math.pow(life, 3);
          ctx.fillStyle = j.color;
          ctx.font = j.compact ? '900 italic 25px Saira, sans-serif' : '900 italic 48px Saira, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = j.compact ? 4 : 7;
          ctx.strokeStyle = '#05070f';
          ctx.strokeText(j.text, 0, 0);
          ctx.fillText(j.text, 0, 0);
          ctx.restore();
        });
      }

      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqRef.current);
  }, [gameState, gameMode, isBattleRoyale, isVS, heroMode, synthGenre]);

  const cycleSpectateBot = useCallback(
    (dir: 1 | -1) => {
      const alive = brBots.current.filter((b) => b.alive);
      if (!alive.length) return;
      let i = alive.findIndex((b) => b.id === spectateBotId);
      if (i < 0) i = 0;
      i = (i + dir + alive.length) % alive.length;
      setSpectateBotId(alive[i].id);
    },
    [spectateBotId]
  );

  useEffect(() => {
    if (!isBattleRoyale || !playerEliminated) return;
    const cycle = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      cycleSpectateBot(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', cycle, { capture: true });
    return () => window.removeEventListener('keydown', cycle, { capture: true });
  }, [isBattleRoyale, playerEliminated, cycleSpectateBot]);

  const inDemonModeNow = performance.now() < demonEndTime.current;
  const spectatedBot = isBattleRoyale && playerEliminated ? brBots.current.find((b) => b.id === spectateBotId) : null;

  return (
    <div
      className={`w-full h-[100dvh] relative flex flex-col justify-between overflow-hidden transition-colors duration-500 ${
        inDemonModeNow ? 'bg-red-950' : 'reboot-shell'
      }`}
    >
      <audio
        ref={bgmRef}
        src={synthGenre ? undefined : song.audioUrl || undefined}
        preload="auto"
        playsInline
        onLoadedMetadata={() => setAudioStatus('ready')}
        onCanPlayThrough={() => setAudioStatus('ready')}
        onWaiting={() => setAudioStatus('buffering')}
        onEnded={() => {
          if (gameMode === 'endless' || isBattleRoyale) {
            loopCountRef.current += 1;
            setLoopCount(loopCountRef.current);
            const rate = (modifiers?.speed || 1) * Math.pow(1.15, loopCountRef.current);
            mapRef.current = mapRef.current.map((n) => ({ ...n, hit: false, missed: false }));
            stats.current = { hits: 0, total: 0, sick: 0, good: 0, bad: 0, miss: 0 };
            if (isBattleRoyale) {
              brLoopRef.current++;
              brBots.current.forEach((b) => {
                if (b.alive) {
                  b.index = 0;
                  b.nextOffset = null;
                  b.resolved = new Uint8Array(mapRef.current.length);
                  b.resolvedAt = new Float64Array(mapRef.current.length);
                }
              });
            }
            if (bgmRef.current) {
              bgmRef.current.currentTime = 0;
              smoothAudioTimeRef.current = 0;
              lastRawAudioTimeRef.current = -1;
              filteredDriftRef.current = 0;
              audioClockInitializedRef.current = false;
              bgmRef.current.playbackRate = Math.min(rate, 4);
              bgmRef.current.play().catch(() => {});
            }
          }
        }}
        onError={(e) => {
          if (song.audioUrl) {
            console.warn('Track audio failed.', e);
            setAudioStatus('error');
          }
        }}
        className="hidden"
      />

      {song.coverUrl && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img
            src={song.coverUrl}
            referrerPolicy="no-referrer"
            className="absolute inset-[-6%] w-[112%] h-[112%] object-cover opacity-40 scale-110"
            style={{ filter: 'blur(26px) saturate(1.4) brightness(.6)', animation: 'none', willChange: 'transform' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/75" />
        </div>
      )}

      <div
        className="absolute inset-0 opacity-35 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at center, ${
            inDemonModeNow ? '#ef4444' : song.color || '#4ade80'
          } 0%, transparent 70%)`,
        }}
      />

      {audioStatus === 'error' && (
        <div className="absolute z-40 top-16 left-1/2 -translate-x-1/2 bg-red-950 border-2 border-red-400 p-3 text-center font-black max-w-xs w-11/12">
          <div className="text-sm">AUDIO COULD NOT LOAD</div>
          <button
            className="mt-2 bg-white text-black px-3 py-1 text-xs font-black"
            onClick={() => {
              const a = bgmRef.current;
              if (a) {
                setAudioStatus('loading');
                a.load();
                a.play().catch(() => setAudioStatus('error'));
              }
            }}
          >
            RETRY AUDIO
          </button>
          <div className="text-[10px] mt-1">Use a direct HTTPS MP3/OGG URL, not a sharing-page link.</div>
        </div>
      )}

      {/* Top Console HUD Bar (respects top-right fullscreen button) */}
      <div
        className={`relative z-20 w-full flex flex-col gap-1 shrink-0 ${
          isLandscapeCompact ? 'pl-2.5 pr-12 pt-1 pb-0.5' : 'pl-4 sm:pl-6 pr-16 md:pr-20 pt-2 sm:pt-2.5'
        }`}
      >
        <div className="w-full flex items-center justify-between gap-2">
          <div className="rc-dock-rail flex items-center gap-1.5 p-1 shrink-0">
            <button
              data-testid="game-exit-btn"
              onClick={() => {
                if (onExitPlaytest) onExitPlaytest();
                else setScreen('freeplay');
              }}
              className={`rc-bevel-btn rc-tile-slate text-white flex items-center justify-center gap-1 font-black whitespace-nowrap ${
                isLandscapeCompact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
              }`}
              aria-label="Exit track"
            >
              <X className={isLandscapeCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
              <span className="hidden md:inline">{onExitPlaytest ? 'RETURN TO EDITOR' : 'EXIT'}</span>
            </button>

            <button
              data-testid="game-dj-stop-btn"
              onClick={() => triggerDjRecordStop(1.4)}
              title="Trigger DJ Record Stop Effect (Synced with Scroll Speed)"
              className={`rc-bevel-btn font-black flex items-center gap-1 whitespace-nowrap ${
                isLandscapeCompact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
              } ${djStopActive ? 'rc-tile-red text-white animate-pulse' : 'rc-tile-violet text-white'}`}
            >
              <Disc3 className={`w-3.5 h-3.5 ${djStopActive ? 'animate-spin' : ''}`} />
              <span>DJ STOP</span>
            </button>

            {!isVS && (
              <button
                data-testid="game-triggers-hud-btn"
                onClick={() => setShowTriggersBar((v) => !v)}
                title="Toggle Live Speed & Extra Notes Triggers Deck"
                className={`rc-bevel-btn font-black flex items-center gap-1 whitespace-nowrap ${
                  isLandscapeCompact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
                } ${showTriggersBar ? 'rc-tile-cyan text-black' : 'rc-tile-slate text-cyan-200'}`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {liveSpeedTrigger.toFixed(2)}x · {liveExtraNotes}L
                </span>
              </button>
            )}
          </div>

          {/* Center Track Info + Live Percentage Progress Bar (0% -> 100%) */}
          <div
            className={`rc-dock-rail flex flex-col justify-center gap-1 min-w-0 flex-1 max-w-[46vw] ${
              isLandscapeCompact ? 'px-2.5 py-1' : 'px-3.5 py-1.5'
            }`}
          >
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3
                  className={`font-black italic text-white uppercase truncate ${
                    isLandscapeCompact ? 'text-xs' : 'text-sm sm:text-base'
                  }`}
                >
                  {song.title}
                </h3>
                <span className="text-[10px] sm:text-xs text-pink-400 font-black uppercase tracking-wider shrink-0 whitespace-nowrap">
                  {gameMode} • {difficulty}
                </span>
              </div>
              <span
                data-testid="game-progress-pct"
                className="text-[11px] sm:text-xs font-black text-cyan-300 tabular-nums shrink-0"
              >
                {songProgressPct.toFixed(1)}%
              </span>
            </div>

            {/* Percentage Bar Tracking Position Throughout Gameplay (0% -> 100%) */}
            <div
              data-testid="game-progress-bar"
              className="w-full h-2 bg-[#07090f] border border-cyan-400/60 rounded-full overflow-hidden shadow-inner"
            >
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-yellow-300 transition-all duration-100 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, songProgressPct))}%` }}
              />
            </div>
          </div>

          <div className="rc-dock-rail flex items-center gap-1.5 p-1 shrink-0">
            {isBattleRoyale && (
              <button
                onClick={() => setShowBrDrawer((v) => !v)}
                className={`lg:hidden rc-bevel-btn rc-tile-gold text-black font-black flex items-center gap-1 whitespace-nowrap ${
                  isLandscapeCompact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" /> {brAlive}/50
              </button>
            )}
            {!isVS && !heroMode && (
              <button
                data-testid="game-layout-btn"
                onClick={() => {
                  triggerHaptic('menuTap', effectiveHaptics);
                  setShowLayoutModal(true);
                }}
                title="Arrange Note Lanes & Note Buttons"
                aria-label="Arrange Note Lanes and Buttons"
                className={`rc-bevel-btn rc-tile-pink text-white font-black flex items-center gap-1 whitespace-nowrap ${
                  isLandscapeCompact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">LAYOUT</span>
              </button>
            )}
            <button
              data-testid="game-haptics-btn"
              onClick={() => {
                triggerHaptic('menuTap', effectiveHaptics);
                setShowHapticsModal(true);
              }}
              title="Haptics Settings"
              aria-label="Haptics Settings"
              className={`rc-bevel-btn font-black flex items-center gap-1 whitespace-nowrap ${
                isLandscapeCompact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
              } ${effectiveHaptics.enabled ? 'rc-tile-gold text-black' : 'rc-tile-slate text-slate-300'}`}
            >
              <Vibrate className="w-3.5 h-3.5" />
              <span className="hidden sm:inline tabular-nums">
                {effectiveHaptics.enabled ? `${effectiveHaptics.intensity}%` : 'OFF'}
              </span>
            </button>
            <button
              data-testid="toggle-pads-btn"
              onClick={() => {
                triggerHaptic('menuTap', effectiveHaptics);
                setShowTouchPads((v) => !v);
              }}
              title="Toggle Extra On-Screen Touch Pads"
              aria-label="Toggle On-Screen Touch Pads"
              className={`rc-bevel-btn font-black flex items-center gap-1 whitespace-nowrap ${
                isLandscapeCompact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
              } ${showTouchPads ? 'rc-tile-cyan text-black' : 'rc-tile-slate text-slate-200'}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{showTouchPads ? 'PADS' : 'NO PADS'}</span>
            </button>
          </div>
        </div>

        {/* Live Gameplay Triggers Strip: 6 Speed Presets + Extra Notes (4/6/8) + 7 PowerPoint Transitions + Transition Speed (0.1s-2.0s) */}
        {showTriggersBar && !isVS && (
          <div
            data-testid="live-triggers-bar"
            className="rc-dock-rail w-full px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-black"
          >
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-amber-300 uppercase mr-1 flex items-center gap-1">
                <Zap className="w-3 h-3" /> SPEED TRIGGER:
              </span>
              {SPEED_TRIGGER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  data-testid={`hud-speed-${preset}`}
                  onClick={() => setLiveSpeedTrigger(preset)}
                  className={`px-2 py-0.5 rounded border transition-all ${
                    liveSpeedTrigger === preset
                      ? 'bg-amber-400 text-black border-white font-black'
                      : 'bg-black/60 text-white/75 border-white/20 hover:bg-white/10'
                  }`}
                >
                  {preset.toFixed(2)}x
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-fuchsia-300 uppercase flex items-center gap-1">
                <Layers className="w-3 h-3" /> EXTRA NOTES:
              </span>
              {EXTRA_NOTES_PRESETS.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  data-testid={`hud-lanes-${cnt}`}
                  onClick={() => handleSelectExtraNotes(cnt)}
                  className={`px-2 py-0.5 rounded border transition-all ${
                    liveExtraNotes === cnt
                      ? 'bg-fuchsia-500 text-white border-white font-black'
                      : 'bg-black/60 text-white/75 border-white/20 hover:bg-white/10'
                  }`}
                >
                  {cnt} LANES
                </button>
              ))}

              <select
                aria-label="Note Expansion Transition"
                value={liveTransitionType}
                onChange={(e) => setLiveTransitionType(e.target.value as ExpansionTransitionType)}
                className="bg-[#0b0e17] border border-fuchsia-400/50 rounded px-2 py-0.5 text-[10px] font-black text-fuchsia-200"
              >
                {EXPANSION_TRANSITIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-1 text-cyan-200">
                <span>{liveTransitionSpeed.toFixed(1)}s</span>
                <input
                  type="range"
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  value={liveTransitionSpeed}
                  onChange={(e) => setLiveTransitionSpeed(Number(parseFloat(e.target.value).toFixed(1)))}
                  className="w-16 accent-fuchsia-400"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Left Active Mods Well */}
      <div className="hidden lg:block absolute left-4 top-24 z-30 rc-panel p-3 text-xs font-black space-y-1">
        <div className="text-cyan-300 tracking-widest">ACTIVE MODS</div>
        <div className="tabular-nums">×{modifiers?.speed?.toFixed(2) || '1.00'} AUDIO</div>
        <div className="text-amber-300 tabular-nums">×{liveSpeedTrigger.toFixed(2)} SCROLL</div>
        <div className="text-fuchsia-300 tabular-nums">{liveExtraNotes} LANES</div>
        {modifiers?.altChart && <div>ALT CHART</div>}
        {modifiers?.nerf > 0 && <div className="text-orange-300 tabular-nums">NERF −{modifiers.nerf}% NOTES</div>}
        {modifiers?.noFail && <div className="text-emerald-400">NO FAIL (DEMON SAFE)</div>}
        {modifiers?.extreme && <div className="text-red-400">EXTREME</div>}
      </div>

      {/* Battle Royale Leaderboard: Right sidebar on lg desktop, toggleable drawer on mobile */}
      {isBattleRoyale && (
        <div
          className={`${
            showBrDrawer ? 'block' : 'hidden lg:block'
          } absolute right-3 top-16 lg:top-20 z-30 rc-panel p-3 w-52 sm:w-56 max-h-[65vh] overflow-y-auto`}
        >
          <div className="flex items-center justify-between">
            <div className="text-yellow-300 text-lg sm:text-xl font-black tabular-nums">{brAlive}/50 ALIVE</div>
            <button onClick={() => setShowBrDrawer(false)} className="lg:hidden text-xs font-black text-slate-300">
              CLOSE
            </button>
          </div>
          <div className="text-[10px] text-emerald-400 font-black">DEFAULT NOTES ENFORCED • BOT LEVELS 1–5</div>
          <div className="text-xs text-cyan-300 mb-2 tabular-nums">
            LOOP {loopCount + 1} • {Math.round(Math.pow(1.15, loopCount) * 100)}%
          </div>
          <div className="space-y-1">
            {brBoard.map((b, i) => (
              <button
                key={b.id}
                disabled={!playerEliminated || b.isPlayer}
                onClick={() => setSpectateBotId(Number(b.id))}
                className={`w-full flex justify-between text-xs px-2 py-1 rounded-lg border ${
                  b.isPlayer
                    ? 'bg-emerald-500 text-black border-black font-black'
                    : spectateBotId === b.id
                    ? 'bg-cyan-400 text-black border-black font-black'
                    : 'bg-[#0d1018] text-white border-white/10'
                }`}
              >
                <span className="truncate">
                  #{i + 1} {b.name}
                  {!b.isPlayer && b.rating !== undefined && <em className="text-cyan-300 ml-1">★{b.rating.toFixed(1)}</em>}
                </span>
                <b className="tabular-nums">{b.score}</b>
              </button>
            ))}
          </div>
          {playerEliminated && (
            <>
              <div className="mt-2 text-red-400 font-black text-center text-xs">ELIMINATED • SPECTATE</div>
              <select
                value={spectateBotId || ''}
                onChange={(e) => setSpectateBotId(Number(e.target.value))}
                className="w-full bg-[#0d1018] border border-cyan-400 rounded-lg p-1 text-xs mt-1 text-white"
              >
                {brBots.current
                  .filter((b) => b.alive)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} • ★{b.rating.toFixed(2)} • {b.score}
                    </option>
                  ))}
              </select>
            </>
          )}
        </div>
      )}

      {isBattleRoyale && playerEliminated && (
        <div className="relative z-30 mx-auto rc-dock-rail px-3 py-1 font-black text-xs sm:text-sm flex items-center gap-2 shrink-0">
          <button
            onClick={() => cycleSpectateBot(-1)}
            className="rc-bevel-btn rc-tile-cyan text-black px-2 py-1 font-black flex items-center"
            aria-label="Previous bot"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <span>
              SPECTATING: {spectatedBot?.name || 'SURVIVOR'} • ★{spectatedBot?.rating?.toFixed(2)}
            </span>
            <span className="text-yellow-300 ml-2">
              {spectatedBot && performance.now() - (spectatedBot.lastJudgeAt || 0) < 500
                ? spectatedBot.lastJudgment
                : ''}
            </span>
          </div>
          <button
            onClick={() => cycleSpectateBot(1)}
            className="rc-bevel-btn rc-tile-cyan text-black px-2 py-1 font-black flex items-center"
            aria-label="Next bot"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {playerInfo.botplay && (
        <div className="hidden lg:block mx-auto z-20 text-yellow-300 font-black text-base animate-pulse rounded-lg border-2 border-yellow-400 bg-[#0d1018]/90 px-4 py-0.5 shrink-0">
          BOTPLAY ENABLED
        </div>
      )}

      {inDemonModeNow && (
        <div className="hidden lg:block mx-auto z-20 text-red-400 font-black text-lg animate-[shake_0.2s_ease-in-out_infinite] rounded-lg border-2 border-red-500 bg-[#0d1018]/95 px-4 py-0.5 shrink-0">
          {modifiers?.noFail ? 'DEMON MODE (NO FAIL PROTECTED)' : 'DEMON MODE: ONE MISS = DEATH'}
        </div>
      )}

      {/* Landscape-Only FNF Playfield Container (widens proportionally for 4, 6, or 8 lanes while keeping noteSize identical) */}
      <div
        data-testid="landscape-playfield"
        className={`relative z-10 flex-1 min-h-0 w-full flex flex-col items-center justify-between px-2 sm:px-4 pb-[max(0.35rem,env(safe-area-inset-bottom))] gap-1.5 ${
          shake ? 'animate-[shake_0.2s_ease-in-out]' : ''
        }`}
      >
        <div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
          <canvas
            ref={canvasRef}
            data-testid="game-canvas"
            data-playfield-mode="fnf-landscape"
            data-active-lanes={liveExtraNotes}
            width={playfieldLayout.width}
            height={playfieldLayout.height}
            style={{ aspectRatio: `${playfieldLayout.width} / ${playfieldLayout.height}`, willChange: 'transform' }}
            className={`touch-surface bg-[#060811] border-4 shadow-[0_10px_28px_rgba(0,0,0,0.7)] rounded-2xl h-full max-h-full max-w-full w-auto object-contain transition-[aspect-ratio] duration-150 ${
              inDemonModeNow ? 'border-red-500' : 'border-white/90'
            } ${isPulsing ? 'pulse-border-active' : ''}`}
          />

          <div
            className={`absolute pointer-events-none flex ${
              heroMode
                ? 'top-3 left-3 w-auto justify-start'
                : `${playerInfo.downscroll ? 'top-[22%]' : 'top-[48%]'} left-0 w-full justify-center text-center`
            }`}
          >
            {combo > 5 && (
              <div
                data-testid="game-combo"
                className={`${
                  heroMode
                    ? 'text-xl bg-[#0d1018] border-2 border-yellow-400 rounded-lg px-2.5 py-0.5 text-left'
                    : 'text-4xl sm:text-5xl'
                } font-black italic text-white drop-shadow-[4px_4px_0_#000] animate-[pulse-fast_0.5s_infinite_alternate] tabular-nums`}
              >
                {combo}
                {heroMode && (
                  <span className="block text-[9px] not-italic tracking-widest text-yellow-300">COMBO</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Console Telemetry Strip */}
        <div className="w-full max-w-[980px] flex flex-col gap-1 shrink-0">
          <div className="rc-dock-rail w-full flex items-center justify-between gap-2 sm:gap-3 px-2.5 py-1.5">
            <div className="rc-dock-well flex items-center gap-2 px-2.5 py-0.5 font-black text-xs sm:text-sm text-white shrink-0 tabular-nums">
              <span data-testid="game-score">SCORE: {spectatedBot ? spectatedBot.score : score}</span>
              {isVS && <span className="text-pink-400">• OPP: {opponentScore}</span>}
            </div>

            <div
              data-testid="game-health"
              className={`flex-1 max-w-[380px] h-3.5 sm:h-4 bg-[#07090f] border-2 rounded-full relative overflow-hidden ${
                inDemonModeNow ? 'border-red-500' : 'border-white/80'
              }`}
            >
              <div
                className={`h-full transition-all duration-200 ${
                  inDemonModeNow ? 'bg-red-600' : 'bg-gradient-to-l from-emerald-400 to-green-500'
                }`}
                style={{ width: `${spectatedBot ? spectatedBot.health : health}%`, float: 'right' }}
              />
            </div>

            <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm shrink-0">
              {playerInfo.botplay && (
                <span className="bg-yellow-400 text-black px-1.5 py-0.5 rounded text-[10px]">BOT</span>
              )}
              {inDemonModeNow && (
                <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] animate-pulse">DEMON</span>
              )}
              <div className="rc-dock-well px-2.5 py-0.5">
                <span data-testid="game-accuracy" className="text-cyan-300 text-xs sm:text-sm tabular-nums">
                  {spectatedBot
                    ? Math.round((100 * spectatedBot.hits) / Math.max(1, spectatedBot.hits + spectatedBot.misses))
                    : accuracy}
                  %
                </span>
              </div>
            </div>
          </div>

          {showTouchPads && (
            <div className="w-full flex justify-center">
              <TouchLanePads
                laneCount={isVS ? 4 : liveExtraNotes}
                colors={gameplaySkinColors}
                shape={gameplaySkinShape}
                onLaneDown={handleLaneDown}
                onLaneUp={handleLaneUp}
                pressedRef={keysPressed}
                disabled={playerEliminated && isBattleRoyale}
                customPads={effectiveControlLayout.landscapePads}
                compact
              />
            </div>
          )}
        </div>
      </div>

      {gameState === 'countdown' && (
        <div
          data-testid="game-countdown"
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 pointer-events-none"
        >
          <div className="rc-hero-wordmark text-6xl md:text-[8rem] text-white drop-shadow-[6px_6px_0_#ec4899] animate-bounce transform -rotate-3">
            READY?
          </div>
          <div className="mt-4 rc-dock-rail px-4 py-1.5 text-xs sm:text-base font-black text-cyan-300 tracking-widest uppercase text-center">
            TAP GRAY NOTES • KEYBOARD • CONTROLLER
          </div>
        </div>
      )}

      {/* Revamped Neon Console Endscreen UI */}
      {gameState === 'finished' && (
        <div data-testid="game-results" className="results-shell rc-stage absolute inset-0 z-50 overflow-hidden">
          <div className="rc-stage-dots absolute inset-0 pointer-events-none" />
          {song.coverUrl && (
            <img
              src={song.coverUrl}
              data-results-wave-cover={String(song.id)}
              className="reactive-cover absolute inset-0 w-full h-full object-cover opacity-35"
              style={{ transformOrigin: 'center' }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#090714]/95 via-[#090714]/80 to-[#090714]/70" />
          <div
            className={`relative z-10 w-full h-full flex flex-col overflow-y-auto custom-scrollbar max-w-6xl mx-auto ${
              isLandscapeCompact ? 'p-2.5 gap-2' : 'p-4 md:p-6 gap-3.5'
            }`}
          >
            {/* Results Top Dock Header */}
            <div className="rc-dock-rail flex items-center justify-between gap-4 px-4 py-2.5 pr-14 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-cyan-300 font-black uppercase tracking-widest truncate">
                    {song.artist} • {difficulty} • {gameMode}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] font-black text-amber-300">
                    ★ {getEffectiveTrackRating(song).toFixed(1)} DIFFICULTY
                  </span>
                  <span className="px-2 py-0.5 rounded bg-fuchsia-500/20 border border-fuchsia-400/50 text-[10px] font-black text-fuchsia-200">
                    {liveExtraNotes} LANES • {liveSpeedTrigger.toFixed(2)}x SCROLL
                  </span>
                </div>
                <h2
                  className={`${
                    isLandscapeCompact ? 'text-xl' : 'text-2xl md:text-3xl'
                  } font-black italic uppercase text-white truncate`}
                >
                  {song.title}
                </h2>
              </div>
              <div
                className={`text-right font-black uppercase shrink-0 ${
                  health <= 0 && !modifiers?.noFail ? 'text-red-400' : 'text-emerald-300'
                }`}
              >
                <div className={`${isLandscapeCompact ? 'text-xl' : 'text-2xl md:text-3xl'} italic`}>
                  {health <= 0 && !modifiers?.noFail ? 'TRACK FAILED' : 'STAGE CLEARED!'}
                </div>
                {isNewHigh && (
                  <div className="text-yellow-300 animate-pulse text-xs sm:text-sm">★ NEW PERSONAL RECORD ★</div>
                )}
              </div>
            </div>

            <div className={`flex-1 grid grid-cols-2 items-stretch min-h-0 ${isLandscapeCompact ? 'gap-2.5' : 'gap-4'}`}>
              {/* Left Telemetry & Judgment Breakdown Tray */}
              <section className={`rc-console-tray flex flex-col justify-between ${isLandscapeCompact ? 'p-3' : 'p-4 sm:p-5'}`}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-black text-cyan-300 uppercase tracking-wider">
                    <span>FINAL SCORE</span>
                    <span>COMPLETION: {Math.round(songProgressPct)}%</span>
                  </div>
                  <div
                    className={`rc-console-inset text-yellow-300 text-right font-black tracking-wider tabular-nums ${
                      isLandscapeCompact ? 'px-3 py-1 text-2xl' : 'px-4 py-2 text-4xl md:text-5xl'
                    }`}
                  >
                    {String(displayScore).padStart(7, '0')}
                  </div>
                </div>

                {/* Visual Judgment Breakdown Bars */}
                <div className={`flex flex-col ${isLandscapeCompact ? 'gap-1.5 my-1.5' : 'gap-2.5 my-3'}`}>
                  {(
                    [
                      { label: 'SICK!!', pts: '350', count: stats.current.sick, color: 'bg-cyan-400', text: 'text-cyan-300' },
                      { label: 'GOOD', pts: '200', count: stats.current.good, color: 'bg-emerald-400', text: 'text-emerald-300' },
                      { label: 'BAD', pts: '50', count: stats.current.bad, color: 'bg-yellow-400', text: 'text-yellow-300' },
                      { label: 'MISS', pts: '0', count: stats.current.miss, color: 'bg-rose-500', text: 'text-rose-400' },
                    ] as const
                  ).map((row) => {
                    const pct = Math.min(100, Math.round((row.count / Math.max(1, stats.current.total)) * 100));
                    return (
                      <div key={row.label} className="rc-console-inset px-3 py-1.5 flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs sm:text-sm font-black tabular-nums">
                          <span className={row.text}>
                            {row.label} <em className="text-[10px] text-white/50 not-italic">({row.pts})</em>
                          </span>
                          <span className="text-white">
                            {row.count}x <span className="text-white/50 text-[10px]">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-black/70 rounded-full overflow-hidden">
                          <div className={`h-full ${row.color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rc-console-inset grid grid-cols-3 gap-2 px-3 py-2 tabular-nums text-center">
                  <div>
                    <div className="text-[10px] text-cyan-300 font-black">MAX COMBO</div>
                    <div className={`${isLandscapeCompact ? 'text-base' : 'text-xl'} font-black text-white`}>
                      {maxCombo}x
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-cyan-300 font-black">ACCURACY</div>
                    <div className={`${isLandscapeCompact ? 'text-base' : 'text-xl'} font-black text-emerald-300`}>
                      {accuracy}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-cyan-300 font-black">PERSONAL BEST</div>
                    <div className={`${isLandscapeCompact ? 'text-base' : 'text-xl'} font-black text-yellow-300`}>
                      {Math.max(previousHigh, score)}
                    </div>
                  </div>
                </div>
              </section>

              {/* Right Rank Emblem & Action Console */}
              <section
                className={`rc-console-tray flex flex-col items-center justify-between ${
                  isLandscapeCompact ? 'p-3 gap-2' : 'p-5 gap-3'
                }`}
              >
                <div className="flex-1 flex flex-col items-center justify-center relative">
                  <div className="text-[11px] font-black text-pink-300 uppercase tracking-widest mb-1">
                    PERFORMANCE GRADE
                  </div>
                  <div
                    className={`leading-none font-black italic drop-shadow-[0_8px_0_#05070e] ${
                      isLandscapeCompact ? 'text-6xl' : 'text-[6.5rem] md:text-[9rem]'
                    } ${
                      health <= 0 && !modifiers?.noFail
                        ? 'text-red-500'
                        : accuracy >= 95
                        ? 'text-cyan-300'
                        : accuracy >= 85
                        ? 'text-emerald-400'
                        : 'text-yellow-300'
                    }`}
                  >
                    {getGrade(accuracy)}
                  </div>
                  <div
                    className={`rc-dock-well font-black text-white tabular-nums mt-2 ${
                      isLandscapeCompact ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'
                    }`}
                  >
                    +{Math.floor(score / 200)} XP • +{Math.floor(score / 500)} COINS
                  </div>
                </div>

                <div className="w-full flex gap-2.5 shrink-0">
                  <button
                    data-testid="results-retry-btn"
                    onClick={retryTrack}
                    className={`rc-bevel-btn rc-tile-gold flex-1 text-black font-black whitespace-nowrap ${
                      isLandscapeCompact ? 'py-2 text-sm' : 'py-3 text-base md:text-lg'
                    }`}
                  >
                    RETRY TRACK
                  </button>
                  <button
                    data-testid="results-back-btn"
                    onClick={() => {
                      if (onExitPlaytest) onExitPlaytest();
                      else setScreen('freeplay');
                    }}
                    className={`rc-bevel-btn rc-tile-cyan flex-1 text-black font-black whitespace-nowrap ${
                      isLandscapeCompact ? 'py-2 text-sm' : 'py-3 text-base md:text-lg'
                    }`}
                  >
                    {onExitPlaytest ? 'BACK TO EDITOR' : 'TRACK SELECT'}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
      {showHapticsModal && (
        <HapticsSettingsModal
          settings={effectiveHaptics}
          onChange={(nextHaptics) => {
            setLocalHaptics(nextHaptics);
            onUpdateHaptics?.(nextHaptics);
          }}
          onClose={() => setShowHapticsModal(false)}
        />
      )}
      {showLayoutModal && (
        <ControlLayoutModal
          controlLayout={effectiveControlLayout}
          downscroll={playerInfo.downscroll}
          skinColors={gameplaySkinColors}
          skinShape={gameplaySkinShape}
          initialOrientation="landscape"
          showTouchPads={showTouchPads}
          onToggleTouchPads={() => setShowTouchPads((v) => !v)}
          onChange={(nextLayout) => {
            setLocalControlLayout(nextLayout);
            onUpdateControlLayout?.(nextLayout);
          }}
          onClose={() => setShowLayoutModal(false)}
        />
      )}
    </div>
  );
};
