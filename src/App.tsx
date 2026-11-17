import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Radio, Volume2 } from 'lucide-react';
import { auth, db } from './firebaseClient';
import { AudioEngine, MenuMusicEngine } from './game/audio';
import {
  APP_VERSION,
  CHANGELOG_STORAGE_KEY,
  CHANGELOG_VERSION,
  MENU_BGM,
  MENU_GENRE_CONFIGS,
  ONLINE_BGM,
  ROYALTY_FREE_SONGS,
  SECRET_DEV_CODE,
} from './game/constants';
import { addRewardsCalc, normalizeChart } from './game/rhythmLogic';
import { normalizeHapticsSettings, triggerHaptic } from './game/haptics';
import { normalizeControlLayout } from './game/layoutConfig';
import type {
  ChartNote,
  ControlLayoutSettings,
  Difficulty,
  FirebaseUser,
  GameMode,
  HapticsSettings,
  InterruptionData,
  Modifiers,
  PeerConnectionLike,
  PlayerInfo,
  ScreenId,
  Song,
} from './game/types';
import { AdminStudio } from './components/AdminStudio';
import { ChangelogModal } from './components/ChangelogModal';
import { DevConsole } from './components/DevConsole';
import { RebootErrorBoundary } from './components/ErrorBoundary';
import { EventsMenu } from './components/EventsMenu';
import { FreeplayMenu } from './components/FreeplayMenu';
import { GameEngine } from './components/GameEngine';
import { HorseEngine } from './components/HorseEngine';
import { MainMenu } from './components/MainMenu';
import { OnlineLobby } from './components/OnlineLobby';
import { OnlineTracksMenu } from './components/OnlineTracksMenu';
import { RaveStageCanvas } from './components/RaveStageCanvas';
import { ShopMenu } from './components/ShopMenu';
import { SongEditor } from './components/SongEditor';

import { safeGetStorage, safeSetStorage } from './game/storage';
import { useViewportOrientation } from './game/useViewport';

const InterruptionOverlay: React.FC<{ message?: string }> = ({ message }) => (
  <div className="fixed inset-0 z-[99998] rc-stage flex flex-col items-center justify-center p-6 text-center text-white">
    <div className="absolute inset-0 rc-stage-dots pointer-events-none" />
    <div className="relative z-10 rc-panel max-w-xl w-full p-6 flex flex-col items-center gap-4">
      <h1 className="rc-hero-wordmark text-3xl sm:text-5xl text-yellow-300 uppercase">GAME INTERRUPTED</h1>
      <p className="w-full rc-console-inset p-4 text-base sm:text-xl font-bold text-cyan-100">
        {message || 'The administrator has paused gameplay.'}
      </p>
      <p className="text-xs sm:text-sm font-black tracking-wider text-cyan-300 uppercase">
        DONATING CAN REDUCE INTERRUPTION FREQUENCY
      </p>
    </div>
  </div>
);

const RotateToLandscapeOverlay: React.FC<{ onTryLock: () => void }> = ({ onTryLock }) => (
  <div
    data-testid="rotate-landscape-overlay"
    className="fixed inset-0 z-[99995] rc-stage flex flex-col items-center justify-center p-6 text-center text-white select-none"
  >
    <div className="absolute inset-0 rc-stage-dots pointer-events-none" />
    <div className="relative z-10 rc-console-tray max-w-sm w-full p-6 flex flex-col items-center gap-5">
      <div className="rc-console-inset w-24 h-24 flex items-center justify-center">
        <svg viewBox="0 0 64 64" className="w-16 h-16 text-cyan-300" fill="none" aria-hidden="true">
          <rect x="14" y="18" width="36" height="24" rx="4" stroke="currentColor" strokeWidth="3.5" fill="#131722" />
          <circle cx="44" cy="30" r="2.2" fill="#ff2e88" />
          <path d="M18 11 C26 5, 38 5, 46 11" stroke="#ffd826" strokeWidth="3" strokeLinecap="round" />
          <path d="M42 6 L47 11.5 L40 13" stroke="#ffd826" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="rc-hero-wordmark rc-word-rhythm text-2xl uppercase">LANDSCAPE</span>
        <span className="rc-hero-wordmark rc-word-canvas text-2xl uppercase">MODE ONLY</span>
      </div>
      <p className="text-sm font-bold text-slate-300 leading-relaxed max-w-[28ch]">
        Rotate your device sideways to play Rhythm Canvas Reboot in widescreen landscape.
      </p>
      <button
        type="button"
        onClick={onTryLock}
        className="rc-bevel-btn rc-tile-pink px-6 py-3 font-black text-sm text-white tracking-wider uppercase whitespace-nowrap min-h-[44px]"
      >
        LOCK LANDSCAPE &amp; FULLSCREEN
      </button>
    </div>
  </div>
);

function RhythmCanvasApp() {
  const appRef = useRef<HTMLDivElement | null>(null);
  const { isPortrait, isLandscapeCompact } = useViewportOrientation();
  const [rhythmList, setRhythmList] = useState<Array<string | number>>([]);

  useEffect(() => {
    if (!db) return;
    const unsubscribe = db.collection('system').doc('rhythmList').onSnapshot((doc: any) => {
      if (doc.exists) {
        setRhythmList(doc.data().top10 || []);
      }
    });
    return () => unsubscribe();
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('button')) {
        AudioEngine.playUI('confirm');
      }
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, []);

  const [hasStarted, setHasStarted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  });
  const [showChangelog, setShowChangelog] = useState(() => {
    if (typeof window === 'undefined') return false;
    const isAutostart = new URLSearchParams(window.location.search).get('autostart') === '1';
    if (isAutostart) return false;
    return safeGetStorage(CHANGELOG_STORAGE_KEY) !== CHANGELOG_VERSION;
  });
  const closeChangelog = useCallback(() => {
    safeSetStorage(CHANGELOG_STORAGE_KEY, CHANGELOG_VERSION);
    setShowChangelog(false);
  }, []);
  const [screen, setScreen] = useState<ScreenId>('menu');

  useEffect(() => {
    document.body.dataset.screen = screen;
  }, [screen]);

  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const raw = JSON.parse(safeGetStorage('rhythmCanvasLocalSongs') || '[]');
      const local = (Array.isArray(raw) ? raw : [])
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({
          ...x,
          bpm: Number(x.bpm) || 120,
          customMap: Array.isArray(x.customMap) ? normalizeChart(x.customMap) : undefined,
        }));
      return [...local, ...ROYALTY_FREE_SONGS];
    } catch {
      return ROYALTY_FREE_SONGS;
    }
  });
  const [selectedSong, setSelectedSong] = useState<Song | null>(songs[0] || null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [gameMode, setGameMode] = useState<GameMode>('standard');
  const [customBeatmap, setCustomBeatmap] = useState<ChartNote[] | null>(null);
  const [modifiers, setModifiers] = useState<Modifiers>({
    speed: 1,
    altChart: false,
    noFail: false,
    extreme: false,
    nerf: 0,
  });
  const [bestGrades, setBestGrades] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(safeGetStorage('rhythmCanvasGrades') || '{}');
    } catch {
      return {};
    }
  });
  const recordGrade = useCallback(
    (songId: string | number, percent: number) =>
      setBestGrades((prev) => {
        const key = String(songId);
        const next = { ...prev, [key]: Math.max(prev[key] || 0, percent) };
        safeSetStorage('rhythmCanvasGrades', JSON.stringify(next));
        return next;
      }),
    []
  );
  const menuBgmRef = useRef<HTMLAudioElement | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [interruption, setInterruption] = useState<InterruptionData | null>(null);
  const [interruptionsDisabled, setInterruptionsDisabled] = useState(
    () => safeGetStorage('rhythmCanvasInterruptionsDisabled') === 'true'
  );
  const interruptionShowing = Boolean(interruption?.active && !interruptionsDisabled);

  const handleToggleInterruptions = useCallback(() => {
    setInterruptionsDisabled((current) => {
      const next = !current;
      safeSetStorage('rhythmCanvasInterruptionsDisabled', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!db) return;
    return db
      .collection('system')
      .doc('interruption')
      .onSnapshot(
        (doc: any) => setInterruption(doc.exists ? doc.data() : null),
        (error: any) => console.warn('Could not load interruption notice', error)
      );
  }, []);

  useEffect(() => {
    const toggleInterruptions = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        handleToggleInterruptions();
      }
    };
    window.addEventListener('keydown', toggleInterruptions);
    return () => window.removeEventListener('keydown', toggleInterruptions);
  }, [handleToggleInterruptions]);

  useEffect(() => {
    if (!db) return;
    const unsubscribe = db.collection('system').doc('config').onSnapshot((doc: any) => {
      if (doc.exists) {
        const data = doc.data();
        if (data.latestVersion > APP_VERSION) {
          setUpdateAvailable(true);
          setUpdateMessage(data.updateMessage || 'A mandatory update was just released!');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const [showDevConsole, setShowDevConsole] = useState(false);
  const keysBufferRef = useRef('');

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') return;
      const newBuffer = (keysBufferRef.current + e.key).slice(-SECRET_DEV_CODE.length);
      if (newBuffer === SECRET_DEV_CODE) {
        setShowDevConsole(true);
        keysBufferRef.current = '';
      } else {
        keysBufferRef.current = newBuffer;
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo>(() => {
    let parsed: Partial<PlayerInfo> = {};
    try {
      const saved = safeGetStorage('rhythmCanvasSave');
      parsed = saved ? JSON.parse(saved) : {};
    } catch {
      parsed = {};
    }
    return {
      level: 1,
      xp: 0,
      coins: 0,
      equippedSkin: 'default',
      unlockedSkins: ['default'],
      equippedShape: 'arrow',
      unlockedShapes: ['arrow'],
      customColors: ['#ff0055', '#00ffcc', '#00ff00', '#ffaa00'],
      botplay: false,
      unlockedNoteProducts: [],
      equippedNoteProduct: null,
      unlockedHitSounds: [],
      equippedHitSound: null,
      unlockedGameMods: [],
      activeGameMods: [],
      menuBgmMuted: false,
      ...parsed,
      menuGenre: (parsed as any)?.v2SpotifyDefaultApplied ? (parsed.menuGenre || 'spotify') : 'spotify',
      bgFloatingNotes: parsed.bgFloatingNotes !== undefined ? Boolean(parsed.bgFloatingNotes) : true,
      downscroll: parsed.downscroll !== undefined ? Boolean(parsed.downscroll) : true,
      haptics: normalizeHapticsSettings(parsed.haptics),
      controlLayout: normalizeControlLayout(parsed.controlLayout),
    };
  });

  useEffect(() => {
    try {
      const localSave = safeGetStorage('rhythmCanvasSave');
      if (localSave) {
        const parsed = JSON.parse(localSave);
        setPlayerInfo((prev) => ({
          ...prev,
          ...parsed,
          menuGenre: (parsed as any)?.v2SpotifyDefaultApplied ? (parsed.menuGenre || 'spotify') : 'spotify',
          bgFloatingNotes: parsed.bgFloatingNotes !== undefined ? Boolean(parsed.bgFloatingNotes) : true,
          unlockedShapes: parsed.unlockedShapes || ['arrow'],
          equippedShape: parsed.equippedShape || 'arrow',
          customColors: parsed.customColors || ['#ff0055', '#00ffcc', '#00ff00', '#ffaa00'],
          botplay: parsed.botplay || false,
          downscroll: parsed.downscroll !== undefined ? Boolean(parsed.downscroll) : true,
          haptics: normalizeHapticsSettings(parsed.haptics),
          controlLayout: normalizeControlLayout(parsed.controlLayout),
          unlockedNoteProducts: parsed.unlockedNoteProducts || [],
          equippedNoteProduct: parsed.equippedNoteProduct || null,
          unlockedHitSounds: parsed.unlockedHitSounds || [],
          equippedHitSound: parsed.equippedHitSound || null,
          unlockedGameMods: parsed.unlockedGameMods || [],
          activeGameMods: (parsed.activeGameMods || []).filter((id: string) => id !== 'dance_rhythm_pitch'),
        }));
      }
    } catch {
      // ignore corrupted save
    }

    if (auth) {
      const unsubscribe = auth.onAuthStateChanged((u: any) => {
        setUser(u ? { uid: u.uid, email: u.email } : null);
        if (u && db) {
          db.collection('saves')
            .doc(u.uid)
            .get()
            .then((doc: any) => {
              if (doc.exists) {
                const data = doc.data();
                setPlayerInfo((prev) => {
                  const newData: PlayerInfo = {
                    ...prev,
                    ...data,
                    menuGenre: data.menuGenre || prev.menuGenre || 'spotify',
                    bgFloatingNotes:
                      data.bgFloatingNotes !== undefined
                        ? Boolean(data.bgFloatingNotes)
                        : prev.bgFloatingNotes !== false,
                    unlockedShapes: data.unlockedShapes || prev.unlockedShapes || ['arrow'],
                    equippedShape: data.equippedShape || prev.equippedShape || 'arrow',
                    customColors: data.customColors || prev.customColors || ['#ff0055', '#00ffcc', '#00ff00', '#ffaa00'],
                    botplay: data.botplay !== undefined ? data.botplay : prev.botplay,
                    downscroll: data.downscroll !== undefined ? Boolean(data.downscroll) : prev.downscroll,
                    haptics: normalizeHapticsSettings(data.haptics || prev.haptics),
                    controlLayout: normalizeControlLayout(data.controlLayout || prev.controlLayout),
                  };
                  safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
                  return newData;
                });
              }
            })
            .catch((err: any) => console.error('Cloud load error:', err));
        }
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (user && playerInfo.xp > 0 && db) {
      db.collection('saves')
        .doc(user.uid)
        .set(playerInfo, { merge: true })
        .catch((err: any) => console.error('Cloud save error:', err));
    }
  }, [playerInfo, user]);

  useEffect(() => {
    if (!db) return;
    const unsubscribe = db.collection('community_tracks').onSnapshot(
      (querySnapshot: any) => {
        const fetchedSongs: Song[] = [];
        querySnapshot.forEach((doc: any) => {
          const data = { id: doc.id, ...doc.data() };
          if (data.entityType !== 'note_product' && data.entityType !== 'hit_sound_product') {
            fetchedSongs.push(data);
          }
        });
        setSongs((prev) => {
          const localOnly = prev.filter(
            (x) =>
              Boolean(x.audioUrl?.startsWith('synth:')) ||
              x.artist === 'Royalty Free' ||
              x.artist === 'USER'
          );
          return [...fetchedSongs, ...localOnly];
        });
        setSelectedSong((current) => {
          if (!current) return current;
          return fetchedSongs.find((x) => String(x.id) === String(current.id)) || current;
        });
      },
      (e: any) => console.warn('Could not load community tracks', e)
    );
    return () => unsubscribe();
  }, []);

  const [peerInstance, setPeerInstance] = useState<any>(null);
  const [myPeerId, setMyPeerId] = useState('');
  const [networkConnection, setNetworkConnection] = useState<PeerConnectionLike | null>(null);

  const addRewards = useCallback((xpToAdd: number, coinsToAdd: number) => {
    setPlayerInfo((prev) => {
      const updated = addRewardsCalc(prev, xpToAdd, coinsToAdd);
      const newData = { ...prev, ...updated };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  }, []);

  const updateHaptics = useCallback((nextHaptics: HapticsSettings) => {
    const normalized = normalizeHapticsSettings(nextHaptics);
    setPlayerInfo((prev) => {
      const newData = { ...prev, haptics: normalized };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  }, []);

  const updateControlLayout = useCallback((nextLayout: ControlLayoutSettings) => {
    const normalized = normalizeControlLayout(nextLayout);
    setPlayerInfo((prev) => {
      const newData = { ...prev, controlLayout: normalized };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  }, []);

  useEffect(() => {
    if (hasStarted && !peerInstance && typeof window !== 'undefined' && window.Peer) {
      const peer = new window.Peer(undefined, {
        secure: true,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
          ],
        },
      });

      peer.on('open', (id: string) => setMyPeerId(id));
      peer.on('disconnected', () => {
        console.warn('Lost connection to PeerJS server, reconnecting...');
        peer.reconnect();
      });
      peer.on('error', (err: any) => {
        console.error('Global Peer Error:', err);
      });

      setPeerInstance(peer);
    }
  }, [hasStarted, peerInstance]);

  const tryLockLandscape = useCallback(() => {
    try {
      (window.screen?.orientation as any)?.lock?.('landscape')?.catch?.(() => {});
    } catch {
      // Orientation lock is browser/PWA gated
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const fsElement = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    const target = (appRef.current || document.documentElement) as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };

    try {
      if (!fsElement) {
        const req = target?.requestFullscreen || target?.webkitRequestFullscreen;
        if (typeof req === 'function') {
          const result = req.call(target);
          if (result && typeof (result as Promise<void>).catch === 'function') {
            (result as Promise<void>).catch(() => {});
          }
          setIsFullscreen(true);
        } else {
          window.scrollTo(0, 1);
          setIsFullscreen(false);
        }
        tryLockLandscape();
      } else {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
        if (typeof exit === 'function') {
          const result = exit.call(doc);
          if (result && typeof (result as Promise<void>).catch === 'function') {
            (result as Promise<void>).catch(() => {});
          }
        }
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(!!(doc.fullscreenElement ?? doc.webkitFullscreenElement));
    }
  }, [tryLockLandscape]);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const handleFullscreenChange = () =>
      setIsFullscreen(!!(doc.fullscreenElement ?? doc.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const bgm = menuBgmRef.current;
    const synthScreens: ScreenId[] = ['menu', 'freeplay', 'shop', 'lobby', 'events'];
    const shouldPlaySynthBgm =
      !isPortrait &&
      synthScreens.includes(screen) &&
      !isPreviewing &&
      hasStarted &&
      !interruptionShowing;

    if (shouldPlaySynthBgm) {
      if (bgm && !bgm.paused) bgm.pause();
      MenuMusicEngine.setMuted(Boolean(playerInfo.menuBgmMuted));
      if (!playerInfo.menuBgmMuted) {
        if (typeof playerInfo.spotifyTrackIndex === 'number') {
          MenuMusicEngine.setSpotifyTrackIndex(playerInfo.spotifyTrackIndex);
        }
        const targetGenre =
          screen === 'freeplay' && selectedSong?.audioUrl?.startsWith('synth:')
            ? ((selectedSong.audioUrl.replace('synth:', '') as any) || playerInfo.menuGenre || 'spotify')
            : playerInfo.menuGenre || 'spotify';
        MenuMusicEngine.start(targetGenre, screen === 'freeplay' ? modifiers?.speed || 1 : 1);
      } else {
        MenuMusicEngine.stop();
      }
      return;
    }

    if (!isPortrait && screen === 'online_tracks' && !isPreviewing && hasStarted && !interruptionShowing) {
      MenuMusicEngine.stop();
      if (bgm) {
        bgm.volume = 0.3;
        if (!bgm.src.includes(ONLINE_BGM)) bgm.src = ONLINE_BGM;
        if (bgm.paused) bgm.play().catch(() => {});
      }
      return;
    }

    if (bgm && !bgm.paused) bgm.pause();
    if (screen !== 'game') {
      MenuMusicEngine.stop();
    }
  }, [
    screen,
    isPreviewing,
    hasStarted,
    interruptionShowing,
    isPortrait,
    playerInfo.menuGenre,
    playerInfo.menuBgmMuted,
    playerInfo.spotifyTrackIndex,
    selectedSong,
    modifiers?.speed,
  ]);

  const handleStartTap = useCallback(() => {
    if (hasStarted) return;
    AudioEngine.init();
    triggerHaptic('hit', playerInfo.haptics, 'sick');
    if (!playerInfo.menuBgmMuted) {
      if (typeof playerInfo.spotifyTrackIndex === 'number') {
        MenuMusicEngine.setSpotifyTrackIndex(playerInfo.spotifyTrackIndex);
      }
      MenuMusicEngine.start(playerInfo.menuGenre || 'spotify');
    }
    tryLockLandscape();
    setHasStarted(true);
  }, [hasStarted, playerInfo.haptics, playerInfo.menuBgmMuted, playerInfo.menuGenre, playerInfo.spotifyTrackIndex, tryLockLandscape]);

  useEffect(() => {
    if (hasStarted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleStartTap();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasStarted, handleStartTap]);

  if (updateAvailable && !interruptionsDisabled) {
    return (
      <div className="fixed inset-0 z-[99999] rc-stage flex flex-col items-center justify-center text-white p-6 overflow-hidden">
        <div className="absolute inset-0 rc-stage-dots pointer-events-none" />
        <div className="relative z-10 rc-console-tray max-w-xl w-full p-6 flex flex-col items-center gap-5 text-center">
          <h1 className="rc-hero-wordmark text-4xl sm:text-6xl text-red-400 uppercase">UPDATE REQUIRED</h1>
          <p className="w-full rc-console-inset p-4 text-base sm:text-xl font-bold text-cyan-200">{updateMessage}</p>
          <button
            onClick={() => {
              window.location.href = window.location.pathname + '?v=' + Date.now();
            }}
            className="rc-bevel-btn rc-tile-gold px-8 py-3.5 font-black text-xl text-black tracking-wider uppercase whitespace-nowrap min-h-[48px]"
          >
            RESTART GAME
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={appRef}
      className="relative w-full h-full min-h-full rc-stage font-sans text-white select-none overflow-hidden"
    >
      <div className="absolute inset-0 rc-stage-dots pointer-events-none opacity-80" />

      <div className={isPortrait ? 'hidden' : 'relative w-full h-full'}>
        {!isPortrait && (
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className={`fixed z-50 rc-bevel-btn rc-tile-slate text-slate-100 flex items-center justify-center ${
              isLandscapeCompact ? 'top-2 right-2 w-9 h-9 rounded-lg' : 'top-3 right-3 w-10 h-10 rounded-xl'
            }`}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}

        {showDevConsole && (
          <DevConsole playerInfo={playerInfo} setPlayerInfo={setPlayerInfo} setShowDevConsole={setShowDevConsole} />
        )}

        {!hasStarted ? (
          <div
            data-testid="start-screen"
            className="relative z-10 w-full h-full flex flex-col items-center justify-center cursor-pointer px-6 py-4 overflow-hidden touch-surface"
            onPointerDown={(e) => {
              e.preventDefault();
              handleStartTap();
            }}
            onClick={handleStartTap}
          >
            <RaveStageCanvas
              genre={playerInfo.menuGenre || 'spotify'}
              intensity={0.95}
              showFloatingNotes={playerInfo.bgFloatingNotes !== false}
            />

            <div className="relative z-10 flex flex-col items-center justify-center gap-4 max-w-2xl w-full">
              <div className="rc-dock-well px-3.5 py-1 flex items-center gap-2 border border-emerald-400/55 shadow-[0_0_18px_rgba(30,215,96,0.34)]">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
                  SPOTIFY RAVE PLAYLIST · DUBSTEP · HARDTEKK · METAL RAVE
                </span>
              </div>

              <h1 className="rc-hero-wordmark text-center uppercase flex flex-col items-center">
                <span
                  className={`rc-word-rhythm block ${
                    isLandscapeCompact ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-7xl md:text-8xl'
                  }`}
                >
                  RHYTHM
                </span>
                <span
                  className={`rc-word-canvas block -mt-1 ${
                    isLandscapeCompact ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-7xl md:text-8xl'
                  }`}
                >
                  CANVAS
                </span>
                <span
                  className={`rc-word-reboot block mt-0.5 ${
                    isLandscapeCompact ? 'text-lg sm:text-xl' : 'text-xl sm:text-3xl md:text-4xl'
                  }`}
                >
                  REBOOT
                </span>
              </h1>

              <button
                type="button"
                data-start="true"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartTap();
                }}
                className={`rc-bevel-btn rc-tile-pink text-white font-black uppercase tracking-widest whitespace-nowrap flex items-center gap-2.5 shadow-[0_6px_0_#080a0f,0_0_28px_rgba(255,46,136,0.65)] ${
                  isLandscapeCompact ? 'px-8 py-3 text-lg min-h-[46px]' : 'px-10 py-4 text-2xl min-h-[56px]'
                }`}
              >
                <Volume2 className="w-6 h-6 shrink-0" />
                <span>DROP THE BEAT · START</span>
              </button>

              <p className="text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase text-slate-200/90 text-center">
                60 FPS RHYTHM ENGINE · TACTILE HAPTICS · KEYBOARD / CONTROLLER / TOUCH
              </p>
            </div>
          </div>
        ) : (
          <>
            <audio ref={menuBgmRef} loop className="hidden" />

            {screen === 'menu' && (
              <MainMenu
                setScreen={setScreen}
                playerInfo={playerInfo}
                setPlayerInfo={setPlayerInfo}
                user={user}
                interruption={interruption}
                interruptionsDisabled={interruptionsDisabled}
                onToggleInterruptions={handleToggleInterruptions}
                onOpenDevConsole={() => setShowDevConsole(true)}
                onOpenChangelog={() => setShowChangelog(true)}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
            )}

            {screen === 'events' && <EventsMenu setScreen={setScreen} setGameMode={setGameMode} />}

            {screen === 'freeplay' && (
              <FreeplayMenu
                songs={songs}
                selectedSong={selectedSong}
                setSelectedSong={setSelectedSong}
                difficulty={difficulty}
                setDifficulty={setDifficulty}
                gameMode={gameMode}
                setGameMode={setGameMode}
                setScreen={setScreen}
                setCustomBeatmap={setCustomBeatmap}
                setIsPreviewing={setIsPreviewing}
                rhythmList={rhythmList}
                playerInfo={playerInfo}
                setPlayerInfo={setPlayerInfo}
                modifiers={modifiers}
                setModifiers={setModifiers}
                bestGrades={bestGrades}
              />
            )}

            {screen === 'online_tracks' && (
              <OnlineTracksMenu
                songs={songs}
                setSongs={setSongs}
                selectedSong={selectedSong}
                setSelectedSong={setSelectedSong}
                difficulty={difficulty}
                setDifficulty={setDifficulty}
                gameMode={gameMode}
                setGameMode={setGameMode}
                setScreen={setScreen}
                setCustomBeatmap={setCustomBeatmap}
                user={user}
                setIsPreviewing={setIsPreviewing}
                playerInfo={playerInfo}
                setPlayerInfo={setPlayerInfo}
                modifiers={modifiers}
                setModifiers={setModifiers}
                bestGrades={bestGrades}
              />
            )}

            {screen === 'lobby' && (
              <OnlineLobby
                peer={peerInstance}
                myPeerId={myPeerId}
                setNetworkConnection={setNetworkConnection}
                setScreen={setScreen}
                gameMode={gameMode}
              />
            )}

            {screen === 'game' && selectedSong && (
              <GameEngine
                key={`${selectedSong.id}_${selectedSong.customMap?.length || 0}`}
                song={selectedSong}
                difficulty={difficulty}
                gameMode={gameMode}
                setScreen={setScreen}
                customBeatmap={Array.isArray(selectedSong.customMap) ? normalizeChart(selectedSong.customMap) : customBeatmap}
                playerInfo={playerInfo}
                onUpdateHaptics={updateHaptics}
                onUpdateControlLayout={updateControlLayout}
                addRewards={addRewards}
                networkConnection={networkConnection}
                modifiers={modifiers}
                recordGrade={recordGrade}
                interruptionActive={interruptionShowing}
              />
            )}

            {screen === 'horse' && (
              <HorseEngine networkConnection={networkConnection} setScreen={setScreen} playerInfo={playerInfo} />
            )}

            {screen === 'editor' && (
              <SongEditor
                setScreen={setScreen}
                setSongs={setSongs}
                songs={songs}
                setSelectedSong={setSelectedSong}
                user={user}
              />
            )}

            {screen === 'shop' && (
              <ShopMenu setScreen={setScreen} playerInfo={playerInfo} setPlayerInfo={setPlayerInfo} user={user} />
            )}

            {screen === 'admin_studio' && <AdminStudio setScreen={setScreen} songs={songs} user={user} />}

            {showChangelog && <ChangelogModal onClose={closeChangelog} />}
          </>
        )}
      </div>

      {isPortrait && <RotateToLandscapeOverlay onTryLock={toggleFullscreen} />}
      {interruptionShowing && <InterruptionOverlay message={interruption?.message} />}
    </div>
  );
}

export default function App() {
  return (
    <RebootErrorBoundary>
      <RhythmCanvasApp />
    </RebootErrorBoundary>
  );
}
