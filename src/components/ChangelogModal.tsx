import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { CHANGELOG_VERSION } from '../game/constants';
import { useIsCompactLandscape } from '../game/useViewport';

interface ChangelogModalProps {
  onClose: () => void;
}

const CHANGELOG_HIGHLIGHTS: Array<{ title: string; detail: string; accent: string }> = [
  {
    title: 'CONSOLE OVERHAUL & LANDSCAPE LOCK',
    detail:
      'Unified beveled console UI across every menu, centered top status docks, and full widescreen FNF landscape playfields.',
    accent: 'text-pink-400',
  },
  {
    title: 'TRUE 60 FPS SMOOTH GAMEPLAY',
    detail:
      'Monotonic frame-rate audio clock and prewarmed note sprites keep note scrolling locked at smooth 60 FPS on mobile and desktop.',
    accent: 'text-cyan-300',
  },
  {
    title: 'DRAG-TO-REARRANGE LANES & PADS',
    detail:
      'Open LAYOUT from the tray or mid-game to drag both the 4 gray receptor lanes and the 4 touch pads anywhere inside boundaries.',
    accent: 'text-yellow-300',
  },
  {
    title: 'MOBILE HAPTICS + iOS TAPTIC FIX',
    detail:
      'Safari iOS switch Taptic triggers, tuned Android vibration envelopes, and Always Layer Tactile Audio inside the Haptics menu.',
    accent: 'text-emerald-400',
  },
  {
    title: 'DIRECT RECEPTOR TAPS & CONTROLLERS',
    detail:
      'Tap directly on the gray receptor notes, use spaced FNF downscroll/upscroll lanes, or connect a Bluetooth keyboard or gamepad.',
    accent: 'text-violet-300',
  },
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
  const isLandscapeCompact = useIsCompactLandscape();

  return (
    <div
      data-testid="changelog-modal"
      className="fixed inset-0 z-[1100] bg-black/85 flex items-center justify-center p-2 sm:p-5 overflow-y-auto"
    >
      <div
        className={`rc-console-tray w-full flex flex-col text-white ${
          isLandscapeCompact ? 'max-w-3xl p-3.5 gap-2.5 max-h-[93dvh]' : 'max-w-2xl p-5 gap-3.5 max-h-[90dvh]'
        }`}
      >
        <div className="rc-dock-rail flex items-center justify-between gap-3 px-3.5 py-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rc-bevel-btn rc-tile-gold text-black p-1.5 shrink-0">
              <Sparkles className={isLandscapeCompact ? 'w-4 h-4' : 'w-5 h-5'} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black tracking-widest text-cyan-300 uppercase">
                REBOOT CONSOLE UPDATE • v{CHANGELOG_VERSION}
              </div>
              <h2 className={`${isLandscapeCompact ? 'text-base' : 'text-lg sm:text-2xl'} font-black italic text-white truncate`}>
                WHAT&apos;S NEW ON THIS DEVICE
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close changelog"
            className="rc-bevel-btn rc-tile-slate text-white p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center font-black shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 grid ${
            isLandscapeCompact ? 'grid-cols-2 gap-2' : 'grid-cols-1 sm:grid-cols-2 gap-2.5'
          }`}
        >
          {CHANGELOG_HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className={`rc-console-inset ${isLandscapeCompact ? 'p-2.5' : 'p-3'}`}
            >
              <div className={`font-black text-xs sm:text-sm tracking-wide ${item.accent}`}>{item.title}</div>
              <p className="text-[11px] sm:text-xs text-slate-200 font-semibold mt-1 leading-snug">{item.detail}</p>
            </div>
          ))}
        </div>

        <button
          data-testid="changelog-close-btn"
          onClick={onClose}
          className={`rc-bevel-btn rc-tile-gold w-full text-black font-black shrink-0 whitespace-nowrap ${
            isLandscapeCompact ? 'py-2 text-sm min-h-[40px]' : 'py-2.5 text-base sm:text-lg min-h-[46px]'
          }`}
        >
          GOT IT — LET&apos;S PLAY
        </button>
      </div>
    </div>
  );
};
