import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getXpRequirement,
  evaluateHitWindow,
  calculateAccuracy,
  calculateGrade,
  mapKeyToLane,
  addRewardsCalc,
  getDefaultLaneCoords,
  getPlayfieldLayout,
  getLaneFromPlayfieldX,
  getLaneFromPlayfieldPoint,
  getOppositeColor,
  getExpandedLaneColors,
  getEffectiveScrollSpeed,
  getActiveSpeedMultiplierAtTime,
  getActiveLaneExpansionState,
  getEffectiveTrackRating,
  getHighestTrackRating,
  validateDifficultyVote,
  autoIndexFeaturedTracks,
  autoSyncChartNotes,
  resolveExternalAudioInput,
} from './rhythmLogic';
import { ROYALTY_FREE_SONGS } from './constants';

describe('rhythmLogic pure functions', () => {
  it('calculates XP requirements monotonically', () => {
    assert.equal(getXpRequirement(1), 150);
    assert.ok(getXpRequirement(2) > getXpRequirement(1));
    assert.ok(getXpRequirement(10) > getXpRequirement(5));
  });

  it('evaluates hit windows accurately', () => {
    assert.equal(evaluateHitWindow(0), 'sick');
    assert.equal(evaluateHitWindow(40), 'sick');
    assert.equal(evaluateHitWindow(70), 'good');
    assert.equal(evaluateHitWindow(120), 'bad');
    assert.equal(evaluateHitWindow(160), 'miss');
    assert.equal(evaluateHitWindow(220), null);
  });

  it('calculates accuracy and grade properly', () => {
    assert.equal(calculateAccuracy({ sick: 10, good: 0, bad: 0, miss: 0 }), 100);
    assert.equal(calculateGrade(100, 0), 'S+');
    assert.equal(calculateGrade(96, 1), 'S');
    assert.equal(calculateGrade(91, 2), 'A');
    assert.equal(calculateGrade(60, 5), 'D');
  });

  it('maps keys to lanes for 4, 6, and 8 lanes', () => {
    assert.equal(mapKeyToLane('a', 'KeyA'), 0);
    assert.equal(mapKeyToLane('s', 'KeyS'), 1);
    assert.equal(mapKeyToLane('w', 'KeyW'), 2);
    assert.equal(mapKeyToLane('d', 'KeyD'), 3);
    assert.equal(mapKeyToLane('f', 'KeyF'), 4);
    assert.equal(mapKeyToLane('g', 'KeyG'), 5);
    assert.equal(mapKeyToLane('h', 'KeyH'), 6);
    assert.equal(mapKeyToLane(';', 'Semicolon'), 7);
  });

  it('computes opposite colors for expanded lanes (6 and 8 notes)', () => {
    assert.equal(getOppositeColor('#00ffff'), '#ff0000');
    assert.equal(getOppositeColor('#ff0055'), '#00ffaa');
    const base = ['#c24b99', '#00ffff', '#12fa05', '#f9393f'];
    const expanded8 = getExpandedLaneColors(base, 8);
    assert.equal(expanded8.length, 8);
    assert.equal(expanded8[0], '#c24b99');
    assert.equal(expanded8[4], getOppositeColor('#c24b99'));
    assert.equal(expanded8[5], getOppositeColor('#00ffff'));
    assert.equal(expanded8[6], getOppositeColor('#12fa05'));
    assert.equal(expanded8[7], getOppositeColor('#f9393f'));
  });

  it('preserves difficulty speed ratios across speed trigger changes', () => {
    const easyBase = getEffectiveScrollSpeed('easy', 1.0);
    const insaneBase = getEffectiveScrollSpeed('insane', 1.0);
    const baseRatio = insaneBase / easyBase;

    for (const preset of [0.5, 0.75, 1.0, 1.5, 1.75, 2.0] as const) {
      const easyTriggered = getEffectiveScrollSpeed('easy', preset);
      const insaneTriggered = getEffectiveScrollSpeed('insane', preset);
      const triggeredRatio = insaneTriggered / easyTriggered;
      assert.ok(Math.abs(triggeredRatio - baseRatio) < 1e-6);
    }
  });

  it('widens playfield while keeping noteSize identical (74) and even spacing for 4, 6, and 8 lanes', () => {
    const layout4 = getPlayfieldLayout({ isLandscape: true, isVS: false, downscroll: true, laneCount: 4 });
    const layout6 = getPlayfieldLayout({ isLandscape: true, isVS: false, downscroll: true, laneCount: 6 });
    const layout8 = getPlayfieldLayout({ isLandscape: true, isVS: false, downscroll: true, laneCount: 8 });

    assert.equal(layout4.noteSize, 74);
    assert.equal(layout6.noteSize, 74);
    assert.equal(layout8.noteSize, 74);

    assert.equal(layout4.playerLaneXs.length, 4);
    assert.equal(layout6.playerLaneXs.length, 6);
    assert.equal(layout8.playerLaneXs.length, 8);

    assert.ok(layout6.width > layout4.width);
    assert.ok(layout8.width > layout6.width);

    // Check even spacing ratio across all 8 lanes
    const step4 = layout4.playerLaneXs[1] - layout4.playerLaneXs[0];
    const step8 = layout8.playerLaneXs[1] - layout8.playerLaneXs[0];
    assert.ok(Math.abs(step8 - step4) <= 1);
  });

  it('resolves active speed triggers and lane expansion transitions', () => {
    const triggers = [
      { id: 't1', time: 1000, type: 'speed' as const, speed: 1.5 as const },
      { id: 't2', time: 2000, type: 'extra_notes' as const, laneCount: 6 as const, transition: 'zoom_burst' as const, transitionDurationSec: 0.5 },
    ];
    assert.equal(getActiveSpeedMultiplierAtTime(triggers, 500, 1.0), 1.0);
    assert.equal(getActiveSpeedMultiplierAtTime(triggers, 1200, 1.0), 1.5);

    const expMid = getActiveLaneExpansionState(triggers, 2250, 4, 'split_out', 0.5);
    assert.equal(expMid.toLanes, 6);
    assert.equal(expMid.isTransitioning, true);
    assert.equal(expMid.transitionType, 'zoom_burst');
  });

  it('enforces Top 1 voting rules unless track is labeled isNewTop1 or user is admin', () => {
    const highest = getHighestTrackRating(ROYALTY_FREE_SONGS);
    assert.equal(highest, 30);

    // Non-admin voting on normal track: <= 30 allowed, > 30 rejected
    assert.equal(
      validateDifficultyVote({ value: 28, highestRating: 30, isNewTop1: false, isAdmin: false }).valid,
      true
    );
    assert.equal(
      validateDifficultyVote({ value: 32, highestRating: 30, isNewTop1: false, isAdmin: false }).valid,
      false
    );

    // When admin labels track as New Top 1, players and admins can vote/set over 30!
    assert.equal(
      validateDifficultyVote({ value: 35, highestRating: 30, isNewTop1: true, isAdmin: false }).valid,
      true
    );
  });

  it('auto-indexes 30 featured tracks sorted from least to greatest numerical rating', () => {
    const indexedIds = autoIndexFeaturedTracks(ROYALTY_FREE_SONGS, {}, 30);
    assert.equal(indexedIds.length, 30);

    const ratings = indexedIds.map((id) => {
      const song = ROYALTY_FREE_SONGS.find((s) => String(s.id) === String(id))!;
      return getEffectiveTrackRating(song, {});
    });

    for (let i = 1; i < ratings.length; i++) {
      assert.ok(
        ratings[i] >= ratings[i - 1],
        `Expected ratings[${i}] (${ratings[i]}) >= ratings[${i - 1}] (${ratings[i - 1]})`
      );
    }
  });

  it('snaps notes onto the beat grid in autoSyncChartNotes and resolves Newgrounds/Spotify links', () => {
    const notes = [
      { time: 492, lane: 0, type: 'normal' as const },
      { time: 1012, lane: 2, type: 'hold' as const, duration: 485 },
    ];
    // 120 BPM, 1/4 step = 125ms per step -> 500ms, 1000ms
    const synced = autoSyncChartNotes(notes, 120, 4);
    assert.equal(synced[0].time, 500);
    assert.equal(synced[1].time, 1000);
    assert.equal(synced[1].duration, 500);

    const ngRes = resolveExternalAudioInput('574484');
    assert.equal(ngRes.ok, true);
    assert.equal(ngRes.sourceType, 'newgrounds');

    const spRes = resolveExternalAudioInput('https://open.spotify.com/playlist/37i9dQZF1FwYctKSlWHO7d');
    assert.equal(spRes.ok, true);
    assert.equal(spRes.sourceType, 'spotify');
  });

  it('levels up and carries over XP in addRewardsCalc', () => {
    const res = addRewardsCalc({ xp: 140, level: 1, coins: 50 }, 30, 25);
    assert.equal(res.level, 2);
    assert.equal(res.xp, 20);
    assert.equal(res.coins, 75);
  });

  it('maps playfield coordinates to lanes accurately', () => {
    const layout = getPlayfieldLayout({ isLandscape: true, isVS: false, downscroll: true });
    assert.equal(getLaneFromPlayfieldX(layout.playerLaneXs[0] + 10, layout), 0);
    assert.equal(getLaneFromPlayfieldPoint(layout.playerLaneXs[2] + 20, layout.receptorY + 20, layout), 2);
    const defaults = getDefaultLaneCoords(true, true);
    assert.equal(defaults.length, 4);
  });
});
