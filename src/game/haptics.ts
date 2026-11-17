import { AudioEngine } from './audio.ts';
import type { HapticsSettings } from './types.ts';

export type HapticEvent = 'press' | 'hit' | 'holdTick' | 'miss' | 'demon' | 'comboMilestone' | 'menuTap';

export interface HapticPulseTelemetry {
  event: HapticEvent;
  intensity: number;
  quality?: 'sick' | 'good' | 'bad';
  pattern: number[];
  timestamp: number;
}

export const DEFAULT_HAPTICS_SETTINGS: HapticsSettings = {
  enabled: true,
  intensity: 90,
  pulseDurationMs: 32,
  accuracyScaling: true,
  audioFallback: false,
  alwaysAudioAssist: false,
  triggers: {
    onPress: true,
    onHit: true,
    onHoldTick: true,
    onMiss: true,
    onDemon: true,
    onComboMilestone: true,
    onMenuTap: true,
  },
};

export const normalizeHapticsSettings = (raw?: Partial<HapticsSettings> | null): HapticsSettings => {
  const intensityRaw = Number(raw?.intensity);
  const durationRaw = Number(raw?.pulseDurationMs);
  const triggers = raw?.triggers || ({} as Partial<HapticsSettings['triggers']>);
  const explicitV2Audio = Boolean((raw as any)?.v2ExplicitAudioAssist);

  return {
    enabled: raw?.enabled !== undefined ? Boolean(raw.enabled) : DEFAULT_HAPTICS_SETTINGS.enabled,
    intensity: Number.isFinite(intensityRaw)
      ? Math.max(10, Math.min(100, Math.round(intensityRaw)))
      : DEFAULT_HAPTICS_SETTINGS.intensity,
    pulseDurationMs: Number.isFinite(durationRaw)
      ? Math.max(8, Math.min(60, Math.round(durationRaw)))
      : DEFAULT_HAPTICS_SETTINGS.pulseDurationMs,
    accuracyScaling:
      raw?.accuracyScaling !== undefined ? Boolean(raw.accuracyScaling) : DEFAULT_HAPTICS_SETTINGS.accuracyScaling,
    audioFallback: explicitV2Audio && raw?.audioFallback !== undefined ? Boolean(raw.audioFallback) : false,
    alwaysAudioAssist:
      explicitV2Audio && raw?.alwaysAudioAssist !== undefined ? Boolean(raw.alwaysAudioAssist) : false,
    triggers: {
      onPress: triggers.onPress !== undefined ? Boolean(triggers.onPress) : DEFAULT_HAPTICS_SETTINGS.triggers.onPress,
      onHit: triggers.onHit !== undefined ? Boolean(triggers.onHit) : DEFAULT_HAPTICS_SETTINGS.triggers.onHit,
      onHoldTick:
        triggers.onHoldTick !== undefined ? Boolean(triggers.onHoldTick) : DEFAULT_HAPTICS_SETTINGS.triggers.onHoldTick,
      onMiss: triggers.onMiss !== undefined ? Boolean(triggers.onMiss) : DEFAULT_HAPTICS_SETTINGS.triggers.onMiss,
      onDemon: triggers.onDemon !== undefined ? Boolean(triggers.onDemon) : DEFAULT_HAPTICS_SETTINGS.triggers.onDemon,
      onComboMilestone:
        triggers.onComboMilestone !== undefined
          ? Boolean(triggers.onComboMilestone)
          : DEFAULT_HAPTICS_SETTINGS.triggers.onComboMilestone,
      onMenuTap:
        triggers.onMenuTap !== undefined ? Boolean(triggers.onMenuTap) : DEFAULT_HAPTICS_SETTINGS.triggers.onMenuTap,
    },
  };
};

export const isHapticEventEnabled = (event: HapticEvent, settings: HapticsSettings): boolean => {
  if (!settings.enabled) return false;
  switch (event) {
    case 'press':
      return settings.triggers.onPress;
    case 'hit':
      return settings.triggers.onHit;
    case 'holdTick':
      return settings.triggers.onHoldTick;
    case 'miss':
      return settings.triggers.onMiss;
    case 'demon':
      return settings.triggers.onDemon;
    case 'comboMilestone':
      return settings.triggers.onComboMilestone;
    case 'menuTap':
      return settings.triggers.onMenuTap;
  }
};

export const buildVibrationPattern = (
  event: HapticEvent,
  settings: HapticsSettings,
  quality?: 'sick' | 'good' | 'bad'
): number[] => {
  const norm = normalizeHapticsSettings(settings);
  const strength = norm.intensity / 100;
  const base = norm.pulseDurationMs;
  const qualityScale = !norm.accuracyScaling
    ? 1
    : quality === 'sick'
    ? 1.32
    : quality === 'good'
    ? 1.0
    : quality === 'bad'
    ? 0.72
    : 1;

  // Tuned for physical Android LRA / ERM vibration motors so every pulse spins up crisply (20ms-55ms+)
  const scaled = (mult: number, minMs = 20) =>
    Math.max(minMs, Math.round(base * mult * (0.55 + strength * 0.75) * qualityScale));

  switch (event) {
    case 'press':
      return [scaled(0.85, 20)];
    case 'hit':
      if (strength < 0.45) {
        const pulse = scaled(0.75, 18);
        return [pulse, 12, Math.max(16, Math.round(pulse * 0.85))];
      }
      return [scaled(1.3, 28)];
    case 'holdTick':
      return [scaled(0.68, 18)];
    case 'miss': {
      const a = scaled(1.35, 32);
      const b = scaled(1.65, 38);
      return [a, 28, b];
    }
    case 'demon': {
      const heavy = scaled(1.9, 42);
      return [heavy, 24, heavy, 24, Math.round(heavy * 1.35)];
    }
    case 'comboMilestone': {
      const pop = scaled(1.2, 26);
      return [pop, 20, Math.round(pop * 1.4)];
    }
    case 'menuTap':
      return [scaled(0.75, 18)];
  }
};

export const isHardwareVibrationSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const isIOSSwitchHapticSupported = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS;
};

let iosSwitchLabelEl: HTMLLabelElement | null = null;
const triggerIOSSwitchHaptic = (pulses = 1): boolean => {
  if (typeof document === 'undefined' || !document.body) return false;
  try {
    if (!iosSwitchLabelEl || !document.body.contains(iosSwitchLabelEl)) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      // Positioned inside viewport at (2px,2px) with 0.01 opacity so iOS 17.4+/18 Safari Taptic Engine fires reliably
      label.style.cssText =
        'position:fixed;left:2px;top:2px;width:2px;height:2px;opacity:0.01;pointer-events:none;overflow:hidden;z-index:99999;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitchLabelEl = label;
    }
    iosSwitchLabelEl.click();
    if (pulses > 1) {
      setTimeout(() => {
        try {
          iosSwitchLabelEl?.click();
        } catch {
          // ignore
        }
      }, 45);
    }
    return true;
  } catch {
    return false;
  }
};

const EVENT_PRIORITY: Record<HapticEvent, number> = {
  holdTick: 1,
  menuTap: 1,
  press: 2,
  hit: 3,
  comboMilestone: 4,
  miss: 4,
  demon: 5,
};

let activeMotorUntil = 0;
let activeMotorPriority = 0;
const lastHapticAt: Partial<Record<HapticEvent, number>> = {};
const chordBurstCount: Partial<Record<HapticEvent, number>> = {};

export const triggerHaptic = (
  event: HapticEvent,
  rawSettings?: Partial<HapticsSettings> | null,
  quality?: 'sick' | 'good' | 'bad'
): void => {
  const settings = normalizeHapticsSettings(rawSettings);
  if (!isHapticEventEnabled(event, settings)) return;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const prevAt = lastHapticAt[event] || 0;
  const delta = now - prevAt;

  if (event === 'holdTick') {
    if (delta < 85) return;
  } else if (event === 'press' || event === 'hit') {
    if (delta < 8) {
      const count = (chordBurstCount[event] || 0) + 1;
      chordBurstCount[event] = count;
      if (count > 4) return;
    } else if (delta < 10) {
      return;
    } else {
      chordBurstCount[event] = 1;
    }
  } else {
    if (delta < 14) return;
  }
  lastHapticAt[event] = now;

  const pattern = buildVibrationPattern(event, settings, quality);
  const patternDuration = pattern.reduce((sum, n) => sum + n, 0);
  const priority = EVENT_PRIORITY[event] || 1;
  let hardwareFired = false;

  // Prevent a weaker 'press' or 'holdTick' call from overwriting a stronger 'hit'/'miss'/'demon' vibration in flight
  if (isHardwareVibrationSupported()) {
    if (now >= activeMotorUntil || priority >= activeMotorPriority) {
      try {
        hardwareFired = Boolean(navigator.vibrate(pattern));
        if (hardwareFired) {
          activeMotorUntil = now + patternDuration * 0.75;
          activeMotorPriority = priority;
        }
      } catch {
        hardwareFired = false;
      }
    } else {
      hardwareFired = true;
    }
  }

  // Forward vibration request to parent window when running inside a mobile preview wrapper
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'rc-vibrate', pattern, event, intensity: settings.intensity }, '*');
      if (typeof (window.parent as any).navigator?.vibrate === 'function') {
        hardwareFired = Boolean((window.parent as any).navigator.vibrate(pattern)) || hardwareFired;
      }
    }
  } catch {
    // Cross-origin parent access ignored
  }

  // Trigger iOS 17.4+/18 Taptic Engine physical switch pulse on iPhones/iPads
  if (!hardwareFired && isIOSSwitchHapticSupported()) {
    hardwareFired = triggerIOSSwitchHaptic(event === 'miss' || event === 'demon' ? 2 : 1);
  }

  // Simulated speaker noise is strictly OFF unless the user explicitly turns on Audio Assist in settings
  const shouldPlayAudioThump =
    typeof window !== 'undefined' &&
    Boolean((rawSettings as any)?.v2ExplicitAudioAssist) &&
    (settings.alwaysAudioAssist || (settings.audioFallback && !hardwareFired));

  if (shouldPlayAudioThump) {
    const strength = (settings.intensity / 100) * (quality === 'sick' ? 1.2 : quality === 'bad' ? 0.72 : 1);
    const freq =
      event === 'miss'
        ? 92
        : event === 'demon'
        ? 76
        : event === 'comboMilestone'
        ? 172
        : event === 'menuTap'
        ? 155
        : event === 'hit'
        ? 138
        : 126;
    const totalMs = Math.min(68, Math.max(20, pattern[0] || settings.pulseDurationMs));
    AudioEngine.playTactileThump(strength, freq, totalMs);
  }

  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    const detail: HapticPulseTelemetry = {
      event,
      intensity: settings.intensity,
      quality,
      pattern,
      timestamp: now,
    };
    window.dispatchEvent(new CustomEvent('rc-haptic-pulse', { detail }));
  }
};
