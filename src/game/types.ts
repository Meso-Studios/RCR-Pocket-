export type ScreenId =
  | 'menu'
  | 'freeplay'
  | 'online_tracks'
  | 'game'
  | 'shop'
  | 'editor'
  | 'lobby'
  | 'horse'
  | 'admin_studio'
  | 'events';

export type GameState = ScreenId;

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';

export type GameMode = 'standard' | 'endless' | 'online_vs' | 'battle_royale' | 'horse';

export type MenuGenre = 'spotify' | 'rave' | 'dubstep' | 'hardtekk';

export type SkinShape = 'arrow' | 'circle';

export type NoteType = 'normal' | 'hold' | 'demon';

export type SpeedTriggerPreset = 0.5 | 0.75 | 1 | 1.5 | 1.75 | 2;

export type ExtraNotesCount = 4 | 6 | 8;
export type LaneCountOption = ExtraNotesCount;

export type ExpansionTransitionType =
  | 'split_out'
  | 'wipe_reveal'
  | 'zoom_burst'
  | 'blinds_snap'
  | 'flip_3d'
  | 'edge_slide'
  | 'flash_cut'
  | 'cut'
  | 'push'
  | 'wipe'
  | 'split'
  | 'fade_zoom'
  | 'cube_rotate'
  | 'cover_slide';

export type LaneExpansionTransition = ExpansionTransitionType;

export type NoteVelocityEffect =
  | 'linear'
  | 'ease_in_rush'
  | 'ease_out_brake'
  | 'elastic_bounce'
  | 'sine_wave_flow'
  | 'stutter_step'
  | 'boomerang_pull'
  | 'heartbeat_pulse'
  | 'hyper_warp'
  | 'spiral_sway'
  | 'gravity_drop'
  | 'pendulum_swing';

export type TriggerType =
  | 'speed'
  | 'extra_notes'
  | 'invisible_notes'
  | 'note_velocity'
  | 'dj_stop';

export interface ChartNote {
  time: number;
  lane: number;
  hit?: boolean;
  missed?: boolean;
  type?: NoteType;
  duration?: number;
  holding?: boolean;
  holdStartedAt?: number;
  isHolding?: boolean;
  holdCompleted?: boolean;
  isBot?: boolean;
}

export type Note = ChartNote;

export interface ChartTrigger {
  id: string;
  time: number;
  row?: number;
  type: TriggerType;
  speed?: SpeedTriggerPreset;
  lanes?: ExtraNotesCount;
  transition?: ExpansionTransitionType;
  transitionDuration?: number;
  stopDurationSec?: number;
  stopDurationMs?: number;
  invisibleEnabled?: boolean;
  invisibleDurationMs?: number;
  velocityEffect?: NoteVelocityEffect;
  velocityIntensity?: number;
}

export interface EditorCheckpoint {
  id: string;
  name: string;
  time: number;
  row: number;
  color?: string;
}

export interface Song {
  id: string | number;
  title: string;
  artist: string;
  bpm: number;
  difficulty?: Difficulty | string;
  color?: string;
  audioUrl?: string;
  coverUrl?: string;
  coverPulse?: boolean;
  coverPulseBpm?: number;
  coverPulseSubdivision?: number;
  coverUpdatedAt?: number;
  ownerUid?: string;
  featured?: boolean;
  customMap?: ChartNote[];
  notes?: ChartNote[];
  triggers?: ChartTrigger[];
  checkpoints?: EditorCheckpoint[];
  duration?: number;
  newgroundsId?: string;
  spotifyUrl?: string;
  difficultyRating?: number | null;
  isNewTop1?: boolean;
  stepClick?: boolean;
  stepSubdivision?: number;
  pulses?: number[];
  entityType?: string;
  hasDemonNotes?: boolean;
  isCustom?: boolean;
  upvotes?: number;
  plays?: number;
}

export interface TrackRatingEntry {
  songId?: string | number;
  adminRating?: number | null;
  isNewTop1?: boolean;
  votes?: number[];
  updatedAt?: number;
  updatedBy?: string;
}

export type TrackRatingRecord = TrackRatingEntry;
export type TrackRatingsMap = Record<string, TrackRatingEntry>;

export interface ShopShutdownConfig {
  closed: boolean;
  message: string;
  updatedAt?: number;
  updatedBy?: string;
}

export interface NoteEffectConfig {
  id: string;
  intensity: number;
}

export interface NoteProduct {
  id: string;
  name: string;
  description?: string;
  fill?: string;
  outline?: string;
  text?: string;
  sticker?: string;
  stickerScaleX?: number;
  stickerScaleY?: number;
  rarity: string;
  price: number;
  effects?: NoteEffectConfig[];
  createdAt?: number;
  createdBy?: string;
  active?: boolean;
}

export interface HitSoundProduct {
  id: string;
  name: string;
  price: number;
  kind: 'single' | 'pack';
  sound?: string | null;
  sounds?: (string | null)[] | null;
  active?: boolean;
  createdBy?: string;
  createdAt?: number;
}

export interface LaneCoord {
  xNorm: number;
  yNorm: number;
}

export interface PadCoord {
  xPct: number;
  yPct: number;
}

export interface ControlLayoutSettings {
  portraitLanes: LaneCoord[] | null;
  landscapeLanes: LaneCoord[] | null;
  portraitPads: PadCoord[] | null;
  landscapePads: PadCoord[] | null;
  preset?: string;
  buttonScale?: number;
  buttonOpacity?: number;
  verticalOffset?: number;
  horizontalSpread?: number;
  swapUpDown?: boolean;
  receptorYPercent?: number;
}

export interface HapticsSettings {
  enabled: boolean;
  intensity: number;
  holdEffectVolume?: number;
  gameplayHits?: boolean;
  holdPulses?: boolean;
  missAlerts?: boolean;
  menuNavigation?: boolean;
  visualShake?: boolean;
  soundPulse?: boolean;
  triggers: {
    onHit: boolean;
    onMiss: boolean;
    onHoldTick: boolean;
    onComboMilestone: boolean;
    onMenuTap: boolean;
  };
}

export interface Modifiers {
  speed: number;
  altChart: boolean;
  noFail: boolean;
  extreme: boolean;
  nerf: number;
  speedPreset?: SpeedTriggerPreset;
  speedTrigger?: SpeedTriggerPreset;
  laneCount?: ExtraNotesCount;
  extraNotes?: ExtraNotesCount;
  expansionTransition?: ExpansionTransitionType;
  transitionDurationSec?: number;
  transitionSpeed?: number;
  allowedDeaths?: 1 | 2 | 3;
}

export interface FirebaseUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

export interface InterruptionData {
  active: boolean;
  message?: string;
  issuedBy?: string;
  issuedAt?: number;
  stoppedAt?: number;
}

export interface PeerConnectionLike {
  open?: boolean;
  _rhythmRole?: 'host' | 'guest';
  _allowedDeaths?: 1 | 2 | 3;
  _opponentName?: string;
  _isSimulatedBot?: boolean;
  send: (data: any) => void;
  on: (event: string, cb: (data: any) => void) => void;
  off?: (event: string, cb: (data: any) => void) => void;
}

export interface PlayerProfile {
  id?: string;
  uid?: string;
  displayName: string;
  email?: string;
  avatarEmoji?: string;
  avatarIcon?: string;
  avatarPhotoUrl?: string;
  bannerColor: string;
  bio: string;
  titleBadge: string;
  ratingPoints?: number;
  wins1v1?: number;
  losses1v1?: number;
  highestDifficultyCleared?: number;
  tracksCleared?: number;
  bestAccuracy?: number;
  versusWins?: number;
  versusMatches?: number;
  horseWins?: number;
  isAdmin?: boolean;
  status?: 'online' | 'in_match' | 'idle';
  lastActiveAt?: number;
  createdProfile?: boolean;
  messagingWaitlistStatus?: 'none' | 'pending' | 'approved';
}

export interface MessagingWaitlistEntry {
  uid: string;
  displayName: string;
  email?: string;
  avatarPhotoUrl?: string;
  avatarEmoji?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
}

export interface ProfileDirectMessage {
  id: string;
  fromUid: string;
  fromName: string;
  fromPhotoUrl?: string;
  fromEmoji?: string;
  toUid: string;
  toName: string;
  text: string;
  createdAt: number;
}

export interface MatchInviteConfig {
  id?: string;
  fromName?: string;
  toName?: string;
  targetProfile?: PlayerProfile;
  mode: 'online_vs' | 'horse';
  songId?: string;
  allowedDeaths: 1 | 2 | 3;
  createdAt?: number;
}

export interface PlayerInfo {
  level: number;
  xp: number;
  coins: number;
  equippedSkin: string;
  unlockedSkins: string[];
  equippedShape: SkinShape;
  unlockedShapes: (SkinShape | string)[];
  customColors: string[];
  botplay: boolean;
  downscroll: boolean;
  unlockedNoteProducts: string[];
  equippedNoteProduct: NoteProduct | null;
  unlockedHitSounds: string[];
  equippedHitSound: HitSoundProduct | null;
  unlockedGameMods: string[];
  activeGameMods: string[];
  menuBgmMuted?: boolean;
  menuGenre?: MenuGenre;
  spotifyTrackIndex?: number;
  v2SpotifyDefaultApplied?: boolean;
  bgFloatingNotes?: boolean;
  haptics: HapticsSettings;
  controlLayout: ControlLayoutSettings;
  customKeybinds?: string[];
  profile?: PlayerProfile;
  unlockedItems?: string[];
  completedLevels?: string[];
  slotSpinCount?: number;
  trackHighScores?: Record<string, number>;
}
