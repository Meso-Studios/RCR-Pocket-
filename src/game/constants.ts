import type { Difficulty, Song } from './types';

export const KEY_MAP: Record<string, number> = {
  arrowleft: 0,
  a: 0,
  j: 0,
  arrowdown: 1,
  s: 1,
  k: 1,
  arrowup: 2,
  w: 2,
  i: 2,
  arrowright: 3,
  d: 3,
  l: 3,
};

export const KEY_CODE_MAP: Record<string, number> = {
  ArrowLeft: 0,
  KeyA: 0,
  KeyJ: 0,
  ArrowDown: 1,
  KeyS: 1,
  KeyK: 1,
  ArrowUp: 2,
  KeyW: 2,
  KeyI: 2,
  ArrowRight: 3,
  KeyD: 3,
  KeyL: 3,
};

export const LANE_LABELS = ['←', '↓', '↑', '→'] as const;
export const LANE_NAMES = ['LEFT', 'DOWN', 'UP', 'RIGHT'] as const;

export const APP_VERSION = 2.1;
export const CHANGELOG_VERSION = '2.1.0';
export const CHANGELOG_STORAGE_KEY = 'rhythmCanvasChangelogSeen';
export const ADMIN_EMAILS = ['rangoown84@gmail.com', 'invincible102102@gmail.com'];
export const SECRET_DEV_CODE = '070813a!070813a!070813a!';

export interface SkinDef {
  name: string;
  price: number;
  colors: string[];
  hidden?: boolean;
}

export const SKINS: Record<string, SkinDef> = {
  default: { name: 'Classic', price: 0, colors: ['#c24b99', '#00ffff', '#12fa05', '#f9393f'] },
  gold: { name: 'Golden Shine', price: 1500, colors: ['#fef08a', '#fde047', '#facc15', '#eab308'] },
  ice: { name: 'Glacial Chill', price: 2000, colors: ['#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9'] },
  fire: { name: 'Inferno', price: 2500, colors: ['#fca5a5', '#f87171', '#ef4444', '#dc2626'] },
  void: { name: 'Abyssal Void', price: 5000, colors: ['#d4d4d8', '#a1a1aa', '#71717a', '#52525b'] },
  custom: { name: 'Dev Custom', price: 0, colors: ['#ff0055', '#00ffcc', '#00ff00', '#ffaa00'], hidden: true },
};

export const SHAPES: Record<'arrow' | 'circle', { name: string; price: number; type: 'arrow' | 'circle' }> = {
  arrow: { name: 'Arrow Notes', price: 0, type: 'arrow' },
  circle: { name: 'Circle Notes', price: 0, type: 'circle' },
};

export const HIT_WINDOWS = { sick: 45, good: 90, bad: 135, miss: 180 };
export const SCROLL_SPEEDS: Record<Difficulty, number> = { easy: 0.4, normal: 0.6, hard: 0.8, insane: 1.1 };
export const LANE_WIDTH = 100;
export const CANVAS_WIDTH = 440;
export const CANVAS_HEIGHT = 600;
export const LANDSCAPE_CANVAS_WIDTH = 860;
export const LANDSCAPE_CANVAS_HEIGHT = 440;

export const ROYALTY_FREE_SONGS: Song[] = [
  { id: 1, title: 'Neon Drift', artist: 'Royalty Free', bpm: 120, color: '#f472b6', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', featured: false },
  { id: 2, title: 'Cyber City', artist: 'Royalty Free', bpm: 130, color: '#38bdf8', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', featured: false },
  { id: 3, title: 'Synthwave Nights', artist: 'Royalty Free', bpm: 140, color: '#a78bfa', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', featured: false },
  { id: 4, title: 'Retro Run', artist: 'Royalty Free', bpm: 150, color: '#fb923c', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', featured: false },
  { id: 5, title: 'Pixel Dawn', artist: 'Royalty Free', bpm: 160, color: '#facc15', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', featured: false },
  { id: 6, title: 'Arcade Assault', artist: 'Royalty Free', bpm: 170, color: '#fb7185', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', featured: false },
  { id: 7, title: 'Vapor Trail', artist: 'Royalty Free', bpm: 115, color: '#2dd4bf', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', featured: false },
  { id: 8, title: 'Glitch Mode', artist: 'Royalty Free', bpm: 125, color: '#c084fc', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', featured: false },
  { id: 9, title: 'Laser Grid', artist: 'Royalty Free', bpm: 135, color: '#f472b6', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', featured: false },
  { id: 10, title: 'Overclocked', artist: 'Royalty Free', bpm: 145, color: '#818cf8', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', featured: false },
  { id: 11, title: 'Data Stream', artist: 'Royalty Free', bpm: 155, color: '#e879f9', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3', featured: false },
  { id: 12, title: 'Mainframe', artist: 'Royalty Free', bpm: 180, color: '#fbbf24', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3', featured: false },
];

export const MENU_BGM = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3';
export const ONLINE_BGM = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3';

export const NOTE_EFFECTS = [
  ['score_boost', 'Score Surge', 'Bonus score'],
  ['heal', 'Vital Spark', 'Restore health'],
  ['combo_guard', 'Combo Guard', 'Protect combo'],
  ['coin_bonus', 'Coin Magnet', 'Bonus coins'],
  ['xp_bonus', 'XP Reactor', 'Bonus XP'],
  ['wide_window', 'Wide Window', 'Wider timing'],
  ['perfect_lock', 'Perfect Lock', 'Upgrade judgment'],
  ['double_hit', 'Echo Hit', 'Second score burst'],
  ['shield', 'Shield', 'Block damage'],
  ['life_steal', 'Life Steal', 'Convert score to health'],
  ['fever', 'Fever', 'Temporary fever'],
  ['slow_time', 'Time Bend', 'Brief slowdown'],
  ['speed_burst', 'Overdrive', 'Brief speed burst'],
  ['gravity', 'Gravity Flip', 'Flip scroll flash'],
  ['lane_shuffle', 'Lane Warp', 'Shuffle visuals'],
  ['rainbow', 'Prism', 'Rainbow hit burst'],
  ['explosion', 'Nova', 'Large hit explosion'],
  ['freeze', 'Freeze Frame', 'Brief freeze flash'],
  ['screen_pulse', 'Screen Pulse', 'Strong screen pulse'],
  ['shake', 'Quake', 'Screen shake'],
  ['ghost', 'Ghost Trail', 'Note ghost trail'],
  ['spark', 'Spark Shower', 'Extra sparks'],
  ['flame', 'Flame Trail', 'Flame particles'],
  ['ice', 'Ice Burst', 'Ice particles'],
  ['lightning', 'Lightning', 'Electric flash'],
  ['void', 'Void Rift', 'Dark pulse'],
  ['gold_rush', 'Gold Rush', 'Gold hit effect'],
  ['accuracy_save', 'Accuracy Save', 'Reduce miss impact'],
  ['hold_power', 'Hold Power', 'Boost hold score'],
  ['chord_power', 'Chord Power', 'Boost chords'],
  ['streak_heal', 'Streak Heal', 'Heal on streaks'],
  ['streak_score', 'Streak Score', 'Scale with combo'],
  ['risk_reward', 'Risk Reward', 'More score, more risk'],
  ['last_stand', 'Last Stand', 'Survive lethal damage'],
  ['auto_sick', 'Sick Chance', 'Chance to perfect'],
  ['demon_ward', 'Demon Ward', 'Protect from demons'],
  ['pulse_blast', 'Pulse Blast', 'BPM synced blast'],
  ['mirror_flash', 'Mirror Flash', 'Mirror visual flash'],
  ['tiny_notes', 'Mini Mode', 'Shrink notes briefly'],
  ['giant_notes', 'Giant Mode', 'Grow notes briefly'],
  ['jackpot', 'Jackpot', 'Rare huge reward'],
  ['revive', 'Phoenix', 'Chance to revive'],
].map(([id, name, description]) => ({ id, name, description }));

export const NOTE_RARITIES: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#38bdf8',
  'super-rare': '#c084fc',
  legendary: '#f59e0b',
  mythical: '#fb3bc7',
};
