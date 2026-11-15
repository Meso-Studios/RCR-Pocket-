import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { CHANGELOG_VERSION } from '../game/constants';

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
  return (
    <div
      data-testid="changelog-modal"
      className="fixed inset-0 z-[1100] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="bg-gray-950 border-4 border-yellow-400 shadow-[10px_10px_0_#000] w-full max-w-xl p-4 sm:p-6 flex flex-col gap-3 max-h-[90dvh] text-white">
        <div className="flex items-start justify-between gap-3 border-b-2 border-white/20 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-yellow-400 text-black p-2 border-2 border-black shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-black tracking-widest text-pink-400 uppercase">
                MOBILE REBOOT UPDATE • v{CHANGELOG_VERSION}
              </div>
              <h2 className="text-xl sm:text-3xl font-black italic text-white">
                WHAT&apos;S NEW ON THIS DEVICE
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close changelog"
            className="bg-white text-black border-2 border-black p-2 min-h-[42px] min-w-[42px] flex items-center justify-center font-black shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
          {CHANGELOG_HIGHLIGHTS.map((item) => (
            <div key={item.title} className={`bg-gray-900/90 border-l-4 p-3 rounded-r-lg ${item.color}`}>
              <div className="font-black text-sm sm:text-base tracking-wide">{item.title}</div>
              <p className="text-xs sm:text-sm text-gray-200 font-semibold mt-0.5 leading-snug">{item.detail}</p>
            </div>
          ))}
        </div>

        <button
          data-testid="changelog-close-btn"
          onClick={onClose}
          className="w-full py-3 bg-yellow-400 text-black font-black text-lg sm:text-xl border-4 border-black shadow-[4px_4px_0_#000] min-h-[48px] shrink-0"
        >
          GOT IT — LET&apos;S PLAY
        </button>
      </div>
    </div>
  );
};
