import React, { useRef, useState } from 'react';
import {
  Calendar,
  Cloud,
  Coins,
  LogOut,
  Maximize,
  Minimize,
  Monitor,
  Move,
  PenTool,
  Play,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Vibrate,
  X,
} from 'lucide-react';
import { auth, db } from '../firebaseClient';
import { ADMIN_EMAILS, APP_VERSION, SKINS } from '../game/constants';
import { normalizeHapticsSettings, triggerHaptic } from '../game/haptics';
import { normalizeControlLayout } from '../game/layoutConfig';
import { getXpRequirement } from '../game/rhythmLogic';
import { safeSetStorage } from '../game/storage';
import type { FirebaseUser, InterruptionData, PlayerInfo, ScreenId } from '../game/types';
import { useIsCompactLandscape } from '../game/useViewport';
import { ControlLayoutModal } from './ControlLayoutModal';
import { HapticsSettingsModal } from './HapticsSettingsModal';

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
}) => {
  const xpRequired = getXpRequirement(playerInfo.level);
  const xpPercent = Math.min(100, Math.max(0, (playerInfo.xp / xpRequired) * 100));

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [showQuickSettingsModal, setShowQuickSettingsModal] = useState(false);
  const [showOtaModal, setShowOtaModal] = useState(false);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);
  const [showHapticsModal, setShowHapticsModal] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [otaVer, setOtaVer] = useState((APP_VERSION + 0.1).toFixed(1));
  const [otaMsg, setOtaMsg] = useState('New features added! Restart to play.');
  const [otaStatus, setOtaStatus] = useState('');
  const isCompact = useIsCompactLandscape();
  const hapticsConfig = normalizeHapticsSettings(playerInfo.haptics);
  const controlLayoutConfig = normalizeControlLayout(playerInfo.controlLayout);
  const skinColors =
    playerInfo.equippedSkin === 'custom'
      ? playerInfo.customColors
      : SKINS[playerInfo.equippedSkin]?.colors || SKINS.default.colors;

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

  const isAdminUser = Boolean(user && ADMIN_EMAILS.includes(user.email || ''));

  return (
    <div className="relative w-full h-full flex flex-col justify-between rc-stage overflow-x-hidden overflow-y-auto custom-scrollbar safe-top safe-bottom">
      <div className="absolute inset-0 rc-stage-dots pointer-events-none" />
      <div className="hidden md:block absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[520px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.22)_0%,transparent_70%)] pointer-events-none" />

      {/* Centered Top Dock Bars ("top sidebars") */}
      <header
        data-testid="menu-top-docks"
        className={`relative z-20 w-full flex items-center justify-center shrink-0 ${
          isCompact ? 'pt-1.5 px-12' : 'pt-3.5 px-14'
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 max-w-5xl">
          {/* Left Dock Rail: LVL + XP & Coins */}
          <div className={`rc-dock-rail flex items-center gap-1.5 sm:gap-2 ${isCompact ? 'p-1' : 'p-1.5'}`}>
            <div className={`rc-dock-well flex items-center gap-2 ${isCompact ? 'px-2 py-1' : 'px-2.5 sm:px-3 py-1 sm:py-1.5'}`}>
              <Star className="w-4 h-4 text-yellow-400 shrink-0" />
              <span className="font-black text-xs sm:text-sm text-white tracking-wider whitespace-nowrap">
                LVL {playerInfo.level}
              </span>
              <div className="w-14 sm:w-24 h-2.5 bg-[#090b10] border border-black rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-sky-300 transition-all duration-500 rounded-full"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
            </div>

            <div className={`rc-dock-well flex items-center gap-1.5 ${isCompact ? 'px-2 py-1' : 'px-2.5 sm:px-3 py-1 sm:py-1.5'}`}>
              <Coins className="w-4 h-4 text-yellow-400 shrink-0" />
              <span className="font-black text-xs sm:text-base text-white tracking-wide tabular-nums whitespace-nowrap">
                {playerInfo.coins}
              </span>
            </div>
          </div>

          {/* Right Dock Rail: What's New, Account / Cloud Login, Admin, Settings Gear */}
          <div className={`rc-dock-rail flex items-center gap-1.5 ${isCompact ? 'p-1' : 'p-1.5'}`}>
            <button
              type="button"
              data-testid="open-changelog-btn"
              onClick={() => {
                triggerHaptic('menuTap', hapticsConfig);
                onOpenChangelog();
              }}
              className={`rc-bevel-btn rc-sub-dark rounded-lg flex items-center gap-1.5 text-[11px] sm:text-xs font-black text-emerald-300 tracking-wide whitespace-nowrap ${
                isCompact ? 'px-2.5 py-1 min-h-[30px]' : 'px-2.5 sm:px-3 py-1.5 min-h-[34px]'
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
                className={`rc-dock-well text-[11px] sm:text-xs font-black text-slate-100 max-w-[130px] sm:max-w-[175px] truncate hover:border-cyan-400/60 transition-colors ${
                  isCompact ? 'px-2.5 py-1 min-h-[30px]' : 'px-2.5 sm:px-3 py-1.5 min-h-[34px]'
                }`}
              >
                {user.email}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className={`rc-bevel-btn rc-sub-dark rounded-lg flex items-center gap-1.5 text-[11px] sm:text-xs font-black text-cyan-200 tracking-wide whitespace-nowrap ${
                  isCompact ? 'px-2.5 py-1 min-h-[30px]' : 'px-2.5 sm:px-3 py-1.5 min-h-[34px]'
                }`}
              >
                <Cloud className="w-3.5 h-3.5 shrink-0" />
                <span>CLOUD LOGIN</span>
              </button>
            )}

            {isAdminUser && (
              <button
                type="button"
                onClick={() => setShowAdminDrawer(true)}
                className={`rc-bevel-btn rc-tile-red rounded-lg text-[11px] sm:text-xs font-black text-white tracking-wider whitespace-nowrap ${
                  isCompact ? 'px-2.5 py-1 min-h-[30px]' : 'px-2.5 sm:px-3 py-1.5 min-h-[34px]'
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
              className={`rc-bevel-btn rc-sub-dark rounded-lg flex items-center justify-center text-slate-200 hover:text-white shrink-0 ${
                isCompact ? 'w-8 h-[30px]' : 'w-9 h-[34px]'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Center Stage: Hero Wordmark + Console Action Tray */}
      <main className={`relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-4 ${isCompact ? 'py-1' : 'py-2'}`}>
        {/* Hero Wordmark (Slight original resemblance: italic neon gradient RHYTHM / white CANVAS / cyan REBOOT) */}
        <div className={`flex flex-col items-center justify-center ${isCompact ? 'mb-3.5' : 'mb-7 sm:mb-9'}`}>
          <h1 className="rc-hero-wordmark text-center uppercase flex flex-col items-center transform -rotate-2">
            <span
              className={`rc-word-rhythm block ${
                isCompact ? 'text-[2.1rem] sm:text-[2.35rem]' : 'text-5xl sm:text-6xl md:text-7xl'
              }`}
            >
              RHYTHM
            </span>
            <span
              className={`rc-word-canvas block -mt-1 ${
                isCompact ? 'text-[2.1rem] sm:text-[2.35rem]' : 'text-5xl sm:text-6xl md:text-7xl'
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
          data-testid="menu-console-tray"
          aria-label="Main game menu"
          className={`rc-console-tray relative w-full ${
            isCompact ? 'max-w-[580px] px-2.5 pb-2.5 pt-1' : 'max-w-[740px] px-4 sm:px-5 pb-4 pt-1'
          }`}
        >
          {/* Top Row: Tilted EVENTS | Dominant PLAY | Tilted SHOP popping above tray rim */}
          <div
            className={`relative z-20 grid grid-cols-[1fr_1.9fr_1fr] items-stretch ${
              isCompact ? 'gap-2 -mt-3 mb-2' : 'gap-3 sm:gap-4 -mt-6 mb-3'
            }`}
          >
            <button
              type="button"
              data-testid="menu-events-btn"
              onClick={() => navigateTo('events')}
              className={`rc-bevel-btn rc-tile-green text-white flex flex-col items-center justify-center gap-0.5 transform -rotate-[2.5deg] hover:-translate-y-0.5 active:translate-y-0.5 ${
                isCompact ? 'py-1.5 px-2 min-h-[58px]' : 'py-3 px-3 min-h-[86px] sm:min-h-[96px]'
              }`}
            >
              <Calendar className={`${isCompact ? 'w-4 h-4' : 'w-7 h-7'} drop-shadow-[0_2px_0_rgba(0,0,0,0.65)]`} />
              <span
                className={`font-black italic tracking-wide drop-shadow-[0_2px_0_#080a0f] whitespace-nowrap ${
                  isCompact ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl'
                }`}
              >
                EVENTS
              </span>
            </button>

            <button
              type="button"
              data-testid="menu-play-btn"
              onClick={() => navigateTo('freeplay')}
              className={`rc-bevel-btn rc-tile-pink text-white flex items-center justify-center gap-2.5 sm:gap-3.5 hover:-translate-y-0.5 active:translate-y-0.5 ${
                isCompact ? 'py-1.5 px-4 min-h-[60px]' : 'py-3 px-6 min-h-[90px] sm:min-h-[100px]'
              }`}
            >
              <Play
                className={`${isCompact ? 'w-6 h-6' : 'w-9 h-9 sm:w-11 sm:h-11'} drop-shadow-[0_2px_0_#080a0f] shrink-0`}
                fill="currentColor"
              />
              <span
                className={`font-black italic tracking-wider drop-shadow-[0_3px_0_#080a0f] whitespace-nowrap ${
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
              className={`rc-bevel-btn rc-tile-gold text-white flex flex-col items-center justify-center gap-0.5 transform rotate-[2.5deg] hover:-translate-y-0.5 active:translate-y-0.5 ${
                isCompact ? 'py-1.5 px-2 min-h-[58px]' : 'py-3 px-3 min-h-[86px] sm:min-h-[96px]'
              }`}
            >
              <ShoppingCart className={`${isCompact ? 'w-4 h-4' : 'w-7 h-7'} drop-shadow-[0_2px_0_rgba(0,0,0,0.65)]`} />
              <span
                className={`font-black italic tracking-wide drop-shadow-[0_2px_0_#080a0f] whitespace-nowrap ${
                  isCompact ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl'
                }`}
              >
                SHOP
              </span>
            </button>
          </div>

          {/* Recessed Sub-Console Well: Left toggles | Center EDITOR pop-out | Right toggles */}
          <div
            className={`rc-console-inset grid grid-cols-[1fr_1.15fr_1fr] items-stretch ${
              isCompact ? 'p-1.5 gap-2' : 'p-2.5 sm:p-3 gap-2.5 sm:gap-3.5'
            }`}
          >
            {/* Bottom Left Stack */}
            <div className={`flex flex-col ${isCompact ? 'gap-1.5' : 'gap-1.5 sm:gap-2'} min-w-0`}>
              <button
                type="button"
                data-testid="open-layout-settings-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  setShowLayoutModal(true);
                }}
                className={`rc-bevel-btn rc-sub-rose text-white font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 text-[10px] min-h-[28px]' : 'px-3 py-1.5 text-xs sm:text-sm min-h-[40px]'
                }`}
              >
                <Move className="w-3.5 h-3.5 shrink-0" />
                <span>LAYOUT</span>
              </button>

              <button
                type="button"
                data-testid="menu-notices-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  onToggleInterruptions();
                }}
                className={`rc-bevel-btn rc-sub-dark text-slate-200 font-black uppercase tracking-wide flex items-center justify-center whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 text-[10px] min-h-[28px]' : 'px-3 py-1.5 text-xs min-h-[40px]'
                }`}
              >
                NOTICES: {interruptionsDisabled ? 'OFF' : 'ON'}
              </button>
            </div>

            {/* Bottom Center Pop-Out: EDITOR */}
            <button
              type="button"
              data-testid="menu-editor-btn"
              onClick={() => navigateTo('editor')}
              className={`rc-bevel-btn rc-tile-violet text-white flex flex-col items-center justify-center gap-0.5 hover:-translate-y-0.5 active:translate-y-0.5 ${
                isCompact ? '-mb-3 px-3 py-1 min-h-[64px]' : '-mb-5 px-4 py-2.5 min-h-[92px]'
              }`}
            >
              <PenTool className={`${isCompact ? 'w-4 h-4' : 'w-6 h-6 sm:w-7 sm:h-7'} drop-shadow-[0_2px_0_#080a0f]`} />
              <span
                className={`font-black italic tracking-wider drop-shadow-[0_2px_0_#080a0f] whitespace-nowrap ${
                  isCompact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'
                }`}
              >
                EDITOR
              </span>
            </button>

            {/* Bottom Right Stack */}
            <div className={`flex flex-col ${isCompact ? 'gap-1.5' : 'gap-1.5 sm:gap-2'} min-w-0`}>
              <button
                type="button"
                data-testid="menu-downscroll-btn"
                onClick={toggleScrollDirection}
                className={`rc-bevel-btn rc-sub-teal text-white font-black uppercase tracking-wide flex items-center justify-center whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 text-[10px] min-h-[28px]' : 'px-3 py-1.5 text-xs sm:text-sm min-h-[40px]'
                }`}
              >
                {playerInfo.downscroll ? 'DOWNSCROLL ↓' : 'UPSCROLL ↑'}
              </button>

              <button
                type="button"
                data-testid="open-haptics-settings-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  setShowHapticsModal(true);
                }}
                className={`rc-bevel-btn rc-sub-amber text-white font-black uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  isCompact ? 'px-2 py-0.5 text-[10px] min-h-[28px]' : 'px-3 py-1.5 text-xs min-h-[40px]'
                }`}
              >
                <Vibrate className="w-3.5 h-3.5 shrink-0" />
                <span>HAPTICS: {hapticsConfig.enabled ? `${hapticsConfig.intensity}%` : 'OFF'}</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Subtle bottom safe spacer to visually balance the pop-out EDITOR tile */}
      <div className={`${isCompact ? 'h-1.5' : 'h-4'} shrink-0`} />

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
                className="rc-bevel-btn rc-sub-dark px-3 py-2.5 text-xs font-black text-emerald-300 uppercase tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[42px]"
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
    </div>
  );
};
