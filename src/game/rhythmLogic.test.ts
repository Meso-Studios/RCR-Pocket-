import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRewardsCalc,
  applyNerfChart,
  createAltChart,
  evaluateHitTiming,
  generateBeatmap,
  getCleanedUrl,
  getDurationString,
  getGrade,
  getLaneFromClientX,
  getLaneFromPlayfieldX,
  getPlayfieldLayout,
  normalizeChart,
} from './rhythmLogic.ts';
import { buildVibrationPattern, DEFAULT_HAPTICS_SETTINGS, isHapticEventEnabled, normalizeHapticsSettings } from './haptics.ts';
import { readGamepadLaneState, readGamepadStartPressed } from './gamepad.ts';
import { isCompactLandscapeViewport } from './useViewport.ts';

test('normalizeChart sorts notes, clamps lanes, and sets hold duration defaults', () => {
  const normalized = normalizeChart([
    { time: 1200, lane: 9, type: 'hold', duration: 40 },
    { time: -50, lane: -3, type: 'demon' },
    { time: 600, lane: 2, type: 'normal' },
  ]);
  assert.equal(normalized.length, 3);
  assert.deepEqual(normalized[0], { time: 0, lane: 0, type: 'demon' });
  assert.deepEqual(normalized[1], { time: 600, lane: 2, type: 'normal' });
  assert.deepEqual(normalized[2], { time: 1200, lane: 7, type: 'hold', duration: 100 });
});

test('evaluateHitTiming maps timing deltas accurately', () => {
  assert.equal(evaluateHitTiming(10).judgment, 'SICK!!');
  assert.equal(evaluateHitTiming(60).judgment, 'GOOD!');
  assert.equal(evaluateHitTiming(110).judgment, 'BAD');
  assert.equal(evaluateHitTiming(160).judgment, 'MISS');
  assert.equal(evaluateHitTiming(80, 1).judgment, 'SICK!!');
});

test('applyNerfChart deterministically removes percentage of notes without modifying original', () => {
  const src = Array.from({ length: 20 }, (_, i) => ({ time: i * 250, lane: i % 4, type: 'normal' as const }));
  const nerfedA = applyNerfChart(src, 25, 'seed-1');
  const nerfedB = applyNerfChart(src, 25, 'seed-1');
  assert.equal(nerfedA.length, 15);
  assert.deepEqual(nerfedA, nerfedB);
  assert.equal(src.length, 20);
});

test('createAltChart avoids immediate repeated single-note lanes and preserves chord lane uniqueness', () => {
  const src = [
    { time: 500, lane: 0, type: 'normal' as const },
    { time: 1000, lane: 0, type: 'normal' as const },
    { time: 1500, lane: 1, type: 'normal' as const },
    { time: 1500, lane: 2, type: 'normal' as const },
  ];
  const alt = createAltChart(src);
  assert.equal(alt.length, 4);
  assert.notEqual(alt[0].lane, alt[1].lane);
  assert.notEqual(alt[2].lane, alt[3].lane);
});

test('getLaneFromClientX accurately maps horizontal touch coordinates to lanes 0-3', () => {
  assert.equal(getLaneFromClientX(10, 0, 400), 0);
  assert.equal(getLaneFromClientX(150, 0, 400), 1);
  assert.equal(getLaneFromClientX(250, 0, 400), 2);
  assert.equal(getLaneFromClientX(399, 0, 400), 3);
  assert.equal(getLaneFromClientX(-5, 0, 400), null);
  assert.equal(getLaneFromClientX(405, 0, 400), null);
});

test('getGrade, getDurationString, getCleanedUrl, generateBeatmap, and addRewardsCalc', () => {
  assert.equal(getGrade(100), 'SSS');
  assert.equal(getGrade(97), 'S');
  assert.equal(getGrade(90), 'A');
  assert.equal(getGrade(55), 'F');

  assert.equal(
    getDurationString({ id: 1, title: 'T', artist: 'A', bpm: 120, color: '#fff', customMap: [{ time: 57500, lane: 0, type: 'normal' }] }),
    '1:00'
  );
  assert.equal(getCleanedUrl('https://www.dropbox.com/s/abc/test.mp3?dl=0'), 'https://dl.dropboxusercontent.com/s/abc/test.mp3');

  const bm = generateBeatmap(120, 0, 10, 'normal', 'standard');
  assert.ok(bm.length > 0);
  assert.ok(bm.every((n) => n.lane >= 0 && n.lane <= 3));

  const next = addRewardsCalc({ level: 1, xp: 800, coins: 10 }, 400, 50);
  assert.deepEqual(next, { level: 2, xp: 200, coins: 60 });
});

test('isCompactLandscapeViewport detects mobile/tablet landscape heights accurately', () => {
  assert.equal(isCompactLandscapeViewport(844, 390), true);
  assert.equal(isCompactLandscapeViewport(667, 375), true);
  assert.equal(isCompactLandscapeViewport(390, 844), false);
  assert.equal(isCompactLandscapeViewport(1440, 900), false);
  assert.equal(isCompactLandscapeViewport(1024, 768), false);
  assert.equal(isCompactLandscapeViewport(0, 0), false);
});

test('getPlayfieldLayout positions spaced FNF bottom receptors in landscape and maps direct receptor taps', () => {
  const fnfLandscape = getPlayfieldLayout({ isLandscape: true, isVS: false, downscroll: true, heroMode: false });
  assert.equal(fnfLandscape.width, 860);
  assert.equal(fnfLandscape.height, 440);
  assert.equal(fnfLandscape.noteSize, 74);
  assert.ok(fnfLandscape.receptorY > 300);
  // Spaced-out FNF notes should have wide gaps (> 100px between edges)
  assert.ok(fnfLandscape.playerLaneXs[1] - (fnfLandscape.playerLaneXs[0] + fnfLandscape.noteSize) > 100);

  // Direct taps on each gray receptor center resolve to exact lane 0..3
  for (let i = 0; i < 4; i++) {
    const laneCenter: number = fnfLandscape.playerLaneXs[i] + fnfLandscape.noteSize / 2;
    assert.equal(getLaneFromPlayfieldX(laneCenter, fnfLandscape), i);
  }
  assert.equal(getLaneFromPlayfieldX(-1, fnfLandscape), null);
  assert.equal(getLaneFromPlayfieldX(861, fnfLandscape), null);

  // Online VS restricts direct canvas touch to player side (left 4 lanes)
  const vsLandscape = getPlayfieldLayout({ isLandscape: true, isVS: true, downscroll: true, heroMode: false });
  assert.equal(getLaneFromPlayfieldX(vsLandscape.playerLaneXs[2] + 10, vsLandscape), 2);
  assert.equal(getLaneFromPlayfieldX(vsLandscape.opponentLaneXs[1] + 10, vsLandscape), null);
});

test('haptics settings normalize safely and generate expected vibration patterns', () => {
  const norm = normalizeHapticsSettings({
    enabled: true,
    intensity: 200,
    pulseDurationMs: 2,
    triggers: { onMiss: false } as any,
  });
  assert.equal(norm.intensity, 100);
  assert.equal(norm.pulseDurationMs, 8);
  assert.equal(norm.triggers.onMiss, false);
  assert.equal(norm.triggers.onHit, true);

  assert.equal(isHapticEventEnabled('hit', norm), true);
  assert.equal(isHapticEventEnabled('miss', norm), false);
  assert.equal(isHapticEventEnabled('hit', { ...DEFAULT_HAPTICS_SETTINGS, enabled: false }), false);

  const sickPat = buildVibrationPattern('hit', DEFAULT_HAPTICS_SETTINGS, 'sick');
  const badPat = buildVibrationPattern('hit', DEFAULT_HAPTICS_SETTINGS, 'bad');
  assert.ok(sickPat[0] > badPat[0]);

  const missPat = buildVibrationPattern('miss', DEFAULT_HAPTICS_SETTINGS);
  assert.equal(missPat.length, 3);
  const demonPat = buildVibrationPattern('demon', DEFAULT_HAPTICS_SETTINGS);
  assert.equal(demonPat.length, 5);
});

test('readGamepadLaneState and readGamepadStartPressed map Xbox/PS buttons and analog stick with deadzone', () => {
  const mkBtn = (pressed: boolean) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 });
  const dpadPad = {
    buttons: Array.from({ length: 16 }, (_, i) => mkBtn(i === 14 || i === 12)), // Left + Up
    axes: [0, 0, 0, 0],
  } as unknown as Gamepad;
  assert.deepEqual(readGamepadLaneState(dpadPad), [true, false, true, false]);

  const stickPad = {
    buttons: Array.from({ length: 16 }, () => mkBtn(false)),
    axes: [0.85, 0.2, 0, 0], // Right pressed, Down inside deadzone
  } as unknown as Gamepad;
  assert.deepEqual(readGamepadLaneState(stickPad), [false, false, false, true]);

  const startPad = {
    buttons: Array.from({ length: 16 }, (_, i) => mkBtn(i === 9)),
    axes: [0, 0, 0, 0],
  } as unknown as Gamepad;
  assert.equal(readGamepadStartPressed(startPad), true);
});
