import React from 'react';
import { RotateCcw, Smartphone, Vibrate, Volume2, X, Zap } from 'lucide-react';
import { AudioEngine } from '../game/audio';
import {
  DEFAULT_HAPTICS_SETTINGS,
  isHardwareVibrationSupported,
  isIOSSwitchHapticSupported,
  normalizeHapticsSettings,
  triggerHaptic,
} from '../game/haptics';
import { useIsCompactLandscape } from '../game/useViewport';
import type { HapticsSettings, HapticsTriggers } from '../game/types';

interface HapticsSettingsModalProps {
  settings?: Partial<HapticsSettings> | null;
  onChange: (next: HapticsSettings) => void;
  onClose: () => void;
}

const TRIGGER_LABELS: Array<{ key: keyof HapticsTriggers; label: string; desc: string }> = [
  { key: 'onPress', label: 'Note / Lane Tap', desc: 'Light crisp tick the instant you tap a receptor' },
  { key: 'onHit', label: 'Note Hit', desc: 'Punchy pulse when hitting a note on beat' },
  { key: 'onHoldTick', label: 'Hold Tail Tick', desc: 'Subtle rhythmic pulse while holding long notes' },
  { key: 'onMiss', label: 'Miss / Let Go', desc: 'Double buzz warning on missed notes' },
  { key: 'onDemon', label: 'Demon Note', desc: 'Heavy triple alert on demon hazard hit' },
  { key: 'onComboMilestone', label: '25x Combo Milestone', desc: 'Celebration pop every 25 combo streak' },
  { key: 'onMenuTap', label: 'Menu Navigation', desc: 'Micro feedback on buttons and toggles' },
];

const INTENSITY_PRESETS = [
  { label: 'LIGHT', value: 30 },
  { label: 'MEDIUM', value: 60 },
  { label: 'STRONG', value: 85 },
  { label: 'MAX', value: 100 },
];

export const HapticsSettingsModal: React.FC<HapticsSettingsModalProps> = ({ settings, onChange, onClose }) => {
  const isLandscapeCompact = useIsCompactLandscape();
  const current = normalizeHapticsSettings(settings);
  const hwSupported = isHardwareVibrationSupported();
  const iosTapticSupported = isIOSSwitchHapticSupported();

  const update = (patch: Partial<HapticsSettings>) => {
    const next = normalizeHapticsSettings({
      ...current,
      ...patch,
      triggers: patch.triggers ? { ...current.triggers, ...patch.triggers } : current.triggers,
    });
    onChange(next);
  };

  const toggleTrigger = (key: keyof HapticsTriggers) => {
    AudioEngine.init();
    const next = normalizeHapticsSettings({
      ...current,
      triggers: { ...current.triggers, [key]: !current.triggers[key] },
    });
    onChange(next);
    triggerHaptic('menuTap', next);
  };

  return (
    <div
      data-testid="haptics-settings-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Haptics Settings"
    >
      <div
        className={`rc-console-tray w-full max-h-[94dvh] flex flex-col overflow-hidden text-white ${
          isLandscapeCompact ? 'max-w-3xl p-3 gap-2' : 'max-w-2xl p-4 gap-3'
        }`}
      >
        {/* Header */}
        <div
          className={`rc-dock-rail flex items-center justify-between gap-3 shrink-0 ${
            isLandscapeCompact ? 'px-3 py-1.5' : 'px-4 py-2.5'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`${isLandscapeCompact ? 'w-7 h-7' : 'w-9 h-9'} rc-bevel-btn rc-tile-gold text-black flex items-center justify-center shrink-0`}>
              <Vibrate className={isLandscapeCompact ? 'w-4 h-4' : 'w-5 h-5'} />
            </div>
            <div className="min-w-0">
              <h2 className={`${isLandscapeCompact ? 'text-base' : 'text-lg sm:text-xl'} font-black italic tracking-wide uppercase truncate`}>
                HAPTICS SETTINGS
              </h2>
              <p className="text-[11px] font-bold text-cyan-300 truncate">
                {hwSupported
                  ? 'Hardware Vibration + Tactile Audio Ready'
                  : iosTapticSupported
                  ? 'iOS Taptic Switch + Tactile Audio Active'
                  : 'Tactile Audio Pulse Engine Active'}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="haptics-close-btn"
            onClick={() => {
              triggerHaptic('menuTap', current);
              onClose();
            }}
            className="rc-bevel-btn rc-tile-slate text-white p-1.5 font-black min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            aria-label="Close haptics settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className={`flex-1 overflow-y-auto custom-scrollbar pr-1 ${isLandscapeCompact ? 'space-y-2' : 'space-y-3'}`}>
          {/* Master Toggle */}
          <div className="rc-console-inset flex items-center justify-between gap-3 p-3">
            <div>
              <div className="font-black text-sm sm:text-base tracking-wider">MASTER HAPTICS</div>
              <div className="text-xs text-slate-300">Enable tactile feedback during gameplay and menus</div>
            </div>
            <button
              type="button"
              data-testid="haptics-master-toggle"
              onClick={() => {
                const next = { ...current, enabled: !current.enabled };
                onChange(next);
                if (next.enabled) triggerHaptic('hit', next, 'sick');
              }}
              className={`rc-bevel-btn px-5 py-2 font-black text-sm min-w-[88px] min-h-[42px] whitespace-nowrap ${
                current.enabled ? 'rc-tile-green text-black' : 'rc-tile-slate text-slate-300'
              }`}
            >
              {current.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Intensity Slider + Presets */}
          <div className="rc-console-inset p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="haptics-intensity" className="font-black text-sm sm:text-base tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                INTENSITY
              </label>
              <span data-testid="haptics-intensity-value" className="font-black text-lg text-cyan-300 tabular-nums">
                {current.intensity}%
              </span>
            </div>
            <input
              id="haptics-intensity"
              data-testid="haptics-intensity-slider"
              type="range"
              min={10}
              max={100}
              step={5}
              value={current.intensity}
              disabled={!current.enabled}
              onChange={(e) => update({ intensity: Number(e.target.value) })}
              className="w-full accent-cyan-400 h-3 cursor-pointer disabled:opacity-40"
            />
            <div className="grid grid-cols-4 gap-2">
              {INTENSITY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={!current.enabled}
                  onClick={() => {
                    const next = normalizeHapticsSettings({ ...current, intensity: preset.value });
                    onChange(next);
                    triggerHaptic('hit', next, 'sick');
                  }}
                  className={`rc-bevel-btn py-2 px-1 font-black text-xs min-h-[38px] disabled:opacity-40 whitespace-nowrap ${
                    Math.abs(current.intensity - preset.value) <= 5
                      ? 'rc-tile-cyan text-black'
                      : 'rc-sub-dark text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pulse Duration Slider */}
          <div className="rc-console-inset p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="haptics-duration" className="font-black text-sm sm:text-base tracking-wider flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-pink-400" />
                PULSE LENGTH
              </label>
              <span data-testid="haptics-duration-value" className="font-black text-lg text-pink-300 tabular-nums">
                {current.pulseDurationMs}ms
              </span>
            </div>
            <input
              id="haptics-duration"
              data-testid="haptics-duration-slider"
              type="range"
              min={8}
              max={60}
              step={2}
              value={current.pulseDurationMs}
              disabled={!current.enabled}
              onChange={(e) => update({ pulseDurationMs: Number(e.target.value) })}
              className="w-full accent-pink-400 h-3 cursor-pointer disabled:opacity-40"
            />
            <div className="flex justify-between text-[11px] font-bold text-slate-400">
              <span>8ms (Snappy)</span>
              <span>22ms (Arcade)</span>
              <span>60ms (Heavy)</span>
            </div>
          </div>

          {/* Behavior Modifiers */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="haptics-accuracy-toggle"
              disabled={!current.enabled}
              onClick={() => {
                const next = normalizeHapticsSettings({ ...current, accuracyScaling: !current.accuracyScaling });
                onChange(next);
                triggerHaptic('hit', next, 'sick');
              }}
              className={`rc-panel flex items-center justify-between gap-2 p-3 text-left transition-colors min-h-[54px] disabled:opacity-40 ${
                current.accuracyScaling ? 'border-cyan-400' : ''
              }`}
            >
              <div>
                <div className="font-black text-xs sm:text-sm">ACCURACY SCALING</div>
                <div className="text-[11px] text-slate-300">SICK!! hits pulse stronger than BAD</div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-black shrink-0 ${
                  current.accuracyScaling ? 'bg-cyan-400 text-black' : 'bg-[#0d1018] text-slate-400'
                }`}
              >
                {current.accuracyScaling ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              data-testid="haptics-audio-fallback-toggle"
              disabled={!current.enabled}
              onClick={() => {
                AudioEngine.init();
                const next = normalizeHapticsSettings({ ...current, audioFallback: !current.audioFallback });
                onChange(next);
                triggerHaptic('hit', next, 'sick');
              }}
              className={`rc-panel flex items-center justify-between gap-2 p-3 text-left transition-colors min-h-[54px] disabled:opacity-40 ${
                current.audioFallback ? 'border-violet-400' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="font-black text-xs sm:text-sm flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                  TACTILE THUMP
                </div>
                <div className="text-[11px] text-slate-300">Chassis pulse for iOS & preview frames</div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-black shrink-0 ${
                  current.audioFallback ? 'bg-violet-400 text-black' : 'bg-[#0d1018] text-slate-400'
                }`}
              >
                {current.audioFallback ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              data-testid="haptics-always-audio-toggle"
              disabled={!current.enabled}
              onClick={() => {
                AudioEngine.init();
                const next = normalizeHapticsSettings({
                  ...current,
                  alwaysAudioAssist: !current.alwaysAudioAssist,
                });
                onChange(next);
                triggerHaptic('hit', next, 'sick');
              }}
              className={`col-span-2 rc-panel flex items-center justify-between gap-2 p-3 text-left transition-colors min-h-[52px] disabled:opacity-40 ${
                current.alwaysAudioAssist ? 'border-yellow-400' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="font-black text-xs sm:text-sm">ALWAYS LAYER TACTILE AUDIO</div>
                <div className="text-[11px] text-slate-300">
                  Play crisp acoustic thump alongside motor vibration on every tap & hit
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-black shrink-0 ${
                  current.alwaysAudioAssist ? 'bg-yellow-400 text-black' : 'bg-[#0d1018] text-slate-400'
                }`}
              >
                {current.alwaysAudioAssist ? 'ON' : 'AUTO'}
              </span>
            </button>
          </div>

          {/* Individual Activation Triggers */}
          <div className="rc-console-inset p-3.5 space-y-2">
            <div className="font-black text-xs sm:text-sm tracking-wider text-yellow-300">WHEN HAPTICS ACTIVATE</div>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_LABELS.map((item) => {
                const active = current.triggers[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-testid={`haptics-trigger-${item.key}`}
                    disabled={!current.enabled}
                    onClick={() => toggleTrigger(item.key)}
                    className={`rc-panel flex items-center justify-between gap-2 p-2.5 text-left transition-colors min-h-[48px] disabled:opacity-40 ${
                      active ? 'border-emerald-400' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-black text-xs text-white truncate">{item.label}</div>
                      <div className="text-[10px] text-slate-400 leading-tight">{item.desc}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-black shrink-0 ${
                        active ? 'bg-emerald-400 text-black' : 'bg-[#0d1018] text-slate-400'
                      }`}
                    >
                      {active ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Test Buttons */}
          <div className="rc-console-inset p-3.5">
            <div className="font-black text-xs tracking-wider text-slate-300 mb-2">TEST HAPTIC FEEL</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="haptics-test-hit"
                disabled={!current.enabled}
                onClick={() => {
                  AudioEngine.init();
                  triggerHaptic('hit', current, 'sick');
                }}
                className="rc-bevel-btn rc-tile-cyan text-black font-black text-xs sm:text-sm py-2 min-h-[42px] disabled:opacity-40 whitespace-nowrap"
              >
                TEST HIT
              </button>
              <button
                type="button"
                data-testid="haptics-test-miss"
                disabled={!current.enabled}
                onClick={() => {
                  AudioEngine.init();
                  triggerHaptic('miss', current);
                }}
                className="rc-bevel-btn rc-tile-red text-white font-black text-xs sm:text-sm py-2 min-h-[42px] disabled:opacity-40 whitespace-nowrap"
              >
                TEST MISS
              </button>
              <button
                type="button"
                data-testid="haptics-test-milestone"
                disabled={!current.enabled}
                onClick={() => {
                  AudioEngine.init();
                  triggerHaptic('comboMilestone', current);
                }}
                className="rc-bevel-btn rc-tile-gold text-black font-black text-xs sm:text-sm py-2 min-h-[42px] disabled:opacity-40 whitespace-nowrap"
              >
                TEST 25x
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="rc-dock-rail flex items-center justify-between gap-3 px-3 py-2 shrink-0">
          <button
            type="button"
            data-testid="haptics-reset-btn"
            onClick={() => {
              onChange(DEFAULT_HAPTICS_SETTINGS);
              triggerHaptic('menuTap', DEFAULT_HAPTICS_SETTINGS);
            }}
            className="rc-bevel-btn rc-tile-slate flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-slate-200 min-h-[36px] whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET DEFAULTS
          </button>

          <button
            type="button"
            data-testid="haptics-done-btn"
            onClick={() => {
              triggerHaptic('menuTap', current);
              onClose();
            }}
            className="rc-bevel-btn rc-tile-gold px-5 py-2 text-black font-black text-sm min-h-[38px] whitespace-nowrap"
          >
            SAVE &amp; CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
