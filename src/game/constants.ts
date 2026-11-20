import type {
  ExpansionTransitionType,
  ExtraNotesCount,
  HapticsSettings,
  MenuGenre,
  NoteVelocityEffect,
  PlayerProfile,
  SkinShape,
  Song,
  SpeedTriggerPreset,
} from './types';

export const APP_VERSION = 2.5;
export const CHANGELOG_VERSION = 'v2.5-osu-arcade-triggers';
export const CHANGELOG_STORAGE_KEY = 'rhythm_canvas_changelog_seen_v25';
export const RHYTHM_LIST_STORAGE_KEY = 'rhythm_canvas_rhythm_list_v1';
export const TRACK_RATINGS_STORAGE_KEY = 'rhythm_canvas_track_ratings_v1';
export const SHOP_SHUTDOWN_STORAGE_KEY = 'rhythm_canvas_shop_shutdown_v1';
export const CUSTOM_ADMINS_STORAGE_KEY = 'rhythm_canvas_custom_admins_v1';
export const SECRET_DEV_CODE = 'RHYTHMDEV777';

export const CANVAS_WIDTH = 440;
export const CANVAS_HEIGHT = 700;
export const LANDSCAPE_CANVAS_WIDTH = 880;
export const LANDSCAPE_CANVAS_HEIGHT = 500;

export const LANE_LABELS = ['LEFT', 'DOWN', 'UP', 'RIGHT', 'EX-1', 'EX-2', 'EX-3', 'EX-4'] as const;

export const LANE_COLORS_8 = [
  '#36e2ff', // Lane 1 Cyan
  '#ff2e88', // Lane 2 Pink
  '#a3e635', // Lane 3 Lime
  '#facc15', // Lane 4 Gold
  '#c91d00', // Lane 5 Opposite of Cyan
  '#00d177', // Lane 6 Opposite of Pink
  '#5c19ca', // Lane 7 Opposite of Lime
  '#0533ea', // Lane 8 Opposite of Gold
];

export const HIT_WINDOWS = {
  sick: 45,
  good: 90,
  bad: 135,
  miss: 180,
};

export const SCROLL_SPEEDS: Record<string, number> = {
  easy: 0.48,
  normal: 0.65,
  hard: 0.82,
  insane: 1.05,
  Easy: 0.48,
  Medium: 0.65,
  Hard: 0.82,
  Expert: 0.96,
  Death: 1.12,
};

export const DEFAULT_CUSTOM_KEYBINDS: string[] = [
  'KeyD',
  'KeyF',
  'KeyJ',
  'KeyK',
  'KeyS',
  'KeyL',
  'KeyA',
  'Semicolon',
];

export const KEY_MAP: Record<string, number> = {
  arrowleft: 0,
  arrowdown: 1,
  arrowup: 2,
  arrowright: 3,
  d: 0,
  f: 1,
  j: 2,
  k: 3,
  s: 4,
  l: 5,
  a: 6,
  ';': 7,
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
};

export const KEY_CODE_MAP: Record<string, number> = {
  ArrowLeft: 0,
  ArrowDown: 1,
  ArrowUp: 2,
  ArrowRight: 3,
  KeyD: 0,
  KeyF: 1,
  KeyJ: 2,
  KeyK: 3,
  KeyS: 4,
  KeyL: 5,
  KeyA: 6,
  Semicolon: 7,
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Digit8: 7,
};

export const SKINS: Record<
  string,
  { name: string; price: number; colors: string[]; desc?: string }
> = {
  default: {
    name: 'NEON CYBER',
    price: 0,
    colors: ['#36e2ff', '#ff2e88', '#34d399', '#facc15'],
    desc: 'Signature high-contrast arcade cyan & magenta neon palette.',
  },
  vaporwave: {
    name: 'VAPORWAVE SUNSET',
    price: 250,
    colors: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff'],
    desc: 'Retro outrun synthwave pastel glow.',
  },
  inferno: {
    name: 'CRIMSON OVERDRIVE',
    price: 500,
    colors: ['#ff1e42', '#ff7b00', '#facc15', '#fb7185'],
    desc: 'Blazing high-BPM volcanic arcade palette.',
  },
  hardtekk: {
    name: 'HARDTEKK VOLT',
    price: 750,
    colors: ['#a3e635', '#22d3ee', '#f43f5e', '#facc15'],
    desc: 'Industrial warehouse rave strobe colors.',
  },
  custom: {
    name: 'CUSTOM PALETTE',
    price: 1000,
    colors: ['#36e2ff', '#ff2e88', '#34d399', '#facc15'],
    desc: 'Design your own 4-lane color mix.',
  },
};

export const SHAPES: Record<SkinShape, { name: string; price: number; desc?: string }> = {
  arrow: {
    name: 'ARCADE ARROWS',
    price: 0,
    desc: 'Directional DDR/FNF bevelled rhythm arrows.',
  },
  circle: {
    name: 'OSU! ORBS',
    price: 300,
    desc: 'Precision osu! mania style circular rhythm orbs.',
  },
};

export const NOTE_RARITIES: Record<string, string> = {
  common: '#94a3b8',
  rare: '#38bdf8',
  epic: '#c084fc',
  legendary: '#facc15',
  mythic: '#ff2e88',
};

export const NOTE_EFFECTS: { id: string; name: string; desc: string }[] = [
  { id: 'pulse_glow', name: 'PULSE GLOW', desc: 'Rhythmic neon outer bloom on beat' },
  { id: 'chromatic_trail', name: 'CHROMATIC TRAIL', desc: 'RGB afterimage trail during fast streams' },
  { id: 'spark_burst', name: 'SPARK BURST', desc: 'Extra particle explosion on SICK! judgment' },
  { id: 'holo_shimmer', name: 'HOLO SHIMMER', desc: 'Iridescent metallic sheen across note face' },
];

export const SPEED_TRIGGER_PRESETS: SpeedTriggerPreset[] = [0.5, 0.75, 1.0, 1.5, 1.75, 2.0];

export const EXTRA_NOTES_PRESETS: ExtraNotesCount[] = [4, 6, 8];
export const EXTRA_LANE_OPTIONS: ExtraNotesCount[] = [4, 6, 8];

export const EXPANSION_TRANSITIONS: {
  id: ExpansionTransitionType;
  label: string;
  shortLabel: string;
  name: string;
  desc: string;
  description: string;
}[] = [
  {
    id: 'split_out',
    label: 'CENTER SPLIT',
    shortLabel: 'SPLIT',
    name: 'CENTER SPLIT',
    desc: 'Playfield splits outward from the center line',
    description: 'Playfield splits outward from the center line',
  },
  {
    id: 'wipe_reveal',
    label: 'LASER WIPE',
    shortLabel: 'WIPE',
    name: 'LASER WIPE',
    desc: 'Horizontal neon laser sweeps new lanes into view',
    description: 'Horizontal neon laser sweeps new lanes into view',
  },
  {
    id: 'zoom_burst',
    label: 'ZOOM BURST',
    shortLabel: 'ZOOM',
    name: 'ZOOM BURST',
    desc: 'Punchy radial camera zoom expansion',
    description: 'Punchy radial camera zoom expansion',
  },
  {
    id: 'blinds_snap',
    label: 'SHUTTER BLINDS',
    shortLabel: 'BLINDS',
    name: 'SHUTTER BLINDS',
    desc: 'Venetian shutter slats snap open across the highway',
    description: 'Venetian shutter slats snap open across the highway',
  },
  {
    id: 'flip_3d',
    label: '3D CARD FLIP',
    shortLabel: '3D FLIP',
    name: '3D CARD FLIP',
    desc: 'Perspective 3D rotation into wider highway',
    description: 'Perspective 3D rotation into wider highway',
  },
  {
    id: 'edge_slide',
    label: 'STAGE CURTAIN',
    shortLabel: 'CURTAIN',
    name: 'STAGE CURTAIN',
    desc: 'Outer lanes glide out smoothly like stage curtains',
    description: 'Outer lanes glide out smoothly like stage curtains',
  },
  {
    id: 'flash_cut',
    label: 'STROBE CUT',
    shortLabel: 'STROBE',
    name: 'STROBE CUT',
    desc: 'Instant rave strobe flash into expanded lanes',
    description: 'Instant rave strobe flash into expanded lanes',
  },
];

export const LANE_EXPANSION_TRANSITIONS = EXPANSION_TRANSITIONS;

export const NOTE_VELOCITY_EFFECTS: {
  id: NoteVelocityEffect;
  name: string;
  desc: string;
  description: string;
  color: string;
}[] = [
  { id: 'linear', name: '1. LINEAR LOCK', desc: 'Standard constant scroll velocity', description: 'Standard constant scroll velocity', color: '#38bdf8' },
  { id: 'ease_in_rush', name: '2. EASE-IN RUSH', desc: 'Starts slow at spawn and accelerates toward receptor', description: 'Starts slow at spawn and accelerates toward receptor', color: '#f43f5e' },
  { id: 'ease_out_brake', name: '3. EASE-OUT BRAKE', desc: 'Launches fast then smoothly decelerates onto beat', description: 'Launches fast then smoothly decelerates onto beat', color: '#10b981' },
  { id: 'elastic_bounce', name: '4. ELASTIC SPRING', desc: 'Springy micro-oscillation while staying locked on beat', description: 'Springy micro-oscillation while staying locked on beat', color: '#a855f7' },
  { id: 'sine_wave_flow', name: '5. SINE WAVE FLOW', desc: 'Smooth accordion wave compression and expansion', description: 'Smooth accordion wave compression and expansion', color: '#06b6d4' },
  { id: 'stutter_step', name: '6. STUTTER STEP', desc: 'Quantized 1/8th beat step-freeze staircase motion', description: 'Quantized 1/8th beat step-freeze staircase motion', color: '#f59e0b' },
  { id: 'boomerang_pull', name: '7. BOOMERANG PULL', desc: 'Brief pullback mid-flight before snapping to receptor', description: 'Brief pullback mid-flight before snapping to receptor', color: '#ec4899' },
  { id: 'heartbeat_pulse', name: '8. HEARTBEAT PULSE', desc: 'Double-thump rhythmic velocity surge', description: 'Double-thump rhythmic velocity surge', color: '#ef4444' },
  { id: 'hyper_warp', name: '9. HYPER WARP', desc: 'Hangs at top then teleports down in final stretch', description: 'Hangs at top then teleports down in final stretch', color: '#8b5cf6' },
  { id: 'spiral_sway', name: '10. SPIRAL SWAY', desc: 'Helical lateral weave + vertical wave modulation', description: 'Helical lateral weave + vertical wave modulation', color: '#14b8a6' },
  { id: 'gravity_drop', name: '11. GRAVITY DROP', desc: 'Free-fall quadratic gravitational acceleration', description: 'Free-fall quadratic gravitational acceleration', color: '#eab308' },
  { id: 'pendulum_swing', name: '12. PENDULUM SWING', desc: 'Alternating lane sway synchronized with scroll progress', description: 'Alternating lane sway synchronized with scroll progress', color: '#3b82f6' },
];

export const SPOTIFY_PLAYLIST_URL =
  'https://open.spotify.com/playlist/37i9dQZF1FwYctKSlWHO7d?si=GKBTNfaSQKuoQDP01lJuXw&utm_source=copy-link';
export const SPOTIFY_EMBED_URL =
  'https://open.spotify.com/embed/playlist/37i9dQZF1FwYctKSlWHO7d?utm_source=generator&theme=0';
export const SPOTIFY_PLAYLIST_TITLE = 'Spotify Rhythm Mix (37i9dQZF1FwYctKSlWHO7d)';
export const SPOTIFY_PLAYLIST_OWNER = 'Spotify Rave & Rhythm Mix';

export const MENU_BGM = 'synth:spotify';
export const ONLINE_BGM = 'synth:rave';

export const SPOTIFY_PLAYLIST_TRACKS: {
  id: string;
  title: string;
  artist: string;
  tag: string;
  bpm: number;
  url: string;
  audioUrl: string;
  genre: string;
  accent: string;
  secondaryAccent: string;
}[] = [
  {
    id: 'sp-1',
    title: 'CYBER RAVE OVERDRIVE',
    artist: 'Spotify Playlist Mix #1',
    tag: 'HYPER RAVE',
    bpm: 150,
    url: 'synth:rave',
    audioUrl: 'synth:rave',
    genre: 'RAVE',
    accent: '#ff2e88',
    secondaryAccent: '#36e2ff',
  },
  {
    id: 'sp-2',
    title: 'SUBWOOFER SHATTER',
    artist: 'Spotify Playlist Mix #2',
    tag: 'HEAVY DUBSTEP',
    bpm: 140,
    url: 'synth:dubstep',
    audioUrl: 'synth:dubstep',
    genre: 'DUBSTEP',
    accent: '#36e2ff',
    secondaryAccent: '#a855f7',
  },
  {
    id: 'sp-3',
    title: 'HARDTEKK WAREHOUSE 180',
    artist: 'Spotify Playlist Mix #3',
    tag: 'HARDTEKK 180',
    bpm: 175,
    url: 'synth:hardtekk',
    audioUrl: 'synth:hardtekk',
    genre: 'HARDTEKK',
    accent: '#facc15',
    secondaryAccent: '#ff2e88',
  },
];

export const MENU_MUSIC_PLAYLIST = SPOTIFY_PLAYLIST_TRACKS;

export const MENU_GENRE_ORDER: MenuGenre[] = ['spotify', 'rave', 'dubstep', 'hardtekk'];

export const MENU_GENRE_CONFIGS: Record<
  MenuGenre,
  {
    label: string;
    shortLabel: string;
    trackTitle: string;
    bpm: number;
    url: string;
    accentColor: string;
    accent: string;
    secondaryAccent: string;
    badge: string;
  }
> = {
  spotify: {
    label: 'SPOTIFY MIX',
    shortLabel: 'SPOTIFY',
    trackTitle: 'Spotify Rhythm Mix',
    bpm: 150,
    url: SPOTIFY_PLAYLIST_TRACKS[0].url,
    accentColor: '#1db954',
    accent: '#1db954',
    secondaryAccent: '#36e2ff',
    badge: '37i9dQZF1FwYctKSlWHO7d',
  },
  rave: {
    label: 'NEON RAVE',
    shortLabel: 'RAVE',
    trackTitle: 'Cyber Rave Overdrive',
    bpm: 155,
    url: SPOTIFY_PLAYLIST_TRACKS[0].url,
    accentColor: '#ff2e88',
    accent: '#ff2e88',
    secondaryAccent: '#36e2ff',
    badge: '155 BPM HYPER RAVE',
  },
  dubstep: {
    label: 'HEAVY DUBSTEP',
    shortLabel: 'DUBSTEP',
    trackTitle: 'Subwoofer Shatter',
    bpm: 140,
    url: SPOTIFY_PLAYLIST_TRACKS[1].url,
    accentColor: '#36e2ff',
    accent: '#36e2ff',
    secondaryAccent: '#a855f7',
    badge: '140 BPM BASS DROP',
  },
  hardtekk: {
    label: 'HARDTEKK 180',
    shortLabel: 'HARDTEKK',
    trackTitle: 'Hardtekk Warehouse 180',
    bpm: 180,
    url: SPOTIFY_PLAYLIST_TRACKS[2].url,
    accentColor: '#facc15',
    accent: '#facc15',
    secondaryAccent: '#ff2e88',
    badge: '180 BPM INDUSTRIAL',
  },
};

/**
 * Built-in featured tracks do NOT have a pre-baked numeric difficultyRating,
 * so ALL featured levels show difficulty rating "N/A" unless they are in the
 * Rhythm List or have been explicitly rated by an admin.
 */
export const ROYALTY_FREE_SONGS: Song[] = [
  {
    id: 'rf-1',
    title: 'Neon Horizon',
    artist: 'Aether',
    bpm: 128,
    difficulty: 'easy',
    color: '#06b6d4',
    audioUrl: 'synth:spotify',
    duration: 95,
    featured: true,
    upvotes: 142,
    plays: 1290,
  },
  {
    id: 'rf-2',
    title: 'Cybernetic Pulse',
    artist: 'Kuro',
    bpm: 145,
    difficulty: 'normal',
    color: '#ec4899',
    audioUrl: 'synth:rave',
    duration: 110,
    featured: true,
    upvotes: 238,
    plays: 2410,
    triggers: [
      { id: 't-rf2-1', time: 12000, type: 'speed', speed: 1.5 },
      {
        id: 't-rf2-2',
        time: 24000,
        type: 'extra_notes',
        lanes: 6,
        transition: 'split_out',
        transitionDuration: 0.6,
      },
      {
        id: 't-rf2-3',
        time: 36000,
        type: 'note_velocity',
        velocityEffect: 'sine_wave_flow',
        velocityIntensity: 0.8,
      },
    ],
  },
  {
    id: 'rf-3',
    title: 'Hardtekk Overdrive',
    artist: 'Vortex X',
    bpm: 175,
    difficulty: 'hard',
    color: '#a855f7',
    audioUrl: 'synth:hardtekk',
    duration: 125,
    featured: true,
    upvotes: 419,
    plays: 5120,
    triggers: [
      { id: 't-rf3-1', time: 10000, type: 'speed', speed: 1.75 },
      {
        id: 't-rf3-2',
        time: 20000,
        type: 'invisible_notes',
        invisibleEnabled: true,
        invisibleDurationMs: 12000,
      },
      {
        id: 't-rf3-3',
        time: 34000,
        type: 'extra_notes',
        lanes: 8,
        transition: 'zoom_burst',
        transitionDuration: 0.5,
      },
    ],
  },
  {
    id: 'rf-4',
    title: 'Abyssal Demon Core',
    artist: 'NullPointer',
    bpm: 195,
    difficulty: 'insane',
    color: '#ef4444',
    audioUrl: 'synth:dubstep',
    duration: 140,
    featured: true,
    hasDemonNotes: true,
    upvotes: 812,
    plays: 9340,
    triggers: [
      { id: 't-rf4-1', time: 8000, type: 'speed', speed: 1.75 },
      {
        id: 't-rf4-2',
        time: 16000,
        type: 'note_velocity',
        velocityEffect: 'hyper_warp',
        velocityIntensity: 1.0,
      },
      {
        id: 't-rf4-3',
        time: 28000,
        type: 'extra_notes',
        lanes: 8,
        transition: 'flip_3d',
        transitionDuration: 0.4,
      },
    ],
  },
];

export const DEFAULT_OWNER_EMAIL = 'palazzolomarin93@gmail.com';

export const ADMIN_EMAILS: string[] = [
  'palazzolomarin93@gmail.com',
  'rangoown84@gmail.com',
  'invincible102102@gmail.com',
  'admin@rhythmcanvas.gg',
];

export function isUserAdmin(email?: string | null, customAdmins: string[] = []): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (ADMIN_EMAILS.some((e) => e.toLowerCase() === clean)) return true;
  return customAdmins.some((e) => e.trim().toLowerCase() === clean);
}

export const REAL_PROFILES_STORAGE_KEY = 'rhythm_canvas_real_profiles_v1';
export const MESSAGING_WAITLIST_STORAGE_KEY = 'rhythm_canvas_messaging_waitlist_v1';
export const PROFILE_MESSAGES_STORAGE_KEY = 'rhythm_canvas_profile_messages_v1';

/** Fake rival profiles removed per user instruction — only real player profiles are displayed */
export const ACTIVE_RIVAL_PROFILES: PlayerProfile[] = [];

/** Built-in pure cosmetic Note Skins priced under 4,000 coins for the Shop & Slot Machine */
export const DEFAULT_SHOP_NOTE_SKINS: import('./types').NoteProduct[] = [
  {
    id: 'skin_neon_pulse',
    name: 'NEON PULSE SKIN',
    description: 'High-contrast magenta & cyan arcade note skin.',
    fill: '#ff2e88',
    outline: '#36e2ff',
    text: '★',
    sticker: '⚡',
    stickerScaleX: 1,
    stickerScaleY: 1,
    rarity: 'rare',
    price: 1400,
    active: true,
    createdBy: 'RHYTHM CANVAS',
    createdAt: 1710000001000,
  },
  {
    id: 'skin_cyber_prism',
    name: 'CYBER PRISM SKIN',
    description: 'Crystalline cyan & violet prism note skin.',
    fill: '#36e2ff',
    outline: '#c084fc',
    text: '◈',
    sticker: '💎',
    stickerScaleX: 1,
    stickerScaleY: 1,
    rarity: 'epic',
    price: 2200,
    active: true,
    createdBy: 'RHYTHM CANVAS',
    createdAt: 1710000002000,
  },
  {
    id: 'skin_arcade_crown',
    name: 'ARCADE CROWN SKIN',
    description: 'Royal gold & solar orange championship note skin.',
    fill: '#facc15',
    outline: '#ffffff',
    text: '♛',
    sticker: '👑',
    stickerScaleX: 1,
    stickerScaleY: 1,
    rarity: 'legendary',
    price: 3400,
    active: true,
    createdBy: 'RHYTHM CANVAS',
    createdAt: 1710000003000,
  },
  {
    id: 'skin_matrix_volt',
    name: 'MATRIX VOLT SKIN',
    description: 'Hyper-lime digital matrix note skin.',
    fill: '#10b981',
    outline: '#a3e635',
    text: '01',
    sticker: '🔥',
    stickerScaleX: 1,
    stickerScaleY: 1,
    rarity: 'rare',
    price: 1800,
    active: true,
    createdBy: 'RHYTHM CANVAS',
    createdAt: 1710000004000,
  },
  {
    id: 'skin_hardtekk_rave',
    name: 'HARDTEKK RAVE SKIN',
    description: 'Industrial crimson strobe note skin.',
    fill: '#ef4444',
    outline: '#facc15',
    text: 'TEK',
    sticker: '💥',
    stickerScaleX: 1,
    stickerScaleY: 1,
    rarity: 'epic',
    price: 2800,
    active: true,
    createdBy: 'RHYTHM CANVAS',
    createdAt: 1710000005000,
  },
  {
    id: 'skin_astral_nova',
    name: 'ASTRAL NOVA SKIN',
    description: 'Cosmic purple & starlight note skin.',
    fill: '#a855f7',
    outline: '#38bdf8',
    text: '✦',
    sticker: '✨',
    stickerScaleX: 1,
    stickerScaleY: 1,
    rarity: 'mythic',
    price: 3800,
    active: true,
    createdBy: 'RHYTHM CANVAS',
    createdAt: 1710000006000,
  },
];

export const DEFAULT_HAPTICS: HapticsSettings = {
  enabled: true,
  intensity: 85,
  holdEffectVolume: 80,
  gameplayHits: true,
  holdPulses: true,
  missAlerts: true,
  menuNavigation: true,
  visualShake: true,
  soundPulse: true,
  triggers: {
    onHit: true,
    onMiss: true,
    onHoldTick: true,
    onComboMilestone: true,
    onMenuTap: true,
  },
};
