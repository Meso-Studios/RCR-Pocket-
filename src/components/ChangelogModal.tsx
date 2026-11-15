import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { CHANGELOG_VERSION } from '../game/constants';
import { useIsCompactLandscape } from '../game/useViewport';

interface ChangelogModalProps {
  onClose: () => void;
}

const CHANGELOG_HIGHLIGHTS: Array<{ title: string; detail: string; color: string }> = [
  {
    title: 'TRUE 60 FPS SMOOTH GAMEPLAY',
    detail:
      'Replaced stepped audio timestamps with a monotonic frame-rate clock, opaque fast canvas compositing, and stabilized animation frames to eliminate 30fps stutter on mobile.',
    color: 'border-cyan-400 text-cyan-300',
  },
  {
    title: 'DRAG-TO-REARRANGE NOTE LANES & BUTTONS',
    detail:
      'Open LAYOUT in Settings or mid-game to drag both the 4 gray receptor lanes and the 4 on-screen note buttons anywhere inside their boundaries for Portrait and Landscape.',
    color: 'border-pink-400 text-pink-300',
  },
  {
    title: 'WIDER PORTRAIT PLAY SCREEN & SPACING',
    detail:
      'Expanded the portrait playfield width with wider spacing between gray receptor notes so thumb taps feel natural without cramped overlaps.',
    color: 'border-yellow-400 text-yellow-300',
  },
  {
    title: 'MOBILE HAPTICS + iOS TAPTIC FIX',
    detail:
      'Added Safari iOS switch Taptic triggers, longer Android vibration envelopes, and an Always Layer Tactile Audio option inside the Haptics mini menu.',
    color: 'border-green-400 text-green-300',
  },
  {
    title: 'FNF LANDSCAPE, DIRECT RECEPTOR TAPS & CONTROLLERS',
    detail:
      'Tap directly on the gray notes, play FNF-style spaced bottom receptors in landscape downscroll, or connect a Bluetooth keyboard or controller.',
    color: 'border-purple-400 text-purple-300',
  },
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
  const isLandscapeCompact = useIsCompactLandscape();

  return (
    <div
      data-testid="changelog-modal"
      className="fixed inset-0 z-[1100] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-5 overflow-y-auto"
    >
      <div
        className={`bg-gray-950 border-4 border-yellow-400 shadow-[10px_10px_0_#000] w-full flex flex-col text-white ${
          isLandscapeCompact ? 'max-w-3xl p-3.5 gap-2.5 max-h-[93dvh]' : 'max-w-xl p-4 sm:p-6 gap-3 max-h-[90dvh]'
        }`}
      >
        <div className={`flex items-start justify-between gap-3 border-b-2 border-white/20 shrink-0 ${isLandscapeCompact ? 'pb-2' : 'pb-3'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`bg-yellow-400 text-black border-2 border-black shrink-0 ${isLandscapeCompact ? 'p-1.5' : 'p-2'}`}>
              <Sparkles className={isLandscapeCompact ? 'w-4 h-4' : 'w-6 h-6'} />
            </div>
            <div>
              <div className="text-[11px] font-black tracking-widest text-pink-400 uppercase">
                MOBILE REBOOT UPDATE • v{CHANGELOG_VERSION}
              </div>
              <h2 className={`${isLandscapeCompact ? 'text-lg' : 'text-xl sm:text-3xl'} font-black italic text-white`}>
                WHAT&apos;S NEW ON THIS DEVICE
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close changelog"
            className="bg-white text-black border-2 border-black p-1.5 min-h-[38px] min-w-[38px] flex items-center justify-center font-black shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 ${
            isLandscapeCompact ? 'grid grid-cols-2 gap-2' : 'space-y-2.5'
          }`}
        >
          {CHANGELOG_HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className={`bg-gray-900/90 border-l-4 rounded-r-lg ${item.color} ${
                isLandscapeCompact ? 'p-2.5' : 'p-3'
              }`}
            >
              <div className="font-black text-xs sm:text-sm tracking-wide">{item.title}</div>
              <p className="text-[11px] sm:text-xs text-gray-200 font-semibold mt-0.5 leading-snug">{item.detail}</p>
            </div>
          ))}
        </div>

        <button
          data-testid="changelog-close-btn"
          onClick={onClose}
          className={`w-full bg-yellow-400 text-black font-black border-4 border-black shadow-[4px_4px_0_#000] shrink-0 ${
            isLandscapeCompact ? 'py-2 text-sm min-h-[40px]' : 'py-3 text-lg sm:text-xl min-h-[48px]'
          }`}
        >
          GOT IT — LET&apos;S PLAY
        </button>
      </div>
    </div>
  );
};
