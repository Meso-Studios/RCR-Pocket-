export type LaneTuple = [boolean, boolean, boolean, boolean];

/**
 * Maps any Standard Gamepad (Xbox, PlayStation, Switch Pro, 8BitDo, Backbone)
 * onto the 4 rhythm lanes using D-Pad, Face buttons, Bumpers/Triggers, or Left Stick.
 */
export const readGamepadLaneState = (
  gamepad: Pick<Gamepad, 'buttons' | 'axes'> | null | undefined,
  deadzone = 0.45
): LaneTuple => {
  if (!gamepad) return [false, false, false, false];
  const b = gamepad.buttons || [];
  const a = gamepad.axes || [];
  const pressed = (idx: number) => Boolean(b[idx]?.pressed || (typeof b[idx]?.value === 'number' && b[idx].value > 0.5));

  const axX = a[0] ?? 0;
  const axY = a[1] ?? 0;

  // Lane 0 (Left): D-pad Left (14), X/Square (2), LB/L1 (4), Left Stick Left
  const lane0 = pressed(14) || pressed(2) || pressed(4) || axX < -deadzone;
  // Lane 1 (Down): D-pad Down (13), A/Cross (0), LT/L2 (6), Left Stick Down
  const lane1 = pressed(13) || pressed(0) || pressed(6) || axY > deadzone;
  // Lane 2 (Up): D-pad Up (12), Y/Triangle (3), RT/R2 (7), Left Stick Up
  const lane2 = pressed(12) || pressed(3) || pressed(7) || axY < -deadzone;
  // Lane 3 (Right): D-pad Right (15), B/Circle (1), RB/R1 (5), Left Stick Right
  const lane3 = pressed(15) || pressed(1) || pressed(5) || axX > deadzone;

  return [lane0, lane1, lane2, lane3];
};

export const readGamepadStartPressed = (gamepad: Pick<Gamepad, 'buttons'> | null | undefined): boolean => {
  if (!gamepad?.buttons) return false;
  return Boolean(gamepad.buttons[9]?.pressed || gamepad.buttons[8]?.pressed);
};

export const pollActiveGamepadLanes = (): { lanes: LaneTuple; startPressed: boolean; connected: boolean } => {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return { lanes: [false, false, false, false], startPressed: false, connected: false };
  }
  const pads = navigator.getGamepads();
  const merged: LaneTuple = [false, false, false, false];
  let startPressed = false;
  let connected = false;

  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (!pad || !pad.connected) continue;
    connected = true;
    const laneState = readGamepadLaneState(pad);
    merged[0] = merged[0] || laneState[0];
    merged[1] = merged[1] || laneState[1];
    merged[2] = merged[2] || laneState[2];
    merged[3] = merged[3] || laneState[3];
    if (readGamepadStartPressed(pad)) startPressed = true;
  }

  return { lanes: merged, startPressed, connected };
};
