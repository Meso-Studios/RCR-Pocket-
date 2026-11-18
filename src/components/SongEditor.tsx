import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Circle as RecordIcon,
  Cloud,
  Disc3,
  Flag,
  Layers,
  Link as LinkIcon,
  Play,
  Save,
  Sparkles,
  Square as StopIcon,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import { db, storage } from '../firebaseClient';
import { AudioEngine, WaveformPulse } from '../game/audio';
import {
  EXPANSION_TRANSITIONS,
  EXTRA_NOTES_PRESETS,
  KEY_MAP,
  SKINS,
  SPEED_TRIGGER_PRESETS,
} from '../game/constants';
import {
  autoSyncChartNotes,
  getCleanedUrl,
  getExpandedLaneColors,
  normalizeChart,
  resolveExternalAudioInput,
} from '../game/rhythmLogic';
import { DEFAULT_HAPTICS_SETTINGS } from '../game/rhythmLogic';
import { useIsCompactLandscape } from '../game/useViewport';
import type {
  ChartNote,
  ChartTrigger,
  EditorCheckpoint,
  ExpansionTransitionType,
  ExtraNotesCount,
  FirebaseUser,
  NoteType,
  PlayerInfo,
  ScreenId,
  Song,
  SpeedTriggerPreset,
} from '../game/types';
import { GameEngine } from './GameEngine';
import { TouchLanePads } from './TouchControls';

interface SongEditorProps {
  setScreen: (s: ScreenId) => void;
  setSongs: React.Dispatch<React.SetStateAction<Song[]>>;
  songs: Song[];
  setSelectedSong: (s: Song) => void;
  user: FirebaseUser | null;
}

const DEFAULT_PLAYTEST_PLAYER: PlayerInfo = {
  level: 10,
  xp: 0,
  coins: 0,
  equippedSkin: 'default',
  unlockedSkins: ['default'],
  equippedShape: 'arrow',
  unlockedShapes: ['arrow', 'circle'],
  customColors: SKINS.default.colors,
  botplay: false,
  downscroll: true,
  bgFloatingNotes: false,
  menuGenre: 'spotify',
  haptics: DEFAULT_HAPTICS_SETTINGS,
  unlockedNoteProducts: [],
  equippedNoteProduct: null,
  unlockedHitSounds: [],
  equippedHitSound: null,
  unlockedGameMods: [],
  activeGameMods: [],
};

export const SongEditor: React.FC<SongEditorProps> = ({
  setScreen,
  setSongs,
  songs,
  setSelectedSong,
  user,
}) => {
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

  // Newgrounds / Spotify Audio Importer
  const [externalAudioInput, setExternalAudioInput] = useState('');

  // Editor Checkpoints
  const [checkpoints, setCheckpoints] = useState<EditorCheckpoint[]>([
    { id: 'cp_start', row: 0, time: 0, label: 'Start (0:00)' },
  ]);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>('cp_start');
  const [newCheckpointRow, setNewCheckpointRow] = useState<number>(16);
  const [newCheckpointLabel, setNewCheckpointLabel] = useState<string>('Drop Section');

  // Gameplay Triggers (Speed, Extra Notes 4/6/8 + 7 PowerPoint Transitions, DJ Stop)
  const [editorLanes, setEditorLanes] = useState<ExtraNotesCount>(4);
  const [triggers, setTriggers] = useState<ChartTrigger[]>([]);
  const [triggerRow, setTriggerRow] = useState<number>(8);
  const [speedPreset, setSpeedPreset] = useState<SpeedTriggerPreset>(1.5);
  const [extraNotesCount, setExtraNotesCount] = useState<ExtraNotesCount>(6);
  const [expansionTransition, setExpansionTransition] =
    useState<ExpansionTransitionType>('split_out');
  const [transitionDurationSec, setTransitionDurationSec] = useState<number>(0.5);

  // Local Playtest Overlay State
  const [playtestState, setPlaytestState] = useState<{
    active: boolean;
    startTimeMs: number;
    song: Song;
    beatmap: ChartNote[];
  } | null>(null);
  const [playtestPlayerInfo, setPlaytestPlayerInfo] =
    useState<PlayerInfo>(DEFAULT_PLAYTEST_PLAYER);

  const [isPublishing, setIsPublishing] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showTriggersPanel, setShowTriggersPanel] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const isLandscapeCompact = useIsCompactLandscape();

  const [isRecording, setIsRecording] = useState(false);
  const editorAudioRef = useRef<HTMLAudioElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const recordStartTime = useRef(0);
  const recordStartOffsetMs = useRef(0);
  const reqRef = useRef(0);
  const heldRecordKeys = useRef<
    Record<string, { row: number; lane: number; start: number; wallStart: number; originalType: NoteType }>
  >({});
  const heldRecordLanes = useRef<boolean[]>(new Array(8).fill(false));
  const lastEditorStepClick = useRef(-1);

  const showNotice = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice((curr) => (curr?.text === text ? null : curr)), 4500);
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
  const expandedColors = useMemo(
    () => getExpandedLaneColors(SKINS.default.colors, 8),
    []
  );

  const subBeatDurationMs = useMemo(() => {
    const safeBpm = Math.max(1, Number(bpm) || 120);
    return 60000 / safeBpm / stepSubdivision;
  }, [bpm, stepSubdivision]);

  const selectedCheckpoint = useMemo(
    () =>
      checkpoints.find((cp) => cp.id === selectedCheckpointId) ||
      checkpoints[0] || { id: 'cp_start', row: 0, time: 0, label: 'Start (0:00)' },
    [checkpoints, selectedCheckpointId]
  );

  const toggleNote = (row: number, col: number) => {
    const key = `${row}_${col}`;
    setGrid((prev) => {
      const next = { ...prev };
      if (next[key] === noteType) delete next[key];
      else next[key] = noteType;
      return next;
    });
    if (noteType === 'demon') AudioEngine.playDemonSound();
    else AudioEngine.playTone(300 + col * 85, 'square', 0.1);
  };

  const getRecordTime = useCallback(() => {
    if (editorAudioRef.current && editorAudioRef.current.readyState >= 2 && !editorAudioRef.current.paused) {
      return editorAudioRef.current.currentTime * 1000;
    }
    return recordStartOffsetMs.current + (performance.now() - recordStartTime.current) * recordingSpeed;
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
      if (lane >= editorLanes) return;
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
    [bpm, editorLanes, getRecordTime, isRecording, noteType, recordMode, stepSubdivision]
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
        if (scrollTarget >= 0) {
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

  const toggleRecording = (mode: 'notes' | 'pulses', fromCheckpoint = true) => {
    AudioEngine.init();
    if (isRecording && recordMode === mode) {
      setIsRecording(false);
      heldRecordKeys.current = {};
      heldRecordLanes.current = new Array(8).fill(false);
      if (editorAudioRef.current) {
        editorAudioRef.current.pause();
        editorAudioRef.current.playbackRate = 1;
      }
    } else {
      const startMs = fromCheckpoint ? selectedCheckpoint.time : 0;
      recordStartOffsetMs.current = startMs;
      setRecordMode(mode);
      setIsRecording(true);
      setMobileSettingsOpen(false);
      heldRecordKeys.current = {};
      heldRecordLanes.current = new Array(8).fill(false);
      recordStartTime.current = performance.now();
      lastEditorStepClick.current = -1;
      if (editorAudioRef.current && audioUrl && !audioUrl.startsWith('synth:')) {
        editorAudioRef.current.currentTime = startMs / 1000;
        (editorAudioRef.current as any).preservesPitch = true;
        editorAudioRef.current.playbackRate = recordingSpeed;
        editorAudioRef.current.play().catch((e) => console.warn('Audio play failed:', e));
      }
      showNotice(
        `Recording ${mode.toUpperCase()} from checkpoint "${selectedCheckpoint.label}" (${(
          startMs / 1000
        ).toFixed(1)}s)`
      );
    }
  };

  useEffect(() => {
    if (editorAudioRef.current) editorAudioRef.current.playbackRate = isRecording ? recordingSpeed : 1;
  }, [recordingSpeed, isRecording]);

  const generateMap = useCallback((): ChartNote[] => {
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
      const note: ChartNote = { time: Math.max(0, Math.round(row * subBeatDuration)), lane, type };
      if (type === 'hold') {
        const parsed = encodedHold ? Number(raw.slice(5)) : beatDuration;
        note.duration = Number.isFinite(parsed) && parsed > 0 ? parsed : beatDuration;
      }
      newMap.push(note);
    });
    return normalizeChart(newMap, 8);
  }, [bpm, grid, stepSubdivision]);

  // 1. Newgrounds ID / Spotify Link Importer
  const handleImportExternalAudio = () => {
    const res = resolveExternalAudioInput(externalAudioInput);
    if (!res.ok) {
      showNotice(res.message, 'error');
      return;
    }
    setAudioUrl(res.audioUrl);
    if (res.title && (title === 'CUSTOM TRACK' || !title.trim())) {
      setTitle(res.title);
    }
    if (res.bpm) {
      setBpm(res.bpm);
    }
    AudioEngine.playUI('confirm');
    showNotice(res.message, 'info');
  };

  // 2. Auto-Sync (BETA)
  const handleAutoSyncBeta = () => {
    const currentNotes = generateMap();
    if (currentNotes.length === 0) {
      // Place a sample starter pattern on beat if grid is empty so user can test Auto-Sync immediately
      const beatMs = 60000 / (Number(bpm) || 120);
      const sampleNotes: ChartNote[] = Array.from({ length: 16 }, (_, i) => ({
        time: Math.round(i * beatMs),
        lane: i % editorLanes,
        type: 'normal',
      }));
      const nextGrid: Record<string, string> = {};
      sampleNotes.forEach((n) => {
        const r = Math.round(n.time / subBeatDurationMs);
        nextGrid[`${r}_${n.lane}`] = 'normal';
      });
      setGrid(nextGrid);
      AudioEngine.playUI('confirm');
      showNotice(`AUTO-SYNC [BETA]: Generated & snapped 16 on-beat notes at ${bpm} BPM!`, 'info');
      return;
    }

    const snapped = autoSyncChartNotes(currentNotes, bpm, stepSubdivision, pulses);
    const nextGrid: Record<string, string> = {};
    let maxRow = 0;
    snapped.forEach((n) => {
      const row = Math.round(n.time / subBeatDurationMs);
      if (row > maxRow) maxRow = row;
      nextGrid[`${row}_${n.lane}`] =
        n.type === 'hold' ? `hold:${n.duration || Math.round(subBeatDurationMs * 2)}` : n.type;
    });
    setGrid(nextGrid);
    setMeasures((prev) => Math.max(prev, Math.ceil((maxRow + stepSubdivision) / (4 * stepSubdivision))));
    AudioEngine.playUI('confirm');
    showNotice(
      `AUTO-SYNC [BETA]: Snapped ${snapped.length} notes onto the ${bpm} BPM (1/${stepSubdivision}) beat grid!`,
      'info'
    );
  };

  // 3. Editor Checkpoints
  const handleAddCheckpoint = (rowOverride?: number) => {
    const targetRow = Math.max(0, Math.round(rowOverride ?? newCheckpointRow));
    const timeMs = Math.round(targetRow * subBeatDurationMs);
    const label =
      (newCheckpointLabel || '').trim() || `Checkpoint @ Row ${targetRow} (${(timeMs / 1000).toFixed(1)}s)`;
    const cp: EditorCheckpoint = {
      id: `cp_${Date.now()}_${targetRow}`,
      row: targetRow,
      time: timeMs,
      label,
    };
    setCheckpoints((prev) => {
      const filtered = prev.filter((p) => p.row !== targetRow || p.id === 'cp_start');
      return [...filtered, cp].sort((a, b) => a.row - b.row);
    });
    setSelectedCheckpointId(cp.id);
    setMeasures((prev) => Math.max(prev, Math.ceil((targetRow + stepSubdivision) / (4 * stepSubdivision))));
    AudioEngine.playUI('confirm');
    showNotice(`Added Editor Checkpoint "${cp.label}" at Row ${targetRow} (${(timeMs / 1000).toFixed(1)}s)`);
  };

  const handleSelectCheckpoint = (cp: EditorCheckpoint) => {
    setSelectedCheckpointId(cp.id);
    if (editorScrollRef.current) {
      editorScrollRef.current.scrollTop = Math.max(0, cp.row * rowHeight - 120);
    }
    if (editorAudioRef.current && audioUrl && !audioUrl.startsWith('synth:')) {
      try {
        editorAudioRef.current.currentTime = cp.time / 1000;
      } catch {}
    }
    AudioEngine.playUI('move');
  };

  const handleClearNotesFromCheckpoint = () => {
    const minRow = selectedCheckpoint.row;
    setGrid((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const r = Number(k.split('_')[0]);
        if (r < minRow) next[k] = v;
      });
      return next;
    });
    AudioEngine.playUI('confirm');
    showNotice(`Cleared notes from Checkpoint "${selectedCheckpoint.label}" (Row ${minRow}+) so you can re-record!`);
  };

  // 4. Add Gameplay Trigger (Speed, Extra Notes 4/6/8 + 7 Transitions, DJ Stop)
  const handleAddTrigger = (type: 'speed' | 'extra_notes' | 'dj_stop') => {
    const r = Math.max(0, Math.round(triggerRow));
    const timeMs = Math.round(r * subBeatDurationMs);
    const newTrig: ChartTrigger = {
      id: `trig_${Date.now()}_${r}`,
      row: r,
      time: timeMs,
      type,
      ...(type === 'speed' ? { speed: speedPreset } : {}),
      ...(type === 'extra_notes'
        ? {
            laneCount: extraNotesCount,
            transition: expansionTransition,
            transitionDurationSec: Number(transitionDurationSec.toFixed(1)),
          }
        : {}),
      ...(type === 'dj_stop' ? { stopDurationSec: 1.2 } : {}),
    };
    setTriggers((prev) => [...prev, newTrig].sort((a, b) => a.time - b.time));
    if (type === 'extra_notes' && extraNotesCount > editorLanes) {
      setEditorLanes(extraNotesCount);
    }
    AudioEngine.playUI('confirm');
    showNotice(
      type === 'speed'
        ? `Added Speed Trigger (${speedPreset.toFixed(2)}x) at Row ${r} (${(timeMs / 1000).toFixed(1)}s)`
        : type === 'extra_notes'
          ? `Added Extra Notes Trigger (${extraNotesCount} Notes · ${expansionTransition.toUpperCase()} · ${transitionDurationSec.toFixed(1)}s) at Row ${r}`
          : `Added DJ Record Stop Effect Trigger at Row ${r} (${(timeMs / 1000).toFixed(1)}s)`
    );
  };

  // 5. Local Playtest in Editor (From Start or From Selected Checkpoint)
  const startLocalPlaytest = (fromCheckpoint: boolean) => {
    setIsRecording(false);
    if (editorAudioRef.current) {
      editorAudioRef.current.pause();
    }
    let mapToTest = generateMap();
    const startMs = fromCheckpoint ? selectedCheckpoint.time : 0;
    if (mapToTest.length === 0) {
      const beatMs = 60000 / (Number(bpm) || 120);
      mapToTest = Array.from({ length: 24 }, (_, i) => ({
        time: Math.round(startMs + 800 + i * (beatMs / 2)),
        lane: i % editorLanes,
        type: 'normal' as const,
      }));
    }
    const testSong: Song = {
      id: 'editor_playtest',
      title: `${title || 'CUSTOM TRACK'} [EDITOR TEST]`,
      artist: user?.email || 'CREATOR PLAYTEST',
      bpm: Number(bpm) || 120,
      color: '#36e2ff',
      audioUrl: getCleanedUrl(audioUrl) || 'synth:rave',
      coverUrl,
      customMap: mapToTest,
      pulses,
      triggers,
      checkpoints,
      stepClick,
      stepSubdivision,
    };
    AudioEngine.playUI('confirm');
    setPlaytestState({
      active: true,
      startTimeMs: startMs,
      song: testSong,
      beatmap: mapToTest,
    });
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
      triggers,
      checkpoints,
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
      const newMap = normalizeChart(generateMap(), 8);
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
        triggers,
        checkpoints,
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
    let maxLane = 3;
    if (songToLoad.customMap) {
      normalizeChart(songToLoad.customMap, 8).forEach((note) => {
        const row = Math.round(note.time / subBeatDur);
        newGrid[`${row}_${note.lane}`] =
          note.type === 'hold' ? `hold:${note.duration || beatDur}` : note.type || 'normal';
        if (row > maxRow) maxRow = row;
        if (note.lane > maxLane) maxLane = note.lane;
      });
    }
    setEditorLanes(maxLane >= 6 ? 8 : maxLane >= 4 ? 6 : 4);
    setGrid(newGrid);
    setPulses(songToLoad.pulses || []);
    setTriggers(songToLoad.triggers || []);
    setCheckpoints(
      songToLoad.checkpoints?.length
        ? songToLoad.checkpoints
        : [{ id: 'cp_start', row: 0, time: 0, label: 'Start (0:00)' }]
    );
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

  // Render Local Playtest Overlay when testing in the Editor
  if (playtestState?.active) {
    return (
      <div className="fixed inset-0 z-[250] bg-black flex flex-col">
        <div className="bg-black/90 border-b-2 border-cyan-400 px-4 py-1.5 flex items-center justify-between z-[260] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-md bg-cyan-500 text-black font-black text-xs uppercase">
              EDITOR PLAYTEST MODE
            </span>
            <span className="text-xs font-black text-white">
              Starting at {(playtestState.startTimeMs / 1000).toFixed(1)}s ({selectedCheckpoint.label})
            </span>
          </div>
          <button
            data-testid="editor-exit-playtest-btn"
            onClick={() => setPlaytestState(null)}
            className="rc-bevel-btn rc-tile-pink text-white px-4 py-1 rounded-lg text-xs font-black uppercase"
          >
            RETURN TO EDITOR
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          <GameEngine
            song={playtestState.song}
            difficulty="normal"
            gameMode="standard"
            setScreen={() => setPlaytestState(null)}
            customBeatmap={playtestState.beatmap}
            playerInfo={playtestPlayerInfo}
            setPlayerInfo={setPlaytestPlayerInfo}
            addRewards={() => {}}
            modifiers={{
              speed: 1,
              altChart: false,
              noFail: true,
              extreme: false,
              nerf: 0,
              laneCount: editorLanes,
              expansionTransition,
              transitionDurationSec,
            }}
            onGradeUpdate={() => {}}
            initialStartTimeMs={playtestState.startTimeMs}
            onExitPlaytest={() => setPlaytestState(null)}
          />
        </div>
      </div>
    );
  }

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
        className={`relative z-10 rc-console-tray mx-2 sm:mx-3 mt-1.5 flex flex-col shrink-0 ${
          isLandscapeCompact ? 'p-1.5 gap-1.5 pr-12' : 'p-2.5 gap-2 pr-14 sm:pr-16'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5">
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
            <div className="rc-dock-rail px-3 py-1 flex items-center gap-2">
              <h2
                className={`font-black italic uppercase text-white ${
                  isLandscapeCompact ? 'text-sm sm:text-base' : 'text-base sm:text-lg'
                }`}
              >
                SONG EDITOR
              </h2>
              <span className="rc-dock-well px-2 py-0.5 text-[10px] font-black text-cyan-300 tabular-nums">
                NOTES: {Object.keys(grid).length}
              </span>
              <span className="rc-dock-well px-2 py-0.5 text-[10px] font-black text-pink-300 tabular-nums">
                TRIGGERS: {triggers.length}
              </span>
            </div>

            {/* Auto-Sync (BETA) Button */}
            <button
              type="button"
              data-testid="editor-autosync-beta-btn"
              onClick={handleAutoSyncBeta}
              className="rc-bevel-btn rc-tile-cyan text-black px-3 py-1.5 font-black text-xs flex items-center gap-1.5 whitespace-nowrap"
              title="Snap recorded or placed notes onto the song's beat grid"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>AUTO-SYNC</span>
              <span className="px-1.5 py-0.5 rounded bg-black text-cyan-300 text-[9px] font-black tracking-wider">
                BETA
              </span>
            </button>

            {/* Local Playtest Buttons (From Start or From Selected Checkpoint) */}
            <button
              type="button"
              data-testid="editor-test-start-btn"
              onClick={() => startLocalPlaytest(false)}
              className="rc-bevel-btn rc-tile-green text-black px-2.5 py-1.5 font-black text-xs flex items-center gap-1 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>TEST (0:00)</span>
            </button>
            <button
              type="button"
              data-testid="editor-test-checkpoint-btn"
              onClick={() => startLocalPlaytest(true)}
              className="rc-bevel-btn rc-tile-purple text-white px-2.5 py-1.5 font-black text-xs flex items-center gap-1 whitespace-nowrap"
              title={`Test track starting from checkpoint: ${selectedCheckpoint.label}`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>TEST @ CP ({(selectedCheckpoint.time / 1000).toFixed(1)}s)</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="rc-dock-rail flex items-center p-1 gap-1 text-xs">
              <button
                onClick={() => setNoteType('normal')}
                className={`rc-bevel-btn px-2 py-1 font-black uppercase whitespace-nowrap ${
                  noteType === 'normal' ? 'rc-tile-green text-black' : 'rc-sub-dark text-slate-300'
                }`}
              >
                Normal
              </button>
              <button
                onClick={() => setNoteType('hold')}
                className={`rc-bevel-btn px-2 py-1 font-black uppercase whitespace-nowrap ${
                  noteType === 'hold' ? 'rc-tile-violet text-white' : 'rc-sub-dark text-slate-300'
                }`}
              >
                Hold
              </button>
              <button
                onClick={() => setNoteType('demon')}
                className={`rc-bevel-btn px-2 py-1 font-black uppercase whitespace-nowrap ${
                  noteType === 'demon' ? 'rc-tile-red text-white' : 'rc-sub-dark text-slate-300'
                }`}
              >
                Demon
              </button>
            </div>

            <button
              type="button"
              data-testid="editor-triggers-toggle-btn"
              onClick={() => setShowTriggersPanel((v) => !v)}
              className={`rc-bevel-btn px-2.5 py-1.5 font-black text-xs flex items-center gap-1 whitespace-nowrap ${
                showTriggersPanel ? 'rc-tile-pink text-white' : 'rc-tile-gold text-black'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>TRIGGERS & CHECKPOINTS</span>
            </button>

            <button
              onClick={() => setMobileSettingsOpen((v) => !v)}
              className="lg:hidden rc-bevel-btn rc-tile-slate text-white px-2.5 py-1.5 font-black text-xs flex items-center gap-1 whitespace-nowrap"
            >
              SETTINGS {mobileSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`rc-console-inset px-3 py-1.5 font-black text-xs ${
              notice.tone === 'error' ? 'border-red-400 text-red-200' : 'border-cyan-400 text-cyan-200'
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* Settings & Newgrounds / Spotify Audio Uploader Row */}
        <div
          className={`${
            mobileSettingsOpen ? 'flex' : 'hidden lg:flex'
          } flex-col lg:flex-row lg:items-center justify-between gap-2 max-h-[42vh] lg:max-h-none overflow-y-auto`}
        >
          <div className="rc-console-inset flex items-center gap-2 flex-wrap p-1.5 flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isRecording}
              className="bg-[#0a0d16] border border-white/25 rounded-lg text-white px-2 py-1 font-black text-xs w-32 uppercase disabled:opacity-50"
              placeholder="TITLE"
            />
            <div className="flex items-center gap-1">
              <span className="font-black text-cyan-300 text-xs">BPM</span>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                disabled={isRecording}
                className="w-14 bg-[#0a0d16] border border-white/25 rounded-lg text-white px-2 py-1 text-xs font-black tabular-nums disabled:opacity-50"
              />
            </div>

            {/* Newgrounds ID or Spotify Link Importer */}
            <div className="flex items-center gap-1 bg-[#0a0d16] border border-cyan-400/50 rounded-lg px-2 py-0.5 flex-1 min-w-[230px]">
              <LinkIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <input
                data-testid="editor-external-audio-input"
                type="text"
                placeholder="Newgrounds ID (574484) or Spotify Link..."
                value={externalAudioInput}
                disabled={isRecording}
                onChange={(e) => setExternalAudioInput(e.target.value)}
                className="w-full bg-transparent text-white py-0.5 font-black text-xs focus:outline-none"
              />
              <button
                type="button"
                data-testid="editor-import-audio-btn"
                onClick={handleImportExternalAudio}
                className="rc-bevel-btn rc-tile-cyan text-black px-2 py-0.5 rounded text-[10px] font-black uppercase shrink-0"
              >
                IMPORT NG / SPOTIFY
              </button>
            </div>

            {/* Direct MP3 URL input */}
            <div className="flex items-center bg-[#0a0d16] border border-white/25 rounded-lg px-2 w-40">
              <input
                type="text"
                placeholder="Direct Audio URL"
                value={audioUrl}
                disabled={isRecording}
                onChange={(e) => setAudioUrl(e.target.value)}
                className="w-full bg-transparent text-white py-1 font-black text-xs focus:outline-none"
              />
            </div>

            {/* Lane Count Switcher (4 / 6 / 8 Notes) */}
            <div className="rc-dock-well flex items-center gap-1 px-2 py-1 text-xs">
              <Layers className="w-3.5 h-3.5 text-pink-400" />
              <span className="font-black text-pink-300 text-[10px]">LANES:</span>
              {EXTRA_NOTES_PRESETS.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setEditorLanes(cnt)}
                  className={`px-1.5 py-0.5 rounded font-black text-[10px] ${
                    editorLanes === cnt ? 'bg-pink-500 text-white' : 'bg-white/10 text-white/70'
                  }`}
                >
                  {cnt}K
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center shrink-0">
            <div className="rc-dock-well px-2 py-1 flex items-center gap-1.5 text-xs">
              <span className="text-[9px] font-black text-yellow-300">REC SPD</span>
              <select
                value={recordingSpeed}
                onChange={(e) => setRecordingSpeed(Number(e.target.value))}
                className="bg-[#0a0d16] text-white border border-white/20 rounded font-black px-1 py-0.5 text-[11px]"
              >
                <option value="0.25">0.25x</option>
                <option value="0.5">0.50x</option>
                <option value="0.75">0.75x</option>
                <option value="1">1.00x</option>
              </select>
            </div>
            <div className="rc-dock-well px-2 py-1 flex items-center gap-1.5 text-xs">
              <label className="text-[9px] font-black text-cyan-300 flex items-center gap-1">
                <input type="checkbox" checked={stepClick} onChange={(e) => setStepClick(e.target.checked)} /> CLICK
              </label>
              <select
                value={stepSubdivision}
                onChange={(e) => changeStepSubdivision(e.target.value)}
                className="bg-[#0a0d16] text-white border border-white/20 rounded font-black px-1 py-0.5 text-[11px]"
              >
                <option value="1">1/1</option>
                <option value="2">1/2</option>
                <option value="4">1/4</option>
                <option value="8">1/8</option>
                <option value="16">1/16</option>
              </select>
            </div>
          </div>
        </div>

        {/* Collapsible Checkpoints & Gameplay Triggers Studio Panel */}
        {showTriggersPanel && (
          <div className="rc-console-inset p-2.5 grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[38vh] overflow-y-auto">
            {/* Left: Editor Checkpoints */}
            <div className="rc-dock-well p-2.5 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-cyan-300 uppercase flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5" /> EDITOR CHECKPOINTS ({checkpoints.length})
                </span>
                <button
                  type="button"
                  onClick={handleClearNotesFromCheckpoint}
                  className="px-2 py-0.5 rounded bg-rose-500/25 border border-rose-400/50 text-rose-200 text-[10px] font-black uppercase"
                  title="Clear notes after selected checkpoint to fix offbeat recording"
                >
                  CLEAR NOTES FROM CP+
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={rows}
                  value={newCheckpointRow}
                  onChange={(e) => setNewCheckpointRow(Number(e.target.value))}
                  className="w-16 bg-black/70 border border-white/25 rounded px-2 py-1 text-xs font-black text-white"
                  placeholder="Row"
                />
                <input
                  type="text"
                  value={newCheckpointLabel}
                  onChange={(e) => setNewCheckpointLabel(e.target.value)}
                  className="flex-1 bg-black/70 border border-white/25 rounded px-2 py-1 text-xs font-black text-white"
                  placeholder="Checkpoint name (e.g. Drop)"
                />
                <button
                  type="button"
                  data-testid="editor-add-checkpoint-btn"
                  onClick={() => handleAddCheckpoint()}
                  className="rc-bevel-btn rc-tile-cyan text-black px-2.5 py-1 rounded text-[10px] font-black uppercase"
                >
                  + ADD CP
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {checkpoints.map((cp) => {
                  const isSel = cp.id === selectedCheckpoint.id;
                  return (
                    <div
                      key={cp.id}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black cursor-pointer ${
                        isSel
                          ? 'bg-cyan-500 text-black border-white'
                          : 'bg-white/10 text-white border-white/20'
                      }`}
                      onClick={() => handleSelectCheckpoint(cp)}
                    >
                      <span>
                        ⚑ {cp.label} (R{cp.row} · {(cp.time / 1000).toFixed(1)}s)
                      </span>
                      {cp.id !== 'cp_start' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCheckpoints((prev) => prev.filter((x) => x.id !== cp.id));
                          }}
                          className="ml-1 text-rose-400 hover:text-rose-200"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Speed Triggers, Extra Notes Triggers (4/6/8 + 7 PowerPoint Transitions), DJ Stop */}
            <div className="rc-dock-well p-2.5 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-pink-300 uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> GAMEPLAY TRIGGERS @ ROW:
                </span>
                <input
                  type="number"
                  min={0}
                  max={rows}
                  value={triggerRow}
                  onChange={(e) => setTriggerRow(Number(e.target.value))}
                  className="w-16 bg-black/70 border border-pink-400/50 rounded px-2 py-0.5 text-xs font-black text-pink-200 text-center"
                />
              </div>

              {/* Speed Trigger Row */}
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  {SPEED_TRIGGER_PRESETS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setSpeedPreset(sp)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                        speedPreset === sp ? 'bg-cyan-400 text-black' : 'bg-white/10 text-white/75'
                      }`}
                    >
                      {sp.toFixed(2)}x
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="editor-add-speed-trigger-btn"
                  onClick={() => handleAddTrigger('speed')}
                  className="rc-bevel-btn rc-tile-cyan text-black px-2.5 py-1 rounded text-[10px] font-black uppercase"
                >
                  + SPEED TRIGGER
                </button>
              </div>

              {/* Extra Notes Trigger + 7 Transitions + Transition Speed (0.1s - 2.0s) */}
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  {EXTRA_NOTES_PRESETS.map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setExtraNotesCount(cnt)}
                      className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        extraNotesCount === cnt ? 'bg-pink-500 text-white' : 'bg-white/10 text-white/75'
                      }`}
                    >
                      {cnt} NOTES
                    </button>
                  ))}
                  <select
                    value={expansionTransition}
                    onChange={(e) => setExpansionTransition(e.target.value as ExpansionTransitionType)}
                    className="bg-black/80 border border-white/25 rounded px-1.5 py-0.5 text-[10px] font-black text-violet-200"
                  >
                    {EXPANSION_TRANSITIONS.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 text-[10px] font-black text-amber-300">
                    <span>{transitionDurationSec.toFixed(1)}s</span>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={transitionDurationSec}
                      onChange={(e) => setTransitionDurationSec(Number(parseFloat(e.target.value).toFixed(1)))}
                      className="w-16 accent-amber-400"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid="editor-add-extra-notes-trigger-btn"
                    onClick={() => handleAddTrigger('extra_notes')}
                    className="rc-bevel-btn rc-tile-pink text-white px-2.5 py-1 rounded text-[10px] font-black uppercase"
                  >
                    + EXTRA NOTES
                  </button>
                  <button
                    type="button"
                    data-testid="editor-add-dj-stop-trigger-btn"
                    onClick={() => handleAddTrigger('dj_stop')}
                    className="rc-bevel-btn rc-tile-gold text-black px-2 py-1 rounded text-[10px] font-black uppercase flex items-center gap-1"
                  >
                    <Disc3 className="w-3 h-3" /> + DJ STOP
                  </button>
                </div>
              </div>

              {triggers.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pt-1 border-t border-white/10">
                  {triggers.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 border border-white/20 text-[9px] font-black text-white"
                    >
                      {t.type === 'speed'
                        ? `⚡ ${t.speed?.toFixed(2)}x @ R${t.row}`
                        : t.type === 'extra_notes'
                          ? `🎹 ${t.laneCount}K (${t.transition} · ${t.transitionDurationSec}s) @ R${t.row}`
                          : `💿 DJ STOP @ R${t.row}`}
                      <button
                        type="button"
                        onClick={() => setTriggers((prev) => prev.filter((x) => x.id !== t.id))}
                        className="text-rose-400 hover:text-rose-200"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Always-accessible Action Row */}
        <div className={`grid grid-cols-5 w-full ${isLandscapeCompact ? 'gap-1.5' : 'gap-2'}`}>
          <button
            onClick={() => toggleRecording('notes', true)}
            className={`rc-bevel-btn flex justify-center items-center gap-1.5 px-2.5 font-black whitespace-nowrap ${
              isLandscapeCompact ? 'py-1.5 text-xs' : 'py-2 text-xs sm:text-sm'
            } ${
              isRecording && recordMode === 'notes'
                ? 'rc-tile-red text-white animate-pulse'
                : 'rc-tile-gold text-black'
            }`}
          >
            {isRecording && recordMode === 'notes' ? <StopIcon className="w-3.5 h-3.5" /> : <RecordIcon className="w-3.5 h-3.5" />}
            REC @ CP
          </button>

          <button
            onClick={() => toggleRecording('pulses', true)}
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

      {/* Note Grid (Widens proportionally for 4, 6, or 8 lanes) */}
      <div
        ref={editorScrollRef}
        className={`relative z-10 flex-1 min-h-0 overflow-auto p-3 md:p-5 flex justify-center custom-scrollbar ${
          isRecording
            ? recordMode === 'notes'
              ? 'smooth-scroll ring-4 ring-red-500/70'
              : 'smooth-scroll ring-4 ring-cyan-400/70'
            : ''
        }`}
      >
        <div
          className={`bg-[#060811] border-4 border-white/80 rounded-xl shadow-[0_12px_28px_rgba(0,0,0,0.7)] relative transition-all duration-300 ${
            isRecording ? 'mt-[40vh] mb-[40vh]' : 'mt-2 mb-12'
          }`}
          style={{
            width: '100%',
            maxWidth: `${editorLanes * 115}px`,
            height: `${rows * rowHeight}px`,
          }}
        >
          <div
            className="absolute inset-0 grid divide-x-[2px] md:divide-x-4 divide-gray-800 pointer-events-none"
            style={{ gridTemplateColumns: `repeat(${editorLanes}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: editorLanes }).map((_, idx) => (
              <div
                key={idx}
                style={{ backgroundColor: `${expandedColors[idx]}14` }}
              />
            ))}
          </div>

          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${editorLanes}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, ${rowHeight}px)`,
            }}
          >
            {Array.from({ length: rows }).map((_, row) => {
              const rowCheckpoint = checkpoints.find((cp) => cp.row === row);
              const rowTrigger = triggers.find((tr) => tr.row === row);
              return (
                <React.Fragment key={row}>
                  {Array.from({ length: editorLanes }).map((__, col) => {
                    const isBeat = row % stepSubdivision === 0;
                    const isMeasure = row % (stepSubdivision * 4) === 0;
                    const noteData = grid[`${row}_${col}`];
                    const isDemon = noteData === 'demon';
                    const isHold = typeof noteData === 'string' && noteData.startsWith('hold');
                    const colColor = expandedColors[col] || '#36e2ff';

                    return (
                      <div
                        key={`${row}_${col}`}
                        onClick={() => {
                          if (!isRecording) toggleNote(row, col);
                        }}
                        onDoubleClick={() => {
                          if (!isRecording) handleAddCheckpoint(row);
                        }}
                        className={`border-b border-gray-800/50 ${
                          isRecording ? '' : 'cursor-pointer hover:bg-white/20 active:bg-white/30'
                        } transition-colors relative ${
                          isBeat ? 'border-b-gray-500 border-b-2 md:border-b-4' : ''
                        } ${isMeasure ? 'border-b-white border-b-[4px] md:border-b-[6px]' : ''} ${
                          rowCheckpoint ? 'bg-cyan-500/15' : ''
                        }`}
                      >
                        {col === 0 && rowCheckpoint && (
                          <span className="absolute left-1 top-0.5 z-20 px-1.5 py-0.2 rounded bg-cyan-400 text-black text-[9px] font-black whitespace-nowrap pointer-events-none">
                            ⚑ {rowCheckpoint.label}
                          </span>
                        )}
                        {col === editorLanes - 1 && rowTrigger && (
                          <span className="absolute right-1 top-0.5 z-20 px-1.5 py-0.2 rounded bg-pink-500 text-white text-[9px] font-black whitespace-nowrap pointer-events-none">
                            {rowTrigger.type === 'speed'
                              ? `⚡ ${rowTrigger.speed?.toFixed(2)}x`
                              : rowTrigger.type === 'extra_notes'
                                ? `🎹 ${rowTrigger.laneCount}K`
                                : '💿 DJ STOP'}
                          </span>
                        )}
                        {noteData && (
                          <div
                            className="absolute inset-1 border-2 md:border-4 rounded shadow-[inset_0_0_5px_rgba(0,0,0,0.8)]"
                            style={{
                              background: isHold ? `linear-gradient(${colColor},#7c3aed)` : undefined,
                              backgroundColor: isDemon ? '#000' : isHold ? undefined : colColor,
                              borderColor: isDemon ? '#dc2626' : '#fff',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
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
              colors={expandedColors.slice(0, editorLanes)}
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
                COMMUNITY & FEATURED TRACKS (REMIX)
              </div>
              {songs
                .filter((s) => s.artist !== 'USER')
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
