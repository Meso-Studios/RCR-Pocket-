import { DEFAULT_HAPTICS } from './constants';
import type { HapticsSettings } from './types';

export type HapticEventType =
  | 'hit'
  | 'miss'
  | 'press'
  | 'holdTick'
  | 'hold_crescendo'
  | 'hold_complete'
  | 'comboMilestone'
  | 'menuTap'
  | 'menu'
  | 'heavy'
  | 'perfect'
  | 'light'
  | 'demon'
  | 'hit_sick'
  | 'hit_good'
  | 'hit_bad'
  | 'ui_click'
  | 'trigger_fire';

export const normalizeHapticsSettings = (
  raw?: Partial<HapticsSettings> | null
): HapticsSettings => {
  const intensity =
    typeof raw?.intensity === 'number'
      ? Math.max(0, Math.min(100, raw.intensity <= 1 ? Math.round(raw.intensity * 100) : raw.intensity))
      : DEFAULT_HAPTICS.intensity;
  const holdEffectVolume =
    typeof raw?.holdEffectVolume === 'number'
      ? Math.max(0, Math.min(100, raw.holdEffectVolume <= 1 ? Math.round(raw.holdEffectVolume * 100) : raw.holdEffectVolume))
      : DEFAULT_HAPTICS.holdEffectVolume ?? 80;

  return {
    enabled: raw?.enabled ?? DEFAULT_HAPTICS.enabled,
    intensity,
    holdEffectVolume,
    gameplayHits: raw?.gameplayHits ?? raw?.triggers?.onHit ?? true,
    holdPulses: raw?.holdPulses ?? raw?.triggers?.onHoldTick ?? true,
    missAlerts: raw?.missAlerts ?? raw?.triggers?.onMiss ?? true,
    menuNavigation: raw?.menuNavigation ?? raw?.triggers?.onMenuTap ?? true,
    visualShake: raw?.visualShake ?? true,
    soundPulse: raw?.soundPulse ?? true,
    triggers: {
      onHit: raw?.triggers?.onHit ?? raw?.gameplayHits ?? true,
      onMiss: raw?.triggers?.onMiss ?? raw?.missAlerts ?? true,
      onHoldTick: raw?.triggers?.onHoldTick ?? raw?.holdPulses ?? true,
      onComboMilestone: raw?.triggers?.onComboMilestone ?? true,
      onMenuTap: raw?.triggers?.onMenuTap ?? raw?.menuNavigation ?? true,
    },
  };
};

/**
 * Real iOS / iPhone Taptic Engine Web Trigger Pool:
 * Safari on iOS 17.4+ triggers native iPhone Taptic Engine actuation when a
 * `<label>` associated with `<input type="checkbox" switch>` receives a programmatic `.click()`.
 * We maintain a pool of hidden switch inputs so rapid rhythm hits and escalating hold note
 * crescendos fire crisp, genuine iPhone Taptic Engine pulses alongside Android `navigator.vibrate`
 * and Gamepad dual-rumble motors.
 */
const IOS_SWITCH_POOL_SIZE = 6;
let iosSwitchLabels: HTMLLabelElement[] = [];
let iosPoolIndex = 0;

function ensureIosTapticSwitchPool(): HTMLLabelElement[] {
  if (typeof document === 'undefined') return [];
  if (iosSwitchLabels.length > 0 && document.body.contains(iosSwitchLabels[0])) {
    return iosSwitchLabels;
  }

  try {
    iosSwitchLabels = [];
    const container = document.createElement('div');
    container.id = 'ios-taptic-switch-pool';
    container.setAttribute('aria-hidden', 'true');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '1px';
    container.style.height = '1px';
    container.style.opacity = '0.001';
    container.style.pointerEvents = 'none';
    container.style.overflow = 'hidden';

    for (let i = 0; i < IOS_SWITCH_POOL_SIZE; i++) {
      const id = `rhythm-ios-taptic-sw-${i}`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.setAttribute('switch', '');
      const label = document.createElement('label');
      label.htmlFor = id;
      label.appendChild(input);
      container.appendChild(label);
      iosSwitchLabels.push(label);
    }

    document.body.appendChild(container);
  } catch {
    // Ignore DOM errors
  }

  return iosSwitchLabels;
}

function fireIosTapticClick(pulses = 1) {
  const pool = ensureIosTapticSwitchPool();
  if (!pool.length) return;
  const fireOnce = () => {
    const label = pool[iosPoolIndex % pool.length];
    iosPoolIndex = (iosPoolIndex + 1) % pool.length;
    try {
      label.click();
    } catch {
      // Ignore
    }
  };

  fireOnce();
  if (pulses >= 2) {
    setTimeout(fireOnce, 32);
  }
  if (pulses >= 3) {
    setTimeout(fireOnce, 68);
  }
}

function fireGamepadRumble(durationMs: number, weakMagnitude: number, strongMagnitude: number) {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
  try {
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      const actuator = (pad as any).vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: Math.max(10, Math.round(durationMs)),
          weakMagnitude: Math.min(1, Math.max(0, weakMagnitude)),
          strongMagnitude: Math.min(1, Math.max(0, strongMagnitude)),
        });
      }
    }
  } catch {
    // Ignore gamepad permission errors
  }
}

export function triggerHaptic(
  event: HapticEventType,
  rawSettings?: Partial<HapticsSettings> | null,
  bucket?: 'sick' | 'good' | 'bad' | 'miss',
  progress01 = 0.5
): boolean {
  const settings = normalizeHapticsSettings(rawSettings);
  if (!settings.enabled || settings.intensity <= 0) return false;

  if (
    (event === 'hit' || event === 'press' || event === 'hit_sick' || event === 'hit_good' || event === 'hit_bad') &&
    !settings.triggers.onHit
  ) {
    return false;
  }
  if ((event === 'miss' || event === 'demon') && !settings.triggers.onMiss) {
    return false;
  }
  if (
    (event === 'holdTick' || event === 'hold_crescendo' || event === 'hold_complete') &&
    !settings.triggers.onHoldTick
  ) {
    return false;
  }
  if (event === 'comboMilestone' && !settings.triggers.onComboMilestone) {
    return false;
  }
  if ((event === 'menuTap' || event === 'ui_click') && !settings.triggers.onMenuTap) {
    return false;
  }

  const scale = Math.max(0.2, Math.min(1.5, settings.intensity / 80));
  const clampedProgress = Math.max(0, Math.min(1, progress01));

  let pattern: number | number[] = 14;
  let iosPulses = 1;
  let weak = 0.45 * scale;
  let strong = 0.35 * scale;

  if (event === 'menuTap' || event === 'ui_click' || event === 'press') {
    pattern = Math.round(10 * scale);
    iosPulses = 1;
    weak = 0.3 * scale;
    strong = 0.15 * scale;
  } else if (event === 'hit' || event === 'hit_sick' || event === 'hit_good' || event === 'hit_bad') {
    if (bucket === 'sick' || event === 'hit_sick') {
      pattern = Math.round(20 * scale);
      iosPulses = 1;
      weak = 0.7 * scale;
      strong = 0.5 * scale;
    } else if (bucket === 'bad' || event === 'hit_bad') {
      pattern = Math.round(10 * scale);
      iosPulses = 1;
    } else {
      pattern = Math.round(15 * scale);
      iosPulses = 1;
    }
  } else if (event === 'holdTick' || event === 'hold_crescendo') {
    // Rising haptic intensity as the player holds a 1s+ hold note
    const dynDuration = Math.round((8 + clampedProgress * 24) * scale);
    pattern = clampedProgress > 0.72 ? [dynDuration, 14, dynDuration] : dynDuration;
    iosPulses = clampedProgress > 0.78 ? 2 : 1;
    weak = Math.min(1, (0.25 + clampedProgress * 0.75) * scale);
    strong = Math.min(1, (0.15 + clampedProgress * 0.85) * scale);
  } else if (event === 'hold_complete') {
    // Satisfying double-pulse pop at the completion of a 1.0s+ hold note
    pattern = [Math.round(18 * scale), 22, Math.round(28 * scale)];
    iosPulses = 2;
    weak = 0.9 * scale;
    strong = 0.85 * scale;
  } else if (event === 'comboMilestone' || event === 'trigger_fire') {
    pattern = [Math.round(16 * scale), 24, Math.round(24 * scale)];
    iosPulses = 2;
    weak = 0.8 * scale;
    strong = 0.75 * scale;
  } else if (event === 'miss' || event === 'demon') {
    pattern = [Math.round(32 * scale), 30, Math.round(45 * scale)];
    iosPulses = 3;
    weak = 0.95;
    strong = 1.0;
  }

  let vibrated = false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      vibrated = navigator.vibrate(pattern);
    } catch {
      vibrated = false;
    }
  }

  // Always fire iOS Taptic switch click pool + Gamepad rumble so iPhones & controllers get physical feedback
  fireIosTapticClick(iosPulses);
  const totalDur = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern;
  fireGamepadRumble(totalDur, weak, strong);

  return vibrated || true;
}

export function triggerHapticFeedback(
  type: HapticEventType,
  settings?: Partial<HapticsSettings> | null,
  progress01 = 0.5
) {
  triggerHaptic(type, settings, 'sick', progress01);
}

/**
 * Computes the interval (in ms) between haptic crescendo pulses while holding a 1s+ hold note.
 * Starts at 130ms and accelerates down to 45ms as `holdProgress01` approaches 1.0.
 */
export function getHoldCrescendoPulseIntervalMs(holdProgress01: number): number {
  const p = Math.max(0, Math.min(1, holdProgress01));
  return Math.round(130 - p * 85);
}
