import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Coins,
  Disc3,
  ExternalLink,
  ListMusic,
  LogOut,
  Maximize,
  Minimize,
  Monitor,
  Move,
  Music2,
  PenTool,
  Play,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  User,
  Keyboard,
  Vibrate,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { auth, db } from '../firebaseClient';
import { AudioEngine, MenuMusicEngine } from '../game/audio';
import {
  ADMIN_EMAILS,
  APP_VERSION,
  CUSTOM_ADMINS_STORAGE_KEY,
  DEFAULT_CUSTOM_KEYBINDS,
  DEFAULT_OWNER_EMAIL,
  MENU_GENRE_CONFIGS,
  MENU_GENRE_ORDER,
  SKINS,
  SPOTIFY_EMBED_URL,
  SPOTIFY_PLAYLIST_OWNER,
  SPOTIFY_PLAYLIST_TITLE,
  SPOTIFY_PLAYLIST_TRACKS,
  SPOTIFY_PLAYLIST_URL,
  isUserAdmin,
} from '../game/constants';
import { normalizeHapticsSettings, triggerHaptic } from '../game/haptics';
import { normalizeControlLayout } from '../game/layoutConfig';
import { getXpRequirement } from '../game/rhythmLogic';
import { safeGetStorage, safeSetStorage } from '../game/storage';
import type {
  FirebaseUser,
  InterruptionData,
  MatchInviteConfig,
  MenuGenre,
  PlayerInfo,
  PlayerProfile,
  ScreenId,
} from '../game/types';
import { useIsCompactLandscape } from '../game/useViewport';
import { ControlLayoutModal } from './ControlLayoutModal';
import { HapticsSettingsModal } from './HapticsSettingsModal';
import { KeybindsModal } from './KeybindsModal';
import { ProfileModal } from './ProfileModal';
import { RaveStageCanvas } from './RaveStageCanvas';

interface MainMenuProps {
  setScreen: (s: ScreenId) => void;
  playerInfo: PlayerInfo;
  setPlayerInfo: React.Dispatch<React.SetStateAction<PlayerInfo>>;
  user: FirebaseUser | null;
  interruption: InterruptionData | null;
  interruptionsDisabled: boolean;
  onToggleInterruptions: () => void;
  onOpenDevConsole: () => void;
  onOpenChangelog: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onLaunch1v1Invite?: (invite: MatchInviteConfig) => void;
}

const InterruptionAdminPanel: React.FC<{ interruption: InterruptionData | null }> = ({ interruption }) => {
  const [message, setMessage] = useState(
    'Gameplay is temporarily paused. Please wait for the administrator to resume.'
  );
  const [status, setStatus] = useState('');
  const isAdmin = ADMIN_EMAILS.includes(auth?.currentUser?.email || '');

  const issue = async () => {
    if (!isAdmin || !db) {
      setStatus('Admin access or database unavailable.');
      return;
    }
    try {
      await db.collection('system').doc('interruption').set({
        active: true,
        message: message.trim() || 'Gameplay is temporarily paused.',
        issuedBy: auth.currentUser.uid,
        issuedAt: Date.now(),
      });
      setStatus('Interruption issued to connected players.');
    } catch (error: any) {
      setStatus(`Could not issue interruption: ${error.message}`);
    }
  };

  const stop = async () => {
    if (!isAdmin || !db) {
      setStatus('Admin access or database unavailable.');
      return;
    }
    try {
      await db.collection('system').doc('interruption').set({ active: false, stoppedAt: Date.now() }, { merge: true });
      setStatus('Interruption stopped.');
    } catch (error: any) {
      setStatus(`Could not stop interruption: ${error.message}`);
    }
  };

  return (
    <div className="w-full rc-console-inset p-4 flex flex-col gap-3">
      <h3 className="text-sm sm:text-base font-black text-red-300 uppercase tracking-wide">
        Global Game Interruption · {interruption?.active ? 'ACTIVE' : 'INACTIVE'}
      </h3>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={400}
        className="w-full min-h-20 p-2.5 rounded-lg bg-[#0a0d14] border-2 border-[#06080c] text-white font-bold text-sm focus:outline-none focus:border-cyan-400"
        aria-label="Interruption message"
      />
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={issue}
          className="rc-bevel-btn rc-tile-red text-white px-4 py-2 font-black text-xs uppercase tracking-wider whitespace-nowrap min-h-[40px]"
        >
          ISSUE TO ALL PLAYERS
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!interruption?.active}
          className="rc-bevel-btn rc-tile-green text-black px-4 py-2 font-black text-xs uppercase tracking-wider whitespace-nowrap disabled:opacity-40 min-h-[40px]"
        >
          STOP INTERRUPTION
        </button>
      </div>
      {status && <p className="text-xs font-bold text-cyan-300">{status}</p>}
    </div>
  );
};

export const MainMenu: React.FC<MainMenuProps> = ({
  setScreen,
  playerInfo,
  setPlayerInfo,
  user,
  interruption,
  interruptionsDisabled,
  onToggleInterruptions,
  onOpenDevConsole,
  onOpenChangelog,
  isFullscreen = false,
  onToggleFullscreen,
  onLaunch1v1Invite,
}) => {
  const xpRequired = getXpRequirement(playerInfo.level);
  const xpPercent = Math.min(100, Math.max(0, (playerInfo.xp / xpRequired) * 100));

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [showQuickSettingsModal, setShowQuickSettingsModal] = useState(false);
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [showSpotifyEmbed, setShowSpotifyEmbed] = useState(false);
  const [showOtaModal, setShowOtaModal] = useState(false);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);
  const [showHapticsModal, setShowHapticsModal] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [showKeybindsModal, setShowKeybindsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [otaVer, setOtaVer] = useState((APP_VERSION + 0.1).toFixed(1));
  const [otaMsg, setOtaMsg] = useState('New features added! Restart to play.');
  const [otaStatus, setOtaStatus] = useState('');
  const [spotifyTrackIdx, setSpotifyTrackIdx] = useState(() =>
    typeof playerInfo.spotifyTrackIndex === 'number' ? playerInfo.spotifyTrackIndex : MenuMusicEngine.getSpotifyTrackIndex()
  );

  const isCompact = useIsCompactLandscape();
  const hapticsConfig = normalizeHapticsSettings(playerInfo.haptics);
  const controlLayoutConfig = normalizeControlLayout(playerInfo.controlLayout);
  const skinColors =
    playerInfo.equippedSkin === 'custom'
      ? playerInfo.customColors
      : SKINS[playerInfo.equippedSkin]?.colors || SKINS.default.colors;

  const activeGenre: MenuGenre = playerInfo.menuGenre || 'spotify';
  const isBgmMuted = Boolean(playerInfo.menuBgmMuted);
  const showBgNotes = playerInfo.bgFloatingNotes !== false;
  const genreConfig = MENU_GENRE_CONFIGS[activeGenre] || MENU_GENRE_CONFIGS.spotify;
  const activeSpotifyTrack =
    SPOTIFY_PLAYLIST_TRACKS[((spotifyTrackIdx % SPOTIFY_PLAYLIST_TRACKS.length) + SPOTIFY_PLAYLIST_TRACKS.length) % SPOTIFY_PLAYLIST_TRACKS.length] ||
    SPOTIFY_PLAYLIST_TRACKS[0];

  const activeAccent = activeGenre === 'spotify' ? activeSpotifyTrack.accent : genreConfig.accent;
  const activeBpm = activeGenre === 'spotify' ? activeSpotifyTrack.bpm : genreConfig.bpm;
  const activeTrackTitle = activeGenre === 'spotify' ? activeSpotifyTrack.title : genreConfig.trackTitle;

  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const emblemRingRef = useRef<HTMLDivElement | null>(null);
  const trayRef = useRef<HTMLElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);

  // Imperative 60fps beat-kick animation on hero wordmark, osu! emblem ring, console tray, and PLAY button
  useEffect(() => {
    let raf = 0;
    const animateBeat = () => {
      const beat = MenuMusicEngine.getBeatState();
      const kick = beat.kickPulse;
      const pulse = beat.pulse;
      if (typeof beat.trackIndex === 'number' && beat.trackIndex !== spotifyTrackIdx) {
        setSpotifyTrackIdx(beat.trackIndex);
      }
      if (wordmarkRef.current) {
        const scale = 1 + kick * 0.085;
        const tilt = -1.6 + Math.sin(performance.now() * 0.0038) * 0.65;
        wordmarkRef.current.style.transform = `rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      }
      if (emblemRingRef.current) {
        const ringScale = 0.94 + kick * 0.22 + pulse * 0.08;
        emblemRingRef.current.style.transform = `scale(${ringScale.toFixed(4)})`;
        emblemRingRef.current.style.borderColor = activeAccent;
        emblemRingRef.current.style.boxShadow = `0 0 ${Math.round(18 + kick * 36)}px ${activeAccent}88, inset 0 0 ${Math.round(12 + pulse * 24)}px ${activeAccent}55`;
      }
      if (trayRef.current) {
        trayRef.current.style.boxShadow = `0 0 0 2.5px #05070e, inset 0 2.5px 0 rgba(255,255,255,0.48), inset 0 -3px 0 rgba(0,0,0,0.78), 0 18px 40px rgba(0,0,0,0.82), 0 0 ${Math.round(
          20 + kick * 38
        )}px ${activeAccent}88`;
      }
      if (playBtnRef.current) {
        const playScale = 1 + pulse * 0.036;
        playBtnRef.current.style.transform = `scale(${playScale.toFixed(4)})`;
      }
      raf = requestAnimationFrame(animateBeat);
    };
    raf = requestAnimationFrame(animateBeat);
    return () => cancelAnimationFrame(raf);
  }, [activeAccent, spotifyTrackIdx]);

  const selectMenuGenre = (genre: MenuGenre) => {
    AudioEngine.init();
    MenuMusicEngine.setGenre(genre);
    if (!isBgmMuted) {
      MenuMusicEngine.start(genre);
    }
    triggerHaptic('hit', hapticsConfig, 'sick');
    setPlayerInfo((prev) => {
      const next = { ...prev, menuGenre: genre, menuBgmMuted: false, v2SpotifyDefaultApplied: true } as PlayerInfo;
      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
      return next;
    });
  };

  const selectSpotifyTrack = (idx: number) => {
    AudioEngine.init();
    const track = MenuMusicEngine.setSpotifyTrackIndex(idx);
    const normalizedIdx = MenuMusicEngine.getSpotifyTrackIndex();
    setSpotifyTrackIdx(normalizedIdx);
    MenuMusicEngine.setGenre('spotify');
    MenuMusicEngine.setMuted(false);
    MenuMusicEngine.start('spotify');
    triggerHaptic('hit', hapticsConfig, 'sick');
    setPlayerInfo((prev) => {
      const next = {
        ...prev,
        menuGenre: 'spotify' as MenuGenre,
        menuBgmMuted: false,
        spotifyTrackIndex: normalizedIdx,
        v2SpotifyDefaultApplied: true,
      } as PlayerInfo;
      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
      return next;
    });
    void track;
  };

  const stepSpotifyTrack = (dir: 1 | -1) => {
    selectSpotifyTrack(spotifyTrackIdx + dir);
  };

  const toggleMenuMute = () => {
    AudioEngine.init();
    const nextMuted = !isBgmMuted;
    MenuMusicEngine.setMuted(nextMuted);
    if (!nextMuted) {
      MenuMusicEngine.start(activeGenre);
    }
    triggerHaptic('menuTap', hapticsConfig);
    setPlayerInfo((prev) => {
      const next = { ...prev, menuBgmMuted: nextMuted };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
      return next;
    });
  };

  const toggleBgFloatingNotes = () => {
    triggerHaptic('menuTap', hapticsConfig);
    setPlayerInfo((prev) => {
      const next = { ...prev, bgFloatingNotes: prev.bgFloatingNotes === false };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
      return next;
    });
  };

  const navigateTo = (target: ScreenId) => {
    triggerHaptic('menuTap', hapticsConfig);
    setScreen(target);
  };

  const toggleScrollDirection = () => {
    triggerHaptic('menuTap', hapticsConfig);
    setPlayerInfo((p) => {
      const next = { ...p, downscroll: !p.downscroll };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
      return next;
    });
  };

  const tapCountRef = useRef({ count: 0, lastAt: 0 });
  const handleSecretTap = () => {
    const now = performance.now();
    if (now - tapCountRef.current.lastAt > 1200) {
      tapCountRef.current.count = 0;
    }
    tapCountRef.current.lastAt = now;
    tapCountRef.current.count += 1;
    if (tapCountRef.current.count >= 8) {
      tapCountRef.current.count = 0;
      onOpenDevConsole();
    }
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!auth) {
      setAuthError('Firebase Auth is missing!');
      return;
    }
    if (isSignUp) {
      auth
        .createUserWithEmailAndPassword(email, password)
        .then(() => setShowAuthModal(false))
        .catch((err: any) => setAuthError(err.message));
    } else {
      auth
        .signInWithEmailAndPassword(email, password)
        .then(() => setShowAuthModal(false))
        .catch((err: any) => setAuthError(err.message));
    }
  };

  const handleSignOut = () => {
    if (!auth) return;
    auth.signOut().catch(() => {});
  };

  const submitOtaUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    try {
      await db.collection('system').doc('config').set(
        {
          latestVersion: Number(otaVer),
          updateMessage: otaMsg,
        },
        { merge: true }
      );
      setOtaStatus('Update Signal Sent! Connected players will see the refresh screen.');
    } catch (err: any) {
      setOtaStatus('Failed to push update: ' + err.message);
    }
  };

  const customAdmins: string[] = (() => {
    try {
      const raw = safeGetStorage(CUSTOM_ADMINS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();

  const effectiveEmail =
    user?.email || playerInfo.profile?.email || '';
  const isAdminUser = isUserAdmin(effectiveEmail, customAdmins);

  return (
    <div className="relative w-full h-full flex flex-col justify-between rc-stage overflow-x-hidden overflow-y-auto custom-scrollbar safe-top safe-bottom">
      <div className="absolute inset-0 rc-stage-dots pointer-events-none" />
      <RaveStageCanvas
        genre={activeGenre}
        intensity={isBgmMuted ? 0.48 : 1}
        showFloatingNotes={showBgNotes}
      />

      {/* Centered Top Dock Bars ("top sidebars") */}
      <header
        data-testid="menu-top-docks"
        className={`relative z-20 w-full flex items-center justify-center shrink-0 ${
          isCompact ? 'pt-1 px-11' : 'pt-2.5 px-14'
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 max-w-6xl">
          {/* Pod 1: LVL + XP & Coins */}
          <div className={`rc-dock-rail flex items-center gap-1.5 ${isCompact ? 'p-1' : 'p-1.5'}`}>
            <div className={`rc-dock-well flex items-center gap-1.5 ${isCompact ? 'px-2 py-0.5' : 'px-2.5 sm:px-3 py-1'}`}>
              <Star className="w-4 h-4 text-yellow-400 shrink-0" />
              <span className="font-black text-xs sm:text-sm text-white tracking-wider whitespace-nowrap">
                LVL {playerInfo.level}
              </span>
              <div className="w-12 sm:w-20 h-2.5 bg-[#090b10] border border-cyan-400/50 rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-yellow-300 transition-all duration-500 rounded-full"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
            </div>

            <div className={`rc-dock-well flex items-center gap-1.5 ${isCompact ? 'px-2 py-0.5' : 'px-2.5 sm:px-3 py-1'}`}>
              <Coins className="w-4 h-4 text-yellow-400 shrink-0" />
              <span className="font-black text-xs sm:text-sm text-white tracking-wide tabular-nums whitespace-nowrap">
                {playerInfo.coins}
              </span>
            </div>
          </div>

          {/* Pod 2: Spotify Playlist & Beat-Sync Deck */}
          <div
            data-testid="menu-bgm-deck"
            className={`rc-dock-rail flex items-center gap-1 ${isCompact ? 'p-1' : 'p-1.5'}`}
          >
            <button
              type="button"
              data-testid="spotify-prev-btn"
              onClick={() => stepSpotifyTrack(-1)}
              aria-label="Previous playlist track"
              className={`rc-bevel-btn rc-sub-dark flex items-center justify-center text-white ${
                isCompact ? 'w-6 h-[26px]' : 'w-7 h-[32px]'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              data-testid="open-spotify-modal-btn"
              onClick={() => {
                triggerHaptic('menuTap', hapticsConfig);
                setShowSpotifyModal(true);
              }}
              title="Open Dubstep Hardtekk & Metal Rave Spotify Playlist"
              className={`rc-dock-well flex items-center gap-1.5 hover:border-emerald-400 transition-colors ${
                isCompact ? 'px-2 py-0.5 min-h-[26px]' : 'px-2.5 py-1 min-h-[32px]'
              }`}
            >
              <Disc3
                className={`w-3.5 h-3.5 shrink-0 ${
                  isBgmMuted ? 'text-slate-400' : 'text-emerald-400'
                }`}
              />
              <span className="font-black text-[10px] sm:text-xs text-white tracking-wide uppercase max-w-[115px] sm:max-w-[180px] truncate">
                {activeTrackTitle}
              </span>
              <span className="hidden md:inline-block px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-[9px] font-black text-emerald-300 whitespace-nowrap">
                {activeBpm} BPM
              </span>
            </button>

            <button
              type="button"
              data-testid="spotify-next-btn"
              onClick={() => stepSpotifyTrack(1)}
              aria-label="Next playlist track"
              className={`rc-bevel-btn rc-sub-dark flex items-center justify-center text-white ${
                isCompact ? 'w-6 h-[26px]' : 'w-7 h-[32px]'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              data-testid="menu-bgm-mute-btn"
              onClick={toggleMenuMute}
              aria-label={isBgmMuted ? 'Unmute menu music' : 'Mute menu music'}
              className={`rc-bevel-btn flex items-center justify-center ${
                isCompact ? 'w-7 h-[26px]' : 'w-8 h-[32px]'
              } ${isBgmMuted ? 'rc-tile-red text-white' : 'rc-tile-green text-black'}`}
            >
              {isBgmMuted ? <VolumeX className="w-3.5 h-3.5 shrink-0" /> : <Volume2 className="w-3.5 h-3.5 shrink-0" />}
            </button>

            <button
              type="button"
              data-testid="spotify-playlist-drawer-btn"
              onClick={() => {
                triggerHaptic('menuTap', hapticsConfig);
                setShowSpotifyModal(true);
              }}
              className={`rc-bevel-btn rc-tile-cyan text-black font-black uppercase tracking-wider flex items-center gap-1 whitespace-nowrap ${
                isCompact ? 'px-2 py-0.5 text-[10px] min-h-[26px]' : 'px-2.5 py-1 text-[11px] min-h-[32px]'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">PLAYLIST</span>
            </button>
          </div>

          {/* Pod 3: What's New, Account / Cloud Login, Admin, Settings Gear */}
          <div className={`rc-dock-rail flex items-center gap-1.5 ${isCompact ? 'p-1' : 'p-1.5'}`}>
            <button
              type="button"
              data-testid="open-changelog-btn"
              onClick={() => {
                triggerHaptic('menuTap', hapticsConfig);
                onOpenChangelog();
              }}
              className={`rc-bevel-btn rc-sub-dark rounded-lg flex items-center gap-1 text-[10px] sm:text-xs font-black text-emerald-300 tracking-wide whitespace-nowrap ${
                isCompact ? 'px-2 py-0.5 min-h-[26px]' : 'px-2.5 py-1 min-h-[32px]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span>WHAT&apos;S NEW</span>
            </button>

            {user ? (
              <button
                type="button"
                onClick={() => setShowQuickSettingsModal(true)}
                title={user.email || 'Account'}
                className={`rc-dock-well text-[10px] sm:text-xs font-black text-slate-100 max-w-[110px] sm:max-w-[145px] truncate hover:border-cyan-400 transition-colors ${
                  isCompact ? 'px-2 py-0.5 min-h-[26px]' : 'px-2.5 py-1 min-h-[32px]'
                }`}
              >
                {user.email}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className={`rc-bevel-btn rc-sub-dark rounded-lg flex items-center gap-1 text-[10px] sm:text-xs font-black text-cyan-200 tracking-wide whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 min-h-[26px]' : 'px-2.5 py-1 min-h-[32px]'
                }`}
              >
                <Cloud className="w-3.5 h-3.5 shrink-0" />
                <span>CLOUD</span>
              </button>
            )}

            <button
              type="button"
              data-testid="menu-profile-btn"
              onClick={() => {
                triggerHaptic('menuTap', hapticsConfig);
                setShowProfileModal(true);
              }}
              className={`rc-bevel-btn rc-tile-purple rounded-lg flex items-center gap-1 text-[10px] sm:text-xs font-black text-white tracking-wider whitespace-nowrap ${
                isCompact ? 'px-2 py-0.5 min-h-[26px]' : 'px-2.5 py-1 min-h-[32px]'
              }`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>PROFILE</span>
            </button>

            <button
              type="button"
              data-testid="menu-keybinds-btn"
              onClick={() => {
                triggerHaptic('menuTap', hapticsConfig);
                setShowKeybindsModal(true);
              }}
              className={`rc-bevel-btn rc-sub-dark rounded-lg flex items-center gap-1 text-[10px] sm:text-xs font-black text-cyan-200 tracking-wider whitespace-nowrap ${
                isCompact ? 'px-2 py-0.5 min-h-[26px]' : 'px-2.5 py-1 min-h-[32px]'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5 shrink-0 text-cyan-300" />
              <span className="hidden md:inline">KEYBINDS</span>
            </button>

            {isAdminUser && (
              <button
                type="button"
                data-testid="menu-admin-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  setScreen('admin_studio');
                }}
                className={`rc-bevel-btn rc-tile-red rounded-lg text-[10px] sm:text-xs font-black text-white tracking-wider whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 min-h-[26px]' : 'px-2.5 py-1 min-h-[32px]'
                }`}
              >
                ADMIN
              </button>
            )}

            <button
              type="button"
              data-testid="open-quick-settings-btn"
              aria-label="Quick settings"
              onClick={() => {
                triggerHaptic('menuTap', hapticsConfig);
                setShowQuickSettingsModal(true);
              }}
              className={`rc-bevel-btn rc-sub-dark rounded-lg flex items-center justify-center text-slate-100 hover:text-white shrink-0 ${
                isCompact ? 'w-7 h-[26px]' : 'w-8 h-[32px]'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Center Stage: osu!-Inspired Beat Emblem + Hero Wordmark + High-Visibility Console Tray */}
      <main
        className={`relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-4 ${
          isCompact ? 'py-0.5' : 'py-1.5'
        }`}
      >
        {/* Clean, Beat-Reactive osu! Emblem & Hero Wordmark Lockup */}
        <div
          ref={wordmarkRef}
          className={`relative flex flex-col items-center justify-center will-change-transform ${
            isCompact ? 'mb-3.5' : 'mb-6 sm:mb-8'
          }`}
        >
          {/* Beat-pulsing concentric osu! neon disc behind wordmark */}
          <div
            ref={emblemRingRef}
            aria-hidden="true"
            className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-pink-400/80 bg-gradient-to-b from-pink-500/20 via-purple-900/35 to-cyan-500/20 ${
              isCompact ? 'w-28 h-28' : 'w-40 h-40 sm:w-44 sm:h-44'
            }`}
          />

          <h1 className="relative z-10 rc-hero-wordmark text-center uppercase flex flex-col items-center">
            <span
              className={`rc-word-rhythm block ${
                isCompact ? 'text-[2.1rem] sm:text-[2.4rem]' : 'text-5xl sm:text-6xl md:text-7xl'
              }`}
            >
              RHYTHM
            </span>
            <span
              className={`rc-word-canvas block -mt-1 ${
                isCompact ? 'text-[2.1rem] sm:text-[2.4rem]' : 'text-5xl sm:text-6xl md:text-7xl'
              }`}
            >
              CANVAS
            </span>
            <button
              type="button"
              onClick={handleSecretTap}
              aria-label="Rhythm Canvas Reboot"
              className={`rc-word-reboot block mt-0.5 cursor-pointer bg-transparent border-0 p-0 italic font-black uppercase ${
                isCompact ? 'text-xs sm:text-sm' : 'text-lg sm:text-xl md:text-2xl'
              }`}
            >
              REBOOT
            </button>
          </h1>
        </div>

        {/* Main Console Tray */}
        <section
          ref={trayRef}
          data-testid="menu-console-tray"
          aria-label="Main game menu"
          className={`rc-console-tray relative w-full ${
            isCompact ? 'max-w-[600px] px-2.5 pb-2 pt-1' : 'max-w-[760px] px-4 sm:px-5 pb-4 pt-1'
          }`}
        >
          {/* Top Primary Row: Tilted EVENTS | Dominant PLAY | Tilted SHOP popping above tray rim */}
          <div
            className={`relative z-20 grid grid-cols-[1fr_1.95fr_1fr] items-stretch ${
              isCompact ? 'gap-2 -mt-3 mb-1.5' : 'gap-3 sm:gap-4 -mt-6 mb-3'
            }`}
          >
            <button
              type="button"
              data-testid="menu-events-btn"
              onClick={() => navigateTo('events')}
              className={`rc-bevel-btn rc-tile-green text-white flex flex-col items-center justify-center gap-0.5 transform -rotate-[2.5deg] hover:-translate-y-1 active:translate-y-0.5 ${
                isCompact ? 'py-1 px-2 min-h-[54px]' : 'py-3 px-3 min-h-[86px] sm:min-h-[96px]'
              }`}
            >
              <Calendar className={`${isCompact ? 'w-4 h-4' : 'w-7 h-7'} drop-shadow-[0_2px_0_rgba(0,0,0,0.75)]`} />
              <span
                className={`font-black italic tracking-wide drop-shadow-[0_2px_0_#05070e] whitespace-nowrap ${
                  isCompact ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl'
                }`}
              >
                EVENTS
              </span>
            </button>

            <button
              ref={playBtnRef}
              type="button"
              data-testid="menu-play-btn"
              onClick={() => navigateTo('freeplay')}
              className={`rc-bevel-btn rc-tile-pink text-white flex items-center justify-center gap-2.5 sm:gap-3.5 hover:brightness-110 active:translate-y-0.5 will-change-transform ${
                isCompact ? 'py-1 px-4 min-h-[56px]' : 'py-3 px-6 min-h-[90px] sm:min-h-[100px]'
              }`}
            >
              <Play
                className={`${isCompact ? 'w-6 h-6' : 'w-9 h-9 sm:w-11 sm:h-11'} drop-shadow-[0_2px_0_#05070e] shrink-0`}
                fill="currentColor"
              />
              <span
                className={`font-black italic tracking-wider drop-shadow-[0_3px_0_#05070e] whitespace-nowrap ${
                  isCompact ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'
                }`}
              >
                PLAY
              </span>
            </button>

            <button
              type="button"
              data-testid="menu-shop-btn"
              onClick={() => navigateTo('shop')}
              className={`rc-bevel-btn rc-tile-gold text-black flex flex-col items-center justify-center gap-0.5 transform rotate-[2.5deg] hover:-translate-y-1 active:translate-y-0.5 ${
                isCompact ? 'py-1 px-2 min-h-[54px]' : 'py-3 px-3 min-h-[86px] sm:min-h-[96px]'
              }`}
            >
              <ShoppingCart className={`${isCompact ? 'w-4 h-4' : 'w-7 h-7'} drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]`} />
              <span
                className={`font-black italic tracking-wide whitespace-nowrap ${
                  isCompact ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl'
                }`}
              >
                SHOP
              </span>
            </button>
          </div>

          {/* Ergonomic Bottom Sub-Console Well: Left Thumb Stack (HAPTICS + LAYOUT) | Center EDITOR | Right Thumb Stack (SCROLL + BG NOTES) */}
          <div
            className={`rc-console-inset grid grid-cols-[1fr_1.15fr_1fr] items-stretch ${
              isCompact ? 'p-1.5 gap-2' : 'p-2.5 sm:p-3 gap-2.5 sm:gap-3.5'
            }`}
          >
            {/* Left Thumb Zone: HAPTICS & LAYOUT */}
            <div className={`flex flex-col ${isCompact ? 'gap-1' : 'gap-1.5 sm:gap-2'} min-w-0`}>
              <button
                type="button"
                data-testid="open-haptics-settings-btn"
                onClick={() => {
                  triggerHaptic('hit', hapticsConfig, 'sick');
                  setShowHapticsModal(true);
                }}
                className={`rc-bevel-btn rc-sub-amber text-white font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 text-[10px] min-h-[28px]' : 'px-3 py-1.5 text-xs sm:text-sm min-h-[42px]'
                }`}
              >
                <Vibrate className="w-3.5 h-3.5 shrink-0" />
                <span>HAPTICS: {hapticsConfig.enabled ? `${hapticsConfig.intensity}%` : 'OFF'}</span>
              </button>

              <button
                type="button"
                data-testid="open-layout-settings-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  setShowLayoutModal(true);
                }}
                className={`rc-bevel-btn rc-sub-rose text-white font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 text-[10px] min-h-[28px]' : 'px-3 py-1.5 text-xs sm:text-sm min-h-[42px]'
                }`}
              >
                <Move className="w-3.5 h-3.5 shrink-0" />
                <span>LAYOUT</span>
              </button>
            </div>

            {/* Bottom Center Pop-Out: EDITOR */}
            <button
              type="button"
              data-testid="menu-editor-btn"
              onClick={() => navigateTo('editor')}
              className={`rc-bevel-btn rc-tile-violet text-white flex flex-col items-center justify-center gap-0.5 hover:-translate-y-0.5 active:translate-y-0.5 ${
                isCompact ? '-mb-2.5 px-3 py-1 min-h-[60px]' : '-mb-5 px-4 py-2.5 min-h-[94px]'
              }`}
            >
              <PenTool className={`${isCompact ? 'w-4 h-4' : 'w-6 h-6 sm:w-7 sm:h-7'} drop-shadow-[0_2px_0_#05070e]`} />
              <span
                className={`font-black italic tracking-wider drop-shadow-[0_2px_0_#05070e] whitespace-nowrap ${
                  isCompact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'
                }`}
              >
                EDITOR
              </span>
            </button>

            {/* Right Thumb Zone: SCROLL DIRECTION & OPTIONAL BG FLOATING NOTES */}
            <div className={`flex flex-col ${isCompact ? 'gap-1' : 'gap-1.5 sm:gap-2'} min-w-0`}>
              <button
                type="button"
                data-testid="menu-downscroll-btn"
                onClick={toggleScrollDirection}
                className={`rc-bevel-btn rc-sub-teal text-white font-black uppercase tracking-wide flex items-center justify-center whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 text-[10px] min-h-[28px]' : 'px-3 py-1.5 text-xs sm:text-sm min-h-[42px]'
                }`}
              >
                {playerInfo.downscroll ? 'DOWNSCROLL ↓' : 'UPSCROLL ↑'}
              </button>

              <button
                type="button"
                data-testid="menu-bg-notes-btn"
                onClick={toggleBgFloatingNotes}
                className={`rc-bevel-btn ${
                  showBgNotes ? 'rc-tile-cyan text-black' : 'rc-sub-dark text-slate-200'
                } font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 text-[10px] min-h-[28px]' : 'px-3 py-1.5 text-xs sm:text-sm min-h-[42px]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>BG NOTES: {showBgNotes ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Subtle bottom safe spacer to visually balance the pop-out EDITOR tile */}
      <div className={`${isCompact ? 'h-1' : 'h-3'} shrink-0`} />

      {/* Spotify Playlist & Synth Deck Modal */}
      {showSpotifyModal && (
        <div
          data-testid="spotify-playlist-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Spotify Playlist Deck"
        >
          <div className="rc-console-tray max-w-2xl w-full max-h-[92dvh] overflow-hidden p-3.5 sm:p-5 flex flex-col gap-3 text-white">
            <div className="rc-dock-rail px-3.5 py-2 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rc-bevel-btn rc-tile-green text-black flex items-center justify-center shrink-0">
                  <Music2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-black uppercase tracking-wider truncate">
                    {SPOTIFY_PLAYLIST_TITLE}
                  </h2>
                  <p className="text-[11px] font-bold text-emerald-300 truncate">
                    Spotify Playlist by {SPOTIFY_PLAYLIST_OWNER} · Live Beat-Synced Menu Audio
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={SPOTIFY_PLAYLIST_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rc-bevel-btn rc-sub-dark px-2.5 py-1.5 text-[11px] font-black text-emerald-300 flex items-center gap-1 whitespace-nowrap"
                >
                  <span>SPOTIFY</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  aria-label="Close playlist modal"
                  onClick={() => setShowSpotifyModal(false)}
                  className="rc-bevel-btn rc-sub-dark w-8 h-8 flex items-center justify-center text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Audio Source Mode Switcher: SPOTIFY PLAYLIST vs RAVE / DUBSTEP / HARDTEKK Synths */}
            <div className="rc-console-inset p-2.5 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black text-cyan-300 uppercase tracking-wider">
                  MENU AUDIO SOURCE
                </span>
                <button
                  type="button"
                  onClick={() => setShowSpotifyEmbed((v) => !v)}
                  className="rc-bevel-btn rc-sub-teal px-2.5 py-1 text-[10px] font-black text-white uppercase whitespace-nowrap"
                >
                  {showSpotifyEmbed ? 'SHOW TRACK LIST' : 'OPEN SPOTIFY EMBED PLAYER'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {MENU_GENRE_ORDER.map((g) => {
                  const cfg = MENU_GENRE_CONFIGS[g];
                  const active = activeGenre === g && !isBgmMuted;
                  const activeCls =
                    g === 'spotify'
                      ? 'rc-tile-green text-black'
                      : g === 'rave'
                      ? 'rc-tile-pink text-white'
                      : g === 'dubstep'
                      ? 'rc-tile-cyan text-black'
                      : 'rc-tile-gold text-black';
                  return (
                    <button
                      key={g}
                      type="button"
                      data-testid={`menu-genre-${g}`}
                      onClick={() => selectMenuGenre(g)}
                      className={`rc-bevel-btn py-1.5 px-2 text-[11px] font-black uppercase whitespace-nowrap flex items-center justify-center gap-1 min-h-[34px] ${
                        active ? activeCls : 'rc-sub-dark text-slate-300'
                      }`}
                    >
                      <Disc3 className={`w-3 h-3 shrink-0 ${active ? 'animate-spin' : 'opacity-60'}`} />
                      <span>{cfg.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showSpotifyEmbed ? (
              <div className="rc-console-inset p-2 flex-1 min-h-[240px] flex flex-col gap-2">
                <iframe
                  title="Spotify Playlist Dubstep Hardtekk & Metal Rave"
                  src={SPOTIFY_EMBED_URL}
                  width="100%"
                  height="260"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className="rounded-xl border-0 w-full flex-1"
                />
              </div>
            ) : (
              <div className="rc-console-inset p-2.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SPOTIFY_PLAYLIST_TRACKS.map((track, idx) => {
                  const isCurrent = activeGenre === 'spotify' && spotifyTrackIdx === idx && !isBgmMuted;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      data-testid={`spotify-track-${idx}`}
                      onClick={() => selectSpotifyTrack(idx)}
                      className={`rc-bevel-btn p-2.5 text-left flex items-center justify-between gap-2 min-h-[48px] ${
                        isCurrent ? 'rc-tile-pink text-white' : 'rc-sub-dark text-slate-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-black text-xs sm:text-sm truncate">{track.title}</div>
                        <div className="text-[10px] font-bold text-cyan-200 truncate">
                          {track.artist} · {track.tag}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-black/45 border border-white/25 text-[10px] font-black text-yellow-300 shrink-0">
                        {track.bpm} BPM
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Settings Modal (Wired from the Top Right Dock Gear) */}
      {showQuickSettingsModal && (
        <div
          data-testid="quick-settings-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3"
        >
          <div className="rc-panel max-w-md w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-5 flex flex-col gap-3.5 text-white">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-300" />
                <h2 className="text-lg font-black uppercase tracking-wider">Quick Settings</h2>
              </div>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setShowQuickSettingsModal(false)}
                className="rc-bevel-btn rc-sub-dark w-9 h-9 rounded-lg flex items-center justify-center text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu Music Source Selector inside Quick Settings */}
            <div className="rc-console-inset p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-cyan-300 uppercase tracking-wider">
                  MENU MUSIC ({activeBpm} BPM)
                </span>
                <button
                  type="button"
                  onClick={toggleMenuMute}
                  className="text-xs font-black text-yellow-300 underline"
                >
                  {isBgmMuted ? 'UNMUTE' : 'MUTE'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {MENU_GENRE_ORDER.map((g) => {
                  const cfg = MENU_GENRE_CONFIGS[g];
                  const active = activeGenre === g && !isBgmMuted;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => selectMenuGenre(g)}
                      className={`rc-bevel-btn py-2 px-1.5 text-[11px] font-black uppercase whitespace-nowrap ${
                        active ? 'rc-tile-pink text-white' : 'rc-sub-dark text-slate-300'
                      }`}
                    >
                      {cfg.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rc-console-inset p-3 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={toggleScrollDirection}
                className="rc-bevel-btn rc-sub-teal px-3 py-2.5 text-xs font-black uppercase tracking-wide whitespace-nowrap min-h-[42px]"
              >
                {playerInfo.downscroll ? 'DOWNSCROLL ↓' : 'UPSCROLL ↑'}
              </button>
              <button
                type="button"
                onClick={toggleBgFloatingNotes}
                className={`rc-bevel-btn px-3 py-2.5 text-xs font-black uppercase tracking-wide whitespace-nowrap min-h-[42px] ${
                  showBgNotes ? 'rc-tile-cyan text-black' : 'rc-sub-dark text-slate-200'
                }`}
              >
                BG NOTES: {showBgNotes ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQuickSettingsModal(false);
                  setShowLayoutModal(true);
                }}
                className="rc-bevel-btn rc-sub-rose px-3 py-2.5 text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[42px]"
              >
                <Move className="w-3.5 h-3.5" />
                <span>CONTROL LAYOUT</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQuickSettingsModal(false);
                  setShowHapticsModal(true);
                }}
                className="rc-bevel-btn rc-sub-amber px-3 py-2.5 text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[42px]"
              >
                <Vibrate className="w-3.5 h-3.5" />
                <span>HAPTICS ({hapticsConfig.enabled ? `${hapticsConfig.intensity}%` : 'OFF'})</span>
              </button>
              <button
                type="button"
                data-testid="quick-settings-keybinds-btn"
                onClick={() => {
                  setShowQuickSettingsModal(false);
                  setShowKeybindsModal(true);
                }}
                className="rc-bevel-btn rc-tile-cyan text-black px-3 py-2.5 text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[42px]"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>8-NOTE KEYBINDS</span>
              </button>
              <button
                type="button"
                data-testid="quick-settings-profile-btn"
                onClick={() => {
                  setShowQuickSettingsModal(false);
                  setShowProfileModal(true);
                }}
                className="rc-bevel-btn rc-tile-purple text-white px-3 py-2.5 text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[42px]"
              >
                <User className="w-3.5 h-3.5" />
                <span>PLAYER PROFILE & 1V1</span>
              </button>
              <button
                type="button"
                data-testid="menu-notices-btn"
                onClick={onToggleInterruptions}
                className="rc-bevel-btn rc-sub-dark px-3 py-2.5 text-xs font-black uppercase tracking-wide whitespace-nowrap min-h-[42px]"
              >
                NOTICES: {interruptionsDisabled ? 'OFF' : 'ON'}
              </button>
              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="rc-bevel-btn rc-tile-slate px-3 py-2.5 text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[42px]"
                >
                  {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                  <span>{isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowQuickSettingsModal(false);
                  onOpenChangelog();
                }}
                className="col-span-2 rc-bevel-btn rc-sub-dark px-3 py-2.5 text-xs font-black text-emerald-300 uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[42px]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>WHAT&apos;S NEW</span>
              </button>
            </div>

            <div className="rc-console-inset p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Cloud Account</div>
                <div className="text-xs font-bold text-slate-100 truncate">
                  {user ? user.email : 'Not signed in (local save active)'}
                </div>
              </div>
              {user ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rc-bevel-btn rc-tile-red px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5 whitespace-nowrap shrink-0 min-h-[38px]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>SIGN OUT</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickSettingsModal(false);
                    setShowAuthModal(true);
                  }}
                  className="rc-bevel-btn rc-tile-cyan text-black px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5 whitespace-nowrap shrink-0 min-h-[38px]"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>SIGN IN</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAdminDrawer && isAdminUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
          <div className="rc-panel max-w-lg w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-red-400 uppercase tracking-wider">Admin Tools</h3>
              <button
                type="button"
                onClick={() => setShowAdminDrawer(false)}
                className="rc-bevel-btn rc-sub-dark text-white px-3 py-1.5 font-black text-xs whitespace-nowrap"
              >
                CLOSE
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAdminDrawer(false);
                setShowOtaModal(true);
              }}
              className="w-full rc-bevel-btn rc-tile-red text-white px-4 py-2.5 text-sm font-black flex items-center justify-center gap-2 whitespace-nowrap min-h-[42px]"
            >
              <Monitor className="w-4 h-4" /> PUSH OTA UPDATE
            </button>
            <InterruptionAdminPanel interruption={interruption} />
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="rc-panel p-5 sm:p-6 max-w-md w-full flex flex-col items-center gap-4 text-white">
            <div className="w-full flex items-center justify-between">
              <h2 className="text-2xl font-black italic text-cyan-300 uppercase">
                {isSignUp ? 'CREATE ACCOUNT' : 'CLOUD LOGIN'}
              </h2>
              <button
                type="button"
                aria-label="Close auth dialog"
                onClick={() => setShowAuthModal(false)}
                className="rc-bevel-btn rc-sub-dark w-9 h-9 rounded-lg flex items-center justify-center text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAuth} className="w-full flex flex-col gap-3">
              {authError && (
                <div className="bg-red-950/90 border-2 border-red-500 rounded-lg text-red-200 font-bold p-2.5 text-center text-xs">
                  {authError}
                </div>
              )}

              <input
                type="email"
                placeholder="EMAIL"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rc-dock-well text-white font-bold text-base p-3 focus:outline-none focus:border-cyan-400"
                required
              />
              <input
                type="password"
                placeholder="PASSWORD"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rc-dock-well text-white font-bold text-base p-3 focus:outline-none focus:border-cyan-400"
                required
              />

              <button
                type="submit"
                className="w-full rc-bevel-btn rc-tile-cyan py-3 font-black text-lg text-black uppercase tracking-wider min-h-[46px]"
              >
                {isSignUp ? 'REGISTER' : 'LOGIN'}
              </button>
            </form>

            <div className="w-full flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setAuthError('');
                }}
                className="text-xs font-bold text-cyan-300 hover:text-cyan-200 underline min-h-[36px]"
              >
                {isSignUp ? 'Already have an account? Log in' : 'Need an account? Sign up'}
              </button>

              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="rc-bevel-btn rc-sub-dark px-4 py-2 text-xs font-black text-slate-200 uppercase min-h-[38px]"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {showOtaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <form onSubmit={submitOtaUpdate} className="rc-panel p-5 max-w-md w-full flex flex-col gap-3 text-white">
            <h3 className="text-xl font-black text-red-400 uppercase">Push OTA Update</h3>
            <label className="text-xs font-black text-slate-300 uppercase">
              New Version (Current {APP_VERSION})
              <input
                type="number"
                step="0.1"
                value={otaVer}
                onChange={(e) => setOtaVer(e.target.value)}
                className="w-full mt-1 p-2.5 rc-dock-well text-white font-bold"
                required
              />
            </label>
            <label className="text-xs font-black text-slate-300 uppercase">
              Update Message
              <textarea
                value={otaMsg}
                onChange={(e) => setOtaMsg(e.target.value)}
                className="w-full mt-1 p-2.5 rc-dock-well text-white font-bold"
                required
              />
            </label>
            {otaStatus && <div className="text-xs font-bold text-cyan-300">{otaStatus}</div>}
            <div className="flex gap-2 mt-2">
              <button type="submit" className="flex-1 rc-bevel-btn rc-tile-red text-white p-3 font-black text-xs uppercase">
                SEND UPDATE
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOtaModal(false);
                  setOtaStatus('');
                }}
                className="flex-1 rc-bevel-btn rc-sub-dark text-white p-3 font-black text-xs uppercase"
              >
                CLOSE
              </button>
            </div>
          </form>
        </div>
      )}

      {showHapticsModal && (
        <HapticsSettingsModal
          settings={playerInfo.haptics}
          onChange={(nextHaptics) =>
            setPlayerInfo((prev) => {
              const next = { ...prev, haptics: nextHaptics };
              safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
              return next;
            })
          }
          onClose={() => setShowHapticsModal(false)}
        />
      )}

      {showLayoutModal && (
        <ControlLayoutModal
          controlLayout={controlLayoutConfig}
          downscroll={playerInfo.downscroll}
          skinColors={skinColors}
          skinShape={playerInfo.equippedShape || 'arrow'}
          initialOrientation="landscape"
          onChange={(nextLayout) =>
            setPlayerInfo((prev) => {
              const next = { ...prev, controlLayout: nextLayout };
              safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
              return next;
            })
          }
          onClose={() => setShowLayoutModal(false)}
        />
      )}

      {showKeybindsModal && (
        <KeybindsModal
          keybinds={playerInfo.customKeybinds || DEFAULT_CUSTOM_KEYBINDS}
          haptics={playerInfo.haptics}
          onChange={(nextBinds: string[]) =>
            setPlayerInfo((prev) => {
              const next = { ...prev, customKeybinds: nextBinds };
              safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
              return next;
            })
          }
          onClose={() => setShowKeybindsModal(false)}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          playerInfo={playerInfo}
          user={user}
          customAdmins={customAdmins}
          knownProfiles={[]}
          haptics={playerInfo.haptics}
          onUpdateProfile={(nextProfile: PlayerProfile) =>
            setPlayerInfo((prev) => {
              const next = { ...prev, profile: nextProfile };
              safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
              return next;
            })
          }
          onSend1v1Invite={(invite: MatchInviteConfig) => {
            setShowProfileModal(false);
            if (onLaunch1v1Invite) {
              onLaunch1v1Invite(invite);
            } else {
              setScreen('lobby');
            }
          }}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
};
