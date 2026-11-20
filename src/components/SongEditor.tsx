import React, { useState, useEffect, useRef } from 'react';
import {
  ChartTrigger,
  Difficulty,
  EditorCheckpoint,
  HapticsSettings,
  LaneCountOption,
  LaneExpansionTransition,
  Note,
  NoteVelocityEffect,
  Song,
  SpeedTriggerPreset,
} from '../game/types';
import {
  DEFAULT_CUSTOM_KEYBINDS,
  EXTRA_LANE_OPTIONS,
  LANE_COLORS_8,
  LANE_EXPANSION_TRANSITIONS,
  NOTE_VELOCITY_EFFECTS,
  SPEED_TRIGGER_PRESETS,
} from '../game/constants';
import {
  autoSyncNotesToBpm,
  mapCustomKeyToLane,
  resolveExternalAudioInput,
  snapTimeToBeatGrid,
} from '../game/rhythmLogic';
import { triggerHapticFeedback } from '../game/haptics';
import { AudioEngine } from '../game/audio';
import {
  ArrowLeft,
  BookmarkCheck,
  Columns,
  Cpu,
  Download,
  EyeOff,
  Flame,
  Flag,
  Gauge,
  HelpCircle,
  Link2,
  Mic,
  Music,
  Play,
  Plus,
  Radio,
  Skull,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UploadCloud,
  Volume2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

interface SongEditorProps {
  onSave?: (song: Song) => void;
  onBack?: () => void;
  setScreen?: (s: any) => void;
  setSongs?: React.Dispatch<React.SetStateAction<Song[]>>;
  songs?: Song[];
  setSelectedSong?: (s: Song) => void;
  user?: any;
  onPlaytest?: (song: Song, startTimeMs?: number) => void;
  initialSong?: Song | null;
  haptics?: HapticsSettings;
  customKeybinds?: string[];
}

export const SongEditor: React.FC<SongEditorProps> = ({
  onSave,
  onBack,
  setScreen,
  setSongs,
  setSelectedSong,
  user,
  onPlaytest,
  initialSong,
  haptics,
  customKeybinds = DEFAULT_CUSTOM_KEYBINDS,
}) => {
  const initialNotes = initialSong?.customMap || initialSong?.notes || [];
  const [title, setTitle] = useState(initialSong?.title || 'My Custom Track');
  const [artist, setArtist] = useState(initialSong?.artist || 'Unknown Artist');
  const [bpm, setBpm] = useState(initialSong?.bpm || 120);
  const [difficulty, setDifficulty] = useState<Difficulty | string>(
    initialSong?.difficulty || 'normal'
  );
  const [color, setColor] = useState(initialSong?.color || '#00f0ff');
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [duration, setDuration] = useState(initialSong?.duration || 120);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(initialSong?.audioUrl);
  const [newgroundsId, setNewgroundsId] = useState<string>(initialSong?.newgroundsId || '');
  const [spotifyUrl, setSpotifyUrl] = useState<string>(initialSong?.spotifyUrl || '');
  const [externalAudioInput, setExternalAudioInput] = useState<string>(
    initialSong?.newgroundsId || initialSong?.spotifyUrl || ''
  );
  const [externalStatus, setExternalStatus] = useState<string>('');
  const [isPreviewingExternal, setIsPreviewingExternal] = useState(false);

  const [triggers, setTriggers] = useState<ChartTrigger[]>(
    (initialSong?.triggers || []).filter((t) => t.type !== 'dj_stop')
  );
  const [checkpoints, setCheckpoints] = useState<EditorCheckpoint[]>(
    initialSong?.checkpoints || []
  );
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [editorLaneCount, setEditorLaneCount] = useState<LaneCountOption>(() => {
    const maxLaneInNotes = initialNotes.reduce((m, n) => Math.max(m, n.lane), 3);
    const maxLaneInTriggers = (initialSong?.triggers || []).reduce(
      (m, t) => Math.max(m, t.lanes || 4),
      4
    );
    if (maxLaneInNotes >= 6 || maxLaneInTriggers === 8) return 8;
    if (maxLaneInNotes >= 4 || maxLaneInTriggers === 6) return 6;
    return 4;
  });

  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [autoSyncSubdivision, setAutoSyncSubdivision] = useState<number>(4);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedNoteType, setSelectedNoteType] = useState<'normal' | 'demon'>('normal');
  const [isHoldMode, setIsHoldMode] = useState(false);
  const [holdStart, setHoldStart] = useState<{ row: number; col: number } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [activeRecLanes, setActiveRecLanes] = useState<Record<number, boolean>>({});

  // Press-and-Hold / Right-Click Slot Context Modal State
  const [slotModalRow, setSlotModalRow] = useState<number | null>(null);
  const [slotModalCol, setSlotModalCol] = useState<number>(0);
  const [slotTab, setSlotTab] = useState<'trigger' | 'checkpoint'>('trigger');
  const [slotTriggerType, setSlotTriggerType] = useState<
    'speed' | 'extra_notes' | 'invisible_notes' | 'note_velocity'
  >('speed');
  const [slotSpeedPreset, setSlotSpeedPreset] = useState<SpeedTriggerPreset>(1.5);
  const [slotExtraLanes, setSlotExtraLanes] = useState<LaneCountOption>(6);
  const [slotTransition, setSlotTransition] = useState<LaneExpansionTransition>('push');
  const [slotTransitionSpeed, setSlotTransitionSpeed] = useState<number>(0.5);
  const [slotInvisibleEnabled, setSlotInvisibleEnabled] = useState<boolean>(true);
  const [slotInvisibleDurationSec, setSlotInvisibleDurationSec] = useState<number>(8);
  const [slotVelocityEffect, setSlotVelocityEffect] = useState<NoteVelocityEffect>('ease_in_rush');
  const [slotVelocityIntensity, setSlotVelocityIntensity] = useState<number>(1.0);
  const [slotCheckpointName, setSlotCheckpointName] = useState<string>('');

  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef<boolean>(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRecordingNotes = useRef<{ [lane: number]: number }>({});

  const stepTime = (60 / Math.max(30, bpm) / 4) * 1000;
  const totalSteps = Math.max(16, Math.floor((duration * 1000) / stepTime));

  useEffect(() => {
    if (audioUrl && !audioUrl.startsWith('synth:')) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const a = new Audio();
      a.crossOrigin = 'anonymous';
      a.src = audioUrl;
      audioRef.current = a;
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [audioUrl]);

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  const openSlotStudioModal = (row: number, col = 0, preferredTab?: 'trigger' | 'checkpoint') => {
    triggerHapticFeedback('heavy', haptics);
    setSlotModalRow(row);
    setSlotModalCol(col);

    const existingCheckpoint = checkpoints.find((cp) => cp.row === row);
    const existingTrigger = triggers.find((t) => t.row === row);

    if (preferredTab) {
      setSlotTab(preferredTab);
    } else if (existingTrigger) {
      setSlotTab('trigger');
    } else if (existingCheckpoint) {
      setSlotTab('checkpoint');
    } else {
      setSlotTab('trigger');
    }

    if (existingTrigger) {
      if (
        existingTrigger.type === 'speed' ||
        existingTrigger.type === 'extra_notes' ||
        existingTrigger.type === 'invisible_notes' ||
        existingTrigger.type === 'note_velocity'
      ) {
        setSlotTriggerType(existingTrigger.type);
      }
      if (existingTrigger.speed) setSlotSpeedPreset(existingTrigger.speed);
      if (existingTrigger.lanes) setSlotExtraLanes(existingTrigger.lanes);
      if (existingTrigger.transition) setSlotTransition(existingTrigger.transition);
      if (existingTrigger.transitionDuration)
        setSlotTransitionSpeed(existingTrigger.transitionDuration);
      if (typeof existingTrigger.invisibleEnabled === 'boolean')
        setSlotInvisibleEnabled(existingTrigger.invisibleEnabled);
      if (existingTrigger.invisibleDurationMs)
        setSlotInvisibleDurationSec(Math.round(existingTrigger.invisibleDurationMs / 1000));
      if (existingTrigger.velocityEffect) setSlotVelocityEffect(existingTrigger.velocityEffect);
      if (existingTrigger.velocityIntensity)
        setSlotVelocityIntensity(existingTrigger.velocityIntensity);
    }

    setSlotCheckpointName(
      existingCheckpoint?.name || `Checkpoint @ ${((row * stepTime) / 1000).toFixed(1)}s`
    );
  };

  const handleCellPointerDown = (row: number, col: number, e: React.PointerEvent) => {
    if (e.button === 2) return; // Right click handled by onContextMenu
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      openSlotStudioModal(row, col);
    }, 360);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSaveSlotTrigger = () => {
    if (slotModalRow === null) return;
    const row = Math.max(0, Math.min(totalSteps - 1, slotModalRow));
    const time = Math.round(row * stepTime);

    const newTrig: ChartTrigger = {
      id: `trig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      row,
      time,
      type: slotTriggerType,
      speed: slotTriggerType === 'speed' ? slotSpeedPreset : undefined,
      lanes: slotTriggerType === 'extra_notes' ? slotExtraLanes : undefined,
      transition: slotTriggerType === 'extra_notes' ? slotTransition : undefined,
      transitionDuration:
        slotTriggerType === 'extra_notes'
          ? Number(slotTransitionSpeed.toFixed(1))
          : undefined,
      invisibleEnabled:
        slotTriggerType === 'invisible_notes' ? slotInvisibleEnabled : undefined,
      invisibleDurationMs:
        slotTriggerType === 'invisible_notes'
          ? Math.max(0, Math.round(slotInvisibleDurationSec * 1000))
          : undefined,
      velocityEffect:
        slotTriggerType === 'note_velocity' ? slotVelocityEffect : undefined,
      velocityIntensity:
        slotTriggerType === 'note_velocity'
          ? Number(slotVelocityIntensity.toFixed(2))
          : undefined,
    };

    if (slotTriggerType === 'extra_notes' && slotExtraLanes > editorLaneCount) {
      setEditorLaneCount(slotExtraLanes);
    }

    setTriggers((prev) =>
      [...prev.filter((t) => !(t.row === row && t.type === slotTriggerType)), newTrig].sort(
        (a, b) => a.time - b.time
      )
    );
    triggerHapticFeedback('perfect', haptics);
    showToast(
      `Placed ${slotTriggerType.replace('_', ' ').toUpperCase()} Trigger at Row #${row} (${(
        time / 1000
      ).toFixed(2)}s)`
    );
    setSlotModalRow(null);
  };

  const handleSaveSlotCheckpoint = () => {
    if (slotModalRow === null) return;
    const row = Math.max(0, Math.min(totalSteps - 1, slotModalRow));
    const time = Math.round(row * stepTime);
    const cp: EditorCheckpoint = {
      id: `cp_${Date.now()}`,
      name: slotCheckpointName.trim() || `CP #${checkpoints.length + 1} (Row ${row})`,
      time,
      row,
      color: '#10b981',
    };
    setCheckpoints((prev) =>
      [...prev.filter((item) => item.row !== row), cp].sort((a, b) => a.time - b.time)
    );
    setActiveCheckpointId(cp.id);
    triggerHapticFeedback('perfect', haptics);
    showToast(`Saved Checkpoint "${cp.name}" at Row #${row}`);
    setSlotModalRow(null);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      const tempAudio = new Audio(url);
      tempAudio.addEventListener('loadedmetadata', () => {
        if (tempAudio.duration && tempAudio.duration !== Infinity) {
          setDuration(Math.ceil(tempAudio.duration));
        }
      });
      showToast(`Loaded local audio file: ${file.name}`);
    }
  };

  const handleApplyExternalAudio = () => {
    const res = resolveExternalAudioInput(externalAudioInput);
    if (res.sourceType === 'invalid' || !res.audioUrl) {
      setExternalStatus('Enter a valid Newgrounds Audio ID (e.g. 1094821) or Spotify Track/Playlist URL.');
      return;
    }
    setAudioUrl(res.audioUrl);
    if (res.sourceType === 'newgrounds' && res.cleanId) {
      setNewgroundsId(res.cleanId);
      setSpotifyUrl('');
      setExternalStatus(`Linked Newgrounds Audio #${res.cleanId} — Ready to preview & chart!`);
    } else if (res.sourceType === 'spotify' && res.cleanId) {
      setSpotifyUrl(externalAudioInput.trim());
      setNewgroundsId('');
      setExternalStatus(`Linked Spotify Track/Playlist (${res.cleanId}) — Ready to preview & chart!`);
    } else {
      setExternalStatus('Loaded direct audio stream URL!');
    }
    if (res.suggestedTitle && (title === 'My Custom Track' || !title.trim())) {
      setTitle(res.suggestedTitle);
    }
    if (res.suggestedArtist && (artist === 'Unknown Artist' || !artist.trim())) {
      setArtist(res.suggestedArtist);
    }
    if (res.suggestedBpm) {
      setBpm(res.suggestedBpm);
    }
    triggerHapticFeedback('perfect', haptics);
    showToast(
      res.sourceType === 'newgrounds'
        ? `Newgrounds ID #${res.cleanId} loaded!`
        : res.sourceType === 'spotify'
        ? `Spotify link synced & loaded!`
        : `Direct audio stream loaded!`
    );
  };

  const handlePreviewExternalAudio = () => {
    if (!audioUrl) {
      handleApplyExternalAudio();
    }
    if (isPreviewingExternal) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      AudioEngine.stopMenuMusic();
      setIsPreviewingExternal(false);
      return;
    }
    setIsPreviewingExternal(true);
    if (audioUrl && !audioUrl.startsWith('synth:') && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        AudioEngine.startMenuMusic();
      });
    } else {
      AudioEngine.startMenuMusic();
    }
  };

  const getActiveStartTimeMs = (): number => {
    if (activeCheckpointId) {
      const cp = checkpoints.find((c) => c.id === activeCheckpointId);
      if (cp) return cp.time;
    }
    return currentTime >= duration * 1000 ? 0 : currentTime;
  };

  const jumpToCheckpoint = (cp: EditorCheckpoint) => {
    if (isPlaying) {
      stopPlayback();
    }
    setActiveCheckpointId(cp.id);
    setCurrentTime(cp.time);
    if (gridRef.current) {
      gridRef.current.scrollTop = Math.max(0, (cp.time / stepTime) * 38 - 160);
    }
    triggerHapticFeedback('menu', haptics);
    showToast(`Jumped to checkpoint "${cp.name}" (${(cp.time / 1000).toFixed(2)}s)`);
  };

  const handleDeleteCheckpoint = (id: string) => {
    setCheckpoints((prev) => prev.filter((cp) => cp.id !== id));
    if (activeCheckpointId === id) setActiveCheckpointId(null);
  };

  const handleAutoSyncAllNotes = () => {
    if (notes.length === 0) {
      showToast('No notes to snap yet — place or record notes first.');
      return;
    }
    const synced = autoSyncNotesToBpm(notes, bpm, autoSyncSubdivision);
    setNotes(synced);
    triggerHapticFeedback('perfect', haptics);
    showToast(`Auto-Sync (Beta): Snapped ${synced.length} notes to 1/${autoSyncSubdivision} beat grid @ ${bpm} BPM.`);
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setIsRecording(false);
    setIsPreviewingExternal(false);
    setActiveRecLanes({});
    activeRecordingNotes.current = {};
    cancelAnimationFrame(requestRef.current);
    AudioEngine.stopMenuMusic();
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const togglePlay = (recordMode = false, overrideStartTimeMs?: number) => {
    if (isPlaying) {
      if (recordMode && !isRecording) {
        // Switch straight into live recording mode while playing
        setIsRecording(true);
        triggerHapticFeedback('heavy', haptics);
        showToast('LIVE REC ACTIVE — Tap the Record Buttons below or press your keybinds!');
        return;
      }
      stopPlayback();
    } else {
      const launchTime =
        typeof overrideStartTimeMs === 'number' ? overrideStartTimeMs : getActiveStartTimeMs();
      setCurrentTime(launchTime);
      setIsPlaying(true);
      setIsRecording(recordMode);
      startTimeRef.current = performance.now() - launchTime;
      if (audioUrl && !audioUrl.startsWith('synth:') && audioRef.current) {
        audioRef.current.currentTime = launchTime / 1000;
        audioRef.current.play().catch(() => {
          AudioEngine.startMenuMusic();
        });
      } else {
        AudioEngine.startMenuMusic();
      }
      requestRef.current = requestAnimationFrame(updatePlayhead);
    }
  };

  const updatePlayhead = (time: number) => {
    const elapsed = time - startTimeRef.current;
    if (elapsed >= duration * 1000) {
      setIsPlaying(false);
      setIsRecording(false);
      setActiveRecLanes({});
      setCurrentTime(0);
      AudioEngine.stopMenuMusic();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      return;
    }
    setCurrentTime(elapsed);

    if (gridRef.current) {
      const currentStep = elapsed / stepTime;
      const rowHeight = 38;
      gridRef.current.scrollTop = currentStep * rowHeight - 180;
    }

    requestRef.current = requestAnimationFrame(updatePlayhead);
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(requestRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      AudioEngine.stopMenuMusic();
    };
  }, []);

  // Unified Live Record Lane Start/End for both Keyboard Keybinds and On-Screen Record Buttons
  const startLiveRecordLane = (lane: number) => {
    if (lane < 0 || lane >= editorLaneCount) return;
    if (!isRecording) {
      // If user taps a record button while not playing, auto-start Live Rec!
      togglePlay(true);
    }
    if (activeRecordingNotes.current[lane] !== undefined) return;
    const rawTime = isPlaying ? performance.now() - startTimeRef.current : currentTime;
    const noteTime = autoSyncEnabled
      ? snapTimeToBeatGrid(Math.max(0, rawTime), bpm, autoSyncSubdivision)
      : Math.max(0, Math.round(rawTime / stepTime) * stepTime);
    activeRecordingNotes.current[lane] = noteTime;
    setActiveRecLanes((prev) => ({ ...prev, [lane]: true }));
    triggerHapticFeedback('hit', haptics);
  };

  const endLiveRecordLane = (lane: number) => {
    if (activeRecordingNotes.current[lane] === undefined) return;
    const startTime = activeRecordingNotes.current[lane];
    const rawEnd = isPlaying ? performance.now() - startTimeRef.current : currentTime;
    const endTime = autoSyncEnabled
      ? snapTimeToBeatGrid(Math.max(startTime, rawEnd), bpm, autoSyncSubdivision)
      : Math.max(startTime, Math.round(rawEnd / stepTime) * stepTime);
    const holdDuration = endTime - startTime;

    const newNote: Note = {
      time: startTime,
      lane,
      hit: false,
      missed: false,
      type: isHoldMode || holdDuration >= stepTime * 2 ? 'hold' : selectedNoteType,
      duration:
        holdDuration >= stepTime * 2
          ? holdDuration
          : isHoldMode
          ? Math.round(stepTime * 4)
          : undefined,
    };

    setNotes((prev) =>
      [
        ...prev.filter(
          (n) => !(Math.abs(n.time - startTime) < stepTime / 2 && n.lane === lane)
        ),
        newNote,
      ].sort((a, b) => a.time - b.time)
    );
    delete activeRecordingNotes.current[lane];
    setActiveRecLanes((prev) => ({ ...prev, [lane]: false }));
  };

  // Live Recording Key Listeners supporting all 8 Custom Keybinds
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const lane = mapCustomKeyToLane(e.key, e.code, customKeybinds);
      if (lane !== null && lane >= 0 && lane < editorLaneCount) {
        startLiveRecordLane(lane);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const lane = mapCustomKeyToLane(e.key, e.code, customKeybinds);
      if (lane !== null && lane >= 0) {
        endLiveRecordLane(lane);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isRecording,
    isPlaying,
    currentTime,
    stepTime,
    selectedNoteType,
    isHoldMode,
    editorLaneCount,
    autoSyncEnabled,
    autoSyncSubdivision,
    bpm,
    customKeybinds,
  ]);

  const handleCellClick = (row: number, col: number) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    const rawTime = row * stepTime;
    const time = autoSyncEnabled
      ? snapTimeToBeatGrid(rawTime, bpm, autoSyncSubdivision)
      : rawTime;

    if (isHoldMode) {
      if (!holdStart) {
        setHoldStart({ row, col });
      } else {
        if (holdStart.col === col && row > holdStart.row) {
          const startTime = holdStart.row * stepTime;
          const holdDuration = (row - holdStart.row) * stepTime;
          const existingIndex = notes.findIndex(
            (n) => Math.abs(n.time - startTime) < 10 && n.lane === col
          );
          const updated = [...notes];
          if (existingIndex >= 0) updated.splice(existingIndex, 1);
          updated.push({
            time: startTime,
            lane: col,
            hit: false,
            missed: false,
            type: 'hold',
            duration: holdDuration,
          });
          updated.sort((a, b) => a.time - b.time);
          setNotes(updated);
        }
        setHoldStart(null);
      }
    } else {
      const existingIndex = notes.findIndex(
        (n) => Math.abs(n.time - time) < 10 && n.lane === col
      );
      if (existingIndex >= 0) {
        const updated = [...notes];
        updated.splice(existingIndex, 1);
        setNotes(updated);
      } else {
        const updated = [
          ...notes,
          { time, lane: col, hit: false, missed: false, type: selectedNoteType },
        ];
        updated.sort((a, b) => a.time - b.time);
        setNotes(updated);
      }
    }
  };

  const buildCurrentSongObject = (): Song => ({
    id: initialSong?.id || 'custom_' + Date.now(),
    title,
    artist,
    bpm,
    difficulty,
    color,
    notes,
    customMap: notes,
    ownerUid: user?.uid || initialSong?.ownerUid,
    isCustom: true,
    hasDemonNotes: notes.some((n) => n.type === 'demon'),
    duration,
    audioUrl:
      audioUrl ||
      (newgroundsId
        ? resolveExternalAudioInput(newgroundsId).audioUrl
        : spotifyUrl
        ? resolveExternalAudioInput(spotifyUrl).audioUrl
        : 'synth:rave'),
    newgroundsId: newgroundsId || undefined,
    spotifyUrl: spotifyUrl || undefined,
    triggers,
    checkpoints,
  });

  const handleSave = () => {
    stopPlayback();
    const saved = buildCurrentSongObject();
    if (onSave) {
      onSave(saved);
      return;
    }
    if (setSongs) {
      setSongs((prev) => {
        const exists = prev.some((s) => String(s.id) === String(saved.id));
        return exists
          ? prev.map((s) => (String(s.id) === String(saved.id) ? saved : s))
          : [saved, ...prev];
      });
    }
    if (setSelectedSong) {
      setSelectedSong(saved);
    }
    if (setScreen) {
      setScreen('freeplay');
    }
  };

  const handleLocalPlaytest = (fromCheckpoint: boolean) => {
    stopPlayback();
    const songObj = buildCurrentSongObject();
    const startMs = fromCheckpoint ? getActiveStartTimeMs() : 0;
    if (onPlaytest) {
      onPlaytest(songObj, startMs);
    } else if (setSelectedSong && setScreen) {
      setSelectedSong(songObj);
      setScreen('game');
    }
  };

  const handleExport = () => {
    const song = buildCurrentSongObject();
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(song, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute(
      'download',
      `${title.toLowerCase().replace(/\s+/g, '_')}.json`
    );
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedSong = JSON.parse(event.target?.result as string) as Song;
        const importedNotes = (importedSong.customMap || importedSong.notes || []).map((n) => ({
          ...n,
          type:
            n.type === 'demon'
              ? ('demon' as const)
              : n.type === 'hold' || (n.duration && n.duration > 0)
              ? ('hold' as const)
              : ('normal' as const),
        }));
        if (importedSong.title && importedSong.bpm && Array.isArray(importedNotes)) {
          setTitle(importedSong.title);
          setArtist(importedSong.artist || 'Unknown Artist');
          setBpm(importedSong.bpm);
          setDifficulty(importedSong.difficulty || 'normal');
          setColor(importedSong.color || '#00f0ff');
          setNotes(importedNotes);
          setDuration(importedSong.duration || 120);
          setTriggers((importedSong.triggers || []).filter((t) => t.type !== 'dj_stop'));
          setCheckpoints(importedSong.checkpoints || []);
          showToast(`Imported chart "${importedSong.title}"`);
        }
      } catch {
        showToast('Failed to parse JSON track file.');
      }
    };
    reader.readAsText(file);
  };

  const getLaneHeaderLabel = (col: number) => {
    const dirNames = ['LEFT', 'DOWN', 'UP', 'RIGHT', 'EX-1', 'EX-2', 'EX-3', 'EX-4'];
    const keyBind = (customKeybinds[col] || DEFAULT_CUSTOM_KEYBINDS[col] || '').replace('Key', '');
    return `${dirNames[col]} [${keyBind}]`;
  };

  return (
    <div className="rc-stage relative z-10 flex flex-col h-full w-full text-white overflow-hidden select-none p-2 sm:p-3">
      <div className="rc-stage-dots" />

      <div className="rc-console-tray relative z-10 flex flex-col h-full w-full p-2.5 sm:p-3 gap-2 overflow-hidden">
        {/* Top Console Dock Rail — Exact same UI as Main Menu / Freeplay / Online Tracks */}
        <div className="rc-dock-rail px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            onClick={() => {
              stopPlayback();
              if (onBack) onBack();
              else if (setScreen) setScreen('menu');
            }}
            className="rc-bevel-btn rc-sub-dark px-3 py-1.5 flex items-center gap-1.5 font-black text-xs tracking-wider uppercase cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> EXIT STUDIO
          </button>

          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-black tracking-wider uppercase text-white">
              BEATMAP & TRIGGER STUDIO
            </h1>
            <span className="rc-dock-well px-2.5 py-1 text-cyan-300 text-[10px] font-black uppercase tracking-wider hidden lg:inline-block">
              HOLD OR RIGHT-CLICK ANY SLOT FOR TRIGGERS & CHECKPOINTS
            </span>
            <button
              onClick={() => setShowTutorial(true)}
              className="rc-bevel-btn rc-sub-dark w-7 h-7 flex items-center justify-center text-cyan-300 cursor-pointer"
              title="How to use the editor"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {onPlaytest && (
              <>
                <button
                  onClick={() => handleLocalPlaytest(false)}
                  className="rc-bevel-btn rc-tile-cyan px-2.5 py-1.5 flex items-center gap-1 font-black text-[11px] uppercase cursor-pointer"
                  title="Test play your track from the beginning (0:00)"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> TEST START
                </button>
                <button
                  onClick={() => handleLocalPlaytest(true)}
                  className="rc-bevel-btn rc-sub-teal px-2.5 py-1.5 flex items-center gap-1 font-black text-[11px] uppercase cursor-pointer"
                  title="Test play your track from active checkpoint or current playhead"
                >
                  <Flag className="w-3.5 h-3.5" /> TEST CHECKPOINT
                </button>
              </>
            )}
            <label className="rc-bevel-btn rc-sub-dark px-2.5 py-1.5 flex items-center gap-1 font-black text-[11px] uppercase cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> IMPORT
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button
              onClick={handleExport}
              className="rc-bevel-btn rc-sub-dark px-2.5 py-1.5 flex items-center gap-1 font-black text-[11px] uppercase cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> EXPORT
            </button>
            <button
              onClick={handleSave}
              className="rc-bevel-btn rc-tile-green px-3.5 py-1.5 flex items-center gap-1.5 font-black text-[11px] uppercase tracking-wider cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" /> PUBLISH
            </button>
          </div>
        </div>

        {statusBanner && (
          <div className="rc-dock-rail px-3 py-1.5 border-2 border-[#36e2ff] text-cyan-200 text-xs font-black tracking-wide flex items-center justify-between shrink-0">
            <span>{statusBanner}</span>
            <button onClick={() => setStatusBanner(null)} className="text-cyan-300 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Metadata & External Audio Dock Bar */}
        <div className="rc-dock-rail px-3 py-2 flex flex-wrap gap-2 items-center justify-between shrink-0">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex flex-col">
              <label className="text-[9px] text-cyan-200 font-black uppercase">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-[#070a14] border-2 border-white/20 rounded-lg px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-[#36e2ff] w-28 sm:w-36"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[9px] text-cyan-200 font-black uppercase">Artist</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="bg-[#070a14] border-2 border-white/20 rounded-lg px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-[#36e2ff] w-24 sm:w-32"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[9px] text-cyan-200 font-black uppercase">BPM</label>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                min="40"
                max="360"
                className="bg-[#070a14] border-2 border-white/20 rounded-lg px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-[#36e2ff] w-16 tabular-nums"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[9px] text-cyan-200 font-black uppercase">Len (s)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min="10"
                max="600"
                className="bg-[#070a14] border-2 border-white/20 rounded-lg px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-[#36e2ff] w-16 tabular-nums"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[9px] text-cyan-200 font-black uppercase">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="bg-[#070a14] border-2 border-white/20 rounded-lg px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-[#36e2ff]"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="Expert">Expert</option>
                <option value="Death">Death</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[9px] text-cyan-200 font-black uppercase">Grid Lanes</label>
              <select
                value={editorLaneCount}
                onChange={(e) => setEditorLaneCount(Number(e.target.value) as LaneCountOption)}
                className="bg-[#070a14] border-2 border-[#36e2ff]/60 rounded-lg px-2 py-1 text-[#36e2ff] text-xs font-black focus:outline-none"
              >
                <option value={4}>4 Lanes (Default)</option>
                <option value={6}>6 Lanes (Expanded)</option>
                <option value={8}>8 Lanes (Full Stage)</option>
              </select>
            </div>

            {/* Local file upload */}
            <div className="flex flex-col">
              <label className="text-[9px] text-cyan-200 font-black uppercase">MP3/OGG File</label>
              <label className="rc-bevel-btn rc-sub-dark flex items-center gap-1 px-2.5 py-1 cursor-pointer text-xs font-bold text-cyan-300">
                <Music className="w-3.5 h-3.5" />
                <span className="truncate max-w-[85px]">{audioUrl ? 'Loaded ✓' : 'Upload File'}</span>
                <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
              </label>
            </div>

            {/* Newgrounds ID or Spotify Link Upload */}
            <div className="flex flex-col">
              <label className="text-[9px] text-amber-300 font-black uppercase flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Newgrounds ID or Spotify Link
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={externalAudioInput}
                  onChange={(e) => setExternalAudioInput(e.target.value)}
                  placeholder="NG ID (e.g. 1094821) or Spotify URL..."
                  className="bg-[#070a14] border-2 border-amber-400/50 rounded-lg px-2 py-1 text-white text-xs w-40 sm:w-52 focus:outline-none focus:border-amber-300"
                />
                <button
                  onClick={handleApplyExternalAudio}
                  className="rc-bevel-btn rc-tile-gold px-2.5 py-1 font-black text-[11px] uppercase cursor-pointer"
                >
                  LOAD
                </button>
                <button
                  onClick={handlePreviewExternalAudio}
                  className={`rc-bevel-btn px-2.5 py-1 font-black text-[11px] uppercase cursor-pointer flex items-center gap-1 ${
                    isPreviewingExternal ? 'rc-tile-red' : 'rc-sub-teal'
                  }`}
                  title="Preview loaded Newgrounds / Spotify audio"
                >
                  <Volume2 className="w-3 h-3" /> {isPreviewingExternal ? 'STOP' : 'HEAR'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {externalStatus && (
          <div className="rc-dock-well px-3 py-1 text-amber-200 text-[11px] font-bold flex items-center justify-between shrink-0">
            <span>{externalStatus}</span>
            <button onClick={() => setExternalStatus('')} className="text-amber-300 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Secondary Console Toolbar: Note Types (Normal, Hold Note, Demon ONLY — no gold/fire/mine), Auto-Sync, Transport & Live Rec */}
        <div className="rc-dock-rail px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Only Normal, Hold Note, and Demon notes */}
            <div className="rc-dock-well p-1 flex items-center gap-1.5">
              <button
                onClick={() => {
                  setSelectedNoteType('normal');
                  setIsHoldMode(false);
                }}
                className={`rc-bevel-btn px-3 py-1 text-[11px] font-black uppercase cursor-pointer ${
                  selectedNoteType === 'normal' && !isHoldMode
                    ? 'rc-tile-cyan'
                    : 'rc-sub-dark text-slate-300'
                }`}
              >
                NORMAL NOTE
              </button>

              <button
                onClick={() => {
                  setIsHoldMode(!isHoldMode);
                  setHoldStart(null);
                }}
                className={`rc-bevel-btn px-3 py-1 text-[11px] font-black uppercase cursor-pointer ${
                  isHoldMode ? 'rc-tile-violet' : 'rc-sub-dark text-slate-300'
                }`}
              >
                {isHoldMode ? (holdStart ? 'TAP HOLD END' : 'HOLD NOTE: ON') : 'HOLD NOTE'}
              </button>

              <button
                onClick={() => {
                  setSelectedNoteType('demon');
                  setIsHoldMode(false);
                }}
                className={`rc-bevel-btn px-3 py-1 text-[11px] font-black uppercase flex items-center gap-1 cursor-pointer ${
                  selectedNoteType === 'demon' && !isHoldMode
                    ? 'rc-tile-red'
                    : 'rc-sub-dark text-rose-300'
                }`}
              >
                <Skull className="w-3.5 h-3.5" /> DEMON NOTE
              </button>
            </div>

            {/* Auto-Sync (BETA) Controls */}
            <div className="rc-dock-well px-2.5 py-1 flex items-center gap-1.5">
              <button
                onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                className={`flex items-center gap-1 text-[11px] font-black uppercase cursor-pointer ${
                  autoSyncEnabled ? 'text-cyan-300' : 'text-slate-400'
                }`}
                title="Auto-Sync (Beta): Automatically snaps placed and recorded notes onto the song's beat grid"
              >
                <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
                AUTO-SYNC
                <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[9px] font-black">
                  BETA
                </span>
                <span>{autoSyncEnabled ? 'ON' : 'OFF'}</span>
              </button>
              <select
                value={autoSyncSubdivision}
                onChange={(e) => setAutoSyncSubdivision(Number(e.target.value))}
                className="bg-[#070a14] border border-cyan-400/40 rounded px-1.5 py-0.5 text-[10px] font-black text-cyan-200"
                title="Beat Grid Snap Subdivision"
              >
                <option value={2}>1/2 Beat</option>
                <option value={4}>1/4 Beat</option>
                <option value={8}>1/8 Beat</option>
              </select>
              <button
                onClick={handleAutoSyncAllNotes}
                className="rc-bevel-btn rc-sub-teal px-2 py-0.5 text-[10px] font-black uppercase cursor-pointer"
                title="Snap all existing notes in the chart to the beat grid"
              >
                SNAP ALL
              </button>
            </div>
          </div>

          {/* Unified Transport & Live Rec Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => openSlotStudioModal(Math.round(currentTime / stepTime), 0, 'trigger')}
              className="rc-bevel-btn rc-tile-violet px-2.5 py-1.5 flex items-center gap-1 text-[11px] font-black uppercase cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" /> + TRIGGER / CP ({triggers.length + checkpoints.length})
            </button>

            <button
              onClick={() => togglePlay(true)}
              className={`rc-bevel-btn px-3.5 py-1.5 flex items-center gap-1.5 font-black text-[11px] uppercase cursor-pointer ${
                isRecording ? 'rc-tile-red animate-pulse' : 'rc-tile-pink'
              }`}
            >
              <Mic className="w-3.5 h-3.5" /> {isRecording ? 'STOP LIVE REC' : 'LIVE REC'}
            </button>

            <button
              onClick={() => togglePlay(false)}
              className={`rc-bevel-btn px-3.5 py-1.5 flex items-center gap-1.5 font-black text-[11px] uppercase cursor-pointer ${
                isPlaying && !isRecording ? 'rc-sub-amber' : 'rc-tile-cyan'
              }`}
            >
              {isPlaying && !isRecording ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" /> PAUSE
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" /> PLAY
                </>
              )}
            </button>

            <button
              onClick={() => setNotes([])}
              className="rc-bevel-btn rc-tile-red p-1.5 cursor-pointer"
              title="Clear All Notes"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active Triggers & Checkpoints Quick Strip */}
        {(triggers.length > 0 || checkpoints.length > 0) && (
          <div className="rc-dock-well px-3 py-1.5 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-300 shrink-0">
              MARKERS:
            </span>
            {checkpoints.map((cp) => (
              <button
                key={cp.id}
                onClick={() => jumpToCheckpoint(cp)}
                className={`rc-bevel-btn px-2 py-0.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 cursor-pointer ${
                  activeCheckpointId === cp.id ? 'rc-tile-green' : 'rc-sub-teal'
                }`}
              >
                <Flag className="w-2.5 h-2.5" /> {cp.name} (R#{cp.row})
              </button>
            ))}
            {triggers.map((trig) => (
              <button
                key={trig.id}
                onClick={() => openSlotStudioModal(trig.row ?? 0, 0, 'trigger')}
                className="rc-bevel-btn rc-tile-violet px-2 py-0.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Zap className="w-2.5 h-2.5" />
                R#{trig.row}:{' '}
                {trig.type === 'speed'
                  ? `SPD ${trig.speed?.toFixed(2)}x`
                  : trig.type === 'extra_notes'
                  ? `${trig.lanes}K (${trig.transition})`
                  : trig.type === 'invisible_notes'
                  ? `INVISIBLE ${trig.invisibleEnabled !== false ? 'ON' : 'OFF'}`
                  : `VEL: ${trig.velocityEffect?.toUpperCase()}`}
              </button>
            ))}
          </div>
        )}

        {/* Editor Timeline Grid with Rectangle Note Slots & Rectangular Editor Notes */}
        <div
          className="rc-console-inset flex-1 min-h-0 overflow-y-auto relative flex justify-center custom-scrollbar"
          ref={gridRef}
        >
          <div
            className="relative py-6 transition-all duration-300"
            style={{
              width: editorLaneCount === 8 ? '860px' : editorLaneCount === 6 ? '670px' : '490px',
              maxWidth: '96vw',
            }}
          >
            {/* Playhead */}
            {isPlaying && (
              <div
                className="absolute left-0 w-full h-1.5 bg-[#36e2ff] z-30 shadow-[0_0_16px_#36e2ff] pointer-events-none"
                style={{ top: `${24 + (currentTime / stepTime) * 38}px` }}
              />
            )}

            {/* Column Headers */}
            <div className="flex mb-2 sticky top-0 bg-[#0d1428]/95 backdrop-blur-md z-20 py-2 border-b-2 border-[#36e2ff]/40 rounded-t-xl">
              <div className="w-24 text-center text-[10px] text-cyan-200 font-black">
                ROW / SLOT
              </div>
              {Array.from({ length: editorLaneCount }).map((_, col) => (
                <div
                  key={col}
                  className="flex-1 text-center font-black text-[10px] sm:text-xs truncate px-1"
                  style={{ color: LANE_COLORS_8[col] }}
                >
                  {getLaneHeaderLabel(col)}
                </div>
              ))}
            </div>

            {/* Grid Rows with Rectangle Note Slots & Rectangular Editor Notes */}
            {Array.from({ length: totalSteps }).map((_, row) => {
              const isBeat = row % 4 === 0;
              const isMeasure = row % 16 === 0;
              const time = row * stepTime;
              const rowCheckpoint = checkpoints.find((cp) => cp.row === row);
              const rowTriggers = triggers.filter((tr) => tr.row === row);

              return (
                <div
                  key={row}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openSlotStudioModal(row, 0);
                  }}
                  className={`flex items-center h-[38px] border-b transition-colors ${
                    rowCheckpoint
                      ? 'bg-emerald-500/20 border-emerald-400/80'
                      : rowTriggers.length > 0
                      ? 'bg-fuchsia-500/20 border-fuchsia-400/70'
                      : isMeasure
                      ? 'border-white/35 bg-white/[0.05]'
                      : isBeat
                      ? 'border-white/20 bg-white/[0.02]'
                      : 'border-white/10'
                  }`}
                >
                  {/* Row Number + Trigger/Checkpoint Indicator Button */}
                  <button
                    onClick={() => openSlotStudioModal(row, 0)}
                    className="w-24 px-1.5 h-full flex items-center justify-end gap-1 text-[10px] text-slate-300 hover:text-cyan-300 tabular-nums cursor-pointer"
                    title="Click, Press & Hold, or Right-Click to place a Trigger or Checkpoint on this row"
                  >
                    {rowCheckpoint && (
                      <span className="px-1 py-0.2 rounded bg-emerald-400 text-slate-950 font-black text-[8px]">
                        CP
                      </span>
                    )}
                    {rowTriggers.map((rt) => (
                      <span
                        key={rt.id}
                        className={`px-1 py-0.2 rounded font-black text-[8px] ${
                          rt.type === 'speed'
                            ? 'bg-amber-400 text-slate-950'
                            : rt.type === 'extra_notes'
                            ? 'bg-fuchsia-400 text-slate-950'
                            : rt.type === 'invisible_notes'
                            ? 'bg-cyan-300 text-slate-950'
                            : 'bg-indigo-400 text-slate-950'
                        }`}
                      >
                        {rt.type === 'speed'
                          ? `${rt.speed}x`
                          : rt.type === 'extra_notes'
                          ? `${rt.lanes}K`
                          : rt.type === 'invisible_notes'
                          ? 'INV'
                          : 'VEL'}
                      </span>
                    ))}
                    <span>{isBeat ? `B${row / 4 + 1}` : `·${row}`}</span>
                  </button>

                  {Array.from({ length: editorLaneCount }).map((_, col) => {
                    const note = notes.find(
                      (n) => Math.abs(n.time - time) < 10 && n.lane === col
                    );
                    const isHoldStart = holdStart?.row === row && holdStart?.col === col;
                    const holdingNote = notes.find(
                      (n) =>
                        n.lane === col &&
                        n.duration &&
                        n.time < time &&
                        n.time + n.duration >= time - 10
                    );
                    const laneColor = LANE_COLORS_8[col];

                    return (
                      <div
                        key={col}
                        onPointerDown={(e) => handleCellPointerDown(row, col, e)}
                        onPointerUp={clearLongPressTimer}
                        onPointerLeave={clearLongPressTimer}
                        onPointerCancel={clearLongPressTimer}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clearLongPressTimer();
                          openSlotStudioModal(row, col);
                        }}
                        onClick={() => handleCellClick(row, col)}
                        className="flex-1 h-full border-l border-white/15 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors relative px-1"
                      >
                        {/* Visible Rectangle Note Slot */}
                        <div
                          className="w-full h-[27px] rounded-md border border-white/15 bg-[#090d1b]/85 flex items-center justify-center relative overflow-hidden"
                          style={{
                            borderColor: isBeat ? `${laneColor}44` : 'rgba(255,255,255,0.13)',
                          }}
                        >
                          {isHoldStart && (
                            <div className="w-full h-full rounded-md border-2 border-dashed border-white bg-purple-500/30 animate-pulse flex items-center justify-center text-[9px] font-black">
                              HOLD START
                            </div>
                          )}

                          {holdingNote && (
                            <div
                              className="w-[70%] h-full opacity-75 border-x-2 border-white/70"
                              style={{ backgroundColor: laneColor }}
                            />
                          )}

                          {/* Rectangular Editor Note */}
                          {note && (
                            <div
                              className={`w-full h-full rounded-md border-2 flex items-center justify-center z-10 font-black text-[10px] tracking-wider uppercase shadow-[0_2px_0_rgba(0,0,0,0.8)] ${
                                note.type === 'demon'
                                  ? 'bg-[#1a050d] border-rose-500 text-rose-200 shadow-[0_0_12px_#f43f5e]'
                                  : 'text-slate-950 border-white'
                              }`}
                              style={
                                note.type !== 'demon'
                                  ? {
                                      backgroundColor: laneColor,
                                      boxShadow: `0 0 10px ${laneColor}88`,
                                    }
                                  : undefined
                              }
                            >
                              {note.type === 'demon' ? (
                                <span className="flex items-center gap-0.5 text-rose-400">
                                  <Skull className="w-3.5 h-3.5" /> DMN
                                </span>
                              ) : note.duration && note.duration > 0 ? (
                                <span>HOLD</span>
                              ) : (
                                <span>NOTE</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Unified Live Rec & Interactive Record Buttons Deck (Matches Live Rec & Gameplay Controls!) */}
        <div className="rc-dock-rail px-3 py-2 flex flex-col gap-1.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePlay(true)}
                className={`rc-bevel-btn px-3 py-1 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer ${
                  isRecording ? 'rc-tile-red animate-pulse' : 'rc-tile-pink'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                {isRecording ? 'LIVE REC ACTIVE (TAP OR HOLD PADS BELOW)' : 'LIVE REC DECK'}
              </button>
              <span className="text-[10px] font-bold text-cyan-200/85 hidden sm:inline">
                Tap or hold the rectangle lane record buttons below (or press keys) to record live notes!
              </span>
            </div>
            <div className="text-[10px] font-black text-amber-300 tabular-nums">
              PLAYHEAD: {(currentTime / 1000).toFixed(2)}s / {duration}s • NOTES: {notes.length}
            </div>
          </div>

          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${editorLaneCount}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: editorLaneCount }).map((_, col) => {
              const laneColor = LANE_COLORS_8[col];
              const isHeld = Boolean(activeRecLanes[col]);
              return (
                <button
                  key={col}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startLiveRecordLane(col);
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    endLiveRecordLane(col);
                  }}
                  onPointerLeave={() => {
                    if (activeRecLanes[col]) endLiveRecordLane(col);
                  }}
                  onPointerCancel={() => {
                    if (activeRecLanes[col]) endLiveRecordLane(col);
                  }}
                  className={`rc-bevel-btn h-10 sm:h-11 flex flex-col items-center justify-center cursor-pointer transition-transform ${
                    isHeld ? 'scale-95 brightness-125' : ''
                  }`}
                  style={{
                    background: isHeld
                      ? laneColor
                      : `linear-gradient(180deg, ${laneColor}33 0%, #0b1022 100%)`,
                    borderColor: laneColor,
                    color: isHeld ? '#05070e' : '#ffffff',
                  }}
                >
                  <span className="text-[10px] sm:text-xs font-black tracking-wider uppercase">
                    REC {col + 1}
                  </span>
                  <span className="text-[8px] font-bold opacity-85 tabular-nums">
                    {getLaneHeaderLabel(col)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* PRESS & HOLD / RIGHT-CLICK SLOT TRIGGER & CHECKPOINT MODAL (Same Arcade Console UI) */}
      {slotModalRow !== null && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3">
          <div className="rc-console-tray w-full max-w-xl p-4 sm:p-5 max-h-[90vh] overflow-y-auto custom-scrollbar rc-modal-enter space-y-3">
            <div className="rc-dock-rail px-3 py-2.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-fuchsia-500/25 border border-fuchsia-400 text-fuchsia-200 text-[10px] font-black uppercase">
                    ROW #{slotModalRow} • LANE {slotModalCol + 1}
                  </span>
                  <span className="text-xs font-black text-cyan-300 tabular-nums">
                    TIMESTAMP: {((slotModalRow * stepTime) / 1000).toFixed(2)}s
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white mt-1">
                  SLOT TRIGGER & CHECKPOINT STUDIO
                </h3>
              </div>
              <button
                onClick={() => setSlotModalRow(null)}
                className="rc-bevel-btn rc-tile-red w-8 h-8 flex items-center justify-center text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher: Trigger vs Editor Checkpoint */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSlotTab('trigger')}
                className={`rc-bevel-btn py-2 px-3 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer ${
                  slotTab === 'trigger' ? 'rc-tile-pink' : 'rc-sub-dark text-slate-300'
                }`}
              >
                <Zap className="w-4 h-4" /> MARK AS CHART TRIGGER
              </button>
              <button
                onClick={() => setSlotTab('checkpoint')}
                className={`rc-bevel-btn py-2 px-3 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer ${
                  slotTab === 'checkpoint' ? 'rc-tile-green' : 'rc-sub-dark text-slate-300'
                }`}
              >
                <BookmarkCheck className="w-4 h-4" /> MARK AS CHECKPOINT
              </button>
            </div>

            {slotTab === 'trigger' ? (
              <div className="rc-console-inset p-3.5 space-y-3.5">
                {/* 4 Trigger Types */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-cyan-200 block mb-1.5">
                    SELECT TRIGGER TYPE FOR ROW #{slotModalRow}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      onClick={() => setSlotTriggerType('speed')}
                      className={`rc-bevel-btn p-2.5 text-left cursor-pointer ${
                        slotTriggerType === 'speed' ? 'rc-tile-gold' : 'rc-sub-dark text-slate-300'
                      }`}
                    >
                      <Gauge className="w-4 h-4 mb-1" />
                      <div className="text-[11px] font-black uppercase">SPEED</div>
                      <div className="text-[9px] opacity-85">Smooth Ramp</div>
                    </button>

                    <button
                      onClick={() => setSlotTriggerType('extra_notes')}
                      className={`rc-bevel-btn p-2.5 text-left cursor-pointer ${
                        slotTriggerType === 'extra_notes'
                          ? 'rc-tile-pink'
                          : 'rc-sub-dark text-slate-300'
                      }`}
                    >
                      <Columns className="w-4 h-4 mb-1" />
                      <div className="text-[11px] font-black uppercase">EXTRA NOTES</div>
                      <div className="text-[9px] opacity-85">4 / 6 / 8 Lanes</div>
                    </button>

                    <button
                      onClick={() => setSlotTriggerType('invisible_notes')}
                      className={`rc-bevel-btn p-2.5 text-left cursor-pointer ${
                        slotTriggerType === 'invisible_notes'
                          ? 'rc-tile-cyan'
                          : 'rc-sub-dark text-slate-300'
                      }`}
                    >
                      <EyeOff className="w-4 h-4 mb-1" />
                      <div className="text-[11px] font-black uppercase">INVISIBLE</div>
                      <div className="text-[9px] opacity-85">Flash & Fade</div>
                    </button>

                    <button
                      onClick={() => setSlotTriggerType('note_velocity')}
                      className={`rc-bevel-btn p-2.5 text-left cursor-pointer ${
                        slotTriggerType === 'note_velocity'
                          ? 'rc-tile-violet'
                          : 'rc-sub-dark text-slate-300'
                      }`}
                    >
                      <Radio className="w-4 h-4 mb-1" />
                      <div className="text-[11px] font-black uppercase">VELOCITY</div>
                      <div className="text-[9px] opacity-85">12 Scroll FX</div>
                    </button>
                  </div>
                </div>

                {/* Trigger Configuration Specifics */}
                {slotTriggerType === 'speed' && (
                  <div className="rc-dock-rail p-3">
                    <label className="text-[10px] font-black uppercase text-amber-300 block mb-2">
                      SPEED TRIGGER PRESET (SMOOTH CUBIC RAMP • KEEPS DIFFICULTY SPEED RATIO)
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {SPEED_TRIGGER_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setSlotSpeedPreset(preset)}
                          className={`rc-bevel-btn py-2 font-black text-xs cursor-pointer ${
                            slotSpeedPreset === preset
                              ? 'rc-tile-gold'
                              : 'rc-sub-dark text-slate-300'
                          }`}
                        >
                          {preset.toFixed(2)}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {slotTriggerType === 'extra_notes' && (
                  <div className="rc-dock-rail p-3 space-y-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-fuchsia-300 block mb-1.5">
                        LANE EXPANSION COUNT (WIDENS STAGE WITH SAME NOTE SIZE)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {EXTRA_LANE_OPTIONS.map((lanes) => (
                          <button
                            key={lanes}
                            onClick={() => setSlotExtraLanes(lanes)}
                            className={`rc-bevel-btn py-2 font-black text-xs cursor-pointer ${
                              slotExtraLanes === lanes
                                ? 'rc-tile-pink'
                                : 'rc-sub-dark text-slate-300'
                            }`}
                          >
                            {lanes} NOTES
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-300 block mb-1">
                          POWERPOINT EXPANSION TRANSITION (7 ESSENTIAL)
                        </label>
                        <select
                          value={slotTransition}
                          onChange={(e) =>
                            setSlotTransition(e.target.value as LaneExpansionTransition)
                          }
                          className="w-full px-2.5 py-2 rounded-lg bg-[#070a14] border-2 border-white/20 text-xs font-bold text-white"
                        >
                          {LANE_EXPANSION_TRANSITIONS.map((tr) => (
                            <option key={tr.id} value={tr.id}>
                              {tr.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-300 mb-1">
                          <span>TRANSITION SPEED</span>
                          <span className="text-fuchsia-300">{slotTransitionSpeed.toFixed(1)}s</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={2.0}
                          step={0.1}
                          value={slotTransitionSpeed}
                          onChange={(e) => setSlotTransitionSpeed(Number(e.target.value))}
                          className="w-full accent-fuchsia-400 cursor-pointer mt-1"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {slotTriggerType === 'invisible_notes' && (
                  <div className="rc-dock-rail p-3 space-y-3">
                    <div className="text-xs font-black text-cyan-300">
                      INVISIBLE NOTES TRIGGER — FLASH & FADE STEALTH CALCULATION
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Notes flash brightly towards the beginning-to-middle of their render and then quickly fade out to invisible.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSlotInvisibleEnabled(true)}
                        className={`rc-bevel-btn py-2 font-black text-xs cursor-pointer ${
                          slotInvisibleEnabled ? 'rc-tile-cyan' : 'rc-sub-dark text-slate-300'
                        }`}
                      >
                        ENABLE INVISIBLE NOTES
                      </button>
                      <button
                        onClick={() => setSlotInvisibleEnabled(false)}
                        className={`rc-bevel-btn py-2 font-black text-xs cursor-pointer ${
                          !slotInvisibleEnabled ? 'rc-tile-green' : 'rc-sub-dark text-slate-300'
                        }`}
                      >
                        RESTORE NORMAL NOTES
                      </button>
                    </div>
                    {slotInvisibleEnabled && (
                      <div>
                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-300 mb-1">
                          <span>ACTIVE DURATION (0s = UNTIL NEXT TRIGGER)</span>
                          <span className="text-cyan-300">
                            {slotInvisibleDurationSec === 0 ? 'INFINITE / UNTIL OFF' : `${slotInvisibleDurationSec}s`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={30}
                          step={1}
                          value={slotInvisibleDurationSec}
                          onChange={(e) => setSlotInvisibleDurationSec(Number(e.target.value))}
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                )}

                {slotTriggerType === 'note_velocity' && (
                  <div className="rc-dock-rail p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-indigo-300">
                        12 NOTE VELOCITY SCROLL EFFECTS (ALWAYS ARRIVES ON BEAT)
                      </span>
                      <span className="text-[10px] font-black text-cyan-300">
                        INTENSITY: {slotVelocityIntensity.toFixed(1)}x
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                      {NOTE_VELOCITY_EFFECTS.map((fx) => (
                        <button
                          key={fx.id}
                          onClick={() => setSlotVelocityEffect(fx.id)}
                          className={`rc-bevel-btn p-2 text-left cursor-pointer ${
                            slotVelocityEffect === fx.id
                              ? 'rc-tile-violet'
                              : 'rc-sub-dark text-slate-300'
                          }`}
                        >
                          <div className="text-[10px] font-black truncate" style={{ color: fx.color }}>
                            {fx.name}
                          </div>
                          <div className="text-[9px] opacity-80 line-clamp-1">
                            {fx.description}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div>
                      <input
                        type="range"
                        min={0.5}
                        max={2.0}
                        step={0.1}
                        value={slotVelocityIntensity}
                        onChange={(e) => setSlotVelocityIntensity(Number(e.target.value))}
                        className="w-full accent-indigo-400 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* Existing Triggers at this Row */}
                {triggers.filter((t) => t.row === slotModalRow).length > 0 && (
                  <div className="rc-dock-well p-2.5">
                    <div className="text-[10px] font-black uppercase text-slate-400 mb-1.5">
                      EXISTING TRIGGERS ON ROW #{slotModalRow}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {triggers
                        .filter((t) => t.row === slotModalRow)
                        .map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/50 text-xs font-black text-fuchsia-200"
                          >
                            <span>{t.type.toUpperCase()}</span>
                            <button
                              onClick={() =>
                                setTriggers((prev) => prev.filter((item) => item.id !== t.id))
                              }
                              className="text-rose-300 hover:text-rose-200 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setSlotModalRow(null)}
                    className="rc-bevel-btn rc-sub-dark px-4 py-2 text-xs font-black text-slate-300 cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleSaveSlotTrigger}
                    className="rc-bevel-btn rc-tile-cyan px-5 py-2 font-black text-xs uppercase tracking-wider cursor-pointer"
                  >
                    SAVE TRIGGER ON ROW #{slotModalRow}
                  </button>
                </div>
              </div>
            ) : (
              /* Editor Checkpoint Tab inside Slot Studio Modal */
              <div className="rc-console-inset p-3.5 space-y-3.5">
                <div className="rc-dock-rail p-3 space-y-2.5">
                  <div className="text-xs font-black text-emerald-300 uppercase">
                    PLACE OR JUMP TO EDITOR CHECKPOINT AT ROW #{slotModalRow}
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Editor checkpoints let you jump directly to this measure to fix off-beat recordings or launch a local playtest starting right from Row #{slotModalRow}.
                  </p>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                      CHECKPOINT LABEL
                    </label>
                    <input
                      type="text"
                      value={slotCheckpointName}
                      onChange={(e) => setSlotCheckpointName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#070a14] border-2 border-emerald-400/50 text-xs font-bold text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  {checkpoints.some((cp) => cp.row === slotModalRow) ? (
                    <button
                      onClick={() => {
                        const existing = checkpoints.find((cp) => cp.row === slotModalRow);
                        if (existing) handleDeleteCheckpoint(existing.id);
                        setSlotModalRow(null);
                      }}
                      className="rc-bevel-btn rc-tile-red px-3 py-2 text-xs font-black uppercase cursor-pointer"
                    >
                      REMOVE CHECKPOINT
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    {onPlaytest && (
                      <button
                        onClick={() => {
                          const time = Math.round(slotModalRow * stepTime);
                          setSlotModalRow(null);
                          stopPlayback();
                          onPlaytest(buildCurrentSongObject(), time);
                        }}
                        className="rc-bevel-btn rc-tile-cyan px-3.5 py-2 font-black text-xs uppercase cursor-pointer"
                      >
                        PLAYTEST FROM HERE
                      </button>
                    )}
                    <button
                      onClick={handleSaveSlotCheckpoint}
                      className="rc-bevel-btn rc-tile-green px-5 py-2 font-black text-xs uppercase tracking-wider cursor-pointer"
                    >
                      SAVE CHECKPOINT
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="rc-console-tray p-5 max-w-lg w-full relative max-h-[88vh] overflow-y-auto space-y-3">
            <div className="rc-dock-rail px-3 py-2 flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-black text-amber-300 uppercase tracking-wider">
                BEATMAP & TRIGGER STUDIO GUIDE
              </h2>
              <button
                onClick={() => setShowTutorial(false)}
                className="rc-bevel-btn rc-tile-red w-7 h-7 flex items-center justify-center text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rc-console-inset p-4 space-y-2.5 text-slate-200 text-xs font-semibold">
              <p>
                <strong className="text-cyan-300">1. Rectangle Note Slots & Editor Notes:</strong>{' '}
                Click any rectangle slot to place or remove a rectangular Normal Note, Hold Note, or Demon Note.
              </p>
              <p>
                <strong className="text-fuchsia-300">2. Press & Hold or Right-Click Any Slot:</strong>{' '}
                Long-press (~0.35s) or Right-Click any slot to mark that row as a Speed Trigger, Extra Notes Trigger (4/6/8 Lanes), Invisible Notes Trigger, Note Velocity Trigger (12 Scroll FX), or Editor Checkpoint.
              </p>
              <p>
                <strong className="text-pink-300">3. Live Rec Deck & Record Buttons:</strong>{' '}
                Click <strong className="text-white">LIVE REC</strong> and tap/hold the bottom rectangular Record Lane Buttons (or press your keyboard keybinds) to record notes live on beat!
              </p>
            </div>
            <button
              onClick={() => setShowTutorial(false)}
              className="rc-bevel-btn rc-tile-gold w-full py-2.5 font-black uppercase text-xs cursor-pointer"
            >
              GOT IT!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
