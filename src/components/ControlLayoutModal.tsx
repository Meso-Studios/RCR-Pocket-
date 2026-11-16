import React, { useRef, useState } from 'react';
import { Move, RotateCcw, Smartphone, X } from 'lucide-react';
import {
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
  initialOrientation: _initialOrientation,
  showTouchPads,
  onToggleTouchPads,
  onChange,
  onClose,
}) => {
  void _initialOrientation;
  const [tab, setTab] = useState<'lanes' | 'pads'>('lanes');
  const [activeDragIdx, setActiveDragIdx] = useState<number | null>(null);
  const isLandscapeCompact = useIsCompactLandscape();

  const normalized = normalizeControlLayout(controlLayout);
  const isLandscape = true;
  const playWidth = LANDSCAPE_CANVAS_WIDTH;
  const playHeight = LANDSCAPE_CANVAS_HEIGHT;
  const noteSize = 74;

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
          onClick={() => updateLanes(getDefaultLaneCoords(true, downscroll))}
          className="rc-bevel-btn rc-tile-cyan text-black px-2.5 py-1.5 text-xs font-black min-h-[34px] whitespace-nowrap"
        >
          EVENLY SPACE
        </button>
        <button
          onClick={() => updateLanes([3, 2, 1, 0].map((idx) => currentLaneCoords[idx]))}
          className="rc-bevel-btn rc-tile-violet text-white px-2.5 py-1.5 text-xs font-black min-h-[34px] whitespace-nowrap"
        >
          MIRROR SWAP
        </button>
        <button
          data-testid="layout-reset-btn"
          onClick={() => updateLanes(null)}
          className="rc-bevel-btn rc-tile-slate text-white px-2.5 py-1.5 text-xs font-black flex items-center gap-1 min-h-[34px] whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" /> RESET
        </button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          onClick={() => updatePads(getDefaultPadCoords('row'))}
          className="rc-bevel-btn rc-tile-cyan text-black px-2.5 py-1.5 text-xs font-black min-h-[34px] whitespace-nowrap"
        >
          ROW
        </button>
        <button
          onClick={() => updatePads(getDefaultPadCoords('split'))}
          className="rc-bevel-btn rc-tile-pink text-white px-2.5 py-1.5 text-xs font-black min-h-[34px] whitespace-nowrap"
        >
          SPLIT 2+2
        </button>
        <button
          onClick={() => updatePads(getDefaultPadCoords('arc'))}
          className="rc-bevel-btn rc-tile-gold text-black px-2.5 py-1.5 text-xs font-black min-h-[34px] whitespace-nowrap"
        >
          THUMB ARC
        </button>
        <button
          data-testid="layout-reset-btn"
          onClick={() => updatePads(null)}
          className="rc-bevel-btn rc-tile-slate text-white px-2.5 py-1.5 text-xs font-black flex items-center gap-1 min-h-[34px] whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" /> RESET
        </button>
        {onToggleTouchPads && (
          <button
            onClick={onToggleTouchPads}
            className={`rc-bevel-btn px-2.5 py-1.5 text-xs font-black flex items-center gap-1 min-h-[34px] whitespace-nowrap ${
              showTouchPads ? 'rc-tile-cyan text-black' : 'rc-tile-slate text-slate-300'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            {showTouchPads ? 'PADS: ON' : 'PADS: OFF'}
          </button>
        )}
      </div>
    );

  return (
    <div
      data-testid="control-layout-modal"
      className="fixed inset-0 z-[1000] bg-black/85 flex items-center justify-center p-2 sm:p-4"
    >
      <div
        className={`rc-console-tray w-full max-w-4xl grid grid-cols-[1.25fr_1fr] gap-3 max-h-[94dvh] text-white items-center ${
          isLandscapeCompact ? 'p-3' : 'p-4 sm:p-5'
        }`}
      >
        <div className="rc-console-inset p-2.5 flex items-center justify-center min-w-0 h-full">{renderCanvas()}</div>

        <div className="flex flex-col justify-between gap-2.5 h-full min-w-0">
          <div className="rc-dock-rail flex items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="rc-bevel-btn rc-tile-cyan text-black p-1 shrink-0">
                <Move className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-black italic text-white truncate">DRAG CONTROLS</h2>
                <p className="text-[10px] font-black text-cyan-300 tracking-wider uppercase truncate">
                  LANDSCAPE PLAYFIELD
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close layout editor"
              className="rc-bevel-btn rc-tile-slate text-white p-1.5 min-h-[34px] min-w-[34px] flex items-center justify-center font-black shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              data-testid="layout-tab-lanes"
              onClick={() => setTab('lanes')}
              className={`rc-bevel-btn px-2 py-2 text-xs font-black min-h-[38px] whitespace-nowrap ${
                tab === 'lanes' ? 'rc-tile-pink text-white' : 'rc-tile-slate text-slate-300'
              }`}
            >
              NOTE LANES
            </button>
            <button
              data-testid="layout-tab-pads"
              onClick={() => setTab('pads')}
              className={`rc-bevel-btn px-2 py-2 text-xs font-black min-h-[38px] whitespace-nowrap ${
                tab === 'pads' ? 'rc-tile-gold text-black' : 'rc-tile-slate text-slate-300'
              }`}
            >
              NOTE BUTTONS
            </button>
          </div>

          <div className="rc-console-inset p-2.5 space-y-2">
            <div className="text-[10px] font-black text-slate-300 tracking-widest uppercase text-center">
              Drag Inside Dashed Boundary • Presets
            </div>
            {renderPresets()}
          </div>

          <button
            data-testid="layout-done-btn"
            onClick={onClose}
            className="rc-bevel-btn rc-tile-cyan w-full py-2.5 text-black font-black text-sm min-h-[42px] mt-auto whitespace-nowrap"
          >
            SAVE &amp; DONE
          </button>
        </div>
      </div>
    </div>
  );
};
