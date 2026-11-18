import React, { useEffect, useState } from 'react';
import { DEFAULT_CUSTOM_KEYBINDS, LANE_COLORS_8 } from '../game/constants';
import { triggerHapticFeedback } from '../game/haptics';
import { HapticsSettings } from '../game/types';
import { Keyboard, RotateCcw, X, Check } from 'lucide-react';

interface KeybindsModalProps {
  keybinds?: string[];
  haptics?: HapticsSettings;
  onChange: (nextKeybinds: string[]) => void;
  onClose: () => void;
}

const LANE_NAMES = [
  { lane: 0, title: 'LANE 1 // LEFT', sub: 'Core Left (+ ←)' },
  { lane: 1, title: 'LANE 2 // DOWN', sub: 'Core Down (+ ↓)' },
  { lane: 2, title: 'LANE 3 // UP', sub: 'Core Up (+ ↑)' },
  { lane: 3, title: 'LANE 4 // RIGHT', sub: 'Core Right (+ →)' },
  { lane: 4, title: 'LANE 5 // EX-1', sub: '6K/8K Extra Note 1' },
  { lane: 5, title: 'LANE 6 // EX-2', sub: '6K/8K Extra Note 2' },
  { lane: 6, title: 'LANE 7 // EX-3', sub: '8K Extra Note 3' },
  { lane: 7, title: 'LANE 8 // EX-4', sub: '8K Extra Note 4' },
];

const KEYBIND_PRESETS: { name: string; keys: string[] }[] = [
  { name: 'DEFAULT (WASD + FGH;)', keys: ['A', 'S', 'W', 'D', 'F', 'G', 'H', ';'] },
  { name: 'ARCADE ROW (ASDF + JKL;)', keys: ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'] },
  { name: 'MANIA 8K (SDFG + HJKL)', keys: ['S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'] },
  { name: 'SPLIT ERGONOMIC (QWER + UIOP)', keys: ['Q', 'W', 'E', 'R', 'U', 'I', 'O', 'P'] },
];

export const KeybindsModal: React.FC<KeybindsModalProps> = ({
  keybinds,
  haptics,
  onChange,
  onClose,
}) => {
  const currentBinds =
    Array.isArray(keybinds) && keybinds.length === 8
      ? keybinds
      : DEFAULT_CUSTOM_KEYBINDS;

  const [listeningLane, setListeningLane] = useState<number | null>(null);

  useEffect(() => {
    if (listeningLane === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListeningLane(null);
        return;
      }
      let formatted = e.key.toUpperCase();
      if (e.code === 'Space' || e.key === ' ') formatted = 'SPACE';
      else if (formatted.length > 1 && e.code.startsWith('Key')) {
        formatted = e.code.replace('Key', '').toUpperCase();
      } else if (e.code.startsWith('Digit')) {
        formatted = e.code.replace('Digit', '');
      }

      const next = [...currentBinds];
      next[listeningLane] = formatted;
      onChange(next);
      triggerHapticFeedback('perfect', haptics);
      setListeningLane(null);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [listeningLane, currentBinds, onChange, haptics]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none">
      <div className="rc-panel w-full max-w-2xl border-2 border-cyan-400/50 shadow-[0_0_50px_rgba(0,240,255,0.28)] p-4 sm:p-5 max-h-[92vh] overflow-y-auto custom-scrollbar rc-modal-enter">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wider uppercase text-white">
                8-NOTE CUSTOM KEYBINDS
              </h2>
              <p className="text-[11px] text-slate-300">
                Click any lane slot below and press a key to bind all 8 notes (Arrow keys always remain active for Lanes 1–4)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/20 border border-white/20 hover:border-rose-400/50 flex items-center justify-center text-slate-200 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="mb-3.5">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            QUICK 8-KEY PRESETS
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {KEYBIND_PRESETS.map((preset) => {
              const isMatch = preset.keys.every((k, idx) => currentBinds[idx] === k);
              return (
                <button
                  key={preset.name}
                  onClick={() => {
                    onChange([...preset.keys]);
                    triggerHapticFeedback('menu', haptics);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    isMatch
                      ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                      : 'bg-slate-900/80 border-white/15 text-slate-300 hover:border-white/30'
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 8-Lane Keybind Slots */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          {LANE_NAMES.map((item) => {
            const color = LANE_COLORS_8[item.lane];
            const isListening = listeningLane === item.lane;
            const boundKey = currentBinds[item.lane] || DEFAULT_CUSTOM_KEYBINDS[item.lane];
            return (
              <button
                key={item.lane}
                onClick={() => {
                  setListeningLane(isListening ? null : item.lane);
                  triggerHapticFeedback('menu', haptics);
                }}
                className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer relative overflow-hidden ${
                  isListening
                    ? 'bg-cyan-500/25 border-cyan-300 animate-pulse shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                    : 'bg-slate-900/90 border-white/15 hover:border-white/35'
                }`}
                style={{
                  borderColor: isListening ? '#00f0ff' : `${color}66`,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-[10px] font-black uppercase tracking-wider"
                    style={{ color }}
                  >
                    {item.title}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 mb-2">{item.sub}</div>
                <div
                  className={`w-full py-2 rounded-lg text-center font-black text-sm tracking-widest uppercase border ${
                    isListening
                      ? 'bg-cyan-400 text-slate-950 border-white'
                      : 'bg-slate-950/90 text-white border-white/20'
                  }`}
                >
                  {isListening ? 'PRESS KEY...' : boundKey}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/15">
          <button
            onClick={() => {
              onChange([...DEFAULT_CUSTOM_KEYBINDS]);
              setListeningLane(null);
              triggerHapticFeedback('menu', haptics);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-black uppercase tracking-wider text-slate-200 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> RESET DEFAULTS
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
          >
            <Check className="w-4 h-4" /> SAVE KEYBINDS
          </button>
        </div>
      </div>
    </div>
  );
};
