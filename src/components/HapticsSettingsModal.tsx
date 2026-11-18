import React, { useState } from 'react';
import { HapticsSettings } from '../game/types';
import { DEFAULT_HAPTICS } from '../game/constants';
import { triggerHapticFeedback } from '../game/haptics';
import { AudioEngine } from '../game/audio';
import { Vibrate, Volume2, Smartphone, Sparkles, AlertTriangle, MousePointerClick, X, Music2 } from 'lucide-react';

interface HapticsSettingsModalProps {
  settings?: HapticsSettings;
  onChange: (next: HapticsSettings) => void;
  onClose: () => void;
}

export const HapticsSettingsModal: React.FC<HapticsSettingsModalProps> = ({
  settings,
  onChange,
  onClose,
}) => {
  const current: HapticsSettings = { ...DEFAULT_HAPTICS, ...(settings || {}) };
  const [testingHoldRiser, setTestingHoldRiser] = useState(false);

  const update = (patch: Partial<HapticsSettings>) => {
    const next = { ...current, ...patch };
    onChange(next);
    triggerHapticFeedback('menu', next);
  };

  const testMikuHoldEffect = () => {
    if (testingHoldRiser) return;
    setTestingHoldRiser(true);
    const vol = current.holdEffectVolume ?? 80;
    const start = performance.now();
    const duration = 1200; // 1.2s hold note demo
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const p = Math.min(1, elapsed / duration);
      AudioEngine.updateMikuHoldRiser(2, p, vol);
      triggerHapticFeedback('hold_crescendo', current, p);
      if (p >= 1) {
        clearInterval(interval);
        AudioEngine.stopMikuHoldRiser(2, true, vol);
        triggerHapticFeedback('hold_complete', current, 1);
        setTestingHoldRiser(false);
      }
    }, 65);
  };

  const toggleItems: {
    key: keyof HapticsSettings;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'gameplayHits',
      label: 'Note Hit Vibration',
      desc: 'Physical vibration & iOS Taptic Engine feedback on note strikes',
      icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
    },
    {
      key: 'holdPulses',
      label: '1s+ Hold Note Haptic Crescendo',
      desc: 'Intensifying iOS Taptic / vibration pulses + release pulse on 1.0s+ hold notes',
      icon: <Vibrate className="w-4 h-4 text-emerald-400" />,
    },
    {
      key: 'missAlerts',
      label: 'Miss & Mine Shock',
      desc: 'Heavy double-pulse vibration on missed notes or mines',
      icon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
    },
    {
      key: 'menuNavigation',
      label: 'Menu Button Tactile Clicks',
      desc: 'Crisp physical micro-pulse when tapping console buttons',
      icon: <MousePointerClick className="w-4 h-4 text-amber-400" />,
    },
    {
      key: 'visualShake',
      label: 'Screen Impact Micro-Shake',
      desc: 'Visual screen punch synced with heavy note hits',
      icon: <Smartphone className="w-4 h-4 text-fuchsia-400" />,
    },
    {
      key: 'soundPulse',
      label: 'Sub-Bass Speaker Thump (Optional)',
      desc: 'Optional low-frequency speaker resonance alongside physical device vibration',
      icon: <Volume2 className="w-4 h-4 text-sky-400" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 select-none">
      <div className="rc-panel w-full max-w-xl border-2 border-cyan-400/50 shadow-[0_0_50px_rgba(0,240,255,0.25)] p-4 sm:p-5 max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
              <Vibrate className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wider uppercase text-white">
                HAPTICS & HOLD SYNTH ENGINE
              </h2>
              <p className="text-[11px] text-slate-300">
                iOS 17.4+/18 Safari Taptic Engine + Navigator Vibration + Project DIVA 1s+ Hold Riser
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

        {/* Master Toggle + Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-900/90 border border-white/15 rounded-xl p-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-white">
                Master Haptics
              </div>
              <div className="text-[10px] text-slate-400">
                {current.enabled ? 'ACTIVE ON DEVICE' : 'DISABLED'}
              </div>
            </div>
            <button
              onClick={() => update({ enabled: !current.enabled })}
              className={`px-3.5 py-1.5 rounded-lg font-black text-xs uppercase tracking-wider border transition-all cursor-pointer ${
                current.enabled
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-slate-800 border-white/15 text-slate-400'
              }`}
            >
              {current.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="bg-slate-900/90 border border-white/15 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Vibration Strength
              </span>
              <span className="text-xs font-black text-cyan-300">{current.intensity}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={current.intensity}
              disabled={!current.enabled}
              onChange={(e) => update({ intensity: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Hatsune Miku / Project DIVA 1s+ Hold Note Rising Effect Volume Slider */}
        <div className="bg-gradient-to-r from-cyan-950/60 via-slate-900/90 to-fuchsia-950/50 border border-cyan-400/40 rounded-xl p-3.5 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Music2 className="w-4 h-4 text-cyan-300" />
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-white">
                  1.0s+ Hold Note Rising Synth Volume (DIVA Trigger FX)
                </div>
                <div className="text-[10px] text-slate-300">
                  Rising harmonic synth + intensifying haptics & end pulse on hold notes 1 second or longer
                </div>
              </div>
            </div>
            <span className="text-xs font-black text-cyan-300 px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30">
              {current.holdEffectVolume ?? 80}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={current.holdEffectVolume ?? 80}
            onChange={(e) => update({ holdEffectVolume: Number(e.target.value) })}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>

        {/* Per-channel options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
          {toggleItems.map((item) => {
            const active = Boolean(current[item.key]);
            return (
              <button
                key={item.key}
                disabled={!current.enabled}
                onClick={() => update({ [item.key]: !active } as Partial<HapticsSettings>)}
                className={`text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                  !current.enabled
                    ? 'opacity-40 bg-slate-900/40 border-white/10 cursor-not-allowed'
                    : active
                    ? 'bg-slate-900/90 border-cyan-400/50 shadow-[0_0_14px_rgba(0,240,255,0.12)]'
                    : 'bg-slate-950/70 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="mt-0.5 p-1.5 rounded-lg bg-white/5 border border-white/10">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-black text-white truncate">{item.label}</span>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                        active
                          ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/40'
                          : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      {active ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{item.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Test Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/15">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => triggerHapticFeedback('perfect', current)}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 font-black text-xs uppercase tracking-wider cursor-pointer transition-all"
            >
              TEST PERFECT HIT
            </button>
            <button
              onClick={testMikuHoldEffect}
              disabled={testingHoldRiser}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 font-black text-xs uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50"
            >
              {testingHoldRiser ? 'RISING HOLD...' : 'TEST 1S+ HOLD RISER'}
            </button>
            <button
              onClick={() => triggerHapticFeedback('miss', current)}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-200 font-black text-xs uppercase tracking-wider cursor-pointer transition-all"
            >
              TEST MISS SHOCK
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white text-slate-950 font-black text-xs uppercase tracking-wider hover:bg-cyan-300 transition-colors cursor-pointer"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
