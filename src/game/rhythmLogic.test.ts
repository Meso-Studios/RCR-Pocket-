import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoIndexFeaturedTracks,
  autoSyncNotesToBpm,
  computeEffectiveScrollSpeed,
  computeExpandedPlayfieldLayout,
  computeInvisibleNoteVisibility,
  computeTrackProgressPercent,
  computeVelocityNoteScroll,
  evaluateActiveTriggers,
  formatTrackRatingBadge,
  getActiveVelocityEffectAtTime,
  getDisplayTrackRating,
  getLaneColor,
  invertHexColor,
  isInvisibleTriggerActiveAtTime,
  mapCustomKeyToLane,
  resolveExternalAudioInput,
  snapTimeToBeatGrid,
  validateDifficultyVote,
} from './rhythmLogic';
import { NOTE_VELOCITY_EFFECTS } from './constants';
import type { ChartNote, ChartTrigger, Song, TrackRatingsMap } from './types';

test('Featured levels rating defaults to N/A unless in Rhythm List or Admin Rated', () => {
  const unratedFeatured: Song = {
    id: 'feat-1',
    title: 'Featured Unrated',
    artist: 'Artist',
    bpm: 140,
    difficulty: 'hard',
    color: '#00f0ff',
    featured: true,
  };

  assert.equal(getDisplayTrackRating(unratedFeatured, {}, []), null);
  assert.equal(formatTrackRatingBadge(getDisplayTrackRating(unratedFeatured, {}, [])), 'N/A');

  // When included in rhythmList, it displays a numeric rating
  const inListRating = getDisplayTrackRating(unratedFeatured, {}, ['feat-1']);
  assert.equal(typeof inListRating, 'number');
  assert.equal(formatTrackRatingBadge(inListRating), '16');

  // When explicitly rated by an admin, it displays the admin rating even if not in rhythmList
  const ratingsMap: TrackRatingsMap = {
    'feat-1': { adminRating: 27, votes: [] },
  };
  assert.equal(getDisplayTrackRating(unratedFeatured, ratingsMap, []), 27);
  assert.equal(formatTrackRatingBadge(getDisplayTrackRating(unratedFeatured, ratingsMap, [])), '27');
});

test('autoIndexFeaturedTracks sorts up to 30 featured tracks from least to greatest rating', () => {
  const songs: Song[] = [
    { id: 's3', title: 'Hard', artist: 'A', bpm: 150, difficulty: 'hard', color: '#fff', featured: true },
    { id: 's1', title: 'Easy', artist: 'A', bpm: 120, difficulty: 'easy', color: '#fff', featured: true },
    { id: 's2', title: 'Mid', artist: 'A', bpm: 130, difficulty: 'normal', color: '#fff', featured: true },
  ];
  const ratings: TrackRatingsMap = {
    s3: { adminRating: 22, votes: [] },
    s1: { adminRating: 5, votes: [] },
    s2: { adminRating: 12, votes: [] },
  };

  const sortedIds = autoIndexFeaturedTracks(songs, ratings, 30);
  assert.deepEqual(sortedIds, ['s1', 's2', 's3']);
});

test('validateDifficultyVote enforces highest rating cap unless New Top 1 or Admin', () => {
  const overCap = validateDifficultyVote({
    proposedRating: 35,
    currentHighestRating: 28,
    isNewTop1: false,
    isAdmin: false,
  });
  assert.equal(overCap.valid, false);

  const validTop1 = validateDifficultyVote({
    proposedRating: 35,
    currentHighestRating: 28,
    isNewTop1: true,
    isAdmin: false,
  });
  assert.equal(validTop1.valid, true);
  assert.equal(validTop1.clampedRating, 35);
});

test('Invisible Notes Trigger flashes early-to-mid travel and fades to 0 alpha after 0.52', () => {
  const early = computeInvisibleNoteVisibility(0.22);
  assert.equal(early.alpha, 1.0);
  assert.ok(early.flashBoost > 0.4);

  const fading = computeInvisibleNoteVisibility(0.44);
  assert.ok(fading.alpha > 0 && fading.alpha < 1);

  const hidden = computeInvisibleNoteVisibility(0.65);
  assert.equal(hidden.alpha, 0);

  const triggers: ChartTrigger[] = [
    { id: 'inv-1', time: 2000, type: 'invisible_notes', invisibleEnabled: true, invisibleDurationMs: 5000 },
  ];
  assert.equal(isInvisibleTriggerActiveAtTime(triggers, 1000), false);
  assert.equal(isInvisibleTriggerActiveAtTime(triggers, 3500), true);
  assert.equal(isInvisibleTriggerActiveAtTime(triggers, 8000), false);
});

test('All 12 Note Velocity Trigger effects modulate scroll while staying locked on time at receptor (p=1.0)', () => {
  assert.equal(NOTE_VELOCITY_EFFECTS.length, 12);
  for (const eff of NOTE_VELOCITY_EFFECTS) {
    const atSpawn = computeVelocityNoteScroll(0, eff.id, 1.0);
    const atReceptor = computeVelocityNoteScroll(1.0, eff.id, 1.0);
    assert.ok(Math.abs(atSpawn.visualProgress) < 0.001, `${eff.id} at spawn`);
    assert.equal(atReceptor.visualProgress, 1.0, `${eff.id} must arrive exactly on beat at p=1.0`);
    assert.equal(atReceptor.lateralOffsetPx, 0, `${eff.id} must have 0 lateral offset at receptor`);
  }

  const triggers: ChartTrigger[] = [
    { id: 'v1', time: 1500, type: 'note_velocity', velocityEffect: 'hyper_warp', velocityIntensity: 1.2 },
  ];
  assert.equal(getActiveVelocityEffectAtTime(triggers, 1000).effect, 'linear');
  assert.equal(getActiveVelocityEffectAtTime(triggers, 2000).effect, 'hyper_warp');
});

test('Custom 8-note keybinds map all 8 lanes accurately', () => {
  const custom = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'];
  assert.equal(mapCustomKeyToLane('a', 'KeyA', custom), 0);
  assert.equal(mapCustomKeyToLane('f', 'KeyF', custom), 3);
  assert.equal(mapCustomKeyToLane('h', 'KeyH', custom), 4);
  assert.equal(mapCustomKeyToLane('l', 'KeyL', custom), 7);
});

test('External audio resolver handles Newgrounds IDs and Spotify links reliably', () => {
  const ng = resolveExternalAudioInput('1094821');
  assert.equal(ng.sourceType, 'newgrounds');
  assert.equal(ng.cleanId, '1094821');
  assert.ok(ng.audioUrl.startsWith('synth:') || ng.audioUrl.startsWith('https://'));

  const sp = resolveExternalAudioInput('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(sp.sourceType, 'spotify');
  assert.ok(sp.audioUrl.startsWith('synth:') || sp.audioUrl.startsWith('https://'));
});

test('Opposite color calculation and playfield expansion preserve note size and speed ratio', () => {
  assert.equal(invertHexColor('#00f0ff'), '#ff0f00');
  assert.notEqual(getLaneColor(0), getLaneColor(4));

  const layout4 = computeExpandedPlayfieldLayout({ baseWidth: 880, targetLaneCount: 4 });
  const layout8 = computeExpandedPlayfieldLayout({ baseWidth: 880, targetLaneCount: 8 });
  assert.equal(layout4.noteSizePx, layout8.noteSizePx);
  assert.ok(layout8.expandedWidthPx > layout4.expandedWidthPx);
  assert.equal(layout8.laneCentersPx.length, 8);

  const easy1x = computeEffectiveScrollSpeed('easy', 1.0);
  const hard1x = computeEffectiveScrollSpeed('hard', 1.0);
  const easy2x = computeEffectiveScrollSpeed('easy', 2.0);
  const hard2x = computeEffectiveScrollSpeed('hard', 2.0);
  assert.ok(Math.abs(hard1x / easy1x - hard2x / easy2x) < 0.001);

  assert.equal(computeTrackProgressPercent(45000, 90000), 50);

  const active = evaluateActiveTriggers(
    [{ id: 't1', time: 1000, type: 'extra_notes', lanes: 6, transition: 'zoom_burst', transitionDuration: 0.5 }],
    1250
  );
  assert.equal(active.targetLaneCount, 6);
  assert.equal(active.previousLaneCount, 4);
});

test('Auto-sync snaps recorded notes onto BPM subdivision grid', () => {
  assert.equal(snapTimeToBeatGrid(512, 120, 4), 500);
  const raw: ChartNote[] = [{ time: 492, lane: 0 }, { time: 1011, lane: 2 }];
  const synced = autoSyncNotesToBpm(raw, 120, 4);
  assert.equal(synced[0].time, 500);
  assert.equal(synced[1].time, 1000);
});
