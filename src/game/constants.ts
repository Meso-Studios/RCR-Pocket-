import type {
  Difficulty,
  ExpansionTransitionType,
  ExtraNotesCount,
  MenuGenre,
  Song,
  SpeedTriggerPreset,
} from './types';

export const SPEED_TRIGGER_PRESETS: SpeedTriggerPreset[] = [0.5, 0.75, 1.0, 1.5, 1.75, 2.0];
export const EXTRA_NOTES_PRESETS: ExtraNotesCount[] = [4, 6, 8];

export interface ExpansionTransitionDef {
  id: ExpansionTransitionType;
  name: string;
  shortLabel: string;
  description: string;
}

export const EXPANSION_TRANSITIONS: ExpansionTransitionDef[] = [
  { id: 'split_out', name: 'Split Out (Curtain)', shortLabel: 'SPLIT OUT', description: 'Center curtains part outward as new lanes emerge' },
  { id: 'push_slide', name: 'Push Slide', shortLabel: 'PUSH SLIDE', description: 'Extra lanes slide in dynamically from the outer edges' },
  { id: 'wipe_reveal', name: 'Wipe Reveal', shortLabel: 'WIPE REVEAL', description: 'Directional neon laser wipe sweeps across the playfield' },
  { id: 'zoom_burst', name: 'Zoom Burst', shortLabel: 'ZOOM BURST', description: 'Explosive scale-up pop with shockwave expansion' },
  { id: 'flip_3d', name: '3D Flip Deck', shortLabel: '3D FLIP', description: 'Perspective 3D card-flip into widened playfield' },
  { id: 'blinds_snap', name: 'Venetian Blinds', shortLabel: 'BLINDS', description: 'Segmented arcade slats snap open into place' },
  { id: 'morph_fade', name: 'Smooth Morph', shortLabel: 'MORPH', description: 'Silky eased interpolation and cross-dissolve' },
];

export const TRANSITION_SPEED_STEPS: number[] = Array.from({ length: 20 }, (_, i) =>
  Number(((i + 1) * 0.1).toFixed(1))
);
export const TRACK_RATINGS_STORAGE_KEY = 'rhythmCanvasTrackRatings';
export const SHOP_SHUTDOWN_STORAGE_KEY = 'rhythmCanvasShopShutdown';
export const RHYTHM_LIST_STORAGE_KEY = 'rhythmCanvasRhythmList';

export interface SpotifyPlaylistTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  accent: string;
  secondaryAccent: string;
  previewUrl: string;
  tag: 'HARDTEKK' | 'DUBSTEP' | 'RAVE';
}

export const SPOTIFY_PLAYLIST_ID = '37i9dQZF1FwYctKSlWHO7d';
export const SPOTIFY_PLAYLIST_TITLE = 'Dubstep Hardtekk & Metal Rave';
export const SPOTIFY_PLAYLIST_OWNER = 'Spotify';
export const SPOTIFY_PLAYLIST_URL =
  'https://open.spotify.com/playlist/37i9dQZF1FwYctKSlWHO7d?si=GKBTNfaSQKuoQDP01lJuXw&utm_source=copy-link';
export const SPOTIFY_EMBED_URL =
  'https://open.spotify.com/embed/playlist/37i9dQZF1FwYctKSlWHO7d?utm_source=generator&theme=0';

export const SPOTIFY_PLAYLIST_TRACKS: SpotifyPlaylistTrack[] = [
  {
    id: 'sp-my-destiny',
    title: 'MY DESTINY HARDTEKK',
    artist: 'conqr, RADIXNT',
    bpm: 180,
    accent: '#ff2e88',
    secondaryAccent: '#36e2ff',
    previewUrl: 'https://p.scdn.co/mp3-preview/b4c73256d422668e6b4d850407b38c133573a10f',
    tag: 'HARDTEKK',
  },
  {
    id: 'sp-thermodynamix',
    title: 'Thermodynamix',
    artist: 'dj-Nate',
    bpm: 136,
    accent: '#36e2ff',
    secondaryAccent: '#a855f7',
    previewUrl: 'https://p.scdn.co/mp3-preview/8c006f969c9e18825e8e6452812af983116be288',
    tag: 'DUBSTEP',
  },
  {
    id: 'sp-jealous-hardtekk',
    title: 'JEALOUS (HARDTEKK)',
    artist: 'Der Aztekke',
    bpm: 182,
    accent: '#a3e635',
    secondaryAccent: '#ff2e88',
    previewUrl: 'https://p.scdn.co/mp3-preview/1bd08f12cd8f94b5f5e58afecaaca53311b78b11',
    tag: 'HARDTEKK',
  },
  {
    id: 'sp-intoxicated',
    title: 'Intoxicated',
    artist: 'Doruksen',
    bpm: 175,
    accent: '#f97316',
    secondaryAccent: '#22d3ee',
    previewUrl: 'https://p.scdn.co/mp3-preview/2770b8caf45f4de635b9a3b942f283221794355c',
    tag: 'HARDTEKK',
  },
  {
    id: 'sp-into-the-void',
    title: 'Into The Void (feat. Jordo)',
    artist: 'POLTERGST, RØØTZ, Jordo',
    bpm: 150,
    accent: '#a855f7',
    secondaryAccent: '#36e2ff',
    previewUrl: 'https://p.scdn.co/mp3-preview/c0369458c321db86b8d2343dbdff6691da1261c1',
    tag: 'DUBSTEP',
  },
  {
    id: 'sp-cute-jumpstyle',
    title: 'CUTE JUMPSTYLE',
    artist: 'HELLBLADE, dxnkwer',
    bpm: 162,
    accent: '#ff47a3',
    secondaryAccent: '#ffe23b',
    previewUrl: 'https://p.scdn.co/mp3-preview/ebb2fe6b398a37ffd1b325910501ed842caf594c',
    tag: 'RAVE',
  },
  {
    id: 'sp-bonfire',
    title: 'Bonfire',
    artist: 'Knife Party',
    bpm: 174,
    accent: '#fb923c',
    secondaryAccent: '#ef4444',
    previewUrl: 'https://p.scdn.co/mp3-preview/546fe77c555db3f00f644b62ad9cc6357dd4e5fd',
    tag: 'DUBSTEP',
  },
  {
    id: 'sp-type-sht',
    title: 'TYPE SH*T',
    artist: 'Crankdat, NGHTMRE, Duke Deuce',
    bpm: 145,
    accent: '#22d3ee',
    secondaryAccent: '#ff2e88',
    previewUrl: 'https://p.scdn.co/mp3-preview/4e9c1dafdc7f405dbe57cce4a7ee7bebbdc1759d',
    tag: 'DUBSTEP',
  },
  {
    id: 'sp-boom-boom',
    title: 'Boom, Boom, Boom, Boom!!',
    artist: 'Zak Conner',
    bpm: 165,
    accent: '#a3e635',
    secondaryAccent: '#38bdf8',
    previewUrl: 'https://p.scdn.co/mp3-preview/739655832e5ddbc6977bacb575d184cc8a5e6e8d',
    tag: 'RAVE',
  },
  {
    id: 'sp-woops',
    title: 'Woops',
    artist: 'Dj Bountyhunter',
    bpm: 176,
    accent: '#ef4444',
    secondaryAccent: '#facc15',
    previewUrl: 'https://p.scdn.co/mp3-preview/8585a764532e7b48ec1a5a867487a7b1a8d71946',
    tag: 'HARDTEKK',
  },
  {
    id: 'sp-zavod',
    title: 'ЗАВОД',
    artist: 'ZAPRAVKA',
    bpm: 170,
    accent: '#38bdf8',
    secondaryAccent: '#818cf8',
    previewUrl: 'https://p.scdn.co/mp3-preview/f07da72db1400ca6a6bce2d4302d7069120e36fa',
    tag: 'HARDTEKK',
  },
  {
    id: 'sp-general-release',
    title: 'General Release',
    artist: 'Mike Klubnika',
    bpm: 138,
    accent: '#c084fc',
    secondaryAccent: '#ff2e88',
    previewUrl: 'https://p.scdn.co/mp3-preview/861182dd026ae1f5b0a931c3115ba98ebf1a6d15',
    tag: 'RAVE',
  },
  {
    id: 'sp-invincible',
    title: 'Invincible',
    artist: 'Deaf Kev',
    bpm: 140,
    accent: '#f472b6',
    secondaryAccent: '#22d3ee',
    previewUrl: 'https://p.scdn.co/mp3-preview/d4290ea0e3b020a1ecbf5b63e76adf930b117668',
    tag: 'DUBSTEP',
  },
  {
    id: 'sp-blind',
    title: 'Blind',
    artist: 'Korn',
    bpm: 158,
    accent: '#34d399',
    secondaryAccent: '#38bdf8',
    previewUrl: 'https://p.scdn.co/mp3-preview/7c2868a7b00e17f310b3366160f900749490d468',
    tag: 'RAVE',
  },
  {
    id: 'sp-stranded',
    title: 'Stranded',
    artist: 'Gojira',
    bpm: 160,
    accent: '#facc15',
    secondaryAccent: '#ff2e88',
    previewUrl: 'https://p.scdn.co/mp3-preview/7c153b1c254c73fe348016ce9b56c5f18a1b8f19',
    tag: 'RAVE',
  },
  {
    id: 'sp-roots-bloody-roots',
    title: 'Roots Bloody Roots',
    artist: 'Sepultura',
    bpm: 178,
    accent: '#fb7185',
    secondaryAccent: '#a3e635',
    previewUrl: 'https://p.scdn.co/mp3-preview/6872c1cff7bdfa31df19ff6cad7c7f0e8e28b899',
    tag: 'HARDTEKK',
  },
];

export interface MenuGenreConfig {
  id: MenuGenre;
  label: string;
  shortLabel: string;
  trackTitle: string;
  bpm: number;
  accent: string;
  secondaryAccent: string;
}

export const MENU_GENRE_CONFIGS: Record<MenuGenre, MenuGenreConfig> = {
  spotify: {
    id: 'spotify',
    label: 'SPOTIFY RAVE PLAYLIST',
    shortLabel: 'SPOTIFY',
    trackTitle: 'MY DESTINY HARDTEKK',
    bpm: 175,
    accent: '#1ed760',
    secondaryAccent: '#ff2e88',
  },
  rave: {
    id: 'rave',
    label: 'HYPER RAVE',
    shortLabel: 'RAVE',
    trackTitle: 'HYPER RAVE 2000',
    bpm: 155,
    accent: '#ff2e88',
    secondaryAccent: '#36e2ff',
  },
  dubstep: {
    id: 'dubstep',
    label: 'WOBBLE DUBSTEP',
    shortLabel: 'DUBSTEP',
    trackTitle: 'WOBBLE PROTOCOL',
    bpm: 140,
    accent: '#22d3ee',
    secondaryAccent: '#a855f7',
  },
  hardtekk: {
    id: 'hardtekk',
    label: 'SCHRANZ HARDTEKK',
    shortLabel: 'HARDTEKK',
    trackTitle: 'SCHRANZ TEKK 180',
    bpm: 180,
    accent: '#a3e635',
    secondaryAccent: '#f97316',
  },
};

export const MENU_GENRE_ORDER: MenuGenre[] = ['spotify', 'rave', 'dubstep', 'hardtekk'];

export const KEY_MAP: Record<string, number> = {
  arrowleft: 0,
  a: 0,
  '1': 0,
  arrowdown: 1,
  s: 1,
  '2': 1,
  arrowup: 2,
  w: 2,
  '3': 2,
  arrowright: 3,
  d: 3,
  '4': 3,
  f: 4,
  j: 4,
  '5': 4,
  g: 5,
  k: 5,
  '6': 5,
  h: 6,
  l: 6,
  '7': 6,
  ';': 7,
  '8': 7,
};

export const KEY_CODE_MAP: Record<string, number> = {
  ArrowLeft: 0,
  KeyA: 0,
  Digit1: 0,
  ArrowDown: 1,
  KeyS: 1,
  Digit2: 1,
  ArrowUp: 2,
  KeyW: 2,
  Digit3: 2,
  ArrowRight: 3,
  KeyD: 3,
  Digit4: 3,
  KeyF: 4,
  KeyJ: 4,
  Digit5: 4,
  KeyG: 5,
  KeyK: 5,
  Digit6: 5,
  KeyH: 6,
  KeyL: 6,
  Digit7: 6,
  Semicolon: 7,
  Digit8: 7,
};

export const LANE_LABELS = ['←', '↓', '↑', '→', '↖', '↙', '↗', '↘'] as const;
export const LANE_NAMES = ['LEFT', 'DOWN', 'UP', 'RIGHT', 'EX-1', 'EX-2', 'EX-3', 'EX-4'] as const;

export const APP_VERSION = 2.2;
export const CHANGELOG_VERSION = '2.2.0';
export const CHANGELOG_STORAGE_KEY = 'rhythmCanvasChangelogSeen';
export const ADMIN_EMAILS = [
  'rangoown84@gmail.com',
  'invincible102102@gmail.com',
  'palazzolomarin93@gmail.com',
];
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
  {
    id: 201,
    title: 'MY DESTINY HARDTEKK',
    artist: 'conqr, RADIXNT',
    bpm: 180,
    color: '#ff2e88',
    audioUrl: 'https://p.scdn.co/mp3-preview/b4c73256d422668e6b4d850407b38c133573a10f',
    featured: true,
    stepClick: false,
    difficultyRating: 28.5,
  },
  {
    id: 202,
    title: 'Thermodynamix',
    artist: 'dj-Nate',
    bpm: 136,
    color: '#36e2ff',
    audioUrl: 'https://p.scdn.co/mp3-preview/8c006f969c9e18825e8e6452812af983116be288',
    featured: true,
    stepClick: false,
    difficultyRating: 24.0,
  },
  {
    id: 203,
    title: 'JEALOUS (HARDTEKK)',
    artist: 'Der Aztekke',
    bpm: 182,
    color: '#a3e635',
    audioUrl: 'https://p.scdn.co/mp3-preview/1bd08f12cd8f94b5f5e58afecaaca53311b78b11',
    featured: true,
    stepClick: false,
    difficultyRating: 30.0,
    isNewTop1: true,
  },
  {
    id: 204,
    title: 'Intoxicated',
    artist: 'Doruksen',
    bpm: 175,
    color: '#f97316',
    audioUrl: 'https://p.scdn.co/mp3-preview/2770b8caf45f4de635b9a3b942f283221794355c',
    featured: true,
    stepClick: false,
    difficultyRating: 26.5,
  },
  {
    id: 205,
    title: 'Into The Void',
    artist: 'POLTERGST, RØØTZ',
    bpm: 150,
    color: '#a855f7',
    audioUrl: 'https://p.scdn.co/mp3-preview/c0369458c321db86b8d2343dbdff6691da1261c1',
    featured: true,
    stepClick: false,
    difficultyRating: 19.5,
  },
  {
    id: 206,
    title: 'CUTE JUMPSTYLE',
    artist: 'HELLBLADE, dxnkwer',
    bpm: 162,
    color: '#ff47a3',
    audioUrl: 'https://p.scdn.co/mp3-preview/ebb2fe6b398a37ffd1b325910501ed842caf594c',
    featured: true,
    stepClick: false,
    difficultyRating: 22.0,
  },
  {
    id: 207,
    title: 'Bonfire (DnB / Dubstep)',
    artist: 'Knife Party',
    bpm: 174,
    color: '#fb923c',
    audioUrl: 'https://p.scdn.co/mp3-preview/546fe77c555db3f00f644b62ad9cc6357dd4e5fd',
    featured: true,
    stepClick: false,
    difficultyRating: 25.5,
  },
  {
    id: 208,
    title: 'TYPE SH*T',
    artist: 'Crankdat, NGHTMRE',
    bpm: 145,
    color: '#22d3ee',
    audioUrl: 'https://p.scdn.co/mp3-preview/4e9c1dafdc7f405dbe57cce4a7ee7bebbdc1759d',
    featured: true,
    stepClick: false,
    difficultyRating: 18.0,
  },
  {
    id: 209,
    title: 'Boom, Boom, Boom, Boom!!',
    artist: 'Zak Conner',
    bpm: 165,
    color: '#a3e635',
    audioUrl: 'https://p.scdn.co/mp3-preview/739655832e5ddbc6977bacb575d184cc8a5e6e8d',
    featured: true,
    stepClick: false,
    difficultyRating: 21.0,
  },
  {
    id: 210,
    title: 'Woops (Hardtekk VIP)',
    artist: 'Dj Bountyhunter',
    bpm: 176,
    color: '#ef4444',
    audioUrl: 'https://p.scdn.co/mp3-preview/8585a764532e7b48ec1a5a867487a7b1a8d71946',
    featured: true,
    stepClick: false,
    difficultyRating: 27.0,
  },
  {
    id: 211,
    title: 'ЗАВОД (ZAVOD)',
    artist: 'ZAPRAVKA',
    bpm: 170,
    color: '#38bdf8',
    audioUrl: 'https://p.scdn.co/mp3-preview/f07da72db1400ca6a6bce2d4302d7069120e36fa',
    featured: true,
    stepClick: false,
    difficultyRating: 23.5,
  },
  {
    id: 212,
    title: 'General Release',
    artist: 'Mike Klubnika',
    bpm: 138,
    color: '#c084fc',
    audioUrl: 'https://p.scdn.co/mp3-preview/861182dd026ae1f5b0a931c3115ba98ebf1a6d15',
    featured: true,
    stepClick: false,
    difficultyRating: 16.5,
  },
  {
    id: 213,
    title: 'Invincible',
    artist: 'Deaf Kev',
    bpm: 140,
    color: '#f472b6',
    audioUrl: 'https://p.scdn.co/mp3-preview/d4290ea0e3b020a1ecbf5b63e76adf930b117668',
    featured: true,
    stepClick: false,
    difficultyRating: 15.0,
  },
  {
    id: 214,
    title: 'Blind (Metal Rave)',
    artist: 'Korn',
    bpm: 158,
    color: '#34d399',
    audioUrl: 'https://p.scdn.co/mp3-preview/7c2868a7b00e17f310b3366160f900749490d468',
    featured: true,
    stepClick: false,
    difficultyRating: 20.5,
  },
  {
    id: 215,
    title: 'Stranded',
    artist: 'Gojira',
    bpm: 160,
    color: '#facc15',
    audioUrl: 'https://p.scdn.co/mp3-preview/7c153b1c254c73fe348016ce9b56c5f18a1b8f19',
    featured: true,
    stepClick: false,
    difficultyRating: 22.5,
  },
  {
    id: 216,
    title: 'Roots Bloody Roots',
    artist: 'Sepultura',
    bpm: 178,
    color: '#fb7185',
    audioUrl: 'https://p.scdn.co/mp3-preview/6872c1cff7bdfa31df19ff6cad7c7f0e8e28b899',
    featured: true,
    stepClick: false,
    difficultyRating: 27.5,
  },
  { id: 101, title: 'HYPER RAVE 2000', artist: 'Rave Core', bpm: 155, color: '#ff2e88', audioUrl: 'synth:rave', featured: true, stepClick: false, difficultyRating: 17.5 },
  { id: 102, title: 'WOBBLE PROTOCOL', artist: 'Sub Bass Labs', bpm: 140, color: '#22d3ee', audioUrl: 'synth:dubstep', featured: true, stepClick: false, difficultyRating: 14.0 },
  { id: 103, title: 'SCHRANZ TEKK 180', artist: 'Tekk Foundry', bpm: 180, color: '#a3e635', audioUrl: 'synth:hardtekk', featured: true, stepClick: false, difficultyRating: 29.0 },
  { id: 1, title: 'Neon Drift', artist: 'Royalty Free', bpm: 120, color: '#f472b6', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', featured: true, difficultyRating: 4.5 },
  { id: 2, title: 'Cyber City', artist: 'Royalty Free', bpm: 130, color: '#38bdf8', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', featured: true, difficultyRating: 6.0 },
  { id: 3, title: 'Synthwave Nights', artist: 'Royalty Free', bpm: 140, color: '#a78bfa', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', featured: true, difficultyRating: 8.5 },
  { id: 4, title: 'Retro Run', artist: 'Royalty Free', bpm: 150, color: '#fb923c', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', featured: true, difficultyRating: 11.0 },
  { id: 5, title: 'Pixel Dawn', artist: 'Royalty Free', bpm: 160, color: '#facc15', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', featured: true, difficultyRating: 13.0 },
  { id: 6, title: 'Arcade Assault', artist: 'Royalty Free', bpm: 170, color: '#fb7185', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', featured: true, difficultyRating: 15.5 },
  { id: 7, title: 'Vapor Trail', artist: 'Royalty Free', bpm: 115, color: '#2dd4bf', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', featured: true, difficultyRating: 3.5 },
  { id: 8, title: 'Glitch Mode', artist: 'Royalty Free', bpm: 125, color: '#c084fc', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', featured: true, difficultyRating: 5.5 },
  { id: 9, title: 'Laser Grid', artist: 'Royalty Free', bpm: 135, color: '#f472b6', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', featured: true, difficultyRating: 7.5 },
  { id: 10, title: 'Overclocked', artist: 'Royalty Free', bpm: 145, color: '#818cf8', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', featured: true, difficultyRating: 10.0 },
  { id: 11, title: 'Data Stream', artist: 'Royalty Free', bpm: 155, color: '#e879f9', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3', featured: true, difficultyRating: 12.0 },
  { id: 12, title: 'Mainframe', artist: 'Royalty Free', bpm: 180, color: '#fbbf24', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3', featured: false, difficultyRating: 25.0 },
];

export const MENU_BGM = 'https://p.scdn.co/mp3-preview/9341d80aa95b5caae8421b60bb636895f3c8d044';
export const ONLINE_BGM = 'https://p.scdn.co/mp3-preview/6ac303fa96d6459a2d5a4bc097028f7eb182ce34';

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
