import React, { useRef, useState } from 'react';
import { Calendar, Cloud, Coins, Monitor, Move, PenTool, Play, ShoppingCart, Sparkles, Star, Vibrate } from 'lucide-react';
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
}

const MenuButton: React.FC<{
  icon: React.ReactNode;
  text: string;
  onClick: () => void;
  color: string;
}> = ({ icon, text, onClick, color }) => (
  <button
    onClick={onClick}
    className={`arcade-btn group flex items-center justify-center gap-3 sm:gap-4 px-4 sm:px-6 py-2.5 sm:py-3 border-4 font-black text-xl sm:text-3xl uppercase tracking-widest transition-all duration-200 transform skew-x-[-10deg] hover:-translate-y-1 active:translate-y-1 min-h-[50px] ${color}`}
  >
    <span className="transform skew-x-[10deg] group-hover:scale-110 transition-all duration-200 w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center">
      {icon}
    </span>
    <span className="transform skew-x-[10deg]">{text}</span>
  </button>
);

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
    <div className="w-full max-w-2xl bg-black border-4 border-red-500 p-4 shadow-[6px_6px_0_#000]">
      <h3 className="text-lg sm:text-xl font-black text-red-300">
        GLOBAL GAME INTERRUPTION {interruption?.active ? '• ACTIVE' : '• INACTIVE'}
      </h3>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={400}
        className="w-full min-h-20 mt-3 p-2 bg-white text-black font-bold"
        aria-label="Interruption message"
      />
      <div className="flex flex-wrap gap-3 mt-3">
        <button onClick={issue} className="bg-red-600 px-4 py-2 font-black min-h-[44px]">
          ISSUE TO ALL PLAYERS
        </button>
        <button
          onClick={stop}
          disabled={!interruption?.active}
          className="bg-green-400 text-black px-4 py-2 font-black disabled:opacity-40 min-h-[44px]"
        >
          STOP INTERRUPTION
        </button>
      </div>
      {status && <p className="mt-2 text-sm text-cyan-200">{status}</p>}
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
}) => {
  const xpRequired = getXpRequirement(playerInfo.level);
  const xpPercent = Math.min(100, Math.max(0, (playerInfo.xp / xpRequired) * 100));

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [showOtaModal, setShowOtaModal] = useState(false);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);
  const [showHapticsModal, setShowHapticsModal] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [otaVer, setOtaVer] = useState((APP_VERSION + 0.1).toFixed(1));
  const [otaMsg, setOtaMsg] = useState('New features added! Restart to play.');
  const [otaStatus, setOtaStatus] = useState('');
  const isLandscapeCompact = useIsCompactLandscape();
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
    <div className="relative w-full h-full flex flex-col bg-gradient-to-br from-indigo-900 via-purple-900 to-black overflow-y-auto overflow-x-hidden groovy-bg-anim custom-scrollbar safe-top safe-bottom">
      <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')] pointer-events-none" />
      <div className="hidden md:block absolute w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.22)_0%,transparent_70%)] animate-[pulse_4s_ease-in-out_infinite] pointer-events-none" />

      {isLandscapeCompact ? (
        <div className="relative z-10 w-full h-full flex flex-col overflow-hidden">
          {/* Compact Top Status & Account Bar */}
          <div className="w-full flex items-center justify-between gap-2 px-4 py-1.5 pr-12 border-b border-white/15 bg-black/40 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-2 bg-black/90 px-2.5 py-1 border-2 border-yellow-400 rounded-lg">
                <Star className="text-yellow-400 w-4 h-4 shrink-0" />
                <span className="font-black text-xs text-white whitespace-nowrap">LVL {playerInfo.level}</span>
                <div className="w-16 h-2 bg-gray-800 border border-black rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400 transition-all duration-500" style={{ width: `${xpPercent}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-black/90 px-2.5 py-1 border-2 border-yellow-400 rounded-lg">
                <Coins className="text-yellow-400 w-4 h-4 shrink-0" />
                <span className="font-black text-sm text-white tracking-wider">{playerInfo.coins}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                data-testid="open-changelog-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  onOpenChangelog();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-black/80 font-black text-[11px] text-green-300 tracking-wider border border-green-400/60 min-h-[34px] flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>WHAT&apos;S NEW</span>
              </button>

              {user ? (
                <div className="flex items-center gap-1.5">
                  <div className="px-2.5 py-1 rounded-lg bg-cyan-700/90 border border-cyan-300/60 text-[11px] font-black text-white max-w-[140px] truncate">
                    {user.email}
                  </div>
                  {isAdminUser && (
                    <button
                      onClick={() => setShowAdminDrawer(true)}
                      className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white border border-white font-black text-[11px] min-h-[34px]"
                    >
                      ADMIN
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-white text-black border-2 border-black font-black text-[11px] flex items-center gap-1.5 min-h-[34px] shadow-[2px_2px_0_#000]"
                >
                  <Cloud className="w-3.5 h-3.5" /> CLOUD LOGIN
                </button>
              )}
            </div>
          </div>

          {/* 2-Column Command Hub Body */}
          <div className="flex-1 min-h-0 grid grid-cols-[1fr_1.15fr] items-center gap-5 px-5 py-2.5">
            {/* Left Column: Title + Quick Settings Dock */}
            <div className="flex flex-col items-center justify-center gap-3 min-w-0">
              <h1 className="font-black italic text-4xl lg:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-yellow-400 drop-shadow-[4px_4px_0_#000] tracking-tight text-center leading-[0.95] transform -rotate-2 skew-x-[-5deg] select-none">
                RHYTHM
                <span className="block text-white drop-shadow-[4px_4px_0_#000]">CANVAS</span>
                <span
                  onClick={handleSecretTap}
                  className="block text-base tracking-[.32em] text-cyan-300 cursor-pointer mt-0.5"
                >
                  REBOOT
                </span>
              </h1>

              <div className="w-full max-w-sm bg-black/55 border-2 border-white/20 rounded-xl p-2 grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    triggerHaptic('menuTap', hapticsConfig);
                    setPlayerInfo((p) => {
                      const next = { ...p, downscroll: !p.downscroll };
                      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
                      return next;
                    });
                  }}
                  className="px-2 py-1.5 rounded-lg bg-gray-900/90 border border-cyan-400/50 font-black text-[11px] text-cyan-200 tracking-wide min-h-[38px] truncate"
                >
                  {playerInfo.downscroll ? 'DOWNSCROLL ↓' : 'UPSCROLL ↑'}
                </button>
                <button
                  data-testid="open-layout-settings-btn"
                  onClick={() => {
                    triggerHaptic('menuTap', hapticsConfig);
                    setShowLayoutModal(true);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-gray-900/90 border border-pink-400/60 font-black text-[11px] text-pink-300 tracking-wide min-h-[38px] flex items-center justify-center gap-1.5"
                >
                  <Move className="w-3.5 h-3.5 shrink-0" />
                  <span>LAYOUT</span>
                </button>
                <button
                  data-testid="open-haptics-settings-btn"
                  onClick={() => {
                    triggerHaptic('menuTap', hapticsConfig);
                    setShowHapticsModal(true);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-gray-900/90 border border-yellow-400/60 font-black text-[11px] text-yellow-300 tracking-wide min-h-[38px] flex items-center justify-center gap-1.5"
                >
                  <Vibrate className="w-3.5 h-3.5 shrink-0" />
                  <span>HAPTICS: {hapticsConfig.enabled ? `${hapticsConfig.intensity}%` : 'OFF'}</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptic('menuTap', hapticsConfig);
                    onToggleInterruptions();
                  }}
                  className="px-2 py-1.5 rounded-lg bg-gray-900/90 border border-white/25 font-black text-[11px] text-gray-200 tracking-wide min-h-[38px] truncate"
                >
                  NOTICES: {interruptionsDisabled ? 'OFF' : 'ON'}
                </button>
              </div>
            </div>

            {/* Right Column: 2x2 Primary Mode Grid */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-md mx-auto">
              <button
                onClick={() => navigateTo('freeplay')}
                className="flex flex-col items-center justify-center gap-1.5 bg-pink-500 text-black border-4 border-black rounded-xl shadow-[5px_5px_0_#000] min-h-[94px] p-3 font-black text-2xl uppercase tracking-wider hover:-translate-y-0.5 active:translate-y-0.5 transition-all"
              >
                <Play className="w-7 h-7" fill="currentColor" />
                <span>PLAY</span>
              </button>
              <button
                onClick={() => navigateTo('events')}
                className="flex flex-col items-center justify-center gap-1.5 bg-green-400 text-black border-4 border-black rounded-xl shadow-[5px_5px_0_#000] min-h-[94px] p-3 font-black text-2xl uppercase tracking-wider hover:-translate-y-0.5 active:translate-y-0.5 transition-all"
              >
                <Calendar className="w-7 h-7" />
                <span>EVENTS</span>
              </button>
              <button
                onClick={() => navigateTo('shop')}
                className="flex flex-col items-center justify-center gap-1.5 bg-yellow-400 text-black border-4 border-black rounded-xl shadow-[5px_5px_0_#000] min-h-[94px] p-3 font-black text-2xl uppercase tracking-wider hover:-translate-y-0.5 active:translate-y-0.5 transition-all"
              >
                <ShoppingCart className="w-7 h-7" />
                <span>SHOP</span>
              </button>
              <button
                onClick={() => navigateTo('editor')}
                className="flex flex-col items-center justify-center gap-1.5 bg-purple-500 text-black border-4 border-black rounded-xl shadow-[5px_5px_0_#000] min-h-[94px] p-3 font-black text-2xl uppercase tracking-wider hover:-translate-y-0.5 active:translate-y-0.5 transition-all"
              >
                <PenTool className="w-7 h-7" />
                <span>EDITOR</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="menu-header w-full flex flex-wrap justify-between items-center p-3 pr-14 sm:p-6 sm:pr-20 z-20 shrink-0 gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 bg-black px-3 sm:px-6 py-2 sm:py-3 border-4 border-yellow-400 shadow-[4px_4px_0_#facc15] sm:shadow-[6px_6px_0_#facc15] transform skew-x-[-8deg]">
              <div className="flex items-center justify-center w-8 h-8 sm:w-12 sm:h-12 bg-yellow-400 border-2 border-black transform skew-x-[8deg]">
                <Star className="text-black w-5 h-5 sm:w-8 sm:h-8" />
              </div>
              <div className="transform skew-x-[8deg]">
                <div className="font-black text-base sm:text-2xl text-white tracking-wider">LEVEL {playerInfo.level}</div>
                <div className="w-24 sm:w-48 h-2.5 sm:h-4 bg-gray-800 border-2 border-black mt-0.5 relative overflow-hidden">
                  <div className="h-full bg-cyan-400 transition-all duration-500" style={{ width: `${xpPercent}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 bg-black px-3 sm:px-6 py-2 sm:py-3 border-4 border-yellow-400 shadow-[4px_4px_0_#facc15] sm:shadow-[6px_6px_0_#facc15] transform skew-x-[8deg]">
              <Coins className="text-yellow-400 w-6 h-6 sm:w-10 sm:h-10 transform skew-x-[-8deg]" />
              <span className="font-black text-xl sm:text-4xl text-white tracking-widest transform skew-x-[-8deg]">
                {playerInfo.coins}
              </span>
            </div>
          </div>

          <div className="my-auto flex flex-col items-center z-10 pb-4 px-4 pt-1 sm:pt-0">
            <h1 className="reboot-title text-5xl sm:text-7xl lg:text-8xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-yellow-400 drop-shadow-[4px_4px_0_#000] md:drop-shadow-[8px_8px_0_#000] tracking-tighter text-center animate-gradient-x transform -rotate-3 skew-x-[-5deg] mb-4 sm:mb-6 border-black select-none">
              RHYTHM
              <br />
              <span className="text-white drop-shadow-[4px_4px_0_#000] md:drop-shadow-[8px_8px_0_#000]">CANVAS</span>
              <span
                onClick={handleSecretTap}
                className="block text-xl sm:text-3xl tracking-[.3em] text-cyan-300 cursor-pointer"
              >
                REBOOT
              </span>
            </h1>

            <div className="menu-buttons-grid flex flex-col gap-3 sm:gap-3.5 w-full max-w-xs sm:max-w-sm">
              <MenuButton
                icon={<Play />}
                text="PLAY"
                onClick={() => navigateTo('freeplay')}
                color="bg-pink-500 text-black border-black shadow-[5px_5px_0_#000] md:shadow-[8px_8px_0_#000]"
              />
              <MenuButton
                icon={<Calendar />}
                text="EVENTS"
                onClick={() => navigateTo('events')}
                color="bg-green-400 text-black border-black shadow-[5px_5px_0_#000] md:shadow-[8px_8px_0_#000]"
              />
              <MenuButton
                icon={<ShoppingCart />}
                text="SHOP"
                onClick={() => navigateTo('shop')}
                color="bg-yellow-400 text-black border-black shadow-[5px_5px_0_#000] md:shadow-[8px_8px_0_#000]"
              />
              <MenuButton
                icon={<PenTool />}
                text="EDITOR"
                onClick={() => navigateTo('editor')}
                color="bg-purple-500 text-black border-black shadow-[5px_5px_0_#000] md:shadow-[8px_8px_0_#000]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              <button
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  setPlayerInfo((p) => {
                    const next = { ...p, downscroll: !p.downscroll };
                    safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
                    return next;
                  });
                }}
                className="px-4 py-2.5 rounded-xl glass-panel font-black text-xs sm:text-base text-cyan-200 tracking-widest border border-cyan-400/50 min-h-[44px]"
              >
                SCROLL: {playerInfo.downscroll ? 'DOWNSCROLL ↓' : 'UPSCROLL ↑'}
              </button>
              <button
                data-testid="open-layout-settings-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  setShowLayoutModal(true);
                }}
                className="px-4 py-2.5 rounded-xl glass-panel font-black text-xs sm:text-base text-pink-300 tracking-wider border border-pink-400/60 min-h-[44px] flex items-center gap-2"
              >
                <Move className="w-4 h-4 shrink-0" />
                <span>CONTROLS &amp; LAYOUT</span>
              </button>
              <button
                data-testid="open-haptics-settings-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  setShowHapticsModal(true);
                }}
                className="px-4 py-2.5 rounded-xl glass-panel font-black text-xs sm:text-base text-yellow-300 tracking-wider border border-yellow-400/60 min-h-[44px] flex items-center gap-2"
              >
                <Vibrate className="w-4 h-4 shrink-0" />
                <span>HAPTICS: {hapticsConfig.enabled ? `${hapticsConfig.intensity}%` : 'OFF'}</span>
              </button>
              <button
                data-testid="open-changelog-btn"
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  onOpenChangelog();
                }}
                className="px-4 py-2.5 rounded-xl glass-panel font-black text-xs sm:text-sm text-green-300 tracking-wider border border-green-400/50 min-h-[44px] flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>WHAT&apos;S NEW</span>
              </button>
              <button
                onClick={() => {
                  triggerHaptic('menuTap', hapticsConfig);
                  onToggleInterruptions();
                }}
                className="px-4 py-2.5 rounded-xl glass-panel font-black text-xs sm:text-sm text-cyan-200 tracking-wider border border-cyan-400/50 min-h-[44px]"
              >
                INTERRUPTION NOTICES: {interruptionsDisabled ? 'OFF' : 'ON'}
              </button>
            </div>

            {user ? (
              <div className="flex flex-col items-center gap-3 mt-5 w-full max-w-2xl">
                <div className="text-xs sm:text-xl font-black bg-cyan-600 text-white px-4 sm:px-6 py-2 border-4 border-black shadow-[4px_4px_0_#000] transform skew-x-[-5deg] text-center">
                  CLOUD SAVE ACTIVE ({user.email})
                </div>

                {isAdminUser && (
                  <button
                    onClick={() => setShowOtaModal(true)}
                    className="text-base sm:text-2xl font-black bg-red-600 text-white px-5 py-3 border-4 border-white shadow-[6px_6px_0_#fff] transform skew-x-[-5deg] hover:-translate-y-1 transition-all animate-pulse"
                  >
                    <Monitor className="inline-block w-5 h-5 sm:w-6 sm:h-6 mr-2" /> ADMIN: PUSH OTA UPDATE
                  </button>
                )}
                {isAdminUser && <InterruptionAdminPanel interruption={interruption} />}
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="mt-5 text-sm sm:text-xl font-black bg-white text-black px-5 py-2.5 border-4 border-black shadow-[4px_4px_0_#000] transform skew-x-[-5deg] hover:-translate-y-1 transition-all text-center flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Cloud className="w-5 h-5 md:w-6 md:h-6" /> CLOUD LOGIN / REGISTER
              </button>
            )}
          </div>
        </>
      )}

      {showAdminDrawer && isAdminUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3">
          <div className="bg-gray-950 border-4 border-red-500 p-4 max-w-lg w-full max-h-[90dvh] overflow-y-auto flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-red-400">ADMIN TOOLS</h3>
              <button
                onClick={() => setShowAdminDrawer(false)}
                className="bg-white text-black px-3 py-1 font-black text-xs border-2 border-black"
              >
                CLOSE
              </button>
            </div>
            <button
              onClick={() => {
                setShowAdminDrawer(false);
                setShowOtaModal(true);
              }}
              className="w-full text-sm font-black bg-red-600 text-white px-4 py-2.5 border-2 border-white flex items-center justify-center gap-2"
            >
              <Monitor className="w-4 h-4" /> PUSH OTA UPDATE
            </button>
            <InterruptionAdminPanel interruption={interruption} />
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-white p-6 md:p-8 border-8 border-black max-w-md w-full flex flex-col items-center gap-4 shadow-[12px_12px_0_#06b6d4] sm:transform sm:skew-x-[-4deg]">
            <h2 className="text-3xl sm:text-4xl font-black italic text-black text-center uppercase">
              {isSignUp ? 'CREATE ACCOUNT' : 'CLOUD LOGIN'}
            </h2>

            <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
              {authError && (
                <div className="bg-red-500 text-white font-bold p-2 border-4 border-black text-center text-sm">
                  {authError}
                </div>
              )}

              <input
                type="email"
                placeholder="EMAIL"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-200 text-black font-black text-lg sm:text-xl p-3 border-4 border-black focus:outline-none focus:ring-4 focus:ring-cyan-400"
                required
              />
              <input
                type="password"
                placeholder="PASSWORD"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-200 text-black font-black text-lg sm:text-xl p-3 border-4 border-black focus:outline-none focus:ring-4 focus:ring-cyan-400"
                required
              />

              <button
                type="submit"
                className="w-full py-3 font-black text-xl sm:text-2xl bg-cyan-400 border-4 border-black text-black hover:bg-cyan-500 transition-all shadow-[4px_4px_0_#000] min-h-[48px]"
              >
                {isSignUp ? 'REGISTER' : 'LOGIN'}
              </button>
            </form>

            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError('');
              }}
              className="text-gray-700 font-bold hover:text-black underline mt-1 min-h-[44px]"
            >
              {isSignUp ? 'Already have an account? Log in' : 'Need an account? Sign up'}
            </button>

            <button
              onClick={() => setShowAuthModal(false)}
              className="w-full py-2.5 font-black text-lg sm:text-xl bg-gray-300 border-4 border-black text-black hover:bg-gray-400 transition-all min-h-[44px]"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {showOtaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <form
            onSubmit={submitOtaUpdate}
            className="bg-gray-950 border-4 border-red-500 p-6 max-w-md w-full flex flex-col gap-3 text-white"
          >
            <h3 className="text-2xl font-black text-red-400">PUSH OTA UPDATE</h3>
            <label className="text-xs font-black text-gray-300">
              NEW VERSION (CURRENT {APP_VERSION})
              <input
                type="number"
                step="0.1"
                value={otaVer}
                onChange={(e) => setOtaVer(e.target.value)}
                className="w-full mt-1 p-2 text-black bg-white font-black"
                required
              />
            </label>
            <label className="text-xs font-black text-gray-300">
              UPDATE MESSAGE
              <textarea
                value={otaMsg}
                onChange={(e) => setOtaMsg(e.target.value)}
                className="w-full mt-1 p-2 text-black bg-white font-bold"
                required
              />
            </label>
            {otaStatus && <div className="text-xs font-bold text-cyan-300">{otaStatus}</div>}
            <div className="flex gap-2 mt-2">
              <button type="submit" className="flex-1 bg-red-600 text-white p-3 font-black">
                SEND UPDATE
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOtaModal(false);
                  setOtaStatus('');
                }}
                className="flex-1 bg-gray-700 text-white p-3 font-black"
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
          initialOrientation={isLandscapeCompact ? 'landscape' : 'portrait'}
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
