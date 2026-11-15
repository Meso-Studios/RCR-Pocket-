export type ScreenId =
  | 'menu'
  | 'events'
  | 'freeplay'
  | 'online_tracks'
  | 'lobby'
  | 'game'
  | 'horse'
  | 'editor'
  | 'shop'
  | 'admin_studio';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';
export type GameMode = 'standard' | 'endless' | 'online_vs' | 'battle_royale' | 'horse';
export type NoteType = 'normal' | 'hold' | 'demon';
export type SkinShape = 'arrow' | 'circle';

export interface ChartNote {
  time: number;
  lane: number;
  type: NoteType;
  duration?: number;
  hit?: boolean;
  missed?: boolean;
  holding?: boolean;
  holdStartedAt?: number;
  isBot?: boolean;
}

export interface Song {
  id: string | number;
  title: string;
  artist: string;
  bpm: number;
  color: string;
  audioUrl?: string | null;
  coverUrl?: string;
  coverPulse?: boolean;
  coverPulseBpm?: number;
  coverPulseSubdivision?: number;
  coverUpdatedAt?: number;
  stepClick?: boolean;
  stepSubdivision?: number;
  pulses?: number[];
  customMap?: ChartNote[];
  chartVersion?: number;
  noteCount?: number;
  featured?: boolean;
  ownerUid?: string;
}

export interface NoteEffectConfig {
  id: string;
  intensity: number;
}

export interface NoteProduct {
  id: string;
  name: string;
  description: string;
  fill: string;
  outline: string;
  text: string;
  sticker: string;
  stickerScaleX: number;
  stickerScaleY: number;
  rarity: string;
  price: number;
  effects: NoteEffectConfig[];
  createdAt?: number;
  createdBy?: string;
  active?: boolean;
}

export interface HitSoundProduct {
  id: string;
  name: string;
  price: number;
  kind: 'single' | 'pack';
  sound: string | null;
  sounds: (string | null)[] | null;
  active?: boolean;
  createdBy?: string;
  createdAt?: number;
}

export interface HapticsTriggers {
  onPress: boolean;
  onHit: boolean;
  onHoldTick: boolean;
  onMiss: boolean;
  onDemon: boolean;
  onComboMilestone: boolean;
  onMenuTap: boolean;
}

export interface HapticsSettings {
  enabled: boolean;
  intensity: number;
  pulseDurationMs: number;
  accuracyScaling: boolean;
  audioFallback: boolean;
  alwaysAudioAssist?: boolean;
  triggers: HapticsTriggers;
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
}

export interface PlayerInfo {
  level: number;
  xp: number;
  coins: number;
  equippedSkin: string;
  unlockedSkins: string[];
  equippedShape: SkinShape;
  unlockedShapes: string[];
  customColors: string[];
  botplay: boolean;
  downscroll: boolean;
  haptics?: HapticsSettings;
  controlLayout?: ControlLayoutSettings;
  unlockedNoteProducts: string[];
  equippedNoteProduct: NoteProduct | null;
  unlockedHitSounds: string[];
  equippedHitSound: HitSoundProduct | null;
  unlockedGameMods: string[];
  activeGameMods: string[];
}

export interface Modifiers {
  speed: number;
  altChart: boolean;
  noFail: boolean;
  extreme: boolean;
  nerf: number;
}

export interface InterruptionData {
  active?: boolean;
  message?: string;
  issuedBy?: string;
  issuedAt?: number;
  stoppedAt?: number;
}

export interface FirebaseUser {
  uid: string;
  email: string | null;
}

export interface PeerConnectionLike {
  open?: boolean;
  _rhythmRole?: 'host' | 'guest';
  send: (data: any) => void;
  on: (event: string, cb: (data: any) => void) => void;
  off?: (event: string, cb: (data: any) => void) => void;
}
