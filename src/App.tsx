import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { auth, db } from './firebaseClient';
import { AudioEngine } from './game/audio';
import {
  APP_VERSION,
  CHANGELOG_STORAGE_KEY,
  CHANGELOG_VERSION,
  MENU_BGM,
  ONLINE_BGM,
  ROYALTY_FREE_SONGS,
  SECRET_DEV_CODE,
} from './game/constants';
import { addRewardsCalc, normalizeChart } from './game/rhythmLogic';
import { normalizeHapticsSettings } from './game/haptics';
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
import { ShopMenu } from './components/ShopMenu';
import { SongEditor } from './components/SongEditor';

const safeGetStorage = (key: string): string | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const safeSetStorage = (key: string, value: string): void => {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    // ignore storage quota/privacy errors
  }
};

const InterruptionOverlay: React.FC<{ message?: string }> = ({ message }) => (
  <div className="absolute inset-0 z-[99998] flex flex-col items-center justify-center bg-black/95 p-6 text-center text-white crt">
    <h1 className="text-4xl md:text-7xl font-black italic text-yellow-300">GAME INTERRUPTED</h1>
    <p className="mt-6 max-w-3xl border-4 border-cyan-400 bg-gray-950 p-6 text-xl md:text-3xl font-bold">
      {message || 'The administrator has paused gameplay.'}
    </p>
    <p className="mt-8 text-lg font-black text-cyan-300">DONATING CAN REDUCE INTERUPTION FREQUENCY</p>
  </div>
);

function RhythmCanvasApp() {
  const appRef = useRef<HTMLDivElement | null>(null);
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
    try {
      return localStorage.getItem(CHANGELOG_STORAGE_KEY) !== CHANGELOG_VERSION;
    } catch {
      return false;
    }
  });
  const closeChangelog = useCallback(() => {
    try {
      localStorage.setItem(CHANGELOG_STORAGE_KEY, CHANGELOG_VERSION);
    } catch {
      // ignore storage errors
    }
    setShowChangelog(false);
  }, []);
  const [screen, setScreen] = useState<ScreenId>('menu');

  useEffect(() => {
    document.body.dataset.screen = screen;
  }, [screen]);

  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('rhythmCanvasLocalSongs') || '[]');
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
      return JSON.parse(localStorage.getItem('rhythmCanvasGrades') || '{}');
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
      const saved = localStorage.getItem('rhythmCanvasSave');
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
      ...parsed,
      downscroll: parsed.downscroll !== undefined ? Boolean(parsed.downscroll) : true,
      haptics: normalizeHapticsSettings(parsed.haptics),
      controlLayout: normalizeControlLayout(parsed.controlLayout),
    };
  });

  useEffect(() => {
    try {
      const localSave = localStorage.getItem('rhythmCanvasSave');
      if (localSave) {
        const parsed = JSON.parse(localSave);
        setPlayerInfo((prev) => ({
          ...prev,
          ...parsed,
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
                    unlockedShapes: data.unlockedShapes || prev.unlockedShapes || ['arrow'],
                    equippedShape: data.equippedShape || prev.equippedShape || 'arrow',
                    customColors: data.customColors || prev.customColors || ['#ff0055', '#00ffcc', '#00ff00', '#ffaa00'],
                    botplay: data.botplay !== undefined ? data.botplay : prev.botplay,
                    downscroll: data.downscroll !== undefined ? Boolean(data.downscroll) : prev.downscroll,
                    haptics: normalizeHapticsSettings(data.haptics || prev.haptics),
                    controlLayout: normalizeControlLayout(data.controlLayout || prev.controlLayout),
                  };
                  localStorage.setItem('rhythmCanvasSave', JSON.stringify(newData));
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
          const localOnly = prev.filter((x) => x.artist === 'Royalty Free' || x.artist === 'USER');
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

  const toggleFullscreen = () => {
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
  };

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
    if (!bgm) return;
    bgm.volume = 0.3;

    const menuScreens: ScreenId[] = ['menu', 'freeplay', 'online_tracks', 'shop', 'lobby', 'events'];
    const shouldPlayBGM = menuScreens.includes(screen) && !isPreviewing && hasStarted && !interruptionShowing;

    if (shouldPlayBGM) {
      const targetSrc = screen === 'online_tracks' ? ONLINE_BGM : MENU_BGM;
      if (!bgm.src.includes(targetSrc)) {
        bgm.src = targetSrc;
      }
      if (bgm.paused) {
        bgm.play().catch(() => {});
      }
    } else {
      bgm.pause();
    }
  }, [screen, isPreviewing, hasStarted, interruptionShowing]);

  const handleStartTap = () => {
    AudioEngine.init();
    setHasStarted(true);
  };

  if (updateAvailable && !interruptionsDisabled) {
    return (
      <div className="absolute inset-0 z-[99999] flex flex-col items-center justify-center bg-black/95 text-white p-4 md:p-8 overflow-hidden crt">
        <h1 className="text-5xl md:text-8xl font-black italic text-red-500 mb-4 animate-pulse transform skew-x-[-5deg] drop-shadow-[6px_6px_0_#000] text-center">
          UPDATE REQUIRED
        </h1>
        <p className="text-lg md:text-4xl font-bold text-cyan-400 mb-8 md:mb-12 max-w-3xl text-center transform skew-x-[5deg] bg-gray-900 p-6 border-4 border-cyan-400 shadow-[8px_8px_0_#000]">
          {updateMessage}
        </p>
        <button
          onClick={() => {
            window.location.href = window.location.pathname + '?v=' + Date.now();
          }}
          className="bg-yellow-400 text-black px-8 md:px-12 py-4 md:py-6 font-black text-2xl md:text-4xl border-4 border-white shadow-[8px_8px_0_#fff] transform skew-x-[-10deg] hover:-translate-y-2 transition-all active:translate-y-0 active:shadow-none"
        >
          RESTART GAME
        </button>
      </div>
    );
  }

  const disableCrtOverlay = hasStarted && (screen === 'game' || screen === 'horse');

  return (
    <div
      ref={appRef}
      className={`relative w-full h-full min-h-full game-bg font-sans text-white select-none overflow-hidden ${
        disableCrtOverlay ? '' : 'crt'
      }`}
    >
      <button
        onClick={toggleFullscreen}
        aria-label="Toggle fullscreen"
        className="absolute top-2 right-2 md:top-5 md:right-5 z-50 bg-black p-2 md:p-3 border-2 md:border-4 border-white text-white hover:bg-white hover:text-black transition-colors shadow-[4px_4px_0_#fff] md:shadow-[6px_6px_0_#fff] transform skew-x-[-5deg] active:translate-y-1 active:shadow-none"
      >
        {isFullscreen ? (
          <Minimize className="w-5 h-5 md:w-7 md:h-7 transform skew-x-[5deg]" />
        ) : (
          <Maximize className="w-5 h-5 md:w-7 md:h-7 transform skew-x-[5deg]" />
        )}
      </button>

      {showDevConsole && (
        <DevConsole playerInfo={playerInfo} setPlayerInfo={setPlayerInfo} setShowDevConsole={setShowDevConsole} />
      )}

      {!hasStarted ? (
        <div
          data-testid="start-screen"
          className="w-full h-full flex flex-col items-center justify-center cursor-pointer px-4 overflow-y-auto touch-surface"
          onPointerDown={(e) => {
            e.preventDefault();
            handleStartTap();
          }}
          onClick={handleStartTap}
        >
          <h1 className="reboot-title text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black italic text-pink-500 drop-shadow-[6px_6px_0_#000] mb-8 animate-pulse transform skew-x-[-10deg] text-center leading-tight">
            RHYTHM
            <br />
            <span className="text-yellow-400">CANVAS</span>
            <div className="text-2xl sm:text-3xl md:text-5xl text-cyan-300 tracking-[.35em] mt-2">REBOOT</div>
          </h1>
          <div className="text-xl sm:text-2xl md:text-3xl font-black text-white bg-black px-6 sm:px-8 py-3 sm:py-4 border-4 border-white shadow-[8px_8px_0_#fff]">
            CLICK TO START
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
