import React, { useRef, useState } from 'react';
import { Move, RotateCcw, Smartphone, X } from 'lucide-react';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  LANDSCAPE_CANVAS_HEIGHT,
  LANDSCAPE_CANVAS_WIDTH,
  LANE_LABELS,
} from '../game/constants';
import {
  clampPadCoord,
  getDefaultLaneCoords,
  getDefaultPadCoords,
  LANE_BOUNDARY_MARGIN,
  laneCoordsToPixels,
  normalizeControlLayout,
  PAD_BUTTON_HEIGHT_PCT,
  PAD_BUTTON_WIDTH_PCT,
  pixelToLaneCoord,
} from '../game/layoutConfig';
import { useIsCompactLandscape } from '../game/useViewport';
import type { ControlLayoutSettings, LaneCoord, PadCoord, SkinShape } from '../game/types';

interface ControlLayoutModalProps {
  controlLayout?: ControlLayoutSettings | null;
  downscroll: boolean;
  skinColors: string[];
  skinShape?: SkinShape;
  initialOrientation: 'portrait' | 'landscape';
  showTouchPads?: boolean;
  onToggleTouchPads?: () => void;
  onChange: (next: ControlLayoutSettings) => void;
  onClose: () => void;
}

const LANE_ROTATIONS = [-90, 180, 0, 90];

export const ControlLayoutModal: React.FC<ControlLayoutModalProps> = ({
  controlLayout,
  downscroll,
  skinColors,
  skinShape = 'arrow',
  initialOrientation,
  showTouchPads,
  onToggleTouchPads,
  onChange,
  onClose,
}) => {
  const [tab, setTab] = useState<'lanes' | 'pads'>('lanes');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(initialOrientation);
  const [activeDragIdx, setActiveDragIdx] = useState<number | null>(null);
  const isLandscapeCompact = useIsCompactLandscape();

  const normalized = normalizeControlLayout(controlLayout);
  const isLandscape = orientation === 'landscape';
  const playWidth = isLandscape ? LANDSCAPE_CANVAS_WIDTH : CANVAS_WIDTH;
  const playHeight = isLandscape ? LANDSCAPE_CANVAS_HEIGHT : CANVAS_HEIGHT;
  const noteSize = isLandscape ? 74 : 66;

  const laneKey = isLandscape ? 'landscapeLanes' : 'portraitLanes';
  const padKey = isLandscape ? 'landscapePads' : 'portraitPads';

  const currentLaneCoords: LaneCoord[] = normalized[laneKey] || getDefaultLaneCoords(isLandscape, downscroll);
  const currentLanePixels = laneCoordsToPixels(currentLaneCoords, isLandscape, noteSize);
  const currentPadCoords: PadCoord[] = normalized[padKey] || getDefaultPadCoords('row');

  const laneAreaRef = useRef<HTMLDivElement | null>(null);
  const padAreaRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ lane: number; offsetX: number; offsetY: number } | null>(null);

  const updateLanes = (nextCoords: LaneCoord[] | null) => {
    onChange({
      ...normalized,
      [laneKey]: nextCoords,
    });
  };

  const updatePads = (nextPads: PadCoord[] | null) => {
    onChange({
      ...normalized,
      [padKey]: nextPads,
    });
  };

  const handleLanePointerDown = (lane: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const box = laneAreaRef.current?.getBoundingClientRect();
    if (!box) return;
    const pointerPlayX = ((e.clientX - box.left) / Math.max(1, box.width)) * playWidth;
    const pointerPlayY = ((e.clientY - box.top) / Math.max(1, box.height)) * playHeight;
    dragOffsetRef.current = {
      lane,
      offsetX: pointerPlayX - currentLanePixels.xs[lane],
      offsetY: pointerPlayY - currentLanePixels.ys[lane],
    };
    setActiveDragIdx(lane);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture is unsupported
    }
  };

  const handleLanePointerMove = (lane: number, e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragOffsetRef.current;
    if (!drag || drag.lane !== lane) return;
    const box = laneAreaRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const pointerPlayX = ((e.clientX - box.left) / Math.max(1, box.width)) * playWidth;
    const pointerPlayY = ((e.clientY - box.top) / Math.max(1, box.height)) * playHeight;
    const clampedCoord = pixelToLaneCoord(
      pointerPlayX - drag.offsetX,
      pointerPlayY - drag.offsetY,
      isLandscape,
      noteSize
    );
    const next = currentLaneCoords.map((c, idx) => (idx === lane ? clampedCoord : c));
    updateLanes(next);
  };

  const handleLanePointerUp = (lane: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (dragOffsetRef.current?.lane === lane) {
      dragOffsetRef.current = null;
      setActiveDragIdx(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handlePadPointerDown = (lane: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const box = padAreaRef.current?.getBoundingClientRect();
    if (!box) return;
    const pointerXPct = ((e.clientX - box.left) / Math.max(1, box.width)) * 100;
    const pointerYPct = ((e.clientY - box.top) / Math.max(1, box.height)) * 100;
    dragOffsetRef.current = {
      lane,
      offsetX: pointerXPct - currentPadCoords[lane].xPct,
      offsetY: pointerYPct - currentPadCoords[lane].yPct,
    };
    setActiveDragIdx(lane);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePadPointerMove = (lane: number, e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragOffsetRef.current;
    if (!drag || drag.lane !== lane) return;
    const box = padAreaRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const pointerXPct = ((e.clientX - box.left) / Math.max(1, box.width)) * 100;
    const pointerYPct = ((e.clientY - box.top) / Math.max(1, box.height)) * 100;
    const clamped = clampPadCoord(
      { xPct: pointerXPct - drag.offsetX, yPct: pointerYPct - drag.offsetY },
      currentPadCoords[lane]
    );
    const next = currentPadCoords.map((p, idx) => (idx === lane ? clamped : p));
    updatePads(next);
  };

  const handlePadPointerUp = (lane: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (dragOffsetRef.current?.lane === lane) {
      dragOffsetRef.current = null;
      setActiveDragIdx(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const marginLeftPct = (LANE_BOUNDARY_MARGIN / playWidth) * 100;
  const marginTopPct = (LANE_BOUNDARY_MARGIN / playHeight) * 100;

  const renderCanvas = () =>
    tab === 'lanes' ? (
      <div
        ref={laneAreaRef}
        data-testid="layout-lanes-boundary"
        className="touch-surface relative bg-[#060811] border-4 border-white/80 rounded-xl overflow-hidden mx-auto w-full"
        style={{
          aspectRatio: `${playWidth} / ${playHeight}`,
          maxHeight: isLandscapeCompact ? (isLandscape ? '72dvh' : '74dvh') : isLandscape ? '38dvh' : '44dvh',
          maxWidth: isLandscape ? (isLandscapeCompact ? '480px' : '560px') : isLandscapeCompact ? '240px' : '320px',
        }}
      >
        <div
          className="absolute border-2 border-dashed border-cyan-400/50 rounded-lg pointer-events-none"
          style={{
            left: `${marginLeftPct}%`,
            right: `${marginLeftPct}%`,
            top: `${marginTopPct}%`,
            bottom: `${marginTopPct}%`,
          }}
        />
        <div className="absolute top-0.5 left-1/2 -translate-x-1/2 bg-[#060811] px-2 text-[9px] font-black tracking-widest text-cyan-300/90 pointer-events-none whitespace-nowrap">
          BOUNDARY • DRAG RECEPTORS
        </div>

        {[0, 1, 2, 3].map((lane) => {
          const xPct = (currentLanePixels.xs[lane] / playWidth) * 100;
          const yPct = (currentLanePixels.ys[lane] / playHeight) * 100;
          const wPct = (noteSize / playWidth) * 100;
          const hPct = (noteSize / playHeight) * 100;
          const color = skinColors[lane] || '#ffffff';
          const isDragging = activeDragIdx === lane;
          return (
            <div
              key={lane}
              data-testid={`layout-drag-lane-${lane}`}
              data-x-px={currentLanePixels.xs[lane]}
              data-y-px={currentLanePixels.ys[lane]}
              onPointerDown={(e) => handleLanePointerDown(lane, e)}
              onPointerMove={(e) => handleLanePointerMove(lane, e)}
              onPointerUp={(e) => handleLanePointerUp(lane, e)}
              onPointerCancel={(e) => handleLanePointerUp(lane, e)}
              className={`touch-surface absolute flex items-center justify-center rounded-lg cursor-grab active:cursor-grabbing select-none border-2 ${
                isDragging ? 'ring-4 ring-yellow-300 z-20 scale-105' : 'border-white/70 z-10'
              }`}
              style={{
                left: `${xPct}%`,
                top: `${yPct}%`,
                width: `${wPct}%`,
                height: `${hPct}%`,
                backgroundColor: '#2a3044',
                boxShadow: `0 0 12px ${color}44`,
              }}
            >
              {skinShape === 'circle' ? (
                <div className="w-[70%] h-[70%] rounded-full border-2 border-white bg-gray-500/80 pointer-events-none" />
              ) : (
                <svg
                  viewBox="0 0 40 40"
                  className="w-[74%] h-[74%] pointer-events-none"
                  style={{ transform: `rotate(${LANE_ROTATIONS[lane]}deg)` }}
                >
                  <polygon
                    points="20,2 38,20 29,20 29,38 11,38 11,20 2,20"
                    fill="#6b7280"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span
                className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 text-[9px] font-black px-1 bg-black/90 rounded pointer-events-none"
                style={{ color }}
              >
                {LANE_LABELS[lane]}
              </span>
            </div>
          );
        })}
      </div>
    ) : (
      <div
        ref={padAreaRef}
        data-testid="layout-pads-boundary"
        className={`touch-surface relative w-full bg-[#060811] border-4 border-dashed border-yellow-400/75 rounded-xl overflow-hidden mx-auto ${
          isLandscapeCompact ? 'h-[66dvh] max-w-[460px]' : 'max-w-[540px] h-[190px] sm:h-[220px]'
        }`}
      >
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-widest text-yellow-300/80 pointer-events-none whitespace-nowrap">
          NOTE BUTTONS BOUNDARY • DRAG ANY PAD
        </div>

        {[0, 1, 2, 3].map((lane) => {
          const pos = currentPadCoords[lane];
          const color = skinColors[lane] || '#ffffff';
          const isDragging = activeDragIdx === lane;
          return (
            <div
              key={lane}
              data-testid={`layout-drag-pad-${lane}`}
              data-x-pct={pos.xPct}
              data-y-pct={pos.yPct}
              onPointerDown={(e) => handlePadPointerDown(lane, e)}
              onPointerMove={(e) => handlePadPointerMove(lane, e)}
              onPointerUp={(e) => handlePadPointerUp(lane, e)}
              onPointerCancel={(e) => handlePadPointerUp(lane, e)}
              className={`touch-surface absolute flex flex-col items-center justify-center rounded-xl border-4 cursor-grab active:cursor-grabbing select-none ${
                isDragging ? 'ring-4 ring-white z-20 scale-105' : 'z-10'
              }`}
              style={{
                left: `${pos.xPct}%`,
                top: `${pos.yPct}%`,
                width: `${PAD_BUTTON_WIDTH_PCT}%`,
                height: `${PAD_BUTTON_HEIGHT_PCT}%`,
                backgroundColor: '#0c1020',
                borderColor: color,
                color,
                boxShadow: `0 4px 0 #000, inset 0 0 14px ${color}33`,
              }}
            >
              <svg
                viewBox="0 0 40 40"
                className="w-7 h-7 sm:w-8 sm:h-8 pointer-events-none"
                style={{ transform: `rotate(${LANE_ROTATIONS[lane]}deg)` }}
              >
                <polygon
                  points="20,2 38,20 29,20 29,38 11,38 11,20 2,20"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          );
        })}
      </div>
    );

  const renderPresets = () =>
    tab === 'lanes' ? (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          onClick={() => updateLanes(getDefaultLaneCoords(isLandscape, downscroll))}
          className="px-2.5 py-1.5 bg-gray-900 border-2 border-cyan-400/60 text-xs font-black text-cyan-200 min-h-[34px] rounded"
        >
          EVENLY SPACE
        </button>
        <button
          onClick={() => updateLanes([3, 2, 1, 0].map((idx) => currentLaneCoords[idx]))}
          className="px-2.5 py-1.5 bg-gray-900 border-2 border-purple-400/60 text-xs font-black text-purple-200 min-h-[34px] rounded"
        >
          MIRROR SWAP
        </button>
        <button
          data-testid="layout-reset-btn"
          onClick={() => updateLanes(null)}
          className="px-2.5 py-1.5 bg-gray-800 border-2 border-white/50 text-xs font-black text-white flex items-center gap-1 min-h-[34px] rounded"
        >
          <RotateCcw className="w-3.5 h-3.5" /> RESET
        </button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          onClick={() => updatePads(getDefaultPadCoords('row'))}
          className="px-2.5 py-1.5 bg-gray-900 border-2 border-cyan-400/60 text-xs font-black text-cyan-200 min-h-[34px] rounded"
        >
          ROW
        </button>
        <button
          onClick={() => updatePads(getDefaultPadCoords('split'))}
          className="px-2.5 py-1.5 bg-gray-900 border-2 border-pink-400/60 text-xs font-black text-pink-200 min-h-[34px] rounded"
        >
          SPLIT 2+2
        </button>
        <button
          onClick={() => updatePads(getDefaultPadCoords('arc'))}
          className="px-2.5 py-1.5 bg-gray-900 border-2 border-yellow-400/60 text-xs font-black text-yellow-200 min-h-[34px] rounded"
        >
          THUMB ARC
        </button>
        <button
          data-testid="layout-reset-btn"
          onClick={() => updatePads(null)}
          className="px-2.5 py-1.5 bg-gray-800 border-2 border-white/50 text-xs font-black text-white flex items-center gap-1 min-h-[34px] rounded"
        >
          <RotateCcw className="w-3.5 h-3.5" /> RESET
        </button>
        {onToggleTouchPads && (
          <button
            onClick={onToggleTouchPads}
            className={`px-2.5 py-1.5 border-2 border-black text-xs font-black flex items-center gap-1 min-h-[34px] rounded ${
              showTouchPads ? 'bg-cyan-400 text-black' : 'bg-gray-900 text-gray-300 border-white/40'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            {showTouchPads ? 'PADS: ON' : 'PADS: OFF'}
          </button>
        )}
      </div>
    );

  if (isLandscapeCompact) {
    return (
      <div
        data-testid="control-layout-modal"
        className="fixed inset-0 z-[1000] bg-black/88 backdrop-blur-md flex items-center justify-center p-2"
      >
        <div className="bg-gray-950 border-4 border-cyan-400 rounded-xl shadow-[8px_8px_0_#000] w-full max-w-4xl p-3 grid grid-cols-[1.25fr_1fr] gap-3 max-h-[94dvh] text-white items-center">
          <div className="flex items-center justify-center min-w-0">{renderCanvas()}</div>

          <div className="flex flex-col justify-between gap-2.5 h-full min-w-0">
            <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-cyan-400 text-black p-1 rounded border border-black shrink-0">
                  <Move className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black italic text-cyan-300 truncate">DRAG CONTROLS</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close layout editor"
                className="bg-white text-black border-2 border-black p-1.5 rounded min-h-[34px] min-w-[34px] flex items-center justify-center font-black shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                data-testid="layout-tab-lanes"
                onClick={() => setTab('lanes')}
                className={`px-2 py-1.5 text-[11px] font-black border-2 border-black rounded min-h-[36px] ${
                  tab === 'lanes' ? 'bg-pink-500 text-black' : 'bg-gray-800 text-gray-200'
                }`}
              >
                NOTE LANES
              </button>
              <button
                data-testid="layout-tab-pads"
                onClick={() => setTab('pads')}
                className={`px-2 py-1.5 text-[11px] font-black border-2 border-black rounded min-h-[36px] ${
                  tab === 'pads' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-200'
                }`}
              >
                NOTE BUTTONS
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                data-testid="layout-orient-portrait"
                onClick={() => setOrientation('portrait')}
                className={`px-2 py-1 text-[11px] font-black border-2 border-black rounded min-h-[34px] ${
                  orientation === 'portrait' ? 'bg-cyan-400 text-black' : 'bg-gray-900 text-gray-300'
                }`}
              >
                PORTRAIT
              </button>
              <button
                data-testid="layout-orient-landscape"
                onClick={() => setOrientation('landscape')}
                className={`px-2 py-1 text-[11px] font-black border-2 border-black rounded min-h-[34px] ${
                  orientation === 'landscape' ? 'bg-cyan-400 text-black' : 'bg-gray-900 text-gray-300'
                }`}
              >
                LANDSCAPE
              </button>
            </div>

            {renderPresets()}

            <button
              data-testid="layout-done-btn"
              onClick={onClose}
              className="w-full py-2 bg-cyan-400 text-black font-black text-sm border-2 border-black rounded-lg shadow-[3px_3px_0_#000] min-h-[40px] mt-auto"
            >
              SAVE &amp; DONE
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="control-layout-modal"
      className="fixed inset-0 z-[1000] bg-black/88 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-gray-950 border-4 border-cyan-400 shadow-[10px_10px_0_#000] w-full max-w-2xl p-3 sm:p-5 flex flex-col gap-3 max-h-[95dvh] overflow-y-auto custom-scrollbar text-white">
        <div className="flex items-center justify-between gap-3 border-b-2 border-white/20 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="bg-cyan-400 text-black p-1.5 border-2 border-black">
              <Move className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-black italic text-cyan-300 tracking-wide">
                DRAG CONTROLS LAYOUT
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-300 font-bold">
                Drag gray note receptors or note buttons anywhere inside the dashed boundary
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close layout editor"
            className="bg-white text-black border-2 border-black p-2 min-h-[42px] min-w-[42px] flex items-center justify-center font-black"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <button
              data-testid="layout-tab-lanes"
              onClick={() => setTab('lanes')}
              className={`px-3 py-2 text-xs sm:text-sm font-black border-2 border-black min-h-[40px] ${
                tab === 'lanes' ? 'bg-pink-500 text-black' : 'bg-gray-800 text-gray-200'
              }`}
            >
              NOTE LANES (GRAY)
            </button>
            <button
              data-testid="layout-tab-pads"
              onClick={() => setTab('pads')}
              className={`px-3 py-2 text-xs sm:text-sm font-black border-2 border-black min-h-[40px] ${
                tab === 'pads' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-200'
              }`}
            >
              NOTE BUTTONS (PADS)
            </button>
          </div>

          <div className="flex gap-1.5">
            <button
              data-testid="layout-orient-portrait"
              onClick={() => setOrientation('portrait')}
              className={`px-2.5 py-1.5 text-xs font-black border-2 border-black min-h-[38px] ${
                orientation === 'portrait' ? 'bg-cyan-400 text-black' : 'bg-gray-900 text-gray-300'
              }`}
            >
              PORTRAIT
            </button>
            <button
              data-testid="layout-orient-landscape"
              onClick={() => setOrientation('landscape')}
              className={`px-2.5 py-1.5 text-xs font-black border-2 border-black min-h-[38px] ${
                orientation === 'landscape' ? 'bg-cyan-400 text-black' : 'bg-gray-900 text-gray-300'
              }`}
            >
              LANDSCAPE
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2.5">
          {renderCanvas()}
          {renderPresets()}
        </div>

        <button
          data-testid="layout-done-btn"
          onClick={onClose}
          className="w-full py-3 bg-cyan-400 text-black font-black text-base sm:text-lg border-4 border-black shadow-[4px_4px_0_#000] min-h-[46px]"
        >
          SAVE &amp; DONE
        </button>
      </div>
    </div>
  );
};
