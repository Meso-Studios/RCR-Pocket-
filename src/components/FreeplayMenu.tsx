import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Globe,
  Infinity as InfinityIcon,
  Play,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { WaveformPulse } from '../game/audio';
import { getDurationString, getGrade, normalizeChart } from '../game/rhythmLogic';
import { safeSetStorage } from '../game/storage';
import { useIsCompactLandscape } from '../game/useViewport';
import type { ChartNote, Difficulty, GameMode, Modifiers, PlayerInfo, ScreenId, Song } from '../game/types';

interface FreeplayMenuProps {
  songs: Song[];
  selectedSong: Song | null;
  setSelectedSong: (s: Song) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  gameMode: GameMode;
  setGameMode: (m: GameMode) => void;
  setScreen: (s: ScreenId) => void;
  setCustomBeatmap: (m: ChartNote[] | null) => void;
  setIsPreviewing: (v: boolean) => void;
  rhythmList?: Array<string | number>;
  playerInfo: PlayerInfo;
  setPlayerInfo: React.Dispatch<React.SetStateAction<PlayerInfo>>;
  modifiers: Modifiers;
  setModifiers: React.Dispatch<React.SetStateAction<Modifiers>>;
  bestGrades: Record<string, number>;
}

export const FreeplayMenu: React.FC<FreeplayMenuProps> = ({
  songs,
  selectedSong,
  setSelectedSong,
  difficulty,
  setDifficulty,
  gameMode,
  setGameMode,
  setScreen,
  setCustomBeatmap,
  setIsPreviewing,
  rhythmList = [],
  playerInfo,
  setPlayerInfo,
  modifiers,
  setModifiers,
  bestGrades,
}) => {
  const diffColors: Record<Difficulty, string> = {
    easy: 'text-green-400',
    normal: 'text-yellow-400',
    hard: 'text-red-500',
    insane: 'text-purple-500',
  };
  const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];
  const [showOwnedMods, setShowOwnedMods] = useState(false);
  const [showModifiersModal, setShowModifiersModal] = useState(false);
  const [mobilePane, setMobilePane] = useState<'preview' | 'list'>('preview');
  const isLandscapeCompact = useIsCompactLandscape();
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (gameMode !== 'battle_royale') return;
    setPlayerInfo((p) => {
      if (!p.equippedNoteProduct && p.equippedShape === 'arrow' && p.equippedSkin === 'default') return p;
      const next = { ...p, equippedNoteProduct: null, equippedShape: 'arrow' as const, equippedSkin: 'default' };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
      return next;
    });
  }, [gameMode, setPlayerInfo]);

  const modes: Array<{ id: GameMode; icon: React.ReactNode; text: string }> = [
    { id: 'standard', icon: <Play className="w-4 h-4" />, text: 'Standard' },
    { id: 'endless', icon: <InfinityIcon className="w-4 h-4" />, text: 'Endless' },
    { id: 'online_vs', icon: <Globe className="w-4 h-4" />, text: 'Online VS' },
    { id: 'battle_royale', icon: <Users className="w-4 h-4" />, text: '50P Royale' },
  ];

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const localSongs = useMemo(
    () => songs.filter((s) => s.artist === 'Royalty Free' || s.artist === 'USER'),
    [songs]
  );

  const [showRhythmList, setShowRhythmList] = useState(false);

  const displayedSongs = useMemo(() => {
    if (!showRhythmList) return localSongs;
    return rhythmList
      .map((id) => songs.find((s) => String(s.id) === String(id)))
      .filter((s): s is Song => Boolean(s));
  }, [localSongs, rhythmList, showRhythmList, songs]);

  const activeModCount =
    (modifiers.speed !== 1 ? 1 : 0) +
    (modifiers.altChart ? 1 : 0) +
    (modifiers.nerf > 0 ? 1 : 0) +
    (modifiers.noFail ? 1 : 0) +
    (modifiers.extreme ? 1 : 0) +
    ((playerInfo.activeGameMods?.length || 0) > 0 ? 1 : 0);

  useEffect(() => {
    if (displayedSongs.length > 0 && !displayedSongs.find((s) => s.id === selectedSong?.id)) {
      setSelectedSong(displayedSongs[0]);
    }
  }, [displayedSongs, selectedSong, setSelectedSong]);

  useEffect(() => {
    if (!selectedSong || !selectedSong.audioUrl) {
      setIsPreviewing(false);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      }
      return;
    }

    setIsPreviewing(true);

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
    }

    const audio = new Audio(selectedSong.audioUrl);
    audio.volume = 0;
    audio.playbackRate = modifiers?.speed || 1;
    (audio as any).preservesPitch = false;
    previewAudioRef.current = audio;
    const detachPulse = selectedSong.coverUrl
      ? WaveformPulse.attach(audio, `[data-wave-cover="${String(selectedSong.id)}"]`)
      : () => {};

    let fadeInInterval: ReturnType<typeof setInterval> | undefined;
    let fadeOutInterval: ReturnType<typeof setInterval> | undefined;
    let stopTimeout: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;

    audio
      .play()
      .then(() => {
        if (isCancelled) {
          audio.pause();
          return;
        }
        let vol = 0;
        fadeInInterval = setInterval(() => {
          if (vol < 0.4) {
            vol += 0.05;
            audio.volume = Math.min(vol, 0.4);
          } else if (fadeInInterval) {
            clearInterval(fadeInInterval);
          }
        }, 100);

        stopTimeout = setTimeout(() => {
          let fadeOutVol = audio.volume;
          fadeOutInterval = setInterval(() => {
            if (fadeOutVol > 0.05) {
              fadeOutVol -= 0.05;
              audio.volume = Math.max(fadeOutVol, 0);
            } else {
              if (fadeOutInterval) clearInterval(fadeOutInterval);
              audio.pause();
              if (!isCancelled) setIsPreviewing(false);
            }
          }, 100);
        }, 10000);
      })
      .catch(() => {
        if (!isCancelled) setIsPreviewing(false);
      });

    return () => {
      isCancelled = true;
      if (fadeInInterval) clearInterval(fadeInInterval);
      if (fadeOutInterval) clearInterval(fadeOutInterval);
      if (stopTimeout) clearTimeout(stopTimeout);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      }
      detachPulse();
      setIsPreviewing(false);
    };
  }, [selectedSong, setIsPreviewing, modifiers?.speed]);

  const cycleDiff = (dir: number) => {
    let nextIdx = diffs.indexOf(difficulty) + dir;
    if (nextIdx < 0) nextIdx = diffs.length - 1;
    if (nextIdx >= diffs.length) nextIdx = 0;
    setDifficulty(diffs[nextIdx]);
  };
  const cycleMode = (dir: number) => {
    let nextIdx = modes.findIndex((m) => m.id === gameMode) + dir;
    if (nextIdx < 0) nextIdx = modes.length - 1;
    if (nextIdx >= modes.length) nextIdx = 0;
    setGameMode(modes[nextIdx].id);
  };
  const cycleSong = (dir: number) => {
    if (!displayedSongs.length) return;
    const idx = displayedSongs.findIndex((s) => String(s.id) === String(selectedSong?.id));
    const safeIdx = idx < 0 ? 0 : idx;
    const nextIdx = (safeIdx + dir + displayedSongs.length) % displayedSongs.length;
    setSelectedSong(displayedSongs[nextIdx]);
  };

  const handlePlayClick = () => {
    if (!selectedSong) return;
    if (modifiers.extreme && (bestGrades[String(selectedSong.id)] || 0) < 90) {
      setModifiers((m) => ({ ...m, extreme: false }));
    }
    setCustomBeatmap(Array.isArray(selectedSong.customMap) ? normalizeChart(selectedSong.customMap).map((n) => ({ ...n })) : null);
    if (gameMode === 'online_vs') setScreen('lobby');
    else setScreen('game');
  };

  const activeMode =
    modes.find((m) => m.id === gameMode) ||
    (gameMode === 'battle_royale'
      ? { id: 'battle_royale' as GameMode, text: '50-BR ROYALE', icon: modes[0].icon }
      : gameMode === 'online_vs'
        ? { id: 'online_vs' as GameMode, text: '1V1 H.O.R.S.E.', icon: modes[0].icon }
        : modes[0]);

  if (isLandscapeCompact) {
    return (
      <div className="arcade-stage relative w-full h-full flex flex-row overflow-hidden safe-top safe-bottom">
        <div className="absolute inset-0 opacity-25 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGVsbGlwc2UgY3g9IjEwIiBjeT0iMTAiIHJ4PSI1IiByeT0iNSIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')] bg-repeat pointer-events-none" />

        {/* Left Track Browser Rail */}
        <div className="w-[37%] h-full flex flex-col bg-black/65 border-r-4 border-yellow-400 z-10 shrink-0">
          <div className="p-2 border-b-2 border-white/15 flex items-center gap-1.5 shrink-0">
            <div className="flex-1 flex bg-gray-900 border-2 border-black rounded-lg overflow-hidden">
              <button
                onClick={() => setShowRhythmList(false)}
                className={`flex-1 py-1.5 px-1.5 text-[11px] font-black uppercase min-h-[36px] ${
                  !showRhythmList ? 'bg-yellow-400 text-black' : 'text-gray-300'
                }`}
              >
                LOCAL ({localSongs.length})
              </button>
              <button
                onClick={() => setShowRhythmList(true)}
                className={`flex-1 py-1.5 px-1.5 text-[11px] font-black uppercase min-h-[36px] flex items-center justify-center gap-1 ${
                  showRhythmList ? 'bg-red-600 text-white' : 'text-gray-300'
                }`}
              >
                <Activity className="w-3 h-3" /> LIST
              </button>
            </div>
            <button
              onClick={() => setScreen('online_tracks')}
              className="px-2.5 py-1.5 bg-cyan-500 text-black border-2 border-black rounded-lg text-[11px] font-black uppercase min-h-[36px] flex items-center gap-1 shrink-0"
            >
              <Globe className="w-3.5 h-3.5" /> ONLINE
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {displayedSongs.length === 0 && showRhythmList && (
              <div className="text-xs font-bold text-gray-400 bg-black/60 p-3 border-2 border-red-900 rounded-lg">
                No tracks found for the Rhythm List yet.
              </div>
            )}
            {displayedSongs.map((song) => {
              const rank = rhythmList.findIndex((id) => String(id) === String(song.id)) + 1;
              const isRanked = rank > 0;
              const isSel = String(selectedSong?.id) === String(song.id);
              return (
                <button
                  key={song.id}
                  onClick={() => setSelectedSong(song)}
                  className={`w-full px-3 py-2 border-2 rounded-lg transition-colors flex items-center justify-between gap-2 min-h-[42px] ${
                    isSel
                      ? 'bg-white text-black border-yellow-400 shadow-[3px_3px_0_#facc15]'
                      : 'bg-gray-900/90 text-gray-200 border-black hover:bg-gray-800'
                  }`}
                >
                  <span className={`text-[11px] font-black shrink-0 ${isRanked ? 'text-red-500' : isSel ? 'text-gray-600' : 'text-gray-400'}`}>
                    {isRanked ? `#${rank}` : `${song.bpm} BPM`}
                  </span>
                  <span className="font-black text-sm uppercase italic truncate text-right">{song.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Track Stage & Launch Cockpit */}
        <div
          className="w-[63%] h-full flex flex-col justify-between p-3 pr-12 z-10 overflow-hidden"
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) swipeRef.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            if (!swipeRef.current || !e.changedTouches[0]) return;
            const dx = e.changedTouches[0].clientX - swipeRef.current.x;
            const dy = e.changedTouches[0].clientY - swipeRef.current.y;
            swipeRef.current = null;
            if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.4) {
              cycleSong(dx < 0 ? 1 : -1);
            }
          }}
        >
          {/* Top Action Header */}
          <div className="flex items-center justify-between gap-2 shrink-0">
            <button
              onClick={() => setScreen('menu')}
              className="flex items-center gap-1 font-black bg-white border-2 border-black text-black px-3 py-1.5 rounded-lg text-xs shadow-[3px_3px_0_#000] min-h-[38px]"
            >
              <ChevronLeft className="w-4 h-4" /> BACK
            </button>

            <div className="flex items-center gap-2">
              <button
                data-testid="landscape-mods-btn"
                onClick={() => setShowModifiersModal(true)}
                className="flex items-center gap-1.5 font-black bg-gray-900/95 text-cyan-300 border-2 border-cyan-400/70 px-3 py-1.5 rounded-lg text-xs min-h-[38px]"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>MODS ×{modifiers.speed.toFixed(2)}</span>
                {activeModCount > 0 && (
                  <span className="bg-cyan-400 text-black px-1.5 py-0.2 rounded-full text-[10px]">
                    {activeModCount}
                  </span>
                )}
              </button>

              <button
                onClick={handlePlayClick}
                disabled={!selectedSong}
                data-testid="play-track-button"
                className={`flex items-center gap-1.5 font-black border-2 border-black px-5 py-1.5 rounded-lg text-sm uppercase tracking-wider shadow-[4px_4px_0_#000] min-h-[38px] ${
                  selectedSong ? 'bg-pink-500 text-black' : 'bg-gray-500 text-gray-700 cursor-not-allowed'
                }`}
              >
                <Play className="w-4 h-4" fill="currentColor" />
                <span>PLAY</span>
              </button>
            </div>
          </div>

          {/* Middle Hero Preview */}
          <div className="flex-1 min-h-0 flex items-center gap-3.5 px-1">
            {selectedSong?.coverUrl && (
              <img
                src={selectedSong.coverUrl}
                referrerPolicy="no-referrer"
                data-wave-cover={String(selectedSong.id)}
                alt={selectedSong.title}
                className="reactive-cover w-24 h-24 rounded-xl object-cover border-2 border-yellow-400 shadow-[5px_5px_0_#000] shrink-0"
              />
            )}
            <div className="flex-1 min-w-0 bg-black/65 border border-white/15 backdrop-blur-sm rounded-xl px-3.5 py-2.5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl lg:text-3xl font-black italic text-white uppercase drop-shadow-[2px_2px_0_#000] truncate">
                  {selectedSong?.title || 'NO TRACKS'}
                </h2>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => cycleSong(-1)}
                    aria-label="Previous track"
                    className="p-1.5 bg-white border-2 border-black rounded text-black min-w-[34px] min-h-[34px] flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => cycleSong(1)}
                    aria-label="Next track"
                    className="p-1.5 bg-white border-2 border-black rounded text-black min-w-[34px] min-h-[34px] flex items-center justify-center"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs sm:text-sm font-black text-cyan-300 tracking-wider uppercase truncate">
                {selectedSong?.artist || ''}
              </p>
              {selectedSong && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-black text-gray-200">
                  <span className="text-white">{selectedSong.bpm} BPM</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-yellow-300">⏱ {getDurationString(selectedSong)}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-green-300">BEST: {getGrade(bestGrades[String(selectedSong.id)] || 0)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom 2-Column Setup Dock */}
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <div className="flex items-center justify-between bg-gray-900/95 border-2 border-black rounded-lg p-1.5 shadow-[3px_3px_0_#000]">
              <button
                onClick={() => cycleDiff(-1)}
                aria-label="Previous difficulty"
                className="p-1.5 bg-white border border-black rounded text-black min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className={`text-center text-sm font-black uppercase ${diffColors[difficulty]}`}>{difficulty}</div>
              <button
                onClick={() => cycleDiff(1)}
                aria-label="Next difficulty"
                className="p-1.5 bg-white border border-black rounded text-black min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between bg-gray-900/95 border-2 border-black rounded-lg p-1.5 shadow-[3px_3px_0_#000]">
              <button
                onClick={() => cycleMode(-1)}
                aria-label="Previous mode"
                className="p-1.5 bg-white border border-black rounded text-black min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center justify-center gap-1.5 text-sm font-black uppercase text-cyan-400 truncate px-1">
                {activeMode.icon}
                <span className="truncate">{activeMode.text}</span>
              </div>
              <button
                onClick={() => cycleMode(1)}
                aria-label="Next mode"
                className="p-1.5 bg-white border border-black rounded text-black min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modifiers Drawer Modal */}
        {showModifiersModal && (
          <div className="fixed inset-0 z-[190] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="bg-gray-950 border-4 border-cyan-400 rounded-xl p-3.5 max-w-xl w-full max-h-[92dvh] flex flex-col gap-2.5 text-white shadow-[8px_8px_0_#000]">
              <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-black text-cyan-300 tracking-widest">TRACK MODIFIERS</h3>
                  <button
                    onClick={() => setShowOwnedMods(true)}
                    className="bg-yellow-400 text-black px-2.5 py-1 rounded text-xs font-black min-h-[32px]"
                  >
                    OWNED DLC MODS
                  </button>
                </div>
                <button
                  onClick={() => setShowModifiersModal(false)}
                  aria-label="Close modifiers"
                  className="bg-white text-black border-2 border-black p-1 rounded min-w-[34px] min-h-[34px] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="hud-chip p-2 font-black text-xs col-span-2 flex flex-col justify-center">
                  <span>SPEED ×{modifiers.speed.toFixed(2)}</span>
                  <input
                    className="w-full accent-cyan-400 mt-1.5"
                    type="range"
                    min="1"
                    max="4"
                    step=".05"
                    value={modifiers.speed}
                    onChange={(e) => setModifiers((m) => ({ ...m, speed: +e.target.value }))}
                  />
                </label>

                <button
                  onClick={() => setModifiers((m) => ({ ...m, altChart: !m.altChart }))}
                  className={`hud-chip p-2 font-black text-xs min-h-[54px] ${
                    modifiers.altChart ? 'text-cyan-300 border-cyan-400' : 'text-gray-400'
                  }`}
                >
                  ALT CHART
                  <br />
                  <small>REMIX LANES</small>
                </button>

                <div className="hud-chip p-1.5 text-center flex flex-col justify-between">
                  <button
                    onClick={() => setModifiers((m) => ({ ...m, nerf: Math.min(90, (m.nerf || 0) + 10) }))}
                    className="font-black text-orange-300 text-xs"
                  >
                    NERF −10% ({modifiers.nerf || 0}%)
                  </button>
                  <button
                    onClick={() => setModifiers((m) => ({ ...m, nerf: 0 }))}
                    disabled={!modifiers.nerf}
                    className="w-full mt-1 bg-white/10 disabled:opacity-30 text-[10px] font-black py-1"
                  >
                    RESET
                  </button>
                </div>

                <button
                  onClick={() =>
                    setModifiers((m) => ({ ...m, noFail: !m.noFail, extreme: m.noFail ? m.extreme : false }))
                  }
                  className={`hud-chip p-2 font-black text-xs min-h-[54px] ${
                    modifiers.noFail ? 'text-green-300' : 'text-gray-400'
                  }`}
                >
                  NO FAIL
                  <br />
                  <small>IMMORTAL</small>
                </button>

                <button
                  disabled={(bestGrades[String(selectedSong?.id)] || 0) < 90}
                  onClick={() => setModifiers((m) => ({ ...m, extreme: !m.extreme, noFail: false }))}
                  className={`hud-chip p-2 font-black text-xs disabled:opacity-35 min-h-[54px] ${
                    modifiers.extreme ? 'text-red-400' : 'text-gray-400'
                  }`}
                >
                  EXTREME
                  <br />
                  <small>{(bestGrades[String(selectedSong?.id)] || 0) >= 90 ? '1 MISS = DEATH' : 'NEED A GRADE'}</small>
                </button>
              </div>

              <button
                onClick={() => setShowModifiersModal(false)}
                className="w-full py-2 bg-cyan-400 text-black font-black text-sm border-2 border-black rounded-lg min-h-[40px]"
              >
                DONE
              </button>
            </div>
          </div>
        )}

        {showOwnedMods && (
          <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
            <div className="bg-gray-950 border-4 border-yellow-400 p-5 max-w-lg w-full max-h-[85dvh] overflow-y-auto">
              <h2 className="text-xl font-black text-yellow-300">PURCHASED MODS</h2>
              {(playerInfo.unlockedGameMods || []).filter((id) => id !== 'dance_rhythm_pitch').length === 0 ? (
                <p className="my-4 text-sm text-gray-400">Buy mods from the Shop first.</p>
              ) : (
                (playerInfo.unlockedGameMods || [])
                  .filter((id) => id !== 'dance_rhythm_pitch')
                  .map((id) => {
                    const active = (playerInfo.activeGameMods || []).includes(id);
                    return (
                      <React.Fragment key={id}>
                        <button
                          onClick={() =>
                            setPlayerInfo((p) => {
                              const a = p.activeGameMods || [];
                              const next = {
                                ...p,
                                activeGameMods: active
                                  ? a.filter((x) => x !== id)
                                  : [...a.filter((x) => !['rhythm_hero', 'dance_rhythm_pitch'].includes(x)), id],
                              };
                              safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
                              return next;
                            })
                          }
                          className={`w-full p-3 my-2 font-black text-base ${
                            active ? 'bg-green-500 text-black' : 'bg-gray-800 text-white'
                          }`}
                        >
                          RHYTHM HERO DLC • {active ? 'ACTIVE' : 'INACTIVE'}
                        </button>
                      </React.Fragment>
                    );
                  })
              )}
              <button onClick={() => setShowOwnedMods(false)} className="w-full bg-white text-black p-2.5 font-black mt-3 min-h-[42px]">
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="arcade-stage relative w-full h-full flex flex-col md:flex-row transition-colors duration-500 overflow-hidden safe-top safe-bottom">
      <div className="absolute inset-0 opacity-40 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGVsbGlwc2UgY3g9IjEwIiBjeT0iMTAiIHJ4PSI1IiByeT0iNSIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')] bg-repeat pointer-events-none" />

      {/* Mobile portrait top bar with BACK + mobile tab switch */}
      <div className="md:hidden w-full flex items-center justify-between gap-2 px-3 pt-2 pb-2 pr-14 z-20 shrink-0 bg-black/75 border-b-2 border-yellow-400">
        <button
          onClick={() => setScreen('menu')}
          className="flex items-center gap-1 text-base font-black bg-white border-4 border-black text-black px-3 py-1.5 shadow-[4px_4px_0_#000] transform skew-x-[-10deg] min-h-[44px]"
        >
          <span className="transform skew-x-[10deg] flex items-center">
            <ChevronLeft className="w-5 h-5" /> BACK
          </span>
        </button>
        <div className="flex gap-1.5 flex-1 max-w-[230px]">
          <button
            onClick={() => setMobilePane('preview')}
            className={`flex-1 py-2 px-2 text-xs font-black border-2 border-black min-h-[44px] ${
              mobilePane === 'preview' ? 'bg-yellow-400 text-black' : 'bg-gray-900 text-gray-300'
            }`}
          >
            PLAY / MODS
          </button>
          <button
            onClick={() => setMobilePane('list')}
            className={`flex-1 py-2 px-2 text-xs font-black border-2 border-black min-h-[44px] ${
              mobilePane === 'list' ? 'bg-yellow-400 text-black' : 'bg-gray-900 text-gray-300'
            }`}
          >
            TRACKS ({displayedSongs.length})
          </button>
        </div>
      </div>

      {/* Preview Deck */}
      <div
        className={`browser-preview preview-deck w-full md:w-2/3 flex-1 md:h-full justify-start xl:justify-center ${
          mobilePane === 'preview' ? 'flex' : 'hidden md:flex'
        } flex-col p-4 z-10 border-b-4 md:border-b-0 md:border-l-4 border-yellow-400 overflow-y-auto custom-scrollbar`}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) swipeRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          if (!swipeRef.current || !e.changedTouches[0]) return;
          const dx = e.changedTouches[0].clientX - swipeRef.current.x;
          const dy = e.changedTouches[0].clientY - swipeRef.current.y;
          swipeRef.current = null;
          if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            cycleSong(dx < 0 ? 1 : -1);
          }
        }}
      >
        <div className="hidden md:block mb-6 mt-2 w-full">
          <button
            onClick={() => setScreen('menu')}
            className="flex items-center gap-2 font-black bg-white border-4 border-black text-black hover:bg-gray-200 transition-all shadow-[6px_6px_0_#000] transform skew-x-[-10deg] w-max text-xl md:text-2xl px-4 md:px-6 py-2 md:py-3"
          >
            <span className="transform skew-x-[10deg] flex items-center">
              <ChevronLeft className="w-6 h-6 md:w-8 md:h-8" /> BACK
            </span>
          </button>
        </div>

        <div className={`track-detail ${selectedSong?.coverUrl ? 'has-cover' : 'no-cover'} border-4 border-transparent pl-2 sm:pl-4 border-l-white`}>
          {selectedSong?.coverUrl && (
            <img
              src={selectedSong.coverUrl}
              referrerPolicy="no-referrer"
              data-wave-cover={String(selectedSong.id)}
              alt={selectedSong.title}
              className="reactive-cover cover-art w-36 h-36 object-cover border-4 border-yellow-400 shadow-[10px_10px_0_#000] mb-4"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-black italic drop-shadow-[6px_6px_0_#000] leading-tight text-white uppercase break-words min-w-0">
              {selectedSong?.title || 'NO TRACKS'}
            </h2>
            <div className="flex md:hidden items-center gap-1 shrink-0">
              <button
                onClick={() => cycleSong(-1)}
                aria-label="Previous track"
                className="p-2 bg-white border-2 border-black text-black min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={() => cycleSong(1)}
                aria-label="Next track"
                className="p-2 bg-white border-2 border-black text-black min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>
          <p className="text-lg md:text-3xl font-black text-gray-200 mt-2 tracking-widest uppercase drop-shadow-[4px_4px_0_#000]">
            {selectedSong?.artist || ''}
          </p>

          {selectedSong && (
            <div className="mt-3 flex flex-wrap gap-3">
              <span className="bg-black border-2 border-white text-white px-3 py-1 font-black text-base md:text-xl transform skew-x-[-5deg] shadow-[2px_2px_0_#fff]">
                <span className="transform skew-x-[5deg] inline-block">{selectedSong.bpm} BPM</span>
              </span>
              <span className="bg-black border-2 border-yellow-400 text-yellow-400 px-3 py-1 font-black text-base md:text-xl transform skew-x-[-5deg] shadow-[2px_2px_0_#facc15]">
                <span className="transform skew-x-[5deg] inline-block">⏱ {getDurationString(selectedSong)}</span>
              </span>
            </div>
          )}

          <div className="difficulty-dock flex flex-row flex-wrap gap-2 mt-4">
            <div className="flex items-center justify-between md:justify-start gap-2 md:gap-6 bg-gray-900 border-4 border-black p-1.5 sm:p-2 shadow-[6px_6px_0_#000] w-full md:w-max">
              <button
                onClick={() => cycleDiff(-1)}
                aria-label="Previous difficulty"
                className="p-2 bg-white border-2 border-black text-black hover:bg-gray-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div className={`w-28 md:w-40 text-center text-xl md:text-4xl font-black uppercase drop-shadow-[4px_4px_0_#000] ${diffColors[difficulty]}`}>
                {difficulty}
              </div>
              <button
                onClick={() => cycleDiff(1)}
                aria-label="Next difficulty"
                className="p-2 bg-white border-2 border-black text-black hover:bg-gray-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
            <div className="flex items-center justify-between md:justify-start gap-2 md:gap-6 bg-gray-900 border-4 border-black p-1.5 sm:p-2 shadow-[6px_6px_0_#000] w-full md:w-max">
              <button
                onClick={() => cycleMode(-1)}
                aria-label="Previous mode"
                className="p-2 bg-white border-2 border-black text-black hover:bg-gray-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div className="w-40 md:w-56 flex items-center justify-center gap-2 text-lg md:text-3xl font-black uppercase drop-shadow-[4px_4px_0_#000] text-cyan-400">
                <span className="w-6 h-6 flex items-center justify-center">{activeMode.icon}</span>{' '}
                {activeMode.text}
              </div>
              <button
                onClick={() => cycleMode(1)}
                aria-label="Next mode"
                className="p-2 bg-white border-2 border-black text-black hover:bg-gray-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="modifier-deck mt-3 p-3 w-full max-w-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <h3 className="text-cyan-300 font-black tracking-[.18em] text-sm sm:text-base">MODIFIERS</h3>
              <button
                onClick={() => setShowOwnedMods(true)}
                className="bg-yellow-400 text-black px-3 py-1.5 font-black text-xs sm:text-sm min-h-[38px]"
              >
                OWNED MODS
              </button>
              <span className="text-xs text-gray-300">BEST: {getGrade(bestGrades[String(selectedSong?.id)] || 0)}</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <label className="hud-chip p-2.5 font-black text-xs sm:text-sm">
                SPEED ×{modifiers.speed.toFixed(2)}
                <input
                  className="w-full accent-cyan-400 mt-1"
                  type="range"
                  min="1"
                  max="4"
                  step=".05"
                  value={modifiers.speed}
                  onChange={(e) => setModifiers((m) => ({ ...m, speed: +e.target.value }))}
                />
              </label>
              <button
                onClick={() => setModifiers((m) => ({ ...m, altChart: !m.altChart }))}
                className={`hud-chip p-2.5 font-black text-xs sm:text-sm min-h-[56px] ${
                  modifiers.altChart ? 'text-cyan-300 border-cyan-400' : 'text-gray-400'
                }`}
              >
                ALT CHART
                <br />
                <small>REMIX LANES</small>
              </button>
              <div className="hud-chip p-2 text-center">
                <button
                  onClick={() => setModifiers((m) => ({ ...m, nerf: Math.min(90, (m.nerf || 0) + 10) }))}
                  className="font-black text-orange-300 px-2 text-xs sm:text-sm"
                >
                  NERF −10%
                  <br />
                  <small>{modifiers.nerf || 0}% DELETED</small>
                </button>
                <button
                  onClick={() => setModifiers((m) => ({ ...m, nerf: 0 }))}
                  disabled={!modifiers.nerf}
                  className="block w-full mt-1 bg-white/10 disabled:opacity-30 text-xs font-black py-1"
                >
                  RESET
                </button>
              </div>
              <button
                onClick={() =>
                  setModifiers((m) => ({ ...m, noFail: !m.noFail, extreme: m.noFail ? m.extreme : false }))
                }
                className={`hud-chip p-2.5 font-black text-xs sm:text-sm min-h-[56px] ${
                  modifiers.noFail ? 'text-green-300' : 'text-gray-400'
                }`}
              >
                NO FAIL
                <br />
                <small>IMMORTAL</small>
              </button>
              <button
                disabled={(bestGrades[String(selectedSong?.id)] || 0) < 90}
                onClick={() => setModifiers((m) => ({ ...m, extreme: !m.extreme, noFail: false }))}
                className={`hud-chip p-2.5 font-black text-xs sm:text-sm disabled:opacity-35 min-h-[56px] col-span-2 lg:col-span-1 ${
                  modifiers.extreme ? 'text-red-400' : 'text-gray-400'
                }`}
              >
                EXTREME
                <br />
                <small>{(bestGrades[String(selectedSong?.id)] || 0) >= 90 ? 'ONE MISS = DEATH' : 'GET A GRADE TO UNLOCK'}</small>
              </button>
            </div>
          </div>

          <button
            onClick={handlePlayClick}
            disabled={!selectedSong}
            data-testid="play-track-button"
            className={`play-launch mt-4 mb-4 w-full sm:w-max justify-center border-4 border-black px-8 md:px-12 py-3.5 md:py-5 font-black text-2xl md:text-5xl uppercase tracking-widest shadow-[6px_6px_0_#000] md:shadow-[10px_10px_0_#000] transition-all flex items-center gap-3 transform skew-x-[-10deg] min-h-[60px] ${
              selectedSong
                ? 'bg-pink-500 text-black hover:translate-y-[-4px] active:translate-y-0 group'
                : 'bg-gray-500 text-gray-700 cursor-not-allowed'
            }`}
          >
            <Play
              className={`transition-transform text-black transform skew-x-[10deg] w-8 h-8 md:w-12 md:h-12 ${
                selectedSong ? 'group-hover:scale-125' : ''
              }`}
              fill="currentColor"
            />
            <span className="transform skew-x-[10deg]">PLAY</span>
          </button>
        </div>
      </div>

      {/* Song Browser List */}
      <div
        className={`browser-list song-browser w-full md:w-1/3 flex-1 md:h-full ${
          mobilePane === 'list' ? 'flex' : 'hidden md:flex'
        } overflow-y-auto p-3 sm:p-4 z-10 custom-scrollbar flex-col`}
      >
        <div className="dial-window flex flex-col gap-2 mt-1 pb-20 md:pb-12">
          <button
            onClick={() => setScreen('online_tracks')}
            className="w-full text-right p-4 md:p-5 border-4 border-black transition-all duration-200 transform skew-x-[-5deg] bg-cyan-700 text-white hover:bg-cyan-600 shadow-[4px_4px_0_#000] min-h-[54px]"
          >
            <div className="font-black text-lg md:text-2xl italic tracking-wide uppercase transform skew-x-[5deg] flex justify-end items-center gap-3">
              <Globe className="w-6 h-6 md:w-7 md:h-7" />
              ONLINE TRACKS
            </div>
          </button>

          <button
            onClick={() => setShowRhythmList(!showRhythmList)}
            className={`w-full text-right p-4 md:p-5 border-4 border-black transition-all duration-200 transform skew-x-[-5deg] shadow-[4px_4px_0_#000] mb-3 min-h-[54px] ${
              showRhythmList ? 'bg-red-600 text-white' : 'bg-red-900 text-red-200 hover:bg-red-800'
            }`}
          >
            <div className="font-black text-lg md:text-2xl italic tracking-wide uppercase transform skew-x-[5deg] flex justify-end items-center gap-3">
              <Activity className="w-6 h-6 md:w-7 md:h-7" />
              {showRhythmList ? 'HIDE RHYTHM LIST' : 'THE RHYTHM LIST'}
            </div>
          </button>

          {displayedSongs.length === 0 && showRhythmList && (
            <div className="text-base sm:text-xl font-bold text-gray-400 bg-black/50 p-5 border-4 border-red-900">
              No tracks found for the Rhythm List yet! Check your database IDs.
            </div>
          )}

          {displayedSongs.map((song) => {
            const rank = rhythmList.findIndex((id) => String(id) === String(song.id)) + 1;
            const isRanked = rank > 0;
            const isSel = String(selectedSong?.id) === String(song.id);
            return (
              <button
                key={song.id}
                onClick={() => setSelectedSong(song)}
                className={`dial-item arcade-select w-full p-3 border-4 border-black transition-all duration-200 flex flex-col min-h-[52px] ${
                  isSel
                    ? 'is-selected bg-white text-black shadow-[6px_6px_0_#000]'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white shadow-[4px_4px_0_#000]'
                }`}
              >
                <div className="w-full font-black text-lg md:text-2xl italic tracking-wide uppercase flex justify-between items-center gap-3">
                  {isRanked ? (
                    <span className={`${isSel ? 'text-red-600' : 'text-red-500'} drop-shadow-[2px_2px_0_#000]`}>
                      #{rank}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 not-italic">{song.bpm} BPM</span>
                  )}
                  <span className="text-right truncate">{song.title}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Mobile portrait sticky launch bar while browsing track list */}
        {selectedSong && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-black/95 border-t-4 border-yellow-400 p-2.5 flex items-center gap-2 safe-bottom">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-yellow-300 font-black truncate">{selectedSong.title}</div>
              <div className="text-[11px] text-gray-300 uppercase">
                {difficulty} • {gameMode}
              </div>
            </div>
            <button
              onClick={() => setMobilePane('preview')}
              className="bg-gray-800 border-2 border-white text-white px-3 py-2 text-xs font-black min-h-[44px]"
            >
              MODS
            </button>
            <button
              onClick={handlePlayClick}
              className="bg-pink-500 border-2 border-black text-black px-5 py-2 text-sm font-black min-h-[44px] flex items-center gap-1"
            >
              <Play className="w-4 h-4" fill="currentColor" /> PLAY
            </button>
          </div>
        )}
      </div>

      {showOwnedMods && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-gray-950 border-4 border-yellow-400 p-6 max-w-xl w-full max-h-[85dvh] overflow-y-auto">
            <h2 className="text-2xl sm:text-3xl font-black text-yellow-300">PURCHASED MODS</h2>
            {(playerInfo.unlockedGameMods || []).filter((id) => id !== 'dance_rhythm_pitch').length === 0 ? (
              <p className="my-6 text-gray-400">Buy mods from the Shop first.</p>
            ) : (
              (playerInfo.unlockedGameMods || [])
                .filter((id) => id !== 'dance_rhythm_pitch')
                .map((id) => {
                  const active = (playerInfo.activeGameMods || []).includes(id);
                  return (
                    <React.Fragment key={id}>
                      <button
                        onClick={() =>
                          setPlayerInfo((p) => {
                            const a = p.activeGameMods || [];
                            const next = {
                              ...p,
                              activeGameMods: active
                                ? a.filter((x) => x !== id)
                                : [...a.filter((x) => !['rhythm_hero', 'dance_rhythm_pitch'].includes(x)), id],
                            };
                            safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
                            return next;
                          })
                        }
                        className={`w-full p-4 my-3 font-black text-lg sm:text-xl ${
                          active ? 'bg-green-500 text-black' : 'bg-gray-800 text-white'
                        }`}
                      >
                        RHYTHM HERO DLC • {active ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                      <details className="bg-gray-900 border border-white/20 p-3 text-left">
                        <summary className="cursor-pointer font-black text-cyan-300">HOW TO PLAY</summary>
                        <div className="text-sm mt-2 text-gray-200">
                          Use the four touch pads or lane keys. Hit each colored note when it reaches the wide receptors
                          at the bottom. Holds must stay pressed to their end.
                        </div>
                      </details>
                    </React.Fragment>
                  );
                })
            )}
            <button onClick={() => setShowOwnedMods(false)} className="w-full bg-white text-black p-3 font-black mt-4 min-h-[48px]">
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
