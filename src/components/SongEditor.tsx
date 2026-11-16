import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Circle as RecordIcon,
  Cloud,
  Link as LinkIcon,
  Save,
  Square as StopIcon,
} from 'lucide-react';
import { db, storage } from '../firebaseClient';
import { AudioEngine, WaveformPulse } from '../game/audio';
import { KEY_MAP, SKINS } from '../game/constants';
import { getCleanedUrl, normalizeChart } from '../game/rhythmLogic';
import { useIsCompactLandscape } from '../game/useViewport';
import type { ChartNote, FirebaseUser, NoteType, ScreenId, Song } from '../game/types';
import { TouchLanePads } from './TouchControls';

interface SongEditorProps {
  setScreen: (s: ScreenId) => void;
  setSongs: React.Dispatch<React.SetStateAction<Song[]>>;
  songs: Song[];
  setSelectedSong: (s: Song) => void;
  user: FirebaseUser | null;
}

export const SongEditor: React.FC<SongEditorProps> = ({ setScreen, setSongs, songs, setSelectedSong, user }) => {
  const [bpm, setBpm] = useState(120);
  const [measures, setMeasures] = useState(8);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [pulses, setPulses] = useState<number[]>([]);
  const [title, setTitle] = useState('CUSTOM TRACK');
  const [audioUrl, setAudioUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverPulse, setCoverPulse] = useState(true);
  const [coverPulseBpm, setCoverPulseBpm] = useState(1);
  const [coverPulseSubdivision, setCoverPulseSubdivision] = useState(1);
  const [pulseSubdivision, setPulseSubdivision] = useState(4);

  const [noteType, setNoteType] = useState<NoteType>('normal');
  const [recordMode, setRecordMode] = useState<'notes' | 'pulses'>('notes');
  const [recordingSpeed, setRecordingSpeed] = useState(0.5);
  const [stepClick, setStepClick] = useState(true);
  const [stepSubdivision, setStepSubdivision] = useState(4);

  const [isPublishing, setIsPublishing] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const isLandscapeCompact = useIsCompactLandscape();

  const [isRecording, setIsRecording] = useState(false);
  const editorAudioRef = useRef<HTMLAudioElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const recordStartTime = useRef(0);
  const reqRef = useRef(0);
  const heldRecordKeys = useRef<
    Record<string, { row: number; lane: number; start: number; wallStart: number; originalType: NoteType }>
  >({});
  const heldRecordLanes = useRef<boolean[]>([false, false, false, false]);
  const lastEditorStepClick = useRef(-1);

  const showNotice = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice((curr) => (curr?.text === text ? null : curr)), 4000);
  }, []);

  useEffect(() => {
    if (!coverUrl || !editorAudioRef.current) return;
    const audioEl = editorAudioRef.current as any;
    const timer = setTimeout(() => {
      const detach = WaveformPulse.attach(audioEl, '[data-editor-wave-cover="true"]');
      audioEl._detachCoverPulse = detach;
    }, 80);
    return () => {
      clearTimeout(timer);
      audioEl?._detachCoverPulse?.();
    };
  }, [coverUrl, audioUrl]);

  useEffect(() => {
    return () => {
      if (editorAudioRef.current) {
        editorAudioRef.current.pause();
        editorAudioRef.current.src = '';
      }
    };
  }, []);

  const rows = measures * 4 * stepSubdivision;
  const rowHeight = Math.max(28, 160 / stepSubdivision);
  const currentSkinColors = SKINS.default.colors;

  const toggleNote = (row: number, col: number) => {
    const key = `${row}_${col}`;
    setGrid((prev) => {
      const next = { ...prev };
      if (next[key] === noteType) delete next[key];
      else next[key] = noteType;
      return next;
    });
    if (noteType === 'demon') AudioEngine.playDemonSound();
    else AudioEngine.playTone(300 + col * 100, 'square', 0.1);
  };

  const getRecordTime = useCallback(() => {
    if (editorAudioRef.current && editorAudioRef.current.readyState >= 2) {
      return editorAudioRef.current.currentTime * 1000;
    }
    return (performance.now() - recordStartTime.current) * recordingSpeed;
  }, [recordingSpeed]);

  const recordPulseTap = useCallback(() => {
    if (!isRecording || recordMode !== 'pulses') return;
    const currentTimeMs = getRecordTime();
    setPulses((prev) => [...prev, currentTimeMs]);
    AudioEngine.playTone(150, 'sine', 0.05);
  }, [getRecordTime, isRecording, recordMode]);

  const startRecordedLane = useCallback(
    (inputId: string, lane: number) => {
      if (!isRecording || recordMode !== 'notes') return;
      if (heldRecordKeys.current[inputId]) return;
      const currentTimeMs = getRecordTime();
      const beatDuration = 60000 / (Number(bpm) || 120);
      const subBeatDuration = beatDuration / stepSubdivision;
      const row = Math.round(currentTimeMs / subBeatDuration);
      heldRecordKeys.current[inputId] = {
        row,
        lane,
        start: currentTimeMs,
        wallStart: performance.now(),
        originalType: noteType,
      };
      heldRecordLanes.current[lane] = true;
      setGrid((prev) => ({ ...prev, [`${row}_${lane}`]: noteType === 'hold' ? 'hold' : noteType }));
      if (noteType === 'demon') AudioEngine.playDemonSound();
      else AudioEngine.playHitSound();
      setMeasures((prev) => Math.max(prev, Math.ceil((row + stepSubdivision) / (4 * stepSubdivision))));
    },
    [bpm, getRecordTime, isRecording, noteType, recordMode, stepSubdivision]
  );

  const releaseRecordedLane = useCallback(
    (inputId: string) => {
      if (!isRecording || recordMode !== 'notes') return;
      const held = heldRecordKeys.current[inputId];
      if (!held) return;
      heldRecordLanes.current[held.lane] = false;
      const nowMs = getRecordTime();
      const duration = Math.max(0, nowMs - held.start);
      const wallDuration = performance.now() - held.wallStart;
      const sub = 60000 / (Number(bpm) || 120) / stepSubdivision;
      if (
        held.originalType !== 'demon' &&
        (held.originalType === 'hold' || (wallDuration >= 320 && duration >= sub * 0.85))
      ) {
        setGrid((prev) => ({
          ...prev,
          [`${held.row}_${held.lane}`]: `hold:${Math.max(100, Math.round(duration || sub))}`,
        }));
      }
      delete heldRecordKeys.current[inputId];
    },
    [bpm, getRecordTime, isRecording, recordMode, stepSubdivision]
  );

  const handleTouchLaneDown = useCallback(
    (lane: number) => startRecordedLane(`touch_${lane}`, lane),
    [startRecordedLane]
  );
  const handleTouchLaneUp = useCallback(
    (lane: number) => releaseRecordedLane(`touch_${lane}`),
    [releaseRecordedLane]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isRecording) return;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Enter', 'Backspace'].includes(e.key) ||
        e.altKey ||
        e.ctrlKey
      ) {
        e.preventDefault();
      }
      const key = e.key.toLowerCase();
      if (recordMode === 'pulses' && key === 'z') {
        e.preventDefault();
        recordPulseTap();
        return;
      }
      if (recordMode !== 'notes') return;
      const lane = KEY_MAP[key];
      if (lane === undefined || e.repeat) return;
      startRecordedLane(key, lane);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isRecording || recordMode !== 'notes') return;
      releaseRecordedLane(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecording, recordMode, recordPulseTap, releaseRecordedLane, startRecordedLane]);

  useEffect(() => {
    if (!isRecording) {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      return;
    }
    const loop = () => {
      if (editorScrollRef.current) {
        const currentTimeMs = getRecordTime();
        const beatDuration = 1000 / (bpm / 60);
        const subBeatDuration = beatDuration / stepSubdivision;
        const currentRow = currentTimeMs / subBeatDuration;
        if (stepClick) {
          const clickMs = beatDuration / stepSubdivision;
          const step = Math.floor(currentTimeMs / clickMs);
          if (step !== lastEditorStepClick.current) {
            lastEditorStepClick.current = step;
            const accent = step % stepSubdivision === 0;
            AudioEngine.playTone(accent ? 1050 : 720, 'square', accent ? 0.035 : 0.018, accent ? 0.032 : 0.016);
          }
        }
        const scrollTarget = currentRow * rowHeight - editorScrollRef.current.clientHeight / 2;
        if (scrollTarget > 0) {
          editorScrollRef.current.scrollTop = scrollTarget;
        }
      }
      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqRef.current);
  }, [isRecording, bpm, stepClick, stepSubdivision, rowHeight, getRecordTime]);

  const changeStepSubdivision = (nextVal: string | number) => {
    const next = Number(nextVal);
    if (!Number.isFinite(next) || next === stepSubdivision) return;
    setGrid((prev) => {
      const converted: Record<string, string> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const [row, lane] = key.split('_').map(Number);
        const newRow = Math.round((row / stepSubdivision) * next);
        converted[`${newRow}_${lane}`] = value;
      });
      return converted;
    });
    setStepSubdivision(next);
    lastEditorStepClick.current = -1;
  };

  const toggleRecording = (mode: 'notes' | 'pulses') => {
    AudioEngine.init();
    if (isRecording && recordMode === mode) {
      setIsRecording(false);
      heldRecordKeys.current = {};
      heldRecordLanes.current = [false, false, false, false];
      if (editorAudioRef.current) {
        editorAudioRef.current.pause();
        editorAudioRef.current.currentTime = 0;
        editorAudioRef.current.playbackRate = 1;
      }
    } else {
      setRecordMode(mode);
      setIsRecording(true);
      setMobileSettingsOpen(false);
      heldRecordKeys.current = {};
      heldRecordLanes.current = [false, false, false, false];
      recordStartTime.current = performance.now();
      lastEditorStepClick.current = -1;
      if (editorAudioRef.current && audioUrl) {
        editorAudioRef.current.currentTime = 0;
        (editorAudioRef.current as any).preservesPitch = true;
        editorAudioRef.current.playbackRate = recordingSpeed;
        editorAudioRef.current.play().catch((e) => console.warn('Audio play failed:', e));
      }
    }
  };

  useEffect(() => {
    if (editorAudioRef.current) editorAudioRef.current.playbackRate = isRecording ? recordingSpeed : 1;
  }, [recordingSpeed, isRecording]);

  const generateMap = (): ChartNote[] => {
    const safeBpm = Math.max(1, Number(bpm) || 120);
    const beatDuration = 60000 / safeBpm;
    const subBeatDuration = beatDuration / stepSubdivision;
    const newMap: ChartNote[] = [];
    Object.entries(grid).forEach(([key, raw]) => {
      const parts = key.split('_');
      const row = Number(parts[0]);
      const lane = Number(parts[1]);
      if (!Number.isFinite(row) || !Number.isFinite(lane)) return;
      const encodedHold = typeof raw === 'string' && raw.indexOf('hold:') === 0;
      const explicitHold = raw === 'hold' || encodedHold;
      const type: NoteType = explicitHold ? 'hold' : raw === 'demon' ? 'demon' : 'normal';
      const note: ChartNote = { time: Math.max(0, row * subBeatDuration), lane, type };
      if (type === 'hold') {
        const parsed = encodedHold ? Number(raw.slice(5)) : beatDuration;
        note.duration = Number.isFinite(parsed) && parsed > 0 ? parsed : beatDuration;
      }
      newMap.push(note);
    });
    return normalizeChart(newMap);
  };

  const handleSave = () => {
    const newMap = generateMap();
    if (!newMap.length) {
      showNotice('This chart has no notes. Place or record at least one note before saving.', 'error');
      return;
    }
    const chartSnapshot = newMap.map((n) => ({ ...n }));
    const newSong: Song = {
      id: Date.now(),
      title,
      artist: 'USER',
      bpm,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      customMap: chartSnapshot,
      chartVersion: 2,
      noteCount: chartSnapshot.length,
      pulses: [...pulses].sort((a, b) => a - b),
      audioUrl: getCleanedUrl(audioUrl),
      coverUrl,
      coverPulse,
      coverPulseBpm,
      coverPulseSubdivision,
      stepClick,
      stepSubdivision,
    };

    setSelectedSong(newSong);
    setSongs((prev) => [newSong, ...prev.filter((x) => String(x.id) !== String(newSong.id))]);
    try {
      const saved = JSON.parse(localStorage.getItem('rhythmCanvasLocalSongs') || '[]');
      localStorage.setItem(
        'rhythmCanvasLocalSongs',
        JSON.stringify([newSong, ...saved.filter((x: any) => String(x.id) !== String(newSong.id))])
      );
    } catch (e) {
      console.warn('Local track persistence failed', e);
    }
    setScreen('freeplay');
  };

  const handlePublish = async () => {
    if (!user) {
      showNotice('You must Log in on the Main Menu to publish tracks!', 'error');
      return;
    }
    if (Object.keys(grid).length === 0) {
      showNotice('You must place at least one note to publish!', 'error');
      return;
    }
    if (!db) {
      showNotice('Database unavailable.', 'error');
      return;
    }
    setIsPublishing(true);
    try {
      const newMap = normalizeChart(generateMap());
      if (!newMap.length) throw new Error('The chart has no valid notes.');
      const chartSnapshot = newMap.map((n) => ({ ...n }));
      const newId = Date.now().toString();
      let publishedCoverUrl = coverUrl;
      if (coverUrl && coverUrl.startsWith('data:') && storage) {
        const blob = await (await fetch(coverUrl)).blob();
        const snap = await storage.ref().child(`covers/${user.uid}/${newId}_cover`).put(blob);
        publishedCoverUrl = await snap.ref.getDownloadURL();
      }
      const newSong: Song = {
        id: newId,
        title: title || 'UNTITLED',
        artist: user.email || 'Community User',
        ownerUid: user.uid,
        bpm: Number(bpm) || 120,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
        customMap: chartSnapshot,
        chartVersion: 2,
        noteCount: chartSnapshot.length,
        pulses: [...pulses].sort((a, b) => a - b),
        audioUrl: getCleanedUrl(audioUrl),
        coverUrl: publishedCoverUrl,
        coverPulse,
        coverPulseBpm,
        coverPulseSubdivision,
        coverUpdatedAt: Date.now(),
        stepClick,
        stepSubdivision,
        featured: false,
      };
      await db.collection('community_tracks').doc(String(newSong.id)).set(newSong);
      setSelectedSong(newSong);
      setSongs((prev) => [newSong, ...prev]);
      setScreen('online_tracks');
    } catch (err: any) {
      showNotice('Failed to publish track: ' + err.message, 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleLoad = (songToLoad: Song) => {
    const isExternal = songToLoad.artist !== 'USER';
    setTitle(isExternal ? `${songToLoad.title} (COPY)` : songToLoad.title);
    setBpm(songToLoad.bpm);
    const beatDur = 1000 / (songToLoad.bpm / 60);
    const loadedSubdivision = Number(songToLoad.stepSubdivision) || 4;
    const subBeatDur = beatDur / loadedSubdivision;
    const newGrid: Record<string, string> = {};
    let maxRow = 0;
    if (songToLoad.customMap) {
      normalizeChart(songToLoad.customMap).forEach((note) => {
        const row = Math.round(note.time / subBeatDur);
        newGrid[`${row}_${note.lane}`] = note.type === 'hold' ? `hold:${note.duration || beatDur}` : note.type || 'normal';
        if (row > maxRow) maxRow = row;
      });
    }
    setGrid(newGrid);
    setPulses(songToLoad.pulses || []);
    setMeasures(Math.max(8, Math.ceil((maxRow + loadedSubdivision) / (4 * loadedSubdivision))));
    setAudioUrl(songToLoad.audioUrl || '');
    setCoverUrl(songToLoad.coverUrl || '');
    setCoverPulse(songToLoad.coverPulse !== false);
    setCoverPulseBpm(songToLoad.coverPulseBpm || 1);
    setCoverPulseSubdivision(songToLoad.coverPulseSubdivision || 1);
    setStepClick(songToLoad.stepClick !== false);
    setStepSubdivision(songToLoad.stepSubdivision || 4);
    setShowLoadModal(false);
  };

  return (
    <div className="rc-stage w-full h-[100dvh] flex flex-col crt relative overflow-hidden text-white">
      <div className="rc-stage-dots absolute inset-0 pointer-events-none" />
      <audio
        ref={editorAudioRef}
        src={getCleanedUrl(audioUrl) || undefined}
        onEnded={() => {
          setIsRecording(false);
          if (editorAudioRef.current) editorAudioRef.current.playbackRate = 1;
        }}
        className="hidden"
      />

      {/* Top Console Toolbar */}
      <div
        className={`relative z-10 rc-console-tray mx-2 sm:mx-3 mt-2 flex flex-col shrink-0 ${
          isLandscapeCompact ? 'p-1.5 gap-1.5 pr-12' : 'p-3 gap-2.5 pr-14 sm:pr-16'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Back to menu"
              onClick={() => {
                setIsRecording(false);
                setScreen('menu');
              }}
              className={`rc-bevel-btn rc-tile-slate text-white flex items-center justify-center ${
                isLandscapeCompact ? 'p-1.5' : 'p-2'
              }`}
            >
              <ChevronLeft className={isLandscapeCompact ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
            <div className="rc-dock-rail px-3 py-1 flex items-center gap-2.5">
              <h2
                className={`font-black italic uppercase text-white ${
                  isLandscapeCompact ? 'text-sm sm:text-base' : 'text-lg sm:text-xl'
                }`}
              >
                SONG EDITOR
              </h2>
              <span className="rc-dock-well px-2 py-0.5 text-[10px] sm:text-xs font-black text-cyan-300 tabular-nums">
                PULSES: {pulses.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rc-dock-rail flex items-center p-1 gap-1 text-xs">
              <button
                onClick={() => setNoteType('normal')}
                className={`rc-bevel-btn px-2.5 py-1 font-black uppercase whitespace-nowrap ${
                  noteType === 'normal' ? 'rc-tile-green text-black' : 'rc-sub-dark text-slate-300'
                }`}
              >
                Normal
              </button>
              <button
                onClick={() => setNoteType('hold')}
                className={`rc-bevel-btn px-2.5 py-1 font-black uppercase whitespace-nowrap ${
                  noteType === 'hold' ? 'rc-tile-violet text-white' : 'rc-sub-dark text-slate-300'
                }`}
              >
                Hold
              </button>
              <button
                onClick={() => setNoteType('demon')}
                className={`rc-bevel-btn px-2.5 py-1 font-black uppercase whitespace-nowrap ${
                  noteType === 'demon' ? 'rc-tile-red text-white' : 'rc-sub-dark text-slate-300'
                }`}
              >
                Demon
              </button>
            </div>

            <button
              onClick={() => setMobileSettingsOpen((v) => !v)}
              className="lg:hidden rc-bevel-btn rc-tile-gold text-black px-2.5 py-1.5 font-black text-xs flex items-center gap-1 whitespace-nowrap"
            >
              SETTINGS {mobileSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`rc-console-inset px-3 py-2 font-black text-xs sm:text-sm ${
              notice.tone === 'error' ? 'border-red-400 text-red-200' : 'border-cyan-400 text-cyan-200'
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* Collapsible Settings Drawer on small landscape (<lg), always shown on desktop (>=lg) */}
        <div
          className={`${
            mobileSettingsOpen ? 'flex' : 'hidden lg:flex'
          } flex-col lg:flex-row lg:items-center justify-between gap-2.5 max-h-[42vh] lg:max-h-none overflow-y-auto`}
        >
          <div className="rc-console-inset flex items-center gap-2.5 flex-wrap p-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isRecording}
              className="bg-[#0a0d16] border border-white/25 rounded-lg text-white px-2.5 py-1 font-black text-xs sm:text-sm w-32 lg:w-40 uppercase disabled:opacity-50"
              placeholder="TITLE"
            />
            <div className="flex items-center gap-1.5">
              <span className="font-black text-cyan-300 text-xs">BPM</span>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                disabled={isRecording}
                className="w-16 bg-[#0a0d16] border border-white/25 rounded-lg text-white px-2 py-1 text-xs sm:text-sm font-black tabular-nums disabled:opacity-50"
              />
            </div>

            <div className="flex items-center bg-[#0a0d16] border border-white/25 rounded-lg px-2 w-full sm:w-52">
              <LinkIcon className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <input
                type="text"
                placeholder="PASTE MP3 URL"
                value={audioUrl}
                disabled={isRecording}
                onChange={(e) => setAudioUrl(e.target.value)}
                className="w-full bg-transparent text-white py-1 font-black text-xs focus:outline-none disabled:opacity-50"
              />
            </div>

            <label className="rc-bevel-btn rc-tile-violet text-white px-3 py-1 font-black text-xs cursor-pointer whitespace-nowrap">
              ALBUM ART
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const r = new FileReader();
                    r.onload = () => setCoverUrl(String(r.result || ''));
                    r.readAsDataURL(f);
                  }
                }}
              />
            </label>

            {coverUrl && (
              <div className="rc-dock-well flex items-center gap-2 p-1">
                <img
                  src={coverUrl}
                  data-editor-wave-cover="true"
                  className="reactive-cover w-8 h-8 object-cover rounded border border-yellow-300"
                />
                <button
                  onClick={() => {
                    if (editorAudioRef.current?.paused) {
                      editorAudioRef.current.playbackRate = isRecording ? recordingSpeed : 1;
                      editorAudioRef.current.play().catch(() => {});
                    } else {
                      editorAudioRef.current?.pause();
                    }
                  }}
                  className="rc-bevel-btn rc-tile-gold text-black px-2 py-1 text-[10px] font-black"
                >
                  PREVIEW
                </button>
              </div>
            )}

            <div className="rc-dock-well flex items-center gap-1.5 px-2 py-1 text-xs">
              <span className="font-black text-cyan-300">PULSE 1/</span>
              <select
                value={pulseSubdivision}
                onChange={(e) => setPulseSubdivision(+e.target.value)}
                className="bg-[#0a0d16] text-white border border-white/25 rounded font-black px-1"
              >
                <option>1</option>
                <option>2</option>
                <option>4</option>
                <option>8</option>
                <option>16</option>
              </select>
              <button
                onClick={() => {
                  const beat = 60000 / bpm;
                  const step = beat / pulseSubdivision;
                  setPulses(Array.from({ length: measures * 4 * pulseSubdivision }, (_, i) => i * step));
                  AudioEngine.playUI('confirm');
                }}
                className="rc-bevel-btn rc-tile-cyan text-black px-2 py-0.5 text-[10px] font-black whitespace-nowrap"
              >
                GENERATE
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center shrink-0">
            <div className="rc-dock-well px-2.5 py-1 flex flex-col justify-center text-xs">
              <label className="text-[9px] font-black tracking-[.15em] text-yellow-300">RECORD SPEED</label>
              <select
                value={recordingSpeed}
                onChange={(e) => setRecordingSpeed(Number(e.target.value))}
                className="bg-[#0a0d16] text-white border border-white/20 rounded font-black px-1 py-0.5 mt-0.5"
              >
                <option value="0.25">25% • ¼ SPEED</option>
                <option value="0.5">50% • ½ SPEED</option>
                <option value="0.75">75% SPEED</option>
                <option value="1">100% • NORMAL</option>
              </select>
            </div>
            <div className="rc-dock-well px-2.5 py-1 flex flex-col justify-center text-xs">
              <label className="text-[9px] font-black tracking-[.15em] text-cyan-300 flex items-center gap-1">
                <input type="checkbox" checked={stepClick} onChange={(e) => setStepClick(e.target.checked)} /> STEP CLICK
              </label>
              <select
                value={stepSubdivision}
                onChange={(e) => changeStepSubdivision(e.target.value)}
                className="bg-[#0a0d16] text-white border border-white/20 rounded font-black px-1 py-0.5 mt-0.5"
              >
                <option value="1">BEATS</option>
                <option value="2">1/2 STEPS</option>
                <option value="4">1/4 STEPS</option>
                <option value="8">1/8 STEPS</option>
                <option value="16">1/16 STEPS</option>
              </select>
            </div>
          </div>
        </div>

        {/* Always-accessible Action Row */}
        <div className={`grid grid-cols-5 w-full ${isLandscapeCompact ? 'gap-1.5' : 'gap-2'}`}>
          <button
            onClick={() => toggleRecording('notes')}
            className={`rc-bevel-btn flex justify-center items-center gap-1.5 px-2.5 font-black whitespace-nowrap ${
              isLandscapeCompact ? 'py-1.5 text-xs' : 'py-2 text-xs sm:text-sm'
            } ${
              isRecording && recordMode === 'notes'
                ? 'rc-tile-red text-white animate-pulse'
                : 'rc-tile-gold text-black'
            }`}
          >
            {isRecording && recordMode === 'notes' ? <StopIcon className="w-3.5 h-3.5" /> : <RecordIcon className="w-3.5 h-3.5" />}
            REC NOTES
          </button>

          <button
            onClick={() => toggleRecording('pulses')}
            className={`rc-bevel-btn flex justify-center items-center gap-1.5 px-2.5 font-black whitespace-nowrap ${
              isLandscapeCompact ? 'py-1.5 text-xs' : 'py-2 text-xs sm:text-sm'
            } ${
              isRecording && recordMode === 'pulses'
                ? 'rc-tile-violet text-white animate-pulse'
                : 'rc-tile-cyan text-black'
            }`}
          >
            {isRecording && recordMode === 'pulses' ? <StopIcon className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
            REC PULSES
          </button>

          <button
            disabled={isRecording}
            onClick={() => setShowLoadModal(true)}
            className={`rc-bevel-btn rc-tile-slate text-white flex justify-center items-center gap-1.5 px-2.5 font-black disabled:opacity-50 whitespace-nowrap ${
              isLandscapeCompact ? 'py-1.5 text-xs' : 'py-2 text-xs sm:text-sm'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" /> LOAD
          </button>

          <button
            disabled={isRecording}
            onClick={handleSave}
            className={`rc-bevel-btn rc-tile-pink text-white flex justify-center items-center gap-1.5 px-2.5 font-black disabled:opacity-50 whitespace-nowrap ${
              isLandscapeCompact ? 'py-1.5 text-xs' : 'py-2 text-xs sm:text-sm'
            }`}
          >
            <Save className="w-3.5 h-3.5" /> SAVE
          </button>

          <button
            disabled={isPublishing || isRecording}
            onClick={handlePublish}
            className={`rc-bevel-btn flex justify-center items-center gap-1.5 px-2.5 font-black disabled:opacity-50 whitespace-nowrap ${
              isPublishing ? 'rc-tile-slate text-slate-300' : 'rc-tile-green text-black'
            } ${isLandscapeCompact ? 'py-1.5 text-xs' : 'py-2 text-xs sm:text-sm'}`}
          >
            <Cloud className="w-3.5 h-3.5" /> {isPublishing ? 'UPLOADING...' : 'PUBLISH'}
          </button>
        </div>
      </div>

      {/* Note Grid */}
      <div
        ref={editorScrollRef}
        className={`relative z-10 flex-1 min-h-0 overflow-auto p-3 md:p-6 flex justify-center custom-scrollbar ${
          isRecording
            ? recordMode === 'notes'
              ? 'smooth-scroll ring-4 ring-red-500/70'
              : 'smooth-scroll ring-4 ring-cyan-400/70'
            : ''
        }`}
      >
        {isRecording && (
          <div
            className={`sticky top-1/2 w-full max-w-[480px] h-[2px] z-50 pointer-events-none ${
              recordMode === 'notes'
                ? 'bg-red-500 shadow-[0_0_10px_#ef4444]'
                : 'bg-cyan-400 shadow-[0_0_10px_#22d3ee]'
            }`}
          />
        )}

        <div
          className={`bg-[#060811] border-4 border-white/80 rounded-xl shadow-[0_12px_28px_rgba(0,0,0,0.7)] relative ${
            isRecording ? 'mt-[40vh] mb-[40vh]' : 'mt-2 mb-12'
          }`}
          style={{ width: '100%', maxWidth: '480px', height: `${rows * rowHeight}px` }}
        >
          <div className="absolute inset-0 grid grid-cols-4 divide-x-[2px] md:divide-x-4 divide-gray-800 pointer-events-none">
            <div className="bg-pink-900/10"></div>
            <div className="bg-cyan-900/10"></div>
            <div className="bg-green-900/10"></div>
            <div className="bg-red-900/10"></div>
          </div>

          <div
            className="absolute inset-0 grid grid-cols-4"
            style={{ gridTemplateRows: `repeat(${rows}, ${rowHeight}px)` }}
          >
            {Array.from({ length: rows }).map((_, row) => (
              <React.Fragment key={row}>
                {Array.from({ length: 4 }).map((__, col) => {
                  const isBeat = row % stepSubdivision === 0;
                  const isMeasure = row % (stepSubdivision * 4) === 0;
                  const noteData = grid[`${row}_${col}`];
                  const isDemon = noteData === 'demon';
                  const isHold = typeof noteData === 'string' && noteData.startsWith('hold');

                  return (
                    <div
                      key={`${row}_${col}`}
                      onClick={() => {
                        if (!isRecording) toggleNote(row, col);
                      }}
                      className={`border-b border-gray-800/50 ${
                        isRecording ? '' : 'cursor-pointer hover:bg-white/20 active:bg-white/30'
                      } transition-colors relative ${isBeat ? 'border-b-gray-500 border-b-2 md:border-b-4' : ''} ${
                        isMeasure ? 'border-b-white border-b-[4px] md:border-b-[6px]' : ''
                      }`}
                    >
                      {noteData && (
                        <div
                          className="absolute inset-1 border-2 md:border-4 rounded shadow-[inset_0_0_5px_rgba(0,0,0,0.8)]"
                          style={{
                            background: isHold ? `linear-gradient(${currentSkinColors[col]},#7c3aed)` : undefined,
                            backgroundColor: isDemon ? '#000' : isHold ? undefined : currentSkinColors[col],
                            borderColor: isDemon ? '#dc2626' : '#fff',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Touch Recording Controls when recording is active */}
      {isRecording && (
        <div
          className={`relative z-20 rc-dock-rail mx-3 mb-2 ${
            isLandscapeCompact ? 'p-1.5' : 'p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          } flex justify-center shrink-0`}
        >
          {recordMode === 'notes' ? (
            <TouchLanePads
              colors={currentSkinColors}
              shape="arrow"
              onLaneDown={handleTouchLaneDown}
              onLaneUp={handleTouchLaneUp}
              pressedRef={heldRecordLanes}
              compact
            />
          ) : (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                recordPulseTap();
              }}
              className={`rc-bevel-btn rc-tile-cyan w-full max-w-md text-black ${
                isLandscapeCompact ? 'py-2 text-base' : 'py-3 text-xl'
              } font-black uppercase tracking-widest touch-surface`}
            >
              TAP TO ADD PULSE
            </button>
          )}
        </div>
      )}

      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-5">
          <div className="rc-console-tray max-w-2xl w-full flex flex-col gap-3 p-4 sm:p-5 max-h-[88dvh] overflow-y-auto custom-scrollbar">
            <div className="rc-dock-rail flex items-center justify-between px-3.5 py-2 shrink-0">
              <h2 className="text-lg sm:text-xl font-black italic text-white uppercase">LOAD TRACK TO EDITOR</h2>
              <button
                onClick={() => setShowLoadModal(false)}
                className="rc-bevel-btn rc-tile-red text-white px-3 py-1 font-black text-xs whitespace-nowrap"
              >
                CANCEL
              </button>
            </div>

            <div className="w-full flex flex-col gap-2.5 overflow-y-auto custom-scrollbar pr-1">
              <div className="rc-dock-well px-3 py-1.5 text-xs font-black text-yellow-300 tracking-widest">
                LOCAL TRACKS
              </div>
              {songs.filter((s) => s.artist === 'USER').length === 0 && (
                <div className="rc-console-inset text-xs sm:text-sm font-bold text-slate-300 text-center p-3">
                  No locally saved tracks found.
                </div>
              )}
              {songs
                .filter((s) => s.artist === 'USER')
                .map((song) => (
                  <button
                    key={song.id}
                    onClick={() => handleLoad(song)}
                    className="rc-bevel-btn rc-tile-slate text-white w-full text-left px-3.5 py-2.5 flex justify-between items-center gap-3"
                  >
                    <span className="font-black text-sm sm:text-base uppercase truncate">{song.title}</span>
                    <span className="rc-dock-well px-2.5 py-1 text-xs font-black text-cyan-300 whitespace-nowrap tabular-nums">
                      {song.bpm} BPM
                    </span>
                  </button>
                ))}

              <div className="rc-dock-well px-3 py-1.5 text-xs font-black text-cyan-300 tracking-widest mt-1">
                COMMUNITY TRACKS (REMIX)
              </div>
              {songs.filter((s) => s.artist !== 'USER' && s.artist !== 'Royalty Free').length === 0 && (
                <div className="rc-console-inset text-xs sm:text-sm font-bold text-slate-300 text-center p-3">
                  No community tracks downloaded.
                </div>
              )}
              {songs
                .filter((s) => s.artist !== 'USER' && s.artist !== 'Royalty Free')
                .map((song) => (
                  <button
                    key={song.id}
                    onClick={() => handleLoad(song)}
                    className="rc-bevel-btn rc-tile-slate text-white w-full text-left px-3.5 py-2.5 flex justify-between items-center gap-3"
                  >
                    <span className="font-black text-sm sm:text-base uppercase truncate">{song.title}</span>
                    <span className="rc-dock-well px-2.5 py-1 text-xs font-black text-cyan-300 whitespace-nowrap tabular-nums">
                      {song.bpm} BPM
                    </span>
                  </button>
                ))}

              <div className="rc-dock-well px-3 py-1.5 text-xs font-black text-pink-300 tracking-widest mt-1">
                DEFAULT TRACKS (REMIX)
              </div>
              {songs
                .filter((s) => s.artist === 'Royalty Free')
                .map((song) => (
                  <button
                    key={song.id}
                    onClick={() => handleLoad(song)}
                    className="rc-bevel-btn rc-tile-slate text-white w-full text-left px-3.5 py-2.5 flex justify-between items-center gap-3"
                  >
                    <span className="font-black text-sm sm:text-base uppercase truncate">{song.title}</span>
                    <span className="rc-dock-well px-2.5 py-1 text-xs font-black text-pink-300 whitespace-nowrap tabular-nums">
                      {song.bpm} BPM
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
