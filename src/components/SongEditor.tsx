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
  const [selectedNoteType, setSelectedNoteType] = useState<
    'normal' | 'mine' | 'gold' | 'fire' | 'demon'
  >('normal');
  const [isHoldMode, setIsHoldMode] = useState(false);
  const [holdStart, setHoldStart] = useState<{ row: number; col: number } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

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
    cancelAnimationFrame(requestRef.current);
    AudioEngine.stopMenuMusic();
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const togglePlay = (recordMode = false, overrideStartTimeMs?: number) => {
    if (isPlaying) {
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

  // Live Recording Key Listeners supporting all 8 Custom Keybinds
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const lane = mapCustomKeyToLane(e.key, e.code, customKeybinds);
      if (lane !== null && lane >= 0 && lane < editorLaneCount) {
        const rawTime = performance.now() - startTimeRef.current;
        const noteTime = autoSyncEnabled
          ? snapTimeToBeatGrid(rawTime, bpm, autoSyncSubdivision)
          : Math.round(rawTime / stepTime) * stepTime;
        activeRecordingNotes.current[lane] = noteTime;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const lane = mapCustomKeyToLane(e.key, e.code, customKeybinds);
      if (lane !== null && lane >= 0 && activeRecordingNotes.current[lane] !== undefined) {
        const startTime = activeRecordingNotes.current[lane];
        const rawEnd = performance.now() - startTimeRef.current;
        const endTime = autoSyncEnabled
          ? snapTimeToBeatGrid(rawEnd, bpm, autoSyncSubdivision)
          : Math.round(rawEnd / stepTime) * stepTime;
        const holdDuration = endTime - startTime;

        const newNote: Note = {
          time: startTime,
          lane,
          hit: false,
          missed: false,
          type: selectedNoteType,
          duration: holdDuration >= stepTime * 2 ? holdDuration : undefined,
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
    stepTime,
    selectedNoteType,
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
            type: selectedNoteType,
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
        const importedNotes = importedSong.customMap || importedSong.notes;
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
    const keyBind = customKeybinds[col] || DEFAULT_CUSTOM_KEYBINDS[col];
    return `${dirNames[col]} [${keyBind}]`;
  };

  return (
    <div className="relative z-10 flex flex-col h-full w-full bg-[#070912]/90 backdrop-blur-xl text-white overflow-hidden select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-950/90 border-b border-white/15 gap-2 shrink-0">
        <button
          onClick={() => {
            stopPlayback();
            if (onBack) onBack();
            else if (setScreen) setScreen('menu');
          }}
          className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors font-black text-xs tracking-widest uppercase cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> EXIT STUDIO
        </button>

        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-black italic tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-cyan-300 to-fuchsia-400">
            BEATMAP & TRIGGER STUDIO 3.0
          </h1>
          <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-[10px] font-black uppercase tracking-wider hidden md:inline-block">
            HOLD OR RIGHT-CLICK ANY SLOT FOR TRIGGERS & CHECKPOINTS
          </span>
          <button
            onClick={() => setShowTutorial(true)}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
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
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-black rounded-lg border border-cyan-400/50 transition-all text-[11px] cursor-pointer"
                title="Test play your track from the beginning (0:00)"
              >
                <Play className="w-3.5 h-3.5" /> TEST START
              </button>
              <button
                onClick={() => handleLocalPlaytest(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-black rounded-lg border border-emerald-400/50 transition-all text-[11px] cursor-pointer"
                title="Test play your track from active checkpoint or current playhead"
              >
                <Flag className="w-3.5 h-3.5" /> TEST CHECKPOINT
              </button>
            </>
          )}
          <label className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer transition-colors text-[11px] border border-white/15">
            <Upload className="w-3.5 h-3.5" /> IMPORT
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors text-[11px] border border-white/15 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> EXPORT
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-black rounded-lg transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)] text-[11px] cursor-pointer uppercase tracking-wider"
          >
            <UploadCloud className="w-3.5 h-3.5" /> PUBLISH
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="px-4 py-1.5 bg-cyan-500/20 border-b border-cyan-400/40 text-cyan-200 text-xs font-black tracking-wide flex items-center justify-between shrink-0">
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner(null)} className="text-cyan-300 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Primary Track Metadata & External Song Loader Bar */}
      <div className="px-4 py-2 bg-slate-900/80 border-b border-white/10 flex flex-wrap gap-2.5 items-center justify-between shrink-0">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex flex-col">
            <label className="text-[9px] text-slate-400 font-black uppercase">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-slate-950 border border-white/15 rounded px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-cyan-400 w-32 sm:w-40"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] text-slate-400 font-black uppercase">Artist</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="bg-slate-950 border border-white/15 rounded px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-cyan-400 w-28 sm:w-36"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] text-slate-400 font-black uppercase">BPM</label>
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              min="40"
              max="360"
              className="bg-slate-950 border border-white/15 rounded px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-cyan-400 w-16"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] text-slate-400 font-black uppercase">Len (s)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min="10"
              max="600"
              className="bg-slate-950 border border-white/15 rounded px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-cyan-400 w-16"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] text-slate-400 font-black uppercase">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="bg-slate-950 border border-white/15 rounded px-2 py-1 text-white text-xs font-bold focus:outline-none focus:border-cyan-400"
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
              <option value="Expert">Expert</option>
              <option value="Death">Death</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] text-slate-400 font-black uppercase">Grid Lanes</label>
            <select
              value={editorLaneCount}
              onChange={(e) => setEditorLaneCount(Number(e.target.value) as LaneCountOption)}
              className="bg-slate-950 border border-cyan-400/50 rounded px-2 py-1 text-cyan-200 text-xs font-black focus:outline-none"
            >
              <option value={4}>4 Lanes (Default)</option>
              <option value={6}>6 Lanes (Expanded)</option>
              <option value={8}>8 Lanes (Full Stage)</option>
            </select>
          </div>

          {/* Local file upload */}
          <div className="flex flex-col">
            <label className="text-[9px] text-slate-400 font-black uppercase">MP3/OGG File</label>
            <label className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-white/15 rounded cursor-pointer text-xs font-bold text-cyan-300">
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
                className="bg-slate-950 border border-amber-400/40 rounded px-2 py-1 text-white text-xs w-44 sm:w-56 focus:outline-none focus:border-amber-300"
              />
              <button
                onClick={handleApplyExternalAudio}
                className="px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] uppercase cursor-pointer"
              >
                LOAD
              </button>
              <button
                onClick={handlePreviewExternalAudio}
                className={`px-2 py-1 rounded border font-black text-[11px] uppercase cursor-pointer flex items-center gap-1 ${
                  isPreviewingExternal
                    ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                    : 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
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
        <div className="px-4 py-1 bg-amber-500/15 border-b border-amber-400/30 text-amber-200 text-[11px] font-bold flex items-center justify-between shrink-0">
          <span>{externalStatus}</span>
          <button onClick={() => setExternalStatus('')} className="text-amber-300 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Secondary Toolbar: Note Types, Hold Mode, Auto-Sync (Beta), Play/Record */}
      <div className="px-4 py-2 bg-slate-950/80 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Note Types */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-white/10">
            <button
              onClick={() => setSelectedNoteType('normal')}
              className={`px-2 py-1 rounded text-[11px] font-black transition-colors cursor-pointer ${
                selectedNoteType === 'normal'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              NORMAL
            </button>
            <button
              onClick={() => setSelectedNoteType('gold')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-black transition-colors cursor-pointer ${
                selectedNoteType === 'gold'
                  ? 'bg-yellow-400 text-slate-950'
                  : 'text-yellow-400/70 hover:text-yellow-300'
              }`}
            >
              <Sparkles className="w-3 h-3" /> GOLD
            </button>
            <button
              onClick={() => setSelectedNoteType('fire')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-black transition-colors cursor-pointer ${
                selectedNoteType === 'fire'
                  ? 'bg-orange-500 text-white'
                  : 'text-orange-400/70 hover:text-orange-300'
              }`}
            >
              <Flame className="w-3 h-3" /> FIRE
            </button>
            <button
              onClick={() => setSelectedNoteType('mine')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-black transition-colors cursor-pointer ${
                selectedNoteType === 'mine'
                  ? 'bg-rose-600 text-white'
                  : 'text-rose-400/70 hover:text-rose-300'
              }`}
            >
              <Skull className="w-3 h-3" /> MINE
            </button>
            <button
              onClick={() => setSelectedNoteType('demon')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-black transition-colors cursor-pointer ${
                selectedNoteType === 'demon'
                  ? 'bg-red-900 text-red-100 border border-red-400'
                  : 'text-red-500 hover:text-red-300'
              }`}
            >
              <Skull className="w-3 h-3" /> DEMON
            </button>
          </div>

          <button
            onClick={() => {
              setIsHoldMode(!isHoldMode);
              setHoldStart(null);
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition-colors cursor-pointer ${
              isHoldMode
                ? 'bg-purple-600 border-purple-300 text-white'
                : 'bg-slate-900 border-white/15 text-slate-300 hover:text-white'
            }`}
          >
            {isHoldMode ? (holdStart ? 'TAP HOLD END' : 'HOLD MODE: ON') : 'HOLD NOTE'}
          </button>

          {/* Auto-Sync (BETA) Controls */}
          <div className="flex items-center gap-1 bg-indigo-950/70 border border-indigo-400/40 rounded-lg px-2 py-1">
            <button
              onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
              className={`flex items-center gap-1 text-[11px] font-black uppercase cursor-pointer ${
                autoSyncEnabled ? 'text-indigo-200' : 'text-slate-400'
              }`}
              title="Auto-Sync (Beta): Automatically snaps placed and recorded notes onto the song's beat grid"
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
              AUTO-SYNC
              <span className="px-1 py-0.2 rounded bg-amber-400 text-slate-950 text-[9px] font-black">
                BETA
              </span>
              <span>{autoSyncEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <select
              value={autoSyncSubdivision}
              onChange={(e) => setAutoSyncSubdivision(Number(e.target.value))}
              className="bg-slate-950 border border-indigo-400/30 rounded px-1 py-0.5 text-[10px] font-black text-indigo-200"
              title="Beat Grid Snap Subdivision"
            >
              <option value={2}>1/2 Beat</option>
              <option value={4}>1/4 Beat</option>
              <option value={8}>1/8 Beat</option>
            </select>
            <button
              onClick={handleAutoSyncAllNotes}
              className="px-2 py-0.5 rounded bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-black uppercase cursor-pointer"
              title="Snap all existing notes in the chart to the beat grid"
            >
              SNAP ALL
            </button>
          </div>
        </div>

        {/* Transport & Quick Slot Trigger Button */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => openSlotStudioModal(Math.round(currentTime / stepTime), 0, 'trigger')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black border bg-fuchsia-500/20 border-fuchsia-400/60 text-fuchsia-200 hover:bg-fuchsia-500/30 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" /> + TRIGGER / CP ({triggers.length + checkpoints.length})
          </button>

          <button
            onClick={() => togglePlay(true)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-black text-[11px] transition-all cursor-pointer ${
              isRecording
                ? 'bg-red-600 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.8)]'
                : 'bg-slate-900 border border-red-500/40 text-red-400 hover:bg-red-500/20'
            }`}
          >
            <Mic className="w-3.5 h-3.5" /> {isRecording ? 'STOP REC' : 'LIVE REC'}
          </button>

          <button
            onClick={() => togglePlay(false)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-black text-[11px] transition-all cursor-pointer ${
              isPlaying && !isRecording
                ? 'bg-rose-500 text-white'
                : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
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
            className="p-1.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Clear All Notes"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Triggers & Checkpoints Quick Strip */}
      {(triggers.length > 0 || checkpoints.length > 0) && (
        <div className="px-4 py-1.5 bg-slate-950/95 border-b border-white/10 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
            TIMELINE MARKERS:
          </span>
          {checkpoints.map((cp) => (
            <button
              key={cp.id}
              onClick={() => jumpToCheckpoint(cp)}
              className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 cursor-pointer ${
                activeCheckpointId === cp.id
                  ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200'
                  : 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300 hover:border-emerald-400'
              }`}
            >
              <Flag className="w-2.5 h-2.5" /> {cp.name} (R#{cp.row})
            </button>
          ))}
          {triggers.map((trig) => (
            <button
              key={trig.id}
              onClick={() => openSlotStudioModal(trig.row ?? 0, 0, 'trigger')}
              className="px-2 py-0.5 rounded-md border border-fuchsia-400/40 bg-fuchsia-950/50 hover:border-fuchsia-300 text-fuchsia-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 cursor-pointer"
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

      {/* Editor Note Grid — Supports Click to Place Note, and Press-and-Hold or Right-Click for Slot Trigger / Checkpoint */}
      <div className="flex-1 overflow-y-auto relative flex justify-center bg-[#05070e]" ref={gridRef}>
        <div
          className="relative py-8 transition-all duration-300"
          style={{
            width: editorLaneCount === 8 ? '820px' : editorLaneCount === 6 ? '640px' : '460px',
            maxWidth: '96vw',
          }}
        >
          {/* Playhead */}
          {isPlaying && (
            <div
              className="absolute left-0 w-full h-1 bg-emerald-400 z-30 shadow-[0_0_15px_#10b981] pointer-events-none"
              style={{ top: `${32 + (currentTime / stepTime) * 38}px` }}
            />
          )}

          {/* Column Headers */}
          <div className="flex mb-2 sticky top-0 bg-slate-950/95 backdrop-blur-md z-20 py-2 border-b border-white/15 rounded-t-lg">
            <div className="w-24 text-center text-[10px] text-slate-400 font-black">
              ROW / HOLD
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

          {/* Grid Rows */}
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
                    ? 'bg-emerald-500/15 border-emerald-400/70'
                    : rowTriggers.length > 0
                    ? 'bg-fuchsia-500/15 border-fuchsia-400/60'
                    : isMeasure
                    ? 'border-white/35 bg-white/[0.04]'
                    : isBeat
                    ? 'border-white/15'
                    : 'border-white/5'
                }`}
              >
                {/* Row Number + Trigger/Checkpoint Indicator Button */}
                <button
                  onClick={() => openSlotStudioModal(row, 0)}
                  className="w-24 px-1.5 h-full flex items-center justify-end gap-1 text-[10px] text-slate-400 hover:text-cyan-300 font-mono cursor-pointer group"
                  title="Click, Press & Hold, or Right-Click to place a Trigger or Checkpoint on this row"
                >
                  {rowCheckpoint && (
                    <span className="px-1 py-0.2 rounded bg-emerald-500 text-slate-950 font-black text-[8px]">
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
                  <span>{isBeat ? `${row / 4 + 1}` : `·${row}`}</span>
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
                      className="flex-1 h-full border-l border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors relative"
                    >
                      {isHoldStart && (
                        <div className="w-6 h-6 rounded-full border-2 border-dashed border-white animate-spin" />
                      )}

                      {holdingNote && (
                        <div
                          className="w-3.5 h-full opacity-55"
                          style={{ backgroundColor: laneColor }}
                        />
                      )}

                      {note && (
                        <div
                          className={`w-7 h-7 shadow-lg transform scale-95 transition-transform flex items-center justify-center z-10 ${
                            note.type === 'mine'
                              ? 'rounded-lg bg-red-900 border-2 border-red-500'
                              : note.type === 'demon'
                              ? 'rounded-lg bg-black border-2 border-red-600 shadow-[0_0_15px_#dc2626]'
                              : note.type === 'gold'
                              ? 'rounded-full bg-yellow-400 border-2 border-white shadow-[0_0_15px_#facc15]'
                              : note.type === 'fire'
                              ? 'rounded-full bg-orange-500 border-2 border-yellow-300 shadow-[0_0_15px_#f97316]'
                              : 'rounded-full'
                          }`}
                          style={
                            !note.type || note.type === 'normal'
                              ? {
                                  backgroundColor: laneColor,
                                  boxShadow: `0 0 10px ${laneColor}`,
                                }
                              : {}
                          }
                        >
                          {note.type === 'mine' && <Skull className="w-3.5 h-3.5 text-red-400" />}
                          {note.type === 'demon' && (
                            <Flame className="w-4 h-4 text-red-600 animate-pulse" />
                          )}
                          {note.type === 'gold' && <Sparkles className="w-3.5 h-3.5 text-black" />}
                          {note.type === 'fire' && (
                            <Flame className="w-3.5 h-3.5 text-yellow-200" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* PRESS & HOLD / RIGHT-CLICK SLOT TRIGGER & CHECKPOINT MODAL */}
      {slotModalRow !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3">
          <div className="rc-panel w-full max-w-xl border-2 border-fuchsia-400/60 shadow-[0_0_50px_rgba(217,70,239,0.3)] p-4 sm:p-5 max-h-[90vh] overflow-y-auto custom-scrollbar rc-modal-enter">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/15">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-fuchsia-500/25 border border-fuchsia-400 text-fuchsia-200 text-[10px] font-black uppercase">
                    ROW #{slotModalRow} • LANE {slotModalCol + 1}
                  </span>
                  <span className="text-xs font-black text-cyan-300">
                    TIMESTAMP: {((slotModalRow * stepTime) / 1000).toFixed(2)}s
                  </span>
                </div>
                <h3 className="text-base font-black uppercase tracking-wider text-white mt-1">
                  SLOT TRIGGER & CHECKPOINT STUDIO
                </h3>
              </div>
              <button
                onClick={() => setSlotModalRow(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/20 border border-white/20 flex items-center justify-center text-slate-300 hover:text-rose-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher: Trigger vs Editor Checkpoint */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => setSlotTab('trigger')}
                className={`py-2 px-3 rounded-xl border font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  slotTab === 'trigger'
                    ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-200 shadow-[0_0_15px_rgba(217,70,239,0.25)]'
                    : 'bg-slate-900 border-white/15 text-slate-400'
                }`}
              >
                <Zap className="w-4 h-4" /> MARK AS CHART TRIGGER
              </button>
              <button
                onClick={() => setSlotTab('checkpoint')}
                className={`py-2 px-3 rounded-xl border font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  slotTab === 'checkpoint'
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                    : 'bg-slate-900 border-white/15 text-slate-400'
                }`}
              >
                <BookmarkCheck className="w-4 h-4" /> MARK AS CHECKPOINT
              </button>
            </div>

            {slotTab === 'trigger' ? (
              <div className="space-y-3.5">
                {/* 4 Trigger Types */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                    SELECT TRIGGER TYPE FOR ROW #{slotModalRow}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      onClick={() => setSlotTriggerType('speed')}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        slotTriggerType === 'speed'
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-slate-900 border-white/10 text-slate-400'
                      }`}
                    >
                      <Gauge className="w-4 h-4 mb-1 text-amber-300" />
                      <div className="text-[11px] font-black uppercase">SPEED</div>
                      <div className="text-[9px] text-slate-300">6 Speed Presets</div>
                    </button>

                    <button
                      onClick={() => setSlotTriggerType('extra_notes')}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        slotTriggerType === 'extra_notes'
                          ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-200'
                          : 'bg-slate-900 border-white/10 text-slate-400'
                      }`}
                    >
                      <Columns className="w-4 h-4 mb-1 text-fuchsia-300" />
                      <div className="text-[11px] font-black uppercase">EXTRA NOTES</div>
                      <div className="text-[9px] text-slate-300">4 / 6 / 8 Lanes</div>
                    </button>

                    <button
                      onClick={() => setSlotTriggerType('invisible_notes')}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        slotTriggerType === 'invisible_notes'
                          ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                          : 'bg-slate-900 border-white/10 text-slate-400'
                      }`}
                    >
                      <EyeOff className="w-4 h-4 mb-1 text-cyan-300" />
                      <div className="text-[11px] font-black uppercase">INVISIBLE</div>
                      <div className="text-[9px] text-slate-300">Early Flash & Fade</div>
                    </button>

                    <button
                      onClick={() => setSlotTriggerType('note_velocity')}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        slotTriggerType === 'note_velocity'
                          ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
                          : 'bg-slate-900 border-white/10 text-slate-400'
                      }`}
                    >
                      <Radio className="w-4 h-4 mb-1 text-indigo-300" />
                      <div className="text-[11px] font-black uppercase">VELOCITY</div>
                      <div className="text-[9px] text-slate-300">12 Scroll FX</div>
                    </button>
                  </div>
                </div>

                {/* Trigger Configuration Specifics */}
                {slotTriggerType === 'speed' && (
                  <div className="bg-slate-900/90 border border-amber-400/40 rounded-xl p-3">
                    <label className="text-[10px] font-black uppercase text-amber-300 block mb-2">
                      SPEED TRIGGER PRESET (KEEPS DIFFICULTY SPEED RATIO)
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {SPEED_TRIGGER_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setSlotSpeedPreset(preset)}
                          className={`py-2 rounded-lg font-black text-xs border cursor-pointer ${
                            slotSpeedPreset === preset
                              ? 'bg-amber-400 text-slate-950 border-white'
                              : 'bg-slate-950 text-slate-300 border-white/15'
                          }`}
                        >
                          {preset.toFixed(2)}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {slotTriggerType === 'extra_notes' && (
                  <div className="bg-slate-900/90 border border-fuchsia-400/40 rounded-xl p-3 space-y-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-fuchsia-300 block mb-1.5">
                        LANE EXPANSION COUNT (WIDENS STAGE WITH SAME NOTE SIZE)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {EXTRA_LANE_OPTIONS.map((lanes) => (
                          <button
                            key={lanes}
                            onClick={() => setSlotExtraLanes(lanes)}
                            className={`py-2 rounded-lg font-black text-xs border cursor-pointer ${
                              slotExtraLanes === lanes
                                ? 'bg-fuchsia-400 text-slate-950 border-white'
                                : 'bg-slate-950 text-slate-300 border-white/15'
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
                          className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-white/20 text-xs font-bold text-white"
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
                  <div className="bg-slate-900/90 border border-cyan-400/40 rounded-xl p-3 space-y-3">
                    <div className="text-xs font-black text-cyan-300">
                      INVISIBLE NOTES TRIGGER — FLASH & FADE STEALTH CALCULATION
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Notes flash brightly towards the beginning-to-middle of their render and then quickly fade out to invisible, challenging the player to calculate the exact hit timing.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSlotInvisibleEnabled(true)}
                        className={`py-2 rounded-lg font-black text-xs border cursor-pointer ${
                          slotInvisibleEnabled
                            ? 'bg-cyan-400 text-slate-950 border-white'
                            : 'bg-slate-950 text-slate-400 border-white/15'
                        }`}
                      >
                        ENABLE INVISIBLE NOTES
                      </button>
                      <button
                        onClick={() => setSlotInvisibleEnabled(false)}
                        className={`py-2 rounded-lg font-black text-xs border cursor-pointer ${
                          !slotInvisibleEnabled
                            ? 'bg-emerald-400 text-slate-950 border-white'
                            : 'bg-slate-950 text-slate-400 border-white/15'
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
                  <div className="bg-slate-900/90 border border-indigo-400/40 rounded-xl p-3 space-y-3">
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
                          className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                            slotVelocityEffect === fx.id
                              ? 'bg-indigo-500/30 border-indigo-300 text-white'
                              : 'bg-slate-950 border-white/10 text-slate-400 hover:border-white/25'
                          }`}
                        >
                          <div className="text-[10px] font-black truncate" style={{ color: fx.color }}>
                            {fx.name}
                          </div>
                          <div className="text-[9px] text-slate-400 line-clamp-1">
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
                  <div className="bg-slate-950/90 border border-white/15 rounded-xl p-2.5">
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
                    className="px-4 py-2 rounded-xl bg-white/10 text-xs font-black text-slate-300 cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleSaveSlotTrigger}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-fuchsia-400 to-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer shadow-[0_0_20px_rgba(217,70,239,0.4)]"
                  >
                    SAVE TRIGGER ON ROW #{slotModalRow}
                  </button>
                </div>
              </div>
            ) : (
              /* Editor Checkpoint Tab inside Slot Studio Modal */
              <div className="space-y-3.5">
                <div className="bg-slate-900/90 border border-emerald-400/40 rounded-xl p-3 space-y-2.5">
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
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-emerald-400/40 text-xs font-bold text-white"
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
                      className="px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-200 text-xs font-black uppercase cursor-pointer"
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
                        className="px-3.5 py-2 rounded-xl bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-black text-xs uppercase cursor-pointer"
                      >
                        PLAYTEST FROM HERE
                      </button>
                    )}
                    <button
                      onClick={handleSaveSlotCheckpoint}
                      className="px-5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 p-5 rounded-2xl max-w-lg w-full relative max-h-[88vh] overflow-y-auto">
            <button
              onClick={() => setShowTutorial(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-black mb-3 text-amber-300 uppercase tracking-wider">
              BEATMAP & TRIGGER STUDIO GUIDE
            </h2>
            <div className="space-y-2.5 text-slate-300 text-xs">
              <p>
                <strong className="text-white">1. Press & Hold or Right-Click Any Slot:</strong>{' '}
                Long-press (~0.35s) or Right-Click any cell in the note grid to mark that row as a{' '}
                <strong className="text-fuchsia-300">Speed Trigger</strong>,{' '}
                <strong className="text-fuchsia-300">Extra Notes Trigger (4/6/8 Lanes)</strong>,{' '}
                <strong className="text-cyan-300">Invisible Notes Trigger</strong>,{' '}
                <strong className="text-indigo-300">Note Velocity Trigger (12 Scroll FX)</strong>, or an{' '}
                <strong className="text-emerald-300">Editor Checkpoint</strong>!
              </p>
              <p>
                <strong className="text-white">2. Local Playtesting:</strong> Click{' '}
                <strong className="text-cyan-300">TEST START</strong> or{' '}
                <strong className="text-emerald-300">TEST CHECKPOINT</strong> to test your chart immediately.
              </p>
              <p>
                <strong className="text-white">3. Newgrounds & Spotify Audio:</strong> Paste any
                Newgrounds Audio ID or Spotify Track/Playlist link and click{' '}
                <strong className="text-amber-300">LOAD</strong> and <strong className="text-cyan-300">HEAR</strong>.
              </p>
            </div>
            <button
              onClick={() => setShowTutorial(false)}
              className="mt-4 w-full py-2 bg-amber-400 text-slate-950 font-black rounded-xl hover:bg-amber-300 transition-colors cursor-pointer uppercase text-xs"
            >
              GOT IT!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
