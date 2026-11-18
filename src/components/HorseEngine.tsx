import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../game/audio';
import { HIT_WINDOWS, SKINS } from '../game/constants';
import { pollActiveGamepadLanes, type LaneTuple } from '../game/gamepad';
import { normalizeHapticsSettings, triggerHaptic } from '../game/haptics';
import { normalizeControlLayout } from '../game/layoutConfig';
import { drawNote, prewarmNoteSprites } from '../game/renderer';
import {
  getLaneFromPlayfieldPoint,
  getPlayfieldLayout,
  mapCustomKeyToLane,
} from '../game/rhythmLogic';
import type { ChartNote, PeerConnectionLike, PlayerInfo, ScreenId } from '../game/types';
import { useIsCompactLandscape } from '../game/useViewport';
import { createSimulatedRivalConnection } from './OnlineLobby';

interface HorseEngineProps {
  networkConnection: PeerConnectionLike | null;
  setScreen: (s: ScreenId) => void;
  playerInfo: PlayerInfo;
}

export const HorseEngine: React.FC<HorseEngineProps> = ({
  networkConnection,
  setScreen,
  playerInfo,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isLandscapeCompact = useIsCompactLandscape();

  // Ensure HorseEngine always has a working connection even if launched directly
  const activeConn = useMemo(
    () => networkConnection || createSimulatedRivalConnection('AetherWave', 2, 'host'),
    [networkConnection]
  );

  const allowedDeaths: 1 | 2 | 3 = activeConn._allowedDeaths || 2;
  const opponentName = activeConn._opponentName || 'RIVAL_DUELIST';

  const [myDeaths, setMyDeaths] = useState(0);
  const [oppDeaths, setOppDeaths] = useState(0);
  const [roundNum, setRoundNum] = useState(1);
  const [winner, setWinner] = useState<'you' | 'opponent' | null>(null);

  const [phase, setPhase] = useState<
    'waiting' | 'recording' | 'waiting_for_result' | 'playing' | 'finished'
  >('recording');
  const [score, setScore] = useState(0);
  const [statusNote, setStatusNote] = useState('TAP RECEPTORS OR KEYS TO RECORD YOUR PHRASE!');

  const recordedNotes = useRef<ChartNote[]>([]);
  const startTime = useRef(performance.now());
  const reqRef = useRef(0);
  const pressedRef = useRef<boolean[]>([false, false, false, false]);
  const prevGamepadLanesRef = useRef<LaneTuple>([false, false, false, false]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const hapticsRef = useRef(normalizeHapticsSettings(playerInfo.haptics));
  hapticsRef.current = normalizeHapticsSettings(playerInfo.haptics);

  const effectiveControlLayout = normalizeControlLayout(playerInfo.controlLayout);

  const playfieldLayout = useMemo(
    () =>
      getPlayfieldLayout({
        isLandscape: true,
        isVS: false,
        downscroll: playerInfo.downscroll,
        heroMode: false,
        controlLayout: effectiveControlLayout,
      }),
    [playerInfo.downscroll, effectiveControlLayout]
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

  const playHorseHit = useCallback(
    (lane: number) => {
      const p = playerInfo.equippedHitSound;
      const url = p ? (p.kind === 'pack' ? p.sounds?.[lane % 4] : p.sound) : null;
      if (url && AudioEngine.playCachedBuffer(url, 0.7)) return;
      AudioEngine.playHitSound(lane);
    },
    [playerInfo.equippedHitSound]
  );

  useEffect(() => {
    const iAmHost = activeConn._rhythmRole !== 'guest';
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
        setStatusNote(`REPLAY ${opponentName}'S PHRASE WITHOUT MISSING!`);
        setPhase('playing');
        startTime.current = performance.now();
      } else if (data.type === 'challenge_result') {
        if (!data.success) {
          setOppDeaths((prev) => {
            const next = prev + 1;
            if (next >= allowedDeaths) {
              setWinner('you');
              setPhase('finished');
            }
            return next;
          });
          setStatusNote(`${opponentName} FAILED YOUR PHRASE! (+1 DEATH) — NOW SURVIVE THEIR COUNTER!`);
        } else {
          setStatusNote(`${opponentName} CLEARED YOUR PHRASE! SURVIVE THEIR COUNTER-COMBO!`);
        }

        if (Array.isArray(data.nextNotes) && data.nextNotes.length > 0) {
          recordedNotes.current = data.nextNotes.map((n: any) => ({
            time: Number(n.time) || 600,
            lane: Number(n.lane) % 4,
            hit: false,
            missed: false,
            type: 'normal',
          }));
          setPhase('playing');
          startTime.current = performance.now();
        }
      }
    };
    activeConn.on('data', onData);
    return () => activeConn.off?.('data', onData);
  }, [activeConn, allowedDeaths, opponentName]);

  const finishRecordingPhrase = useCallback(() => {
    if (recordedNotes.current.length === 0) {
      // Seed a default 4-note phrase if player didn't tap during the window
      recordedNotes.current = [
        { time: 500, lane: 0, hit: false, missed: false, type: 'normal' },
        { time: 950, lane: 1, hit: false, missed: false, type: 'normal' },
        { time: 1400, lane: 2, hit: false, missed: false, type: 'normal' },
        { time: 1850, lane: 3, hit: false, missed: false, type: 'normal' },
      ];
    }
    setStatusNote(`SENT ${recordedNotes.current.length}-NOTE PHRASE TO ${opponentName}...`);
    setPhase('waiting_for_result');
    activeConn.send({
      type: 'send_challenge',
      notes: recordedNotes.current,
    });
  }, [activeConn, opponentName]);

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
        recordedNotes.current.push({
          time: Math.max(250, Math.round(elapsed)),
          lane,
          hit: false,
          missed: false,
          type: 'normal',
        });
      } else if (currentPhase === 'playing') {
        const targetNote = recordedNotes.current.find(
          (n) =>
            n.lane === lane &&
            !n.hit &&
            !n.missed &&
            Math.abs(n.time - elapsed) < HIT_WINDOWS.miss
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const lane = mapCustomKeyToLane(e.key, e.code, playerInfo.customKeybinds);
      if (lane >= 0 && lane <= 3) {
        e.preventDefault();
        handleLaneDown(lane);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const lane = mapCustomKeyToLane(e.key, e.code, playerInfo.customKeybinds);
      if (lane >= 0 && lane <= 3) handleLaneUp(lane);
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleLaneDown, handleLaneUp, playerInfo.customKeybinds]);

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
      if (lane === null || lane < 0 || lane > 3) return;
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
  }, [handleLaneDown, handleLaneUp]);

  useEffect(() => {
    let activeCanvas: HTMLCanvasElement | null = canvasRef.current;
    let activeCtx = activeCanvas ? activeCanvas.getContext('2d', { alpha: false }) : null;
    if (!activeCtx) return;

    const loop = (time: number) => {
      const currentCanvas = canvasRef.current;
      if (currentCanvas && currentCanvas !== activeCanvas) {
        activeCanvas = currentCanvas;
        activeCtx = currentCanvas.getContext('2d', { alpha: false });
      }
      if (!activeCtx) {
        reqRef.current = requestAnimationFrame(loop);
        return;
      }

      const gp = pollActiveGamepadLanes();
      for (let gi = 0; gi < 4; gi++) {
        if (gp.lanes[gi] !== prevGamepadLanesRef.current[gi]) {
          prevGamepadLanesRef.current[gi] = gp.lanes[gi];
          if (gp.lanes[gi]) handleLaneDown(gi);
          else handleLaneUp(gi);
        }
      }

      const ctx = activeCtx;
      const layout = playfieldLayoutRef.current;
      ctx.fillStyle = '#060811';
      ctx.fillRect(0, 0, layout.width, layout.height);
      const elapsed = time - startTime.current;

      for (let i = 0; i < 4; i++) {
        const lx = layout.playerLaneXs[i];
        const ly = layout.playerLaneYs[i] ?? layout.receptorY;
        if (pressedRef.current[i]) {
          ctx.fillStyle = currentSkinColors[i] || '#ffffff';
          ctx.globalAlpha = 0.16;
          ctx.fillRect(lx - 5, 0, layout.noteSize + 10, layout.height);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.035;
          ctx.fillRect(lx - 5, 0, layout.noteSize + 10, layout.height);
          ctx.globalAlpha = 1;
        }
        drawNote(ctx, lx, ly, layout.noteSize, i % 4, null, pressedRef.current[i], currentSkinShape);
      }

      if (phase === 'recording') {
        if (elapsed > 6500) {
          finishRecordingPhrase();
          return;
        }
      } else if (phase === 'playing') {
        let activeNotes = false;
        recordedNotes.current.forEach((n) => {
          if (!n.hit && !n.missed) {
            activeNotes = true;
            const laneIdx = n.lane % 4;
            const laneY = layout.playerLaneYs[laneIdx] ?? layout.receptorY;
            const y = playerInfo.downscroll
              ? laneY - (n.time - elapsed) * 0.6
              : laneY + (n.time - elapsed) * 0.6;
            if (y > -100 && y < layout.height + 100) {
              drawNote(
                ctx,
                layout.playerLaneXs[laneIdx] ?? 20,
                y,
                layout.noteSize,
                laneIdx,
                currentSkinColors[laneIdx],
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

        const lastNoteTime =
          recordedNotes.current[recordedNotes.current.length - 1]?.time || 1500;
        if (!activeNotes && elapsed > lastNoteTime + 900) {
          const anyMiss = recordedNotes.current.some((n) => n.missed || !n.hit);
          if (anyMiss) {
            const nextDeaths = myDeaths + 1;
            setMyDeaths(nextDeaths);
            if (nextDeaths >= allowedDeaths) {
              AudioEngine.playVinylStopSound(1.1);
              setWinner('opponent');
              setPhase('finished');
              return;
            }
          }
          // Advance to next round: player's turn to record a new phrase
          recordedNotes.current = [];
          setRoundNum((r) => r + 1);
          setStatusNote(
            anyMiss
              ? 'PHRASE MISSED (+1 DEATH)! YOUR TURN TO RECORD A COUNTER-PHRASE!'
              : 'PHRASE CLEARED! YOUR TURN TO RECORD A NEW PHRASE!'
          );
          startTime.current = performance.now();
          setPhase('recording');
          return;
        }
      }
      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqRef.current);
  }, [
    phase,
    currentSkinColors,
    currentSkinShape,
    playerInfo.downscroll,
    finishRecordingPhrase,
    handleLaneDown,
    handleLaneUp,
    myDeaths,
    allowedDeaths,
  ]);

  return (
    <div className="rc-stage w-full h-[100dvh] flex flex-col items-center justify-between transition-colors overflow-hidden px-3 pt-2 sm:pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] gap-1.5 sm:gap-2 select-none">
      <div className="rc-stage-dots absolute inset-0 pointer-events-none" />
      <div
        className={`relative z-10 rc-dock-rail w-full max-w-4xl pr-14 sm:pr-16 shrink-0 flex flex-wrap items-center justify-between gap-2 ${
          isLandscapeCompact ? 'py-1.5 px-3' : 'px-4 py-2'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-fuchsia-500/25 border border-fuchsia-400 text-[10px] font-black uppercase text-fuchsia-200">
            H.O.R.S.E. ROUND #{roundNum}
          </span>
          <h2 className="font-black text-white italic uppercase truncate text-xs sm:text-sm">
            {statusNote}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="rc-dock-well px-2.5 py-1 text-[11px] font-black text-cyan-300">
            YOU: {Math.max(0, allowedDeaths - myDeaths)} / {allowedDeaths} ❤️
          </div>
          <div className="rc-dock-well px-2.5 py-1 text-[11px] font-black text-rose-300">
            {opponentName}: {Math.max(0, allowedDeaths - oppDeaths)} / {allowedDeaths} ❤️
          </div>
          {phase === 'recording' && (
            <button
              type="button"
              onClick={finishRecordingPhrase}
              className="rc-bevel-btn rc-tile-gold text-black px-3 py-1 rounded-lg text-[11px] font-black uppercase"
            >
              SEND PHRASE ({recordedNotes.current.length})
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={playfieldLayout.width}
          height={playfieldLayout.height}
          style={{ aspectRatio: `${playfieldLayout.width} / ${playfieldLayout.height}` }}
          className="touch-surface bg-[#060811] border-4 border-white/90 shadow-[0_12px_28px_rgba(0,0,0,0.7)] max-h-full max-w-full w-auto h-auto object-contain rounded-2xl"
        />
      </div>

      {phase === 'finished' && (
        <div className="relative z-10 flex items-center gap-3">
          <div className="rc-dock-well px-4 py-2 font-black text-sm uppercase text-amber-300">
            {winner === 'you'
              ? `VICTORY! ${opponentName} RAN OUT OF ALLOWED DEATHS!`
              : `ELIMINATED! YOU USED ALL ${allowedDeaths} ALLOWED DEATHS!`}
          </div>
          <button
            onClick={() => setScreen('events')}
            className="rc-bevel-btn rc-tile-pink text-white px-6 py-2 font-black text-sm uppercase shrink-0 whitespace-nowrap"
          >
            EXIT H.O.R.S.E. ARENA
          </button>
        </div>
      )}
    </div>
  );
};
