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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Haptics Settings"
    >
      <div
        className={`w-full max-h-[94dvh] flex flex-col bg-gray-950 border-4 border-cyan-400 shadow-[10px_10px_0_#000] rounded-2xl overflow-hidden text-white ${
          isLandscapeCompact ? 'max-w-2xl' : 'max-w-xl'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 bg-gradient-to-r from-cyan-500/20 via-purple-600/20 to-pink-500/20 border-b-4 border-cyan-400 shrink-0 ${
            isLandscapeCompact ? 'px-4 py-2' : 'px-4 sm:px-6 py-3'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`${isLandscapeCompact ? 'w-7 h-7' : 'w-9 h-9'} rounded-lg bg-cyan-400 text-black flex items-center justify-center shrink-0 border-2 border-black`}>
              <Vibrate className={isLandscapeCompact ? 'w-4 h-4' : 'w-5 h-5'} />
            </div>
            <div className="min-w-0">
              <h2 className={`${isLandscapeCompact ? 'text-base' : 'text-lg sm:text-2xl'} font-black italic tracking-wide uppercase truncate`}>
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
            className="bg-white text-black border-2 border-black p-1.5 rounded-lg font-black hover:bg-cyan-300 transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center"
            aria-label="Close haptics settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className={`flex-1 overflow-y-auto custom-scrollbar ${isLandscapeCompact ? 'p-3 space-y-2.5' : 'p-4 sm:p-5 space-y-4'}`}>
          {/* Master Toggle */}
          <div className="flex items-center justify-between gap-3 bg-black/70 border-2 border-white/20 rounded-xl p-3">
            <div>
              <div className="font-black text-base sm:text-lg tracking-wider">MASTER HAPTICS</div>
              <div className="text-xs text-gray-300">Enable tactile feedback during gameplay and menus</div>
            </div>
            <button
              type="button"
              data-testid="haptics-master-toggle"
              onClick={() => {
                const next = { ...current, enabled: !current.enabled };
                onChange(next);
                if (next.enabled) triggerHaptic('hit', next, 'sick');
              }}
              className={`px-5 py-2.5 rounded-xl font-black text-sm border-2 border-black shadow-[4px_4px_0_#000] min-w-[88px] min-h-[44px] transition-colors ${
                current.enabled ? 'bg-green-400 text-black' : 'bg-gray-700 text-gray-200'
              }`}
            >
              {current.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Intensity Slider + Presets */}
          <div className="bg-black/70 border-2 border-white/20 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="haptics-intensity" className="font-black text-sm sm:text-base tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                INTENSITY
              </label>
              <span data-testid="haptics-intensity-value" className="font-black text-lg text-cyan-300">
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
                  className={`py-2 px-1 rounded-lg font-black text-xs border-2 transition-colors min-h-[40px] disabled:opacity-40 ${
                    Math.abs(current.intensity - preset.value) <= 5
                      ? 'bg-cyan-400 text-black border-white'
                      : 'bg-gray-900 text-gray-200 border-white/25 hover:border-cyan-400'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pulse Duration Slider */}
          <div className="bg-black/70 border-2 border-white/20 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="haptics-duration" className="font-black text-sm sm:text-base tracking-wider flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-pink-400" />
                PULSE LENGTH
              </label>
              <span data-testid="haptics-duration-value" className="font-black text-lg text-pink-300">
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
            <div className="flex justify-between text-[11px] font-bold text-gray-400">
              <span>8ms (Snappy)</span>
              <span>22ms (Arcade)</span>
              <span>60ms (Heavy)</span>
            </div>
          </div>

          {/* Behavior Modifiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="haptics-accuracy-toggle"
              disabled={!current.enabled}
              onClick={() => {
                const next = normalizeHapticsSettings({ ...current, accuracyScaling: !current.accuracyScaling });
                onChange(next);
                triggerHaptic('hit', next, 'sick');
              }}
              className={`flex items-center justify-between gap-2 p-3 rounded-xl border-2 text-left transition-colors min-h-[54px] disabled:opacity-40 ${
                current.accuracyScaling ? 'bg-cyan-950/60 border-cyan-400' : 'bg-black/60 border-white/20'
              }`}
            >
              <div>
                <div className="font-black text-xs sm:text-sm">ACCURACY SCALING</div>
                <div className="text-[11px] text-gray-300">SICK!! hits pulse stronger than BAD</div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-black shrink-0 ${
                  current.accuracyScaling ? 'bg-cyan-400 text-black' : 'bg-gray-800 text-gray-400'
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
              className={`flex items-center justify-between gap-2 p-3 rounded-xl border-2 text-left transition-colors min-h-[54px] disabled:opacity-40 ${
                current.audioFallback ? 'bg-purple-950/60 border-purple-400' : 'bg-black/60 border-white/20'
              }`}
            >
              <div className="min-w-0">
                <div className="font-black text-xs sm:text-sm flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                  TACTILE THUMP
                </div>
                <div className="text-[11px] text-gray-300">Chassis pulse for iOS & preview frames</div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-black shrink-0 ${
                  current.audioFallback ? 'bg-purple-400 text-black' : 'bg-gray-800 text-gray-400'
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
              className={`sm:col-span-2 flex items-center justify-between gap-2 p-3 rounded-xl border-2 text-left transition-colors min-h-[52px] disabled:opacity-40 ${
                current.alwaysAudioAssist ? 'bg-yellow-950/50 border-yellow-400' : 'bg-black/60 border-white/20'
              }`}
            >
              <div className="min-w-0">
                <div className="font-black text-xs sm:text-sm">ALWAYS LAYER TACTILE AUDIO</div>
                <div className="text-[11px] text-gray-300">
                  Play crisp acoustic thump alongside motor vibration on every tap & hit
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-black shrink-0 ${
                  current.alwaysAudioAssist ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400'
                }`}
              >
                {current.alwaysAudioAssist ? 'ON' : 'AUTO'}
              </span>
            </button>
          </div>

          {/* Individual Activation Triggers */}
          <div className="bg-black/70 border-2 border-white/20 rounded-xl p-3.5 space-y-2">
            <div className="font-black text-sm tracking-wider text-yellow-300">WHEN HAPTICS ACTIVATE</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TRIGGER_LABELS.map((item) => {
                const active = current.triggers[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-testid={`haptics-trigger-${item.key}`}
                    disabled={!current.enabled}
                    onClick={() => toggleTrigger(item.key)}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border-2 text-left transition-colors min-h-[48px] disabled:opacity-40 ${
                      active ? 'bg-green-950/40 border-green-400' : 'bg-gray-900/70 border-white/15'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-black text-xs text-white truncate">{item.label}</div>
                      <div className="text-[10px] text-gray-400 leading-tight">{item.desc}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-black shrink-0 ${
                        active ? 'bg-green-400 text-black' : 'bg-gray-800 text-gray-400'
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
          <div className="bg-black/70 border-2 border-white/20 rounded-xl p-3.5">
            <div className="font-black text-xs tracking-wider text-gray-300 mb-2">TEST HAPTIC FEEL</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="haptics-test-hit"
                disabled={!current.enabled}
                onClick={() => {
                  AudioEngine.init();
                  triggerHaptic('hit', current, 'sick');
                }}
                className="bg-cyan-400 text-black font-black text-xs sm:text-sm py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0_#000] min-h-[44px] disabled:opacity-40"
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
                className="bg-red-500 text-white font-black text-xs sm:text-sm py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0_#000] min-h-[44px] disabled:opacity-40"
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
                className="bg-yellow-400 text-black font-black text-xs sm:text-sm py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0_#000] min-h-[44px] disabled:opacity-40"
              >
                TEST 25x
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between gap-3 bg-black border-t-2 border-white/20 shrink-0 ${isLandscapeCompact ? 'px-4 py-2' : 'px-4 sm:px-6 py-3'}`}>
          <button
            type="button"
            data-testid="haptics-reset-btn"
            onClick={() => {
              onChange(DEFAULT_HAPTICS_SETTINGS);
              triggerHaptic('menuTap', DEFAULT_HAPTICS_SETTINGS);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-black text-gray-200 min-h-[38px]"
          >
            <RotateCcw className="w-4 h-4" />
            RESET DEFAULTS
          </button>

          <button
            type="button"
            data-testid="haptics-done-btn"
            onClick={() => {
              triggerHaptic('menuTap', current);
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-yellow-400 text-black border-2 border-black font-black text-sm shadow-[4px_4px_0_#000] min-h-[38px]"
          >
            SAVE & CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
