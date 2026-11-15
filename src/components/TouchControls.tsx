import React, { useEffect, useRef } from 'react';
import { LANE_LABELS } from '../game/constants';
import { PAD_BUTTON_HEIGHT_PCT, PAD_BUTTON_WIDTH_PCT } from '../game/layoutConfig';
import type { PadCoord, SkinShape } from '../game/types';

interface TouchLanePadsProps {
  colors: string[];
  shape?: SkinShape;
  onLaneDown: (lane: number) => void;
  onLaneUp?: (lane: number) => void;
  pressedRef?: React.MutableRefObject<boolean[]>;
  disabled?: boolean;
  compact?: boolean;
  lanes?: number[];
  variant?: 'bar' | 'split';
  customPads?: PadCoord[] | null;
  className?: string;
}

/**
 * Zero-input-delay multi-touch lane pad strip / split cluster.
 * Uses native DOM pointer listeners with `{ passive: false }` and per-pointerId tracking
 * so chords, rapid jacks, and hold notes respond on the exact frame of finger contact
 * without React event batching or browser gesture delays.
 */
export const TouchLanePads: React.FC<TouchLanePadsProps> = ({
  colors,
  shape = 'arrow',
  onLaneDown,
  onLaneUp,
  pressedRef,
  disabled = false,
  compact = false,
  lanes = [0, 1, 2, 3],
  variant = 'bar',
  customPads = null,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const padRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const onDownRef = useRef(onLaneDown);
  const onUpRef = useRef(onLaneUp);
  onDownRef.current = onLaneDown;
  onUpRef.current = onLaneUp;

  const lanesKey = lanes.join(',');

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    const activeLanes = lanesKey.split(',').map(Number);
    const activePointers = new Map<number, number>();
    const lanePointerCounts = [0, 0, 0, 0];

    const syncVisual = (lane: number, pressed: boolean) => {
      const pad = padRefs.current[lane];
      if (pad) {
        pad.dataset.pressed = pressed ? 'true' : 'false';
      }
    };

    const resolveLaneFromPoint = (clientX: number, clientY: number): number | null => {
      const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const padEl = target?.closest?.('[data-touch-lane]') as HTMLElement | null;
      if (padEl && el.contains(padEl)) {
        const parsed = Number(padEl.dataset.touchLane);
        if (activeLanes.includes(parsed)) return parsed;
      }
      // Nearest pad center fallback for custom dragged pad layouts
      let nearestLane: number | null = null;
      let nearestDist = Infinity;
      for (const lane of activeLanes) {
        const p = padRefs.current[lane];
        if (!p) continue;
        const pr = p.getBoundingClientRect();
        const cx = pr.left + pr.width / 2;
        const cy = pr.top + pr.height / 2;
        const d = Math.hypot(clientX - cx, clientY - cy);
        if (d < Math.max(pr.width, pr.height) * 0.9 && d < nearestDist) {
          nearestDist = d;
          nearestLane = lane;
        }
      }
      if (nearestLane !== null) return nearestLane;

      const rect = el.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
      const idx = Math.min(
        activeLanes.length - 1,
        Math.max(0, Math.floor(((clientX - rect.left) / Math.max(1, rect.width)) * activeLanes.length))
      );
      return activeLanes[idx] ?? null;
    };

    const releasePointer = (pointerId: number) => {
      const lane = activePointers.get(pointerId);
      if (lane === undefined) return;
      activePointers.delete(pointerId);
      lanePointerCounts[lane] = Math.max(0, lanePointerCounts[lane] - 1);
      if (lanePointerCounts[lane] === 0) {
        syncVisual(lane, false);
        onUpRef.current?.(lane);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const lane = resolveLaneFromPoint(e.clientX, e.clientY);
      if (lane === null) return;
      try {
        (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
      } catch {
        // ignore if element cannot capture
      }
      if (activePointers.has(e.pointerId)) {
        releasePointer(e.pointerId);
      }
      activePointers.set(e.pointerId, lane);
      lanePointerCounts[lane] += 1;
      if (lanePointerCounts[lane] === 1) {
        syncVisual(lane, true);
        onDownRef.current(lane);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return;
      e.preventDefault();
      releasePointer(e.pointerId);
    };

    const handlePointerCancel = (e: PointerEvent) => {
      releasePointer(e.pointerId);
    };

    const blockTouchScroll = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    el.addEventListener('pointerdown', handlePointerDown, { passive: false });
    window.addEventListener('pointerup', handlePointerUp, { passive: false });
    window.addEventListener('pointercancel', handlePointerCancel);
    el.addEventListener('touchstart', blockTouchScroll, { passive: false });
    el.addEventListener('touchmove', blockTouchScroll, { passive: false });

    let raf = 0;
    if (pressedRef) {
      const tick = () => {
        for (const lane of activeLanes) {
          if (lanePointerCounts[lane] === 0) {
            const pad = padRefs.current[lane];
            const shouldBePressed = Boolean(pressedRef.current[lane]);
            if (pad && (pad.dataset.pressed === 'true') !== shouldBePressed) {
              pad.dataset.pressed = shouldBePressed ? 'true' : 'false';
            }
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      el.removeEventListener('touchstart', blockTouchScroll);
      el.removeEventListener('touchmove', blockTouchScroll);
    };
  }, [disabled, pressedRef, lanesKey]);

  const hasCustomPads = Array.isArray(customPads) && customPads.length === 4 && variant === 'bar';
  const isSplit = variant === 'split';
  const gridColsClass = lanes.length === 2 ? 'grid-cols-2' : 'grid-cols-4';
  const heightClass = isSplit
    ? 'h-[clamp(76px,30dvh,128px)]'
    : compact
    ? 'h-14 sm:h-16'
    : 'h-[76px] sm:h-20';

  if (hasCustomPads) {
    return (
      <div
        ref={containerRef}
        data-testid="touch-lane-pads"
        data-custom-pads="true"
        className={`touch-surface relative w-full max-w-[600px] ${
          compact ? 'h-[clamp(96px,20dvh,132px)]' : 'h-[clamp(124px,22dvh,172px)]'
        } select-none ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
      >
        {lanes.map((lane) => {
          const pos = customPads[lane] || { xPct: 4 + lane * 24, yPct: 28 };
          const color = colors[lane] || '#ffffff';
          const rotation = lane === 0 ? -90 : lane === 1 ? 180 : lane === 2 ? 0 : 90;
          return (
            <div
              key={lane}
              ref={(el) => {
                padRefs.current[lane] = el;
              }}
              data-touch-lane={lane}
              data-testid={`touch-lane-${lane}`}
              data-pressed="false"
              role="button"
              aria-label={`Lane ${lane + 1} ${LANE_LABELS[lane]}`}
              className="touch-pad absolute flex items-center justify-center border-4 border-black shadow-[0_5px_0_#000] rounded-xl cursor-pointer"
              style={{
                left: `${pos.xPct}%`,
                top: `${pos.yPct}%`,
                width: `${PAD_BUTTON_WIDTH_PCT}%`,
                height: `${PAD_BUTTON_HEIGHT_PCT}%`,
                backgroundColor: '#0c1020',
                borderColor: color,
                color,
                boxShadow: `0 5px 0 #000, inset 0 0 18px ${color}33`,
              }}
            >
              {shape === 'circle' ? (
                <div
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-4 border-white flex items-center justify-center pointer-events-none"
                  style={{ backgroundColor: color }}
                >
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white" />
                </div>
              ) : (
                <svg
                  viewBox="0 0 40 40"
                  className="w-8 h-8 sm:w-10 sm:h-10 pointer-events-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                  style={{ transform: `rotate(${rotation}deg)` }}
                >
                  <polygon
                    points="20,2 38,20 29,20 29,38 11,38 11,20 2,20"
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid={isSplit ? `touch-lane-split-${lanes.join('')}` : 'touch-lane-pads'}
      className={`touch-surface w-full ${isSplit ? 'max-w-none px-1' : 'max-w-[560px] px-2'} grid ${gridColsClass} gap-3 sm:gap-4 select-none ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${className}`}
    >
      {lanes.map((lane) => {
        const color = colors[lane] || '#ffffff';
        const rotation = lane === 0 ? -90 : lane === 1 ? 180 : lane === 2 ? 0 : 90;
        return (
          <div
            key={lane}
            ref={(el) => {
              padRefs.current[lane] = el;
            }}
            data-touch-lane={lane}
            data-testid={`touch-lane-${lane}`}
            data-pressed="false"
            role="button"
            aria-label={`Lane ${lane + 1} ${LANE_LABELS[lane]}`}
            className={`touch-pad relative flex items-center justify-center border-4 border-black shadow-[0_6px_0_#000] rounded-xl cursor-pointer ${heightClass}`}
            style={{
              backgroundColor: '#0c1020',
              borderColor: color,
              color,
              boxShadow: `0 5px 0 #000, inset 0 0 18px ${color}33`,
            }}
          >
            {shape === 'circle' ? (
              <div
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full border-4 border-white flex items-center justify-center pointer-events-none"
                style={{ backgroundColor: color }}
              >
                <div className="w-4 h-4 rounded-full border-2 border-white" />
              </div>
            ) : (
              <svg
                viewBox="0 0 40 40"
                className="w-9 h-9 sm:w-11 sm:h-11 pointer-events-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                <polygon
                  points="20,2 38,20 29,20 29,38 11,38 11,20 2,20"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
};
