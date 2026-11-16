import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Globe,
  Infinity as InfinityIcon,
  Play,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from 'lucide-react';
import { db, storage } from '../firebaseClient';
import { WaveformPulse } from '../game/audio';
import { ADMIN_EMAILS } from '../game/constants';
import { getDurationString, getGrade, normalizeChart } from '../game/rhythmLogic';
import { safeSetStorage } from '../game/storage';
import { useIsCompactLandscape } from '../game/useViewport';
import type {
  ChartNote,
  Difficulty,
  FirebaseUser,
  GameMode,
  Modifiers,
  PlayerInfo,
  ScreenId,
  Song,
} from '../game/types';

interface OnlineTracksMenuProps {
  songs: Song[];
  setSongs: React.Dispatch<React.SetStateAction<Song[]>>;
  selectedSong: Song | null;
  setSelectedSong: (s: Song | null) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  gameMode: GameMode;
  setGameMode: (m: GameMode) => void;
  setScreen: (s: ScreenId) => void;
  setCustomBeatmap: (m: ChartNote[] | null) => void;
  user: FirebaseUser | null;
  setIsPreviewing: (v: boolean) => void;
  playerInfo: PlayerInfo;
  setPlayerInfo: React.Dispatch<React.SetStateAction<PlayerInfo>>;
  modifiers: Modifiers;
  setModifiers: React.Dispatch<React.SetStateAction<Modifiers>>;
  bestGrades: Record<string, number>;
}

export const OnlineTracksMenu: React.FC<OnlineTracksMenuProps> = ({
  songs,
  setSongs,
  selectedSong,
  setSelectedSong,
  difficulty,
  setDifficulty,
  gameMode,
  setGameMode,
  setScreen,
  setCustomBeatmap,
  user,
  setIsPreviewing,
  playerInfo,
  setPlayerInfo,
  modifiers,
  setModifiers,
  bestGrades,
}) => {
  const diffColors: Record<Difficulty, string> = {
    easy: 'text-emerald-300',
    normal: 'text-yellow-300',
    hard: 'text-red-400',
    insane: 'text-violet-300',
  };
  const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];
  const [showOwnedMods, setShowOwnedMods] = useState(false);
  const [showModifiersModal, setShowModifiersModal] = useState(false);
  const [notice, setNotice] = useState('');
  const isCompact = useIsCompactLandscape();

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

  const [searchTerm, setSearchTerm] = useState('');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const onlineSongs = useMemo(
    () => songs.filter((s) => s.artist !== 'Royalty Free' && s.artist !== 'USER'),
    [songs]
  );
  const filteredSongs = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return onlineSongs.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
  }, [onlineSongs, searchTerm]);

  const activeModCount =
    (modifiers.speed !== 1 ? 1 : 0) +
    (modifiers.altChart ? 1 : 0) +
    (modifiers.nerf > 0 ? 1 : 0) +
    (modifiers.noFail ? 1 : 0) +
    (modifiers.extreme ? 1 : 0) +
    ((playerInfo.activeGameMods?.length || 0) > 0 ? 1 : 0);

  useEffect(() => {
    if (filteredSongs.length > 0 && !filteredSongs.find((s) => s.id === selectedSong?.id)) {
      setSelectedSong(filteredSongs[0]);
    } else if (filteredSongs.length === 0) {
      setSelectedSong(null);
    }
  }, [filteredSongs, selectedSong, setSelectedSong]);

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
  }, [selectedSong, modifiers?.speed, setIsPreviewing]);

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

  const handlePlayClick = () => {
    if (!selectedSong) return;
    if (modifiers.extreme && (bestGrades[String(selectedSong.id)] || 0) < 90) {
      setModifiers((m) => ({ ...m, extreme: false }));
    }
    setCustomBeatmap(Array.isArray(selectedSong.customMap) ? normalizeChart(selectedSong.customMap).map((n) => ({ ...n })) : null);
    if (gameMode === 'online_vs') setScreen('lobby');
    else setScreen('game');
  };

  const updatePublishedCover = async (patch: Partial<Song>) => {
    if (
      !db ||
      !selectedSong ||
      !user ||
      !((selectedSong.ownerUid && selectedSong.ownerUid === user.uid) || selectedSong.artist === user.email)
    ) {
      return;
    }
    try {
      const updated = { ...selectedSong, ...patch, coverUpdatedAt: Date.now() };
      await db.collection('community_tracks').doc(String(selectedSong.id)).set(updated, { merge: true });
      setSelectedSong(updated);
      setSongs((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? updated : x)));
    } catch (err: any) {
      setNotice('Could not update album cover: ' + err.message);
    }
  };

  const uploadPublishedCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSong) return;
    if (file.size > 8000000) {
      setNotice('Please use an image smaller than 8 MB.');
      return;
    }
    const songAtUpload = { ...selectedSong };
    const readDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    try {
      const localUrl = await readDataUrl();
      const optimistic: Song = {
        ...songAtUpload,
        coverUrl: localUrl,
        coverPulse: true,
        coverPulseBpm: songAtUpload.coverPulseBpm || 1,
        coverPulseSubdivision: songAtUpload.coverPulseSubdivision || 1,
      };
      setSelectedSong(optimistic);
      setSongs((prev) => prev.map((x) => (String(x.id) === String(optimistic.id) ? optimistic : x)));
      let publicUrl = localUrl;
      if (storage && user) {
        try {
          const path = `covers/${user.uid}/${songAtUpload.id}_${Date.now()}_${file.name.replace(/[^a-z0-9._-]/gi, '_')}`;
          const snap = await storage.ref().child(path).put(file, { contentType: file.type || 'image/jpeg' });
          publicUrl = await snap.ref.getDownloadURL();
        } catch (storageError: any) {
          if (localUrl.length > 750000) {
            throw new Error(
              'Firebase Storage rejected the upload and this image is too large for the database. Try an image under 500 KB. ' +
                storageError.message
            );
          }
          console.warn('Storage unavailable; using database image fallback.', storageError);
        }
      }
      const patch = {
        coverUrl: publicUrl,
        coverPulse: true,
        coverPulseBpm: songAtUpload.coverPulseBpm || 1,
        coverPulseSubdivision: songAtUpload.coverPulseSubdivision || 1,
        coverUpdatedAt: Date.now(),
        ownerUid: songAtUpload.ownerUid || user?.uid,
      };
      if (!db) {
        setNotice('Database unavailable.');
        return;
      }
      await db.collection('community_tracks').doc(String(songAtUpload.id)).set(patch, { merge: true });
      const finished = { ...optimistic, ...patch };
      setSelectedSong(finished);
      setSongs((prev) => prev.map((x) => (String(x.id) === String(finished.id) ? finished : x)));
    } catch (err: any) {
      setSelectedSong(songAtUpload);
      setSongs((prev) => prev.map((x) => (String(x.id) === String(songAtUpload.id) ? songAtUpload : x)));
      setNotice('Cover upload failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleToggleFeatured = async () => {
    if (!db || !selectedSong || !user) return;
    const newStatus = !selectedSong.featured;
    try {
      await db.collection('community_tracks').doc(selectedSong.id.toString()).update({ featured: newStatus });
      const updatedSong = { ...selectedSong, featured: newStatus };
      setSelectedSong(updatedSong);
      setSongs((prev) => prev.map((s) => (s.id === selectedSong.id ? updatedSong : s)));
    } catch (err: any) {
      console.error('Feature toggle failed:', err);
      setNotice('Failed to feature track. ' + err.message);
    }
  };

  const activeMode =
    modes.find((m) => m.id === gameMode) ||
    (gameMode === 'battle_royale'
      ? { id: 'battle_royale' as GameMode, text: '50-BR ROYALE', icon: modes[0].icon }
      : gameMode === 'online_vs'
        ? { id: 'online_vs' as GameMode, text: '1V1 H.O.R.S.E.', icon: modes[0].icon }
        : modes[0]);

  const isOwner =
    user &&
    selectedSong &&
    ((selectedSong.ownerUid && selectedSong.ownerUid === user.uid) || selectedSong.artist === user.email);
  const isAdminUser = Boolean(user && ADMIN_EMAILS.includes(user.email || ''));

  return (
    <div className="rc-stage relative w-full h-full flex flex-row overflow-hidden safe-top safe-bottom">
      <div className="absolute inset-0 rc-stage-dots pointer-events-none" />

      {notice && (
        <div className="fixed bottom-3 left-3 right-3 z-[300] rc-panel border-yellow-400 text-white p-2.5 flex items-center justify-between gap-2">
          <span className="text-xs font-bold">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="rc-bevel-btn rc-tile-gold text-black px-2.5 py-1 font-black text-xs rounded"
          >
            OK
          </button>
        </div>
      )}

      {/* Left Community Browser */}
      <aside
        aria-label="Community track browser"
        className={`relative z-10 h-full flex flex-col shrink-0 ${
          isCompact ? 'w-[38%] p-2' : 'w-[36%] max-w-[440px] p-3.5'
        }`}
      >
        <div className="rc-console-tray flex-1 min-h-0 flex flex-col p-2 sm:p-2.5 gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setScreen('freeplay')}
              className="rc-bevel-btn rc-tile-cyan text-black px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-black uppercase min-h-[38px] flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>LOCAL</span>
            </button>
            <label className="rc-dock-well flex-1 flex items-center px-2.5 min-h-[38px]">
              <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <input
                type="text"
                aria-label="Search cloud tracks"
                placeholder="SEARCH CLOUD..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent text-white font-bold text-xs uppercase focus:outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          <div className="rc-console-inset flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {onlineSongs.length === 0 && (
              <div className="text-xs font-bold text-slate-400 bg-[#0d1018] p-3 border border-white/10 rounded-lg">
                No community tracks found. Publish one in the Editor!
              </div>
            )}
            {onlineSongs.length > 0 && filteredSongs.length === 0 && (
              <div className="text-xs font-bold text-slate-400 bg-[#0d1018] p-3 border border-white/10 rounded-lg">
                No tracks matched your search.
              </div>
            )}
            {filteredSongs.map((song) => {
              const isSelected = String(selectedSong?.id) === String(song.id);
              const isFeatured = song.featured;
              return (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => setSelectedSong(song)}
                  className={`rc-bevel-btn w-full px-3 py-2 flex items-center justify-between gap-2 min-h-[44px] ${
                    isSelected
                      ? 'bg-white text-black border-cyan-400 shadow-[0_3px_0_#080a0f,0_0_0_2px_#22d3ee]'
                      : isFeatured
                      ? 'rc-sub-amber text-yellow-100'
                      : 'rc-sub-dark text-cyan-100 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1 shrink-0">
                    {isFeatured && <Star className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" />}
                    <Cloud className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <span className="font-black text-xs sm:text-sm uppercase italic truncate text-right">
                    {song.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Right Stage */}
      <main
        className={`relative z-10 flex-1 h-full flex flex-col justify-between overflow-hidden ${
          isCompact ? 'p-2.5 pl-1 pr-12' : 'p-3.5 pl-1 pr-14'
        }`}
      >
        <div className="rc-dock-rail flex items-center justify-between gap-2 p-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setScreen('freeplay')}
            className="rc-bevel-btn rc-tile-slate text-white flex items-center gap-1 font-black px-3 py-1.5 rounded-lg text-xs uppercase whitespace-nowrap min-h-[38px]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>LOCAL</span>
          </button>

          <span className="hidden sm:block text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
            COMMUNITY TRACKS
          </span>

          <div className="flex items-center gap-2 shrink-0">
            {isAdminUser && selectedSong && (
              <button
                type="button"
                onClick={handleToggleFeatured}
                className={`rc-bevel-btn flex items-center gap-1 font-black px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap min-h-[38px] ${
                  selectedSong.featured ? 'rc-sub-dark text-slate-200' : 'rc-tile-gold text-black'
                }`}
              >
                <Star className="w-3.5 h-3.5" fill={selectedSong.featured ? 'currentColor' : 'none'} />
                <span>{selectedSong.featured ? 'UNFEATURE' : 'FEATURE'}</span>
              </button>
            )}

            <button
              type="button"
              data-testid="landscape-mods-btn"
              onClick={() => setShowModifiersModal(true)}
              className="rc-bevel-btn rc-sub-dark flex items-center gap-1.5 font-black text-yellow-300 px-3 py-1.5 rounded-lg text-xs uppercase whitespace-nowrap min-h-[38px]"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>MODS ×{modifiers.speed.toFixed(2)}</span>
              {activeModCount > 0 && <span className="text-cyan-300 tabular-nums">({activeModCount})</span>}
            </button>

            <button
              type="button"
              onClick={handlePlayClick}
              disabled={!selectedSong}
              data-testid="play-track-button"
              className={`rc-bevel-btn flex items-center gap-1.5 font-black px-5 py-1.5 rounded-lg text-sm uppercase tracking-wider whitespace-nowrap min-h-[38px] ${
                selectedSong ? 'rc-tile-cyan text-black' : 'rc-sub-dark text-slate-500 cursor-not-allowed opacity-60'
              }`}
            >
              <Play className="w-4 h-4" fill="currentColor" />
              <span>PLAY</span>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center py-2">
          <div className={`rc-panel w-full max-w-3xl flex items-center gap-4 ${isCompact ? 'p-3' : 'p-5 sm:p-6'}`}>
            {selectedSong?.coverUrl && (
              <img
                src={selectedSong.coverUrl}
                referrerPolicy="no-referrer"
                data-wave-cover={String(selectedSong.id)}
                alt={selectedSong.title}
                className={`reactive-cover rounded-xl object-cover border-2 border-yellow-400 shadow-[0_6px_16px_rgba(0,0,0,0.65)] shrink-0 ${
                  isCompact ? 'w-24 h-24' : 'w-32 h-32 sm:w-36 sm:h-36'
                }`}
              />
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <h2
                className={`font-black italic text-white uppercase drop-shadow-[0_3px_0_#080a0f] truncate ${
                  isCompact ? 'text-2xl' : 'text-3xl sm:text-4xl'
                }`}
              >
                {selectedSong?.title || 'NO TRACKS FOUND'}
              </h2>
              <p className="text-xs sm:text-sm font-black text-cyan-300 tracking-wider uppercase truncate flex items-center gap-1.5">
                <span className="truncate">{selectedSong?.artist || ''}</span>
                {selectedSong && <Cloud className="w-4 h-4 text-cyan-400 shrink-0" />}
              </p>
              {selectedSong && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-black text-slate-200 tabular-nums">
                  <span className="text-cyan-300">{selectedSong.bpm} BPM</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span className="text-pink-300">DURATION {getDurationString(selectedSong)}</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span className="text-emerald-300">
                    BEST GRADE {getGrade(bestGrades[String(selectedSong.id)] || 0)}
                  </span>
                </div>
              )}
              {isOwner && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="rc-bevel-btn rc-tile-gold text-black px-2.5 py-1 rounded text-[11px] font-black cursor-pointer">
                    {selectedSong?.coverUrl ? 'REPLACE ART' : 'UPLOAD ART'}
                    <input type="file" accept="image/*" className="hidden" onChange={uploadPublishedCover} />
                  </label>
                  {selectedSong?.coverUrl && (
                    <button
                      type="button"
                      onClick={() => updatePublishedCover({ coverUrl: '' })}
                      className="rc-bevel-btn rc-tile-red text-white px-2.5 py-1 rounded text-[11px] font-black"
                    >
                      REMOVE ART
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rc-console-tray p-2 grid grid-cols-2 gap-2 shrink-0">
          <div className="rc-console-inset flex items-center justify-between p-1.5 gap-2">
            <button
              type="button"
              onClick={() => cycleDiff(-1)}
              aria-label="Previous difficulty"
              className="rc-bevel-btn rc-tile-slate text-white w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className={`text-center text-sm sm:text-base font-black uppercase tracking-wider ${diffColors[difficulty]}`}>
              {difficulty}
            </div>
            <button
              type="button"
              onClick={() => cycleDiff(1)}
              aria-label="Next difficulty"
              className="rc-bevel-btn rc-tile-slate text-white w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="rc-console-inset flex items-center justify-between p-1.5 gap-2">
            <button
              type="button"
              onClick={() => cycleMode(-1)}
              aria-label="Previous mode"
              className="rc-bevel-btn rc-tile-slate text-white w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center gap-1.5 text-sm sm:text-base font-black uppercase text-cyan-300 truncate px-1">
              {activeMode.icon}
              <span className="truncate">{activeMode.text}</span>
            </div>
            <button
              type="button"
              onClick={() => cycleMode(1)}
              aria-label="Next mode"
              className="rc-bevel-btn rc-tile-slate text-white w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>

      {showModifiersModal && (
        <div className="fixed inset-0 z-[190] bg-black/80 flex items-center justify-center p-3">
          <div className="rc-panel p-4 max-w-xl w-full max-h-[92dvh] flex flex-col gap-3 text-white">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-black text-yellow-300 uppercase tracking-wider">Online Modifiers</h3>
                <button
                  type="button"
                  onClick={() => setShowOwnedMods(true)}
                  className="rc-bevel-btn rc-tile-gold text-black px-3 py-1 rounded-lg text-xs font-black min-h-[32px] whitespace-nowrap"
                >
                  OWNED DLC MODS
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowModifiersModal(false)}
                aria-label="Close modifiers"
                className="rc-bevel-btn rc-sub-dark text-white w-9 h-9 rounded-lg flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rc-console-inset p-3 grid grid-cols-3 gap-2">
              <label className="rc-dock-well p-2.5 font-black text-xs col-span-2 flex flex-col justify-center">
                <span className="tabular-nums">SPEED ×{modifiers.speed.toFixed(2)}</span>
                <input
                  className="w-full accent-yellow-400 mt-1.5"
                  type="range"
                  min="1"
                  max="4"
                  step=".05"
                  value={modifiers.speed}
                  onChange={(e) => setModifiers((m) => ({ ...m, speed: +e.target.value }))}
                />
              </label>

              <button
                type="button"
                onClick={() => setModifiers((m) => ({ ...m, altChart: !m.altChart }))}
                className={`rc-bevel-btn p-2 font-black text-xs min-h-[54px] ${
                  modifiers.altChart ? 'rc-tile-gold text-black' : 'rc-sub-dark text-slate-300'
                }`}
              >
                ALT CHART
                <span className="block text-[10px] opacity-80">REMIX LANES</span>
              </button>

              <div className="rc-dock-well p-1.5 text-center flex flex-col justify-between gap-1">
                <button
                  type="button"
                  onClick={() => setModifiers((m) => ({ ...m, nerf: Math.min(90, (m.nerf || 0) + 10) }))}
                  className="font-black text-amber-300 text-xs py-1"
                >
                  NERF −10% ({modifiers.nerf || 0}%)
                </button>
                <button
                  type="button"
                  onClick={() => setModifiers((m) => ({ ...m, nerf: 0 }))}
                  disabled={!modifiers.nerf}
                  className="w-full bg-white/10 rounded disabled:opacity-30 text-[10px] font-black py-1"
                >
                  RESET
                </button>
              </div>

              <button
                type="button"
                onClick={() => setModifiers((m) => ({ ...m, noFail: !m.noFail, extreme: false }))}
                className={`rc-bevel-btn p-2 font-black text-xs min-h-[54px] ${
                  modifiers.noFail ? 'rc-tile-green text-black' : 'rc-sub-dark text-slate-300'
                }`}
              >
                NO FAIL
                <span className="block text-[10px] opacity-80">IMMORTAL</span>
              </button>

              <button
                type="button"
                disabled={(bestGrades[String(selectedSong?.id)] || 0) < 90}
                onClick={() => setModifiers((m) => ({ ...m, extreme: !m.extreme, noFail: false }))}
                className={`rc-bevel-btn p-2 font-black text-xs disabled:opacity-35 min-h-[54px] ${
                  modifiers.extreme ? 'rc-tile-red text-white' : 'rc-sub-dark text-slate-300'
                }`}
              >
                EXTREME
                <span className="block text-[10px] opacity-80">
                  {(bestGrades[String(selectedSong?.id)] || 0) >= 90 ? '1 MISS = DEATH' : 'NEED A GRADE'}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowModifiersModal(false)}
              className="w-full py-2.5 rc-bevel-btn rc-tile-gold text-black font-black text-sm uppercase min-h-[42px]"
            >
              DONE
            </button>
          </div>
        </div>
      )}

      {showOwnedMods && (
        <div className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4">
          <div className="rc-panel p-5 max-w-lg w-full max-h-[85dvh] overflow-y-auto flex flex-col gap-3">
            <h2 className="text-xl font-black text-yellow-300 uppercase">Purchased Mods</h2>
            {(playerInfo.unlockedGameMods || []).filter((id) => id !== 'dance_rhythm_pitch').length === 0 ? (
              <p className="py-3 text-sm text-slate-300 font-bold">Buy mods from the Shop first.</p>
            ) : (
              (playerInfo.unlockedGameMods || [])
                .filter((id) => id !== 'dance_rhythm_pitch')
                .map((id) => {
                  const active = (playerInfo.activeGameMods || []).includes(id);
                  return (
                    <React.Fragment key={id}>
                      <button
                        type="button"
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
                        className={`w-full p-3 rc-bevel-btn font-black text-sm uppercase ${
                          active ? 'rc-tile-green text-black' : 'rc-sub-dark text-white'
                        }`}
                      >
                        RHYTHM HERO DLC · {active ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                      <details className="rc-dock-well p-3 text-left text-xs text-slate-200">
                        <summary className="cursor-pointer font-black text-cyan-300 uppercase">How to play</summary>
                        <div className="mt-2 leading-relaxed">
                          Use the four touch receptors or lane keys. Hit each colored note when it reaches the receptors.
                          Holds must stay pressed to their end.
                        </div>
                      </details>
                    </React.Fragment>
                  );
                })
            )}
            <button
              type="button"
              onClick={() => setShowOwnedMods(false)}
              className="w-full rc-bevel-btn rc-tile-slate text-white p-2.5 font-black text-sm uppercase min-h-[42px]"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
