import { AudioEngine } from './audio.ts';
import type { HapticsSettings } from './types.ts';

export type HapticEvent = 'press' | 'hit' | 'holdTick' | 'miss' | 'demon' | 'comboMilestone' | 'menuTap';

export const DEFAULT_HAPTICS_SETTINGS: HapticsSettings = {
  enabled: true,
  intensity: 75,
  pulseDurationMs: 24,
  accuracyScaling: true,
  audioFallback: true,
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
    audioFallback:
      raw?.audioFallback !== undefined ? Boolean(raw.audioFallback) : DEFAULT_HAPTICS_SETTINGS.audioFallback,
    alwaysAudioAssist:
      raw?.alwaysAudioAssist !== undefined
        ? Boolean(raw.alwaysAudioAssist)
        : DEFAULT_HAPTICS_SETTINGS.alwaysAudioAssist,
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
    ? 1.2
    : quality === 'good'
    ? 0.92
    : quality === 'bad'
    ? 0.68
    : 1;

  // Minimum 14ms effective pulse so Android LRA vibration motors reliably spin up
  const scaled = (mult: number, minMs = 14) =>
    Math.max(minMs, Math.round(base * mult * (0.45 + strength * 0.65) * qualityScale));

  switch (event) {
    case 'press':
      return [scaled(0.75, 14)];
    case 'hit':
      if (strength < 0.45) {
        const pulse = scaled(0.65, 12);
        return [pulse, 10, Math.max(10, Math.round(pulse * 0.75))];
      }
      return [scaled(1.15, 18)];
    case 'holdTick':
      return [scaled(0.55, 12)];
    case 'miss': {
      const a = scaled(1.25, 22);
      const b = scaled(1.55, 26);
      return [a, 24, b];
    }
    case 'demon': {
      const heavy = scaled(1.8, 30);
      return [heavy, 22, heavy, 22, Math.round(heavy * 1.25)];
    }
    case 'comboMilestone': {
      const pop = scaled(1.05, 18);
      return [pop, 18, Math.round(pop * 1.3)];
    }
    case 'menuTap':
      return [scaled(0.6, 12)];
  }
};

export const isHardwareVibrationSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const isIOSSwitchHapticSupported = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS && !isHardwareVibrationSupported();
};

let iosSwitchLabelEl: HTMLLabelElement | null = null;
const triggerIOSSwitchHaptic = (): boolean => {
  if (typeof document === 'undefined' || !document.body) return false;
  try {
    if (!iosSwitchLabelEl || !document.body.contains(iosSwitchLabelEl)) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText =
        'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0.01;pointer-events:none;overflow:hidden;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitchLabelEl = label;
    }
    iosSwitchLabelEl.click();
    return true;
  } catch {
    return false;
  }
};

const lastHapticAt: Partial<Record<HapticEvent, number>> = {};

export const triggerHaptic = (
  event: HapticEvent,
  rawSettings?: Partial<HapticsSettings> | null,
  quality?: 'sick' | 'good' | 'bad'
): void => {
  const settings = normalizeHapticsSettings(rawSettings);
  if (!isHapticEventEnabled(event, settings)) return;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const minCooldown = event === 'holdTick' ? 95 : 14;
  if (now - (lastHapticAt[event] || 0) < minCooldown) return;
  lastHapticAt[event] = now;

  const pattern = buildVibrationPattern(event, settings, quality);
  let hardwareFired = false;

  if (isHardwareVibrationSupported()) {
    try {
      hardwareFired = Boolean(navigator.vibrate(pattern));
    } catch {
      hardwareFired = false;
    }
  } else if (isIOSSwitchHapticSupported()) {
    triggerIOSSwitchHaptic();
  }

  const inCrossOriginFrame = (() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const shouldPlayAudioThump =
    typeof window !== 'undefined' &&
    (settings.alwaysAudioAssist || (settings.audioFallback && (!hardwareFired || inCrossOriginFrame)));

  if (shouldPlayAudioThump) {
    const strength = (settings.intensity / 100) * (quality === 'sick' ? 1.15 : quality === 'bad' ? 0.72 : 1);
    const freq =
      event === 'miss'
        ? 92
        : event === 'demon'
        ? 78
        : event === 'comboMilestone'
        ? 165
        : event === 'menuTap'
        ? 150
        : 128;
    const totalMs = Math.min(65, Math.max(20, pattern[0] || settings.pulseDurationMs));
    AudioEngine.playTactileThump(strength, freq, totalMs);
  }
};
