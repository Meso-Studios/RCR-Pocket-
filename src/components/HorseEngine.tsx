import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../game/audio';
import { HIT_WINDOWS, KEY_CODE_MAP, KEY_MAP, SKINS } from '../game/constants';
import { pollActiveGamepadLanes, type LaneTuple } from '../game/gamepad';
import { normalizeHapticsSettings, triggerHaptic } from '../game/haptics';
import { drawNote, prewarmNoteSprites } from '../game/renderer';
import { getLaneFromPlayfieldX, getPlayfieldLayout } from '../game/rhythmLogic';
import type { ChartNote, PeerConnectionLike, PlayerInfo, ScreenId } from '../game/types';
import { useIsCompactLandscape } from '../game/useViewport';

interface HorseEngineProps {
  networkConnection: PeerConnectionLike | null;
  setScreen: (s: ScreenId) => void;
  playerInfo: PlayerInfo;
}

export const HorseEngine: React.FC<HorseEngineProps> = ({ networkConnection, setScreen, playerInfo }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isLandscapeCompact = useIsCompactLandscape();
  const [phase, setPhase] = useState<'waiting' | 'recording' | 'waiting_for_result' | 'playing' | 'finished' | 'error'>(
    'waiting'
  );
  const [score, setScore] = useState(0);
  const recordedNotes = useRef<ChartNote[]>([]);
  const startTime = useRef(0);
  const reqRef = useRef(0);
  const pressedRef = useRef<boolean[]>([false, false, false, false]);
  const prevGamepadLanesRef = useRef<LaneTuple>([false, false, false, false]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const hapticsRef = useRef(normalizeHapticsSettings(playerInfo.haptics));
  hapticsRef.current = normalizeHapticsSettings(playerInfo.haptics);

  const playfieldLayout = useMemo(
    () =>
      getPlayfieldLayout({
        isLandscape: isLandscapeCompact,
        isVS: false,
        downscroll: playerInfo.downscroll,
        heroMode: false,
      }),
    [isLandscapeCompact, playerInfo.downscroll]
  );
  const playfieldLayoutRef = useRef(playfieldLayout);
  playfieldLayoutRef.current = playfieldLayout;

  const currentSkinColors =
    playerInfo.equippedSkin === 'custom'
      ? playerInfo.customColors
      : SKINS[playerInfo.equippedSkin]?.colors || SKINS.default.colors;
  const currentSkinShape = playerInfo.equippedShape || 'arrow';

  useEffect(() => {
    prewarmNoteSprites(playfieldLayout.noteSize, currentSkinColors, currentSkinShape, null);
  }, [playfieldLayout.noteSize, currentSkinColors, currentSkinShape]);

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

  const playHorseHit = useCallback(
    (lane: number) => {
      const p = playerInfo.equippedHitSound;
      const url = p ? (p.kind === 'pack' ? p.sounds?.[lane % 4] : p.sound) : null;
      if (url && AudioEngine.playCachedBuffer(url, 0.7)) return;
      AudioEngine.playHitSound();
    },
    [playerInfo.equippedHitSound]
  );

  useEffect(() => {
    if (!networkConnection) {
      setPhase('error');
      return;
    }
    const iAmHost = networkConnection._rhythmRole === 'host';
    setPhase(iAmHost ? 'recording' : 'waiting');
    startTime.current = performance.now();

    const onData = (data: any) => {
      if (data.type === 'horse_pattern') {
        recordedNotes.current = (data.notes || []).map((n: any) => ({
          ...n,
          hit: false,
          missed: false,
          type: n.type || 'normal',
        }));
        setPhase('playing');
        startTime.current = performance.now();
      } else if (data.type === 'horse_score') {
        setScore(data.score);
        setPhase('finished');
      }
    };
    networkConnection.on('data', onData);
    return () => networkConnection.off?.('data', onData);
  }, [networkConnection]);

  const handleLaneDown = useCallback(
    (lane: number) => {
      if (lane < 0 || lane > 3) return;
      if (pressedRef.current[lane]) return;
      pressedRef.current[lane] = true;
      const elapsed = performance.now() - startTime.current;
      const currentPhase = phaseRef.current;

      if (currentPhase === 'recording') {
        playHorseHit(lane);
        triggerHaptic('hit', hapticsRef.current, 'sick');
        recordedNotes.current.push({ time: elapsed, lane, hit: false, missed: false, type: 'normal' });
      } else if (currentPhase === 'playing') {
        const targetNote = recordedNotes.current.find(
          (n) => n.lane === lane && !n.hit && !n.missed && Math.abs(n.time - elapsed) < HIT_WINDOWS.miss
        );
        if (targetNote) {
          targetNote.hit = true;
          setScore((s) => s + 350);
          playHorseHit(lane);
          triggerHaptic('hit', hapticsRef.current, 'sick');
        } else {
          triggerHaptic('press', hapticsRef.current);
        }
      }
    },
    [playHorseHit]
  );

  const handleLaneUp = useCallback((lane: number) => {
    if (lane >= 0 && lane <= 3) pressedRef.current[lane] = false;
  }, []);

  useEffect(() => {
    const resolveKeyLane = (e: KeyboardEvent): number | undefined => {
      const byCode = KEY_CODE_MAP[e.code];
      if (byCode !== undefined) return byCode;
      return KEY_MAP[e.key.toLowerCase()];
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Enter', 'Backspace'].includes(e.key) ||
        e.altKey ||
        e.ctrlKey
      ) {
        e.preventDefault();
      }
      const lane = resolveKeyLane(e);
      if (lane !== undefined) handleLaneDown(lane);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const lane = resolveKeyLane(e);
      if (lane !== undefined) handleLaneUp(lane);
    };
    const releaseAll = () => {
      for (let i = 0; i < 4; i++) {
        if (pressedRef.current[i]) handleLaneUp(i);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, [handleLaneDown, handleLaneUp]);

  // Direct zero-latency multi-touch support on the gray receptor notes & canvas lanes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointerToLane = new Map<number, number>();
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const layout = playfieldLayoutRef.current;
      const canvasX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * layout.width;
      const lane = getLaneFromPlayfieldX(canvasX, layout);
      if (lane === null) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      pointerToLane.set(e.pointerId, lane);
      handleLaneDown(lane);
    };
    const onPointerUp = (e: PointerEvent) => {
      const lane = pointerToLane.get(e.pointerId);
      if (lane !== undefined) {
        pointerToLane.delete(e.pointerId);
        handleLaneUp(lane);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [handleLaneDown, handleLaneUp, isLandscapeCompact]);

  const handleDownRef = useRef(handleLaneDown);
  handleDownRef.current = handleLaneDown;
  const handleUpRef = useRef(handleLaneUp);
  handleUpRef.current = handleLaneUp;

  useEffect(() => {
    let activeCanvas: HTMLCanvasElement | null = canvasRef.current;
    let activeCtx = activeCanvas ? activeCanvas.getContext('2d') : null;
    if (!activeCtx) return;

    const loop = (time: number) => {
      const currentCanvas = canvasRef.current;
      if (currentCanvas && currentCanvas !== activeCanvas) {
        activeCanvas = currentCanvas;
        activeCtx = currentCanvas.getContext('2d');
      }
      if (!activeCtx) {
        reqRef.current = requestAnimationFrame(loop);
        return;
      }

      const gp = pollActiveGamepadLanes();
      for (let gi = 0; gi < 4; gi++) {
        if (gp.lanes[gi] !== prevGamepadLanesRef.current[gi]) {
          prevGamepadLanesRef.current[gi] = gp.lanes[gi];
          if (gp.lanes[gi]) handleDownRef.current(gi);
          else handleUpRef.current(gi);
        }
      }

      const ctx = activeCtx;
      const layout = playfieldLayoutRef.current;
      ctx.clearRect(0, 0, layout.width, layout.height);
      const elapsed = time - startTime.current;
      const receptorY = layout.receptorY;

      for (let i = 0; i < 4; i++) {
        const lx = layout.playerLaneXs[i];
        if (pressedRef.current[i]) {
          ctx.fillStyle = currentSkinColors[i] || '#ffffff';
          ctx.globalAlpha = 0.16;
          ctx.fillRect(lx - 5, 0, layout.noteSize + 10, layout.height);
          ctx.globalAlpha = 1;
        } else if (layout.isLandscape) {
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.035;
          ctx.fillRect(lx - 5, 0, layout.noteSize + 10, layout.height);
          ctx.globalAlpha = 1;
        }
        drawNote(ctx, lx, receptorY, layout.noteSize, i % 4, null, pressedRef.current[i], currentSkinShape);
      }

      if (phase === 'recording') {
        if (elapsed > 10000) {
          if (networkConnection?.open) {
            networkConnection.send({ type: 'horse_pattern', notes: recordedNotes.current });
          }
          setPhase('waiting_for_result');
          return;
        }
      } else if (phase === 'playing') {
        let activeNotes = false;
        recordedNotes.current.forEach((n) => {
          if (!n.hit && !n.missed) {
            activeNotes = true;
            const y = playerInfo.downscroll ? receptorY - (n.time - elapsed) * 0.6 : receptorY + (n.time - elapsed) * 0.6;
            if (y > -100 && y < layout.height + 100) {
              drawNote(
                ctx,
                layout.playerLaneXs[n.lane % 4] ?? 20,
                y,
                layout.noteSize,
                n.lane % 4,
                currentSkinColors[n.lane % 4],
                false,
                currentSkinShape,
                n.type
              );
            }
            if (elapsed > n.time + HIT_WINDOWS.miss) {
              n.missed = true;
              triggerHaptic('miss', hapticsRef.current);
            }
          }
        });

        if (!activeNotes && elapsed > (recordedNotes.current[recordedNotes.current.length - 1]?.time || 0) + 2000) {
          if (networkConnection?.open) networkConnection.send({ type: 'horse_score', score: scoreRef.current });
          setPhase('finished');
          return;
        }
      }
      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqRef.current);
  }, [phase, currentSkinColors, currentSkinShape, networkConnection, playerInfo.downscroll]);

  return (
    <div className="w-full h-[100dvh] flex flex-col items-center justify-between bg-gray-900 transition-colors overflow-hidden px-3 pt-2 sm:pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] gap-1.5 sm:gap-2">
      <div
        className={`text-center z-10 bg-black border-4 border-white shadow-[6px_6px_0_#fff] transform skew-x-[-5deg] w-full max-w-3xl pr-14 sm:pr-16 shrink-0 ${
          isLandscapeCompact ? 'py-1.5 px-3 flex items-center justify-between gap-2' : 'p-3 sm:p-4'
        }`}
      >
        <h2
          className={`font-black text-white italic transform skew-x-[5deg] ${
            isLandscapeCompact ? 'text-base sm:text-xl' : 'text-xl sm:text-3xl md:text-4xl'
          }`}
        >
          {phase === 'recording' && <span className="text-red-500 animate-pulse">RECORDING... TAP GRAY NOTES!</span>}
          {phase === 'waiting' && <span className="text-yellow-400 animate-pulse">HOST IS CREATING PATTERN...</span>}
          {phase === 'waiting_for_result' && <span className="text-cyan-400 animate-pulse">GUEST IS PLAYING...</span>}
          {phase === 'playing' && <span className="text-green-400">SURVIVE THEIR PATTERN!</span>}
          {phase === 'finished' && <span className="text-pink-500">ROUND OVER!</span>}
          {phase === 'error' && <span className="text-red-400">CONNECTION LOST</span>}
        </h2>
        {(phase === 'playing' || phase === 'finished') && (
          <div className={`font-black text-white transform skew-x-[5deg] ${isLandscapeCompact ? 'text-base' : 'text-lg sm:text-2xl mt-2'}`}>
            SCORE: {score}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={playfieldLayout.width}
          height={playfieldLayout.height}
          style={{ aspectRatio: `${playfieldLayout.width} / ${playfieldLayout.height}` }}
          className="touch-surface bg-black border-4 sm:border-8 border-white shadow-[8px_8px_0_#000] max-h-full max-w-full w-auto h-auto object-contain rounded-xl"
        />
      </div>

      {(phase === 'finished' || phase === 'error') && (
        <button
          onClick={() => setScreen('events')}
          className="bg-pink-500 text-black border-4 border-black px-8 py-3 font-black text-xl sm:text-3xl uppercase shadow-[6px_6px_0_#000] hover:translate-y-[-2px] transition-transform transform skew-x-[-5deg] shrink-0"
        >
          EXIT TO EVENTS
        </button>
      )}
    </div>
  );
};
