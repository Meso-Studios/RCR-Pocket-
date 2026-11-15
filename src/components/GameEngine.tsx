import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Move, Smartphone, Trophy, Vibrate, X } from 'lucide-react';
import { AudioEngine, WaveformPulse } from '../game/audio';
import { HIT_WINDOWS, KEY_CODE_MAP, KEY_MAP, SCROLL_SPEEDS, SKINS } from '../game/constants';
import { pollActiveGamepadLanes, type LaneTuple } from '../game/gamepad';
import { normalizeHapticsSettings, triggerHaptic } from '../game/haptics';
import { normalizeControlLayout } from '../game/layoutConfig';
import { drawNote, getHeroHighway, prewarmNoteSprites } from '../game/renderer';
import {
  applyNerfChart,
  createAltChart,
  evaluateHitTiming,
  generateBeatmap,
  getGrade,
  getLaneFromPlayfieldPoint,
  getPlayfieldLayout,
  normalizeChart,
} from '../game/rhythmLogic';
import type {
  ChartNote,
  ControlLayoutSettings,
  Difficulty,
  GameMode,
  HapticsSettings,
  Modifiers,
  PeerConnectionLike,
  PlayerInfo,
  ScreenId,
  Song,
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
  onUpdateHaptics?: (next: HapticsSettings) => void;
  onUpdateControlLayout?: (next: ControlLayoutSettings) => void;
  addRewards: (xp: number, coins: number) => void;
  networkConnection: PeerConnectionLike | null;
  modifiers: Modifiers;
  recordGrade?: (songId: string | number, percent: number) => void;
  interruptionActive?: boolean;
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
  networkConnection,
  modifiers,
  recordGrade,
  interruptionActive = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [gameState, setGameState] = useState<'countdown' | 'playing' | 'finished' | 'interrupted'>('countdown');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [health, setHealth] = useState(50);
  const [accuracy, setAccuracy] = useState(100);
  const [audioStatus, setAudioStatus] = useState<'loading' | 'ready' | 'buffering' | 'error'>('loading');
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

  const [opponentScore, setOpponentScore] = useState(0);
  const [shake, setShake] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);

  const stats = useRef({ hits: 0, total: 0, sick: 0, good: 0, bad: 0, miss: 0 });
  const mapRef = useRef<ChartNote[]>([]);
  const startTime = useRef(0);
  const keysPressed = useRef<boolean[]>([false, false, false, false]);
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
    document.body.dataset.landscape = isLandscapeCompact ? 'true' : 'false';
    return () => {
      delete document.body.dataset.gameState;
      delete document.body.dataset.downscroll;
      delete document.body.dataset.landscape;
    };
  }, [gameState, playerInfo.downscroll, isLandscapeCompact]);

  useEffect(() => {
    return () => {
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.src = '';
      }
    };
  }, []);

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
      bgmRef.current?.pause();
      setGameState('interrupted');
    } else if (!interruptionActive && gameState === 'interrupted') {
      const resumeState = stateBeforeInterruption.current || 'playing';
      stateBeforeInterruption.current = null;
      lastTimeRef.current = performance.now();
      setGameState(resumeState);
      if (resumeState === 'playing' && bgmRef.current && song.audioUrl) {
        bgmRef.current.play().catch(() => {});
      }
    }
  }, [interruptionActive, gameState, song.audioUrl]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    if (showHapticsModal || showLayoutModal) {
      bgmRef.current?.pause();
    } else {
      lastTimeRef.current = performance.now();
      filteredDriftRef.current = 0;
      if (bgmRef.current && song.audioUrl && bgmRef.current.paused) {
        bgmRef.current.play().catch(() => {});
      }
    }
  }, [showHapticsModal, showLayoutModal, gameState, song.audioUrl]);

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
  const activeCustomLanes =
    !isVS && !heroMode
      ? isLandscapeCompact
        ? effectiveControlLayout.landscapeLanes
        : effectiveControlLayout.portraitLanes
      : null;
  const playfieldLayout = useMemo(
    () =>
      getPlayfieldLayout({
        isLandscape: isLandscapeCompact,
        isVS,
        downscroll: playerInfo.downscroll,
        heroMode,
        customLanes: activeCustomLanes,
      }),
    [isLandscapeCompact, isVS, playerInfo.downscroll, heroMode, activeCustomLanes]
  );
  const playfieldLayoutRef = useRef(playfieldLayout);
  playfieldLayoutRef.current = playfieldLayout;

  const currentSkinColors =
    playerInfo.equippedSkin === 'custom'
      ? playerInfo.customColors
      : SKINS[playerInfo.equippedSkin]?.colors || SKINS.default.colors;
  const currentSkinShape = playerInfo.equippedShape || 'arrow';
  const gameplaySkinColors = isBattleRoyale ? SKINS.default.colors : currentSkinColors;
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
      if (laneIdx < 0 || laneIdx > 3) return;
      if (isDown && keysPressed.current[laneIdx]) return;
      keysPressed.current[laneIdx] = isDown;
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
          setHealth(1);
          setCombo(0);
          demonEndTime.current = performance.now() + 5000;
          spawnJudgment('DEMON!', '#ef4444', true);
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

  // Wireless / Bluetooth / Hardware Keyboard listener (Arrow, WASD, IJKL via e.code & e.key)
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
      for (let i = 0; i < 4; i++) {
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
  }, [gameState, handleLaneInput, isLandscapeCompact, isVS]);

  useEffect(() => {
    if (health <= 0 && gameState === 'playing') {
      if (isBattleRoyale) {
        activeJudgments.current = [];
        hitBursts.current = [];
        keysPressed.current = [false, false, false, false];
        setPlayerEliminated(true);
        const first = brBots.current.find((b) => b.alive);
        setSpectateBotId(first?.id || null);
      } else {
        setGameState('finished');
      }
    }
  }, [health, gameState, isBattleRoyale]);

  useEffect(() => {
    if (gameState === 'countdown') {
      const timer = setTimeout(() => {
        setGameState('playing');
        const now = performance.now();
        startTime.current = now;
        lastTimeRef.current = now;
        smoothAudioTimeRef.current = 0;
        lastRawAudioTimeRef.current = -1;
        filteredDriftRef.current = 0;
        audioClockInitializedRef.current = false;
        virtualTimeRef.current = 0;
        lastStepClickRef.current = -1;
        AudioEngine.init();
        if (bgmRef.current && song.audioUrl) {
          bgmRef.current.volume = 0.5;
          bgmRef.current.playbackRate = modifiers?.speed || 1;
          (bgmRef.current as any).preservesPitch = false;
          bgmRef.current.play().catch(() => {});
        }

        const hasAuthoredChart = Array.isArray(song?.customMap) || Array.isArray(customBeatmap);
        const authoredSource = Array.isArray(song?.customMap) ? song.customMap : customBeatmap;
        if (hasAuthoredChart) {
          let map: ChartNote[] = normalizeChart(authoredSource).map((n) => ({ ...n, hit: false, missed: false }));
          if (map.length === 0) {
            console.error('Authored chart contains no valid notes', authoredSource);
            spawnJudgment('EMPTY CHART', '#ef4444', true);
          }
          if (isVS) {
            const vsMap: ChartNote[] = [];
            map.forEach((n) => {
              vsMap.push({ ...n, lane: n.lane, isBot: true });
              vsMap.push({ ...n, lane: n.lane + 4, isBot: false });
            });
            map = vsMap;
          }
          mapRef.current = map;
        } else {
          mapRef.current = generateBeatmap(Number(song.bpm) || 120, 0, 180, difficulty, gameMode);
        }
        if (modifiers?.altChart) mapRef.current = createAltChart(mapRef.current);
        if (modifiers?.nerf) mapRef.current = applyNerfChart(mapRef.current, modifiers.nerf, song.id || song.title);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState, customBeatmap, difficulty, gameMode, isVS, song, modifiers, spawnJudgment]);

  useEffect(() => {
    if (gameState === 'finished') {
      if (!rewardsProcessed.current) {
        rewardsProcessed.current = true;
        addRewards(Math.floor(score / 200), Math.floor(score / 500));
        recordGrade?.(song.id, accuracy);
      }
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.playbackRate = 1;
      }
      return () => {
        if (bgmRef.current) bgmRef.current.playbackRate = 1;
      };
    }
  }, [gameState, accuracy, addRewards, recordGrade, score, song.id]);

  useEffect(() => {
    if (gameState !== 'finished') return;
    const highKey = `rhythmCanvasHigh_${song.id}_${difficulty}`;
    const oldHigh = Number(localStorage.getItem(highKey) || 0);
    setPreviousHigh(oldHigh);
    const fresh = score > oldHigh;
    setIsNewHigh(fresh);
    if (fresh) localStorage.setItem(highKey, String(score));
    setDisplayScore(0);
    const steps = 36;
    const increment = Math.max(1, Math.ceil(Math.max(0, score) / steps));
    let resultsAudioStarted = false;
    const startResultsAudio = () => {
      if (resultsAudioStarted) return;
      resultsAudioStarted = true;
      const resultTrack = bgmRef.current;
      if (resultTrack && song.audioUrl) {
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
  }, [gameState, score, song.id, song.audioUrl, song.coverUrl, difficulty]);

  const retryTrack = () => {
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0;
      bgmRef.current.volume = 0.5;
    }
    stats.current = { hits: 0, total: 0, sick: 0, good: 0, bad: 0, miss: 0 };
    rewardsProcessed.current = false;
    lastPulseIdx.current = 0;
    lastStepClickRef.current = -1;
    lastAccuracyRef.current = 100;
    virtualTimeRef.current = 0;
    smoothAudioTimeRef.current = 0;
    lastRawAudioTimeRef.current = -1;
    filteredDriftRef.current = 0;
    audioClockInitializedRef.current = false;
    loopCountRef.current = 0;
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

      const inDemonMode = now < demonEndTime.current;
      const loopBoost = gameMode === 'endless' || isBattleRoyale ? Math.pow(1.15, loopCountRef.current) : 1;
      const targetRate = Math.min(4, (curMods?.speed || 1) * loopBoost);
      const effectiveRate = targetRate * (inDemonMode ? 0.5 : 1);

      let currentAudioTime = 0;
      const bgm = bgmRef.current;
      if (bgm && curSong.audioUrl && bgm.readyState >= 2 && !bgm.paused) {
        if (Math.abs(bgm.playbackRate - effectiveRate) > 0.001) {
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
        virtualTimeRef.current += clampedDt * effectiveRate;
        smoothAudioTimeRef.current = virtualTimeRef.current;
        currentAudioTime = virtualTimeRef.current;
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

      const layout = playfieldLayoutRef.current;
      ctx.fillStyle = '#060811';
      ctx.fillRect(0, 0, layout.width, layout.height);
      if (heroMode) ctx.drawImage(getHeroHighway(layout.width, layout.height), 0, 0);

      const visualSpeed = SCROLL_SPEEDS[curDifficulty] || 0.6;

      let activeNotesRemaining = false;
      let anyHolding = false;
      if (!(curEliminated && isBattleRoyale)) {
        mapRef.current.forEach((note) => {
          if (!note.hit && !note.missed) {
            activeNotesRemaining = true;
            if (note.holding && note.lane < 4) anyHolding = true;

            if (
              note.type === 'hold' &&
              note.holding &&
              note.lane < 4 &&
              currentAudioTime >= note.time + (note.duration || 500) - HIT_WINDOWS.sick
            ) {
              note.holding = false;
              note.hit = true;
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
              note.lane < 4 &&
              currentAudioTime >= note.time &&
              !note.holding
            ) {
              note.holding = true;
              keysPressed.current[note.lane] = true;
            }

            if (
              curBotplay &&
              note.type !== 'hold' &&
              note.type !== 'demon' &&
              note.lane < 4 &&
              currentAudioTime >= note.time
            ) {
              note.hit = true;
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
            if (note.lane < 4 && !note.holding && currentAudioTime > noteDeadline) {
              note.missed = true;
              if (note.type === 'demon') {
                spawnJudgmentRef.current('DODGED', '#a855f7', true);
              } else {
                if (inDemonMode) setHealth(0);
                else {
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
        setGameState('finished');
        return;
      }

      const watchedBot =
        curEliminated && isBattleRoyale ? brBots.current.find((b) => b.id === curSpectateBotId) : null;

      // Subtle FNF lane tracks + pressed receptor beams so direct tapping on gray receptors feels crisp
      if (!heroMode) {
        for (let i = 0; i < 4; i++) {
          const lx = layout.playerLaneXs[i];
          const ly = layout.playerLaneYs[i] ?? layout.receptorY;
          const isPressed =
            curEliminated && isBattleRoyale ? (watchedBot?.pressed?.[i] || 0) > now : keysPressed.current[i];
          if (layout.isLandscape) {
            ctx.fillStyle = isPressed ? curSkinColors[i] : '#ffffff';
            ctx.globalAlpha = isPressed ? 0.16 : 0.035;
            ctx.fillRect(lx - 6, 0, layout.noteSize + 12, layout.height);
          } else if (isPressed) {
            ctx.fillStyle = curSkinColors[i];
            ctx.globalAlpha = 0.15;
            ctx.fillRect(lx - 4, 0, layout.noteSize + 8, layout.height);
          }
          if (isPressed) {
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = curSkinColors[i];
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(lx + layout.noteSize / 2, ly + layout.noteSize / 2, layout.noteSize * 0.56, 0, Math.PI * 2);
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

      const numLanes = isVS ? 8 : 4;
      for (let i = 0; i < numLanes; i++) {
        const x = i < 4 ? layout.playerLaneXs[i] : layout.opponentLaneXs[i - 4];
        const y = i < 4 ? layout.playerLaneYs[i] ?? layout.receptorY : layout.receptorY;
        const isPressed =
          isVS && i >= 4
            ? false
            : curEliminated && isBattleRoyale
            ? (watchedBot?.pressed?.[i % 4] || 0) > now
            : keysPressed.current[i % 4];
        drawNote(
          ctx,
          x,
          y,
          layout.noteSize,
          i % 4,
          null,
          isPressed,
          curSkinShape,
          'normal',
          curNoteProduct
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

      const renderLeadMs = heroMode ? 1450 : (layout.height + 160) / visualSpeed;
      mapRef.current.forEach((note, noteIndex) => {
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
        const laneY = note.lane < 4 ? layout.playerLaneYs[note.lane] ?? layout.receptorY : layout.receptorY;
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
          let x =
            note.lane < 4
              ? layout.playerLaneXs[note.lane] ?? 20
              : layout.opponentLaneXs[note.lane - 4] ?? 400;
          if (heroMode) {
            const cx = layout.width / 2;
            const farHalf = layout.width * 0.14;
            const nearHalf = layout.width * 0.47;
            const q = Math.max(0, Math.min(1, (y - 55) / (layout.height - 160)));
            const half = farHalf + (nearHalf - farHalf) * q;
            const laneW = (half * 2) / 4;
            const size = layout.noteSize * heroScale;
            x = cx - half + (note.lane % 4) * laneW + (laneW - size) / 2;
          }
          if (note.type === 'hold') {
            const remain = note.holding
              ? Math.max(0, note.time + (note.duration || 500) - currentAudioTime)
              : note.duration || 500;
            const tailW = Math.round(layout.noteSize * 0.34);
            const tailX = x + (layout.noteSize - tailW) / 2;
            const tailY = y + layout.noteSize / 2;
            ctx.fillStyle = curSkinColors[note.lane % 4];
            ctx.globalAlpha = 0.72;
            const tail = remain * visualSpeed * (curDownscroll ? -1 : 1);
            ctx.fillRect(tailX, tailY, tailW, tail);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.strokeRect(tailX, tailY, tailW, tail);
            ctx.globalAlpha = 1;
          }
          drawNote(
            ctx,
            x,
            y,
            heroMode ? layout.noteSize * heroScale : layout.noteSize,
            note.lane % 4,
            curSkinColors[note.lane % 4],
            false,
            curSkinShape,
            note.type,
            curNoteProduct
          );
        }
      });

      if (heroMode) {
        if (hitBursts.current.length) hitBursts.current = [];
      } else if (hitBursts.current.length) {
        hitBursts.current = hitBursts.current.filter((b) => now - b.time < 420);
        hitBursts.current.forEach((b) => {
          const life = (now - b.time) / 420;
          const x = (layout.playerLaneXs[b.lane % 4] ?? 20) + layout.noteSize / 2;
          const y = (layout.playerLaneYs[b.lane % 4] ?? layout.receptorY) + layout.noteSize / 2;
          ctx.save();
          ctx.strokeStyle = b.color;
          ctx.globalAlpha = 1 - life;
          ctx.lineWidth = 8 * (1 - life) + 2;
          ctx.beginPath();
          ctx.arc(x, y, 18 + life * 65, 0, Math.PI * 2);
          ctx.stroke();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * 25, y + Math.sin(a) * 25);
            ctx.lineTo(x + Math.cos(a) * (35 + life * 55), y + Math.sin(a) * (35 + life * 55));
            ctx.stroke();
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
          const life = (now - j.time) / 800;
          const yOffset = life * 50;
          ctx.save();
          ctx.globalAlpha = 1 - Math.pow(life, 3);
          ctx.fillStyle = j.color;
          ctx.font = j.compact ? '900 italic 25px Saira, sans-serif' : '900 italic 48px sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = j.compact ? 4 : 6;
          ctx.strokeStyle = '#000';
          ctx.strokeText(j.text, j.x, j.y - yOffset);
          ctx.fillText(j.text, j.x, j.y - yOffset);
          ctx.restore();
        });
      }

      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqRef.current);
  }, [gameState, gameMode, isBattleRoyale, isVS, heroMode]);

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
        src={song.audioUrl || undefined}
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

      {/* Top HUD Bar (respects top-right fullscreen button via pr-16 md:pr-24) */}
      <div
        className={`relative z-20 w-full pl-3 sm:pl-6 pr-16 md:pr-24 flex items-center justify-between gap-2 shrink-0 ${
          isLandscapeCompact ? 'pt-1.5 pb-1' : 'pt-2 sm:pt-4'
        }`}
      >
        <button
          data-testid="game-exit-btn"
          onClick={() => setScreen('freeplay')}
          className="bg-white border-4 border-black p-1.5 sm:p-2.5 hover:bg-gray-200 transition-colors shadow-[4px_4px_0_#000] transform skew-x-[-10deg] shrink-0"
          aria-label="Exit track"
        >
          <X className="w-5 h-5 sm:w-7 sm:h-7 text-black transform skew-x-[10deg]" />
        </button>

        <div
          className={`text-center bg-black border-2 sm:border-4 border-white shadow-[4px_4px_0_#fff] sm:shadow-[8px_8px_0_#fff] transform skew-x-[5deg] min-w-0 ${
            isLandscapeCompact ? 'px-3 py-0.5 flex items-center gap-2' : 'px-3 sm:px-6 py-1 sm:py-2'
          }`}
        >
          <h3
            className={`font-black italic text-white uppercase transform skew-x-[-5deg] truncate ${
              isLandscapeCompact ? 'text-sm sm:text-lg max-w-[160px] sm:max-w-xs' : 'text-base sm:text-2xl md:text-3xl max-w-[175px] sm:max-w-md'
            }`}
          >
            {song.title}
          </h3>
          {gameMode === 'endless' && (
            <div className="text-cyan-300 font-black text-[10px] sm:text-xs">
              LOOP {loopCount + 1} • {Math.round(Math.pow(1.15, loopCount) * 100)}% SPEED
            </div>
          )}
          <p className="text-[10px] sm:text-sm text-pink-400 font-black uppercase tracking-widest transform skew-x-[-5deg] truncate">
            {gameMode} • {difficulty}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isBattleRoyale && (
            <button
              onClick={() => setShowBrDrawer((v) => !v)}
              className="lg:hidden bg-yellow-400 text-black border-2 border-black px-2 py-1.5 font-black text-xs flex items-center gap-1 shadow-[3px_3px_0_#000]"
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
              className="border-2 border-black px-2 py-1.5 font-black text-[10px] sm:text-xs flex items-center gap-1 shadow-[3px_3px_0_#000] bg-pink-500 text-black"
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
            className={`border-2 border-black px-2 py-1.5 font-black text-[10px] sm:text-xs flex items-center gap-1 shadow-[3px_3px_0_#000] ${
              effectiveHaptics.enabled ? 'bg-yellow-400 text-black' : 'bg-gray-900 text-gray-300 border-white/50'
            }`}
          >
            <Vibrate className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{effectiveHaptics.enabled ? `${effectiveHaptics.intensity}%` : 'OFF'}</span>
          </button>
          <button
            data-testid="toggle-pads-btn"
            onClick={() => {
              triggerHaptic('menuTap', effectiveHaptics);
              setShowTouchPads((v) => !v);
            }}
            title="Toggle Extra On-Screen Touch Pads"
            aria-label="Toggle On-Screen Touch Pads"
            className={`border-2 border-black px-2 py-1.5 font-black text-[10px] sm:text-xs flex items-center gap-1 shadow-[3px_3px_0_#000] ${
              showTouchPads ? 'bg-cyan-400 text-black' : 'bg-gray-900 text-white border-white/50'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showTouchPads ? 'PADS ON' : 'PADS OFF'}</span>
          </button>
        </div>
      </div>

      {/* Compact Active Mods / Botplay / Demon status (portrait/non-landscape compact) */}
      {!isLandscapeCompact && (
        <div className="relative z-20 w-full px-3 mt-1.5 flex flex-wrap items-center justify-center gap-1.5 shrink-0 lg:hidden">
        <span className="hud-chip px-2 py-0.5 text-[10px] font-black text-cyan-300">
          ×{modifiers?.speed?.toFixed(2) || '1.00'}
        </span>
        {modifiers?.altChart && <span className="hud-chip px-2 py-0.5 text-[10px] font-black">ALT</span>}
        {modifiers?.nerf > 0 && (
          <span className="hud-chip px-2 py-0.5 text-[10px] font-black text-orange-300">-{modifiers.nerf}%</span>
        )}
        {modifiers?.noFail && (
          <span className="hud-chip px-2 py-0.5 text-[10px] font-black text-green-400">NO FAIL</span>
        )}
        {modifiers?.extreme && (
          <span className="hud-chip px-2 py-0.5 text-[10px] font-black text-red-400">EXTREME</span>
        )}
        {playerInfo.botplay && (
          <span className="bg-black/80 border border-yellow-400 px-2 py-0.5 text-[10px] font-black text-yellow-400 animate-pulse">
            BOTPLAY
          </span>
        )}
        {inDemonModeNow && (
          <span className="bg-black/90 border border-red-500 px-2 py-0.5 text-[10px] font-black text-red-400 animate-pulse">
            DEMON: ONE MISS = DEATH
          </span>
        )}
        </div>
      )}

      {/* Desktop Left Active Mods HUD */}
      <div className="hidden lg:block absolute left-5 top-24 z-30 hud-chip p-3 text-xs font-black space-y-1">
        <div className="text-cyan-300 tracking-widest">ACTIVE MODS</div>
        <div>×{modifiers?.speed?.toFixed(2) || '1.00'} SPEED</div>
        {modifiers?.altChart && <div>ALT CHART</div>}
        {modifiers?.nerf > 0 && <div className="text-orange-300">NERF −{modifiers.nerf}% NOTES</div>}
        {modifiers?.noFail && <div className="text-green-400">NO FAIL</div>}
        {modifiers?.extreme && <div className="text-red-400">EXTREME</div>}
      </div>

      {/* Battle Royale Leaderboard: Right sidebar on lg desktop, toggleable drawer on mobile */}
      {isBattleRoyale && (
        <div
          className={`${
            showBrDrawer ? 'block' : 'hidden lg:block'
          } absolute right-2 sm:right-3 top-14 lg:top-24 z-30 hud-chip p-2.5 sm:p-3 w-52 sm:w-56 max-h-[65vh] overflow-y-auto`}
        >
          <div className="flex items-center justify-between">
            <div className="text-yellow-300 text-lg sm:text-2xl font-black">{brAlive}/50 ALIVE</div>
            <button onClick={() => setShowBrDrawer(false)} className="lg:hidden text-xs font-black text-gray-300">
              CLOSE
            </button>
          </div>
          <div className="text-[10px] text-green-400 font-black">DEFAULT NOTES ENFORCED • BOT LEVELS 1–5 BY 0.5</div>
          <div className="text-xs text-cyan-300 mb-2">
            LOOP {loopCount + 1} • {Math.round(Math.pow(1.15, loopCount) * 100)}%
          </div>
          {brBoard.map((b, i) => (
            <button
              key={b.id}
              disabled={!playerEliminated || b.isPlayer}
              onClick={() => setSpectateBotId(Number(b.id))}
              className={`w-full flex justify-between text-xs px-2 py-1 ${
                b.isPlayer ? 'bg-green-500 text-black' : spectateBotId === b.id ? 'bg-cyan-500 text-black' : 'bg-black/60'
              }`}
            >
              <span>
                #{i + 1} {b.name}
                {!b.isPlayer && b.rating !== undefined && <em className="text-cyan-300 ml-1">★{b.rating.toFixed(2)}</em>}
              </span>
              <b>{b.score}</b>
            </button>
          ))}
          {playerEliminated && (
            <>
              <div className="mt-2 text-red-400 font-black text-center text-xs">ELIMINATED • SPECTATE</div>
              <select
                value={spectateBotId || ''}
                onChange={(e) => setSpectateBotId(Number(e.target.value))}
                className="w-full bg-black border border-cyan-400 p-1 text-xs mt-1"
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
        <div className="relative z-30 mx-auto bg-black/90 border-2 border-cyan-400 px-3 sm:px-5 py-1.5 font-black text-xs sm:text-sm flex items-center gap-2 shrink-0">
          <button
            onClick={() => cycleSpectateBot(-1)}
            className="bg-cyan-400 text-black px-2 py-1 font-black flex items-center"
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
            className="bg-cyan-400 text-black px-2 py-1 font-black flex items-center"
            aria-label="Next bot"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {playerInfo.botplay && (
        <div className="hidden lg:block mx-auto z-20 text-yellow-400 font-black text-xl animate-pulse transform skew-x-[-5deg] border-2 border-yellow-400 bg-black/60 px-4 py-0.5 shrink-0">
          BOTPLAY ENABLED
        </div>
      )}

      {inDemonModeNow && (
        <div className="hidden lg:block mx-auto z-20 text-red-500 font-black text-2xl animate-[shake_0.2s_ease-in-out_infinite] transform skew-x-[-5deg] border-4 border-red-500 bg-black/80 px-5 py-1 shadow-[0_0_20px_#ef4444] shrink-0">
          DEMON MODE: ONE MISS = DEATH
        </div>
      )}

      {/* Main Playfield Container */}
      {isLandscapeCompact ? (
        <div
          data-testid="landscape-playfield"
          className={`relative z-10 flex-1 min-h-0 w-full flex flex-col items-center justify-between px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] gap-1 ${
            shake ? 'animate-[shake_0.2s_ease-in-out]' : ''
          }`}
        >
          {/* FNF-Style Wide Playfield with spaced-out receptor notes at the bottom */}
          <div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
            <canvas
              ref={canvasRef}
              data-testid="game-canvas"
              data-playfield-mode="fnf-landscape"
              width={playfieldLayout.width}
              height={playfieldLayout.height}
              style={{ aspectRatio: `${playfieldLayout.width} / ${playfieldLayout.height}`, willChange: 'transform' }}
              className={`touch-surface bg-[#060811] border-4 shadow-[6px_6px_0_#000] rounded-xl h-full max-h-full max-w-full w-auto object-contain ${
                inDemonModeNow ? 'border-red-600' : 'border-white'
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
                    heroMode ? 'text-xl bg-black/70 border-l-4 border-yellow-400 px-2 py-0.5 text-left' : 'text-4xl sm:text-5xl'
                  } font-black italic text-white drop-shadow-[4px_4px_0_#000] animate-[pulse-fast_0.5s_infinite_alternate]`}
                >
                  {combo}
                  {heroMode && (
                    <span className="block text-[9px] not-italic tracking-widest text-yellow-300">COMBO</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* FNF-style Bottom Health Bar + Score / Accuracy / Active Mods */}
          <div className="w-full max-w-[860px] flex flex-col gap-1 shrink-0">
            <div className="w-full flex items-center justify-between gap-2 sm:gap-3 px-1">
              <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm text-white shrink-0">
                <span data-testid="game-score">SCORE: {spectatedBot ? spectatedBot.score : score}</span>
                {isVS && <span className="text-pink-400">• OPP: {opponentScore}</span>}
              </div>

              <div
                data-testid="game-health"
                className={`flex-1 max-w-[380px] h-3.5 bg-black border-2 relative overflow-hidden shadow-[3px_3px_0_#000] transform skew-x-[-15deg] ${
                  inDemonModeNow ? 'border-red-500' : 'border-white'
                }`}
              >
                <div
                  className={`h-full transition-all duration-200 ${
                    inDemonModeNow ? 'bg-red-600' : 'bg-gradient-to-l from-green-400 to-green-600'
                  }`}
                  style={{ width: `${spectatedBot ? spectatedBot.health : health}%`, float: 'right' }}
                />
              </div>

              <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm shrink-0">
                {playerInfo.botplay && (
                  <span className="bg-yellow-400 text-black px-1.5 py-0.5 text-[10px]">BOT</span>
                )}
                {inDemonModeNow && (
                  <span className="bg-red-600 text-white px-1.5 py-0.5 text-[10px] animate-pulse">DEMON</span>
                )}
                <span data-testid="game-accuracy" className="text-cyan-400 text-sm sm:text-base">
                  {spectatedBot
                    ? Math.round((100 * spectatedBot.hits) / Math.max(1, spectatedBot.hits + spectatedBot.misses))
                    : accuracy}
                  %
                </span>
              </div>
            </div>

            {showTouchPads && (
              <div className="w-full flex justify-center">
                <TouchLanePads
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
      ) : (
        <>
          <div
            className={`relative z-10 flex-1 min-h-0 w-full flex flex-col items-center justify-center px-1.5 sm:px-3 py-1 ${
              shake ? 'animate-[shake_0.2s_ease-in-out]' : ''
            }`}
          >
            <div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
              <canvas
                ref={canvasRef}
                data-testid="game-canvas"
                data-playfield-mode="portrait"
                width={playfieldLayout.width}
                height={playfieldLayout.height}
                style={{ aspectRatio: `${playfieldLayout.width} / ${playfieldLayout.height}`, willChange: 'transform' }}
                className={`touch-surface bg-[#060811] border-4 md:border-8 shadow-[6px_6px_0_#000] md:shadow-[16px_16px_0_#000] rounded-2xl max-h-full max-w-full w-auto h-auto object-contain ${
                  inDemonModeNow ? 'border-red-600' : 'border-white'
                } ${isPulsing ? 'pulse-border-active' : ''}`}
              />

              <div
                className={`absolute pointer-events-none flex ${
                  heroMode
                    ? 'top-4 left-3 w-auto justify-start'
                    : `${playerInfo.downscroll ? 'top-[34%]' : 'top-[42%]'} left-0 w-full justify-center text-center`
                }`}
              >
                {combo > 5 && (
                  <div
                    data-testid="game-combo"
                    className={`${
                      heroMode
                        ? 'text-2xl sm:text-3xl bg-black/70 border-l-4 border-yellow-400 px-3 py-1 text-left'
                        : 'text-5xl sm:text-7xl md:text-8xl'
                    } font-black italic text-white drop-shadow-[4px_4px_0_#000] animate-[pulse-fast_0.5s_infinite_alternate]`}
                  >
                    {combo}
                    {heroMode && (
                      <span className="block text-[10px] not-italic tracking-widest text-yellow-300">COMBO</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Score & Accuracy strip directly under canvas */}
            <div className="w-full max-w-[560px] flex justify-between items-center px-2 pt-1 pointer-events-none shrink-0">
              <div data-testid="game-score" className="font-black text-base sm:text-2xl drop-shadow-[3px_3px_0_#000] text-white">
                SCORE: {spectatedBot ? spectatedBot.score : score}
              </div>
              {isVS && (
                <div className="font-black text-base sm:text-2xl drop-shadow-[3px_3px_0_#000] text-pink-400">
                  OPP: {opponentScore}
                </div>
              )}
              <div data-testid="game-accuracy" className="font-black text-base sm:text-2xl text-cyan-400 drop-shadow-[3px_3px_0_#000]">
                {spectatedBot
                  ? Math.round((100 * spectatedBot.hits) / Math.max(1, spectatedBot.hits + spectatedBot.misses))
                  : accuracy}
                %
              </div>
            </div>
          </div>

          {/* Health Bar + Optional Bottom Mobile Touch Lane Pads */}
          <div className="relative z-20 w-full flex flex-col items-center gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0">
            <div
              data-testid="game-health"
              className={`w-11/12 md:w-[760px] h-4 sm:h-6 md:h-8 bg-black border-2 sm:border-4 relative overflow-hidden shadow-[4px_4px_0_#000] transform skew-x-[-15deg] ${
                inDemonModeNow ? 'border-red-500' : 'border-white'
              }`}
            >
              <div
                className={`h-full transition-all duration-200 ${
                  inDemonModeNow ? 'bg-red-600' : 'bg-gradient-to-l from-green-400 to-green-600'
                }`}
                style={{ width: `${spectatedBot ? spectatedBot.health : health}%`, float: 'right' }}
              />
            </div>

            {showTouchPads && (
              <TouchLanePads
                colors={gameplaySkinColors}
                shape={gameplaySkinShape}
                onLaneDown={handleLaneDown}
                onLaneUp={handleLaneUp}
                pressedRef={keysPressed}
                disabled={playerEliminated && isBattleRoyale}
                customPads={effectiveControlLayout.portraitPads}
                compact
              />
            )}
          </div>
        </>
      )}

      {gameState === 'countdown' && (
        <div
          data-testid="game-countdown"
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 pointer-events-none"
        >
          <div className="text-6xl md:text-[10rem] font-black italic text-white drop-shadow-[8px_8px_0_#eab308] animate-bounce transform -rotate-6">
            READY?
          </div>
          <div className="mt-4 text-xs sm:text-lg font-black text-cyan-300 tracking-widest uppercase text-center px-4">
            TAP GRAY NOTES • KEYBOARD • CONTROLLER
          </div>
        </div>
      )}

      {gameState === 'finished' && (
        <div data-testid="game-results" className="results-shell absolute inset-0 z-50 overflow-hidden bg-[#080a12]">
          {song.coverUrl && (
            <img
              src={song.coverUrl}
              data-results-wave-cover={String(song.id)}
              className="reactive-cover absolute inset-0 w-full h-full object-cover opacity-65"
              style={{ transformOrigin: 'center' }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/55 to-black/30" />
          <div className={`relative z-10 w-full h-full flex flex-col overflow-y-auto custom-scrollbar ${isLandscapeCompact ? 'p-3' : 'p-4 md:p-7'}`}>
            <div className={`result-header flex items-start justify-between gap-4 pr-12 md:pr-16 ${isLandscapeCompact ? 'mb-2' : 'mb-4'}`}>
              <div>
                <div className="text-xs md:text-sm text-gray-300 uppercase tracking-widest">{song.artist}</div>
                <h2 className={`${isLandscapeCompact ? 'text-xl' : 'text-2xl md:text-4xl'} font-black italic uppercase text-white drop-shadow-[4px_4px_0_#000]`}>
                  {song.title}
                </h2>
                <div className={`text-yellow-300 font-black uppercase ${isLandscapeCompact ? 'text-xs' : ''}`}>
                  {difficulty} • {gameMode}
                </div>
              </div>
              <div className={`text-right font-black uppercase ${health <= 0 ? 'text-red-400' : 'text-white'}`}>
                <div className={`${isLandscapeCompact ? 'text-2xl' : 'text-3xl md:text-6xl'} italic`}>{health <= 0 ? 'GAME OVER' : 'RANKING'}</div>
                {isNewHigh && <div className="text-yellow-300 animate-pulse text-sm sm:text-xl">★ NEW HIGH SCORE ★</div>}
              </div>
            </div>
            <div className={`flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,48%)_1fr] items-stretch min-h-0 ${isLandscapeCompact ? 'gap-3' : 'gap-4'}`}>
              <section className={`result-stats flex flex-col justify-between ${isLandscapeCompact ? 'p-3' : 'p-4 md:p-6'}`}>
                <div className={`result-score text-black border-4 border-black text-right font-black tracking-wider ${isLandscapeCompact ? 'px-3 py-1 text-2xl' : 'px-4 py-2 text-3xl md:text-5xl'}`}>
                  {String(displayScore).padStart(7, '0')}
                </div>
                <div className={`grid grid-cols-[auto_1fr_auto] gap-x-3 font-black relative z-10 ${isLandscapeCompact ? 'text-sm mt-2' : 'text-lg md:text-2xl mt-4'}`}>
                  <div className="judgment-row text-xs text-cyan-200">350</div>
                  <div className="judgment-row text-cyan-100">SICK</div>
                  <div className="judgment-row text-right">{stats.current.sick}x</div>
                  <div className="judgment-row text-xs text-green-200">200</div>
                  <div className="judgment-row text-green-200">GOOD</div>
                  <div className="judgment-row text-right">{stats.current.good}x</div>
                  <div className="judgment-row text-xs text-yellow-200">50</div>
                  <div className="judgment-row text-yellow-200">BAD</div>
                  <div className="judgment-row text-right">{stats.current.bad}x</div>
                  <div className="judgment-row text-xs text-red-300">×</div>
                  <div className="judgment-row text-red-300">MISS</div>
                  <div className="judgment-row text-right">{stats.current.miss}x</div>
                </div>
                <div className={`grid grid-cols-2 border-t-2 border-white/40 ${isLandscapeCompact ? 'mt-2 pt-2' : 'mt-5 pt-3'}`}>
                  <div>
                    <div className="text-xs sm:text-sm text-cyan-100">MAX COMBO</div>
                    <div className={`${isLandscapeCompact ? 'text-xl' : 'text-3xl'} font-black`}>{maxCombo}x</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs sm:text-sm text-cyan-100">ACCURACY</div>
                    <div className={`${isLandscapeCompact ? 'text-xl' : 'text-3xl'} font-black`}>{accuracy}%</div>
                  </div>
                </div>
              </section>
              <section className={`result-rank flex flex-col items-center justify-center ${isLandscapeCompact ? 'min-h-0 p-2 gap-1.5' : 'min-h-[220px] p-4 gap-3'}`}>
                <div
                  className={`result-grade leading-none font-black italic ${
                    isLandscapeCompact ? 'text-6xl' : 'text-[7rem] sm:text-[9rem] md:text-[15rem]'
                  } ${
                    health <= 0 ? 'text-red-600' : 'text-green-500'
                  }`}
                >
                  {getGrade(accuracy)}
                </div>
                <div className={`result-record border border-white/30 font-black ${isLandscapeCompact ? 'px-4 py-1 text-sm' : 'px-5 sm:px-7 py-2 sm:py-3 text-base sm:text-lg'}`}>
                  BEST: {Math.max(previousHigh, score)} • SCORE: {score}
                </div>
                <div className={`result-actions w-full max-w-lg flex gap-3 ${isLandscapeCompact ? 'mt-1 pb-1' : 'mt-2 pb-4'}`}>
                  <button
                    onClick={retryTrack}
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-black border-4 border-black p-3 text-xl md:text-3xl font-black shadow-[6px_6px_0_#000]"
                  >
                    RETRY
                  </button>
                  <button
                    onClick={() => setScreen('freeplay')}
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-4 border-black p-3 text-xl md:text-3xl font-black shadow-[6px_6px_0_#000]"
                  >
                    BACK
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
          initialOrientation={isLandscapeCompact ? 'landscape' : 'portrait'}
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
