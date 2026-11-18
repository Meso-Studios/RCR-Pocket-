import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Flame,
  Globe,
  Heart,
  Radio,
  ShieldAlert,
  Sparkles,
  Swords,
  Users,
  Zap,
} from 'lucide-react';
import { ACTIVE_RIVAL_PROFILES } from '../game/constants';
import { AudioEngine } from '../game/audio';
import { useIsCompactLandscape } from '../game/useViewport';
import type {
  GameMode,
  Modifiers,
  PeerConnectionLike,
  PlayerProfile,
  ScreenId,
} from '../game/types';

interface OnlineLobbyProps {
  peer: any;
  myPeerId?: string;
  setNetworkConnection: (conn: PeerConnectionLike) => void;
  setScreen: (s: ScreenId) => void;
  gameMode: GameMode;
  setGameMode?: (m: GameMode) => void;
  modifiers?: Modifiers;
  setModifiers?: React.Dispatch<React.SetStateAction<Modifiers>>;
  initialOpponent?: PlayerProfile | null;
}

export function createSimulatedRivalConnection(
  rivalName: string,
  allowedDeaths: 1 | 2 | 3,
  role: 'host' | 'guest' = 'host'
): PeerConnectionLike {
  const listeners = new Map<string, Set<(data: any) => void>>();

  const emit = (event: string, payload: any) => {
    const set = listeners.get(event);
    if (!set) return;
    set.forEach((cb) => cb(payload));
  };

  const conn: PeerConnectionLike = {
    open: true,
    _rhythmRole: role,
    _allowedDeaths: allowedDeaths,
    _opponentName: rivalName,
    _isSimulatedBot: true,
    send(data: any) {
      // If playing H.O.R.S.E. mode and host finishes recording a phrase (`send_challenge`),
      // the rival attempts the phrase and then sends back a counter-challenge!
      if (data?.type === 'send_challenge' && Array.isArray(data.notes)) {
        setTimeout(() => {
          const phraseLen = data.notes.length;
          // Rival succeeds ~68% of the time depending on phrase complexity
          const success = Math.random() > Math.min(0.45, 0.15 + phraseLen * 0.03);
          const counterNotes = data.notes.map((n: any, idx: number) => ({
            time: Math.max(200, Number(n.time) || idx * 380),
            lane: (Number(n.lane) + (idx % 2 === 0 ? 1 : 3)) % 4,
          }));
          emit('data', {
            type: 'challenge_result',
            success,
            nextNotes: counterNotes,
          });
        }, 2200);
      }
    },
    on(event: string, cb: (data: any) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off(event: string, cb: (data: any) => void) {
      listeners.get(event)?.delete(cb);
    },
  };

  return conn;
}

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  peer,
  setNetworkConnection,
  setScreen,
  gameMode,
  setGameMode,
  modifiers,
  setModifiers,
  initialOpponent,
}) => {
  const isCompact = useIsCompactLandscape();
  const [allowedDeaths, setAllowedDeaths] = useState<1 | 2 | 3>(
    modifiers?.allowedDeaths || 2
  );
  const [selectedRival, setSelectedRival] = useState<PlayerProfile>(
    initialOpponent || ACTIVE_RIVAL_PROFILES[0]
  );
  const [matchStatus, setMatchStatus] = useState<string>(
    'READY FOR INSTANT 1V1 MATCHMAKING (NO CODES REQUIRED)'
  );
  const [isSearching, setIsSearching] = useState(false);

  const isHorseMode = gameMode === 'horse';

  useEffect(() => {
    if (setModifiers) {
      setModifiers((prev) => ({ ...prev, allowedDeaths }));
    }
  }, [allowedDeaths, setModifiers]);

  useEffect(() => {
    if (!peer) return;
    const handleConnection = (conn: any) => {
      conn._rhythmRole = 'host';
      conn._allowedDeaths = allowedDeaths;
      conn._opponentName = selectedRival.displayName;
      const launch = () => {
        setNetworkConnection(conn);
        setMatchStatus(`Matched with ${selectedRival.displayName}! Launching Arena...`);
        setTimeout(() => setScreen(isHorseMode ? 'horse' : 'game'), 500);
      };
      if (conn.open) launch();
      else conn.on('open', launch);
    };
    peer.on('connection', handleConnection);
    return () => {
      peer.off('connection', handleConnection);
    };
  }, [peer, allowedDeaths, selectedRival, setNetworkConnection, setScreen, isHorseMode]);

  const handleStartCodeFreeMatch = (rival: PlayerProfile) => {
    AudioEngine.playUI('confirm');
    setSelectedRival(rival);
    setIsSearching(true);
    setMatchStatus(
      `Locking 1v1 ${isHorseMode ? 'H.O.R.S.E. Phrase Duel' : 'GD-Style Versus Race'} vs ${rival.displayName} (${allowedDeaths} Allowed ${allowedDeaths === 1 ? 'Death' : 'Deaths'})...`
    );

    if (setModifiers) {
      setModifiers((prev) => ({ ...prev, allowedDeaths }));
    }

    setTimeout(() => {
      const conn = createSimulatedRivalConnection(
        rival.displayName,
        allowedDeaths,
        'host'
      );
      setNetworkConnection(conn);
      setScreen(isHorseMode ? 'horse' : 'game');
    }, 650);
  };

  return (
    <div className="rc-stage w-full h-full flex flex-col overflow-hidden safe-top safe-bottom p-3 sm:p-4 select-none">
      <div className="absolute inset-0 rc-stage-dots pointer-events-none" />

      <header className="relative z-10 w-full flex items-center justify-between pr-12 shrink-0">
        <div className="rc-dock-rail flex items-center gap-3 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setScreen(isHorseMode ? 'events' : 'freeplay')}
            className="rc-bevel-btn rc-tile-slate text-white flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-lg min-h-[36px] whitespace-nowrap"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>
          <div className="rc-dock-well px-4 py-1.5 flex items-center gap-2">
            <Swords className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-black italic text-white uppercase tracking-wider whitespace-nowrap">
              {isHorseMode
                ? '1V1 H.O.R.S.E. PHRASE DUEL QUEUE'
                : '1V1 GD-VERSUS LIVE MATCHMAKING'}
            </h2>
          </div>
        </div>

        {setGameMode && (
          <div className="rc-dock-rail flex items-center gap-1.5 p-1">
            <button
              type="button"
              onClick={() => setGameMode('online_vs')}
              className={`rc-bevel-btn px-3 py-1 rounded-lg text-[11px] font-black uppercase ${
                !isHorseMode ? 'rc-tile-cyan text-black' : 'rc-sub-dark text-slate-300'
              }`}
            >
              GD VERSUS 1V1
            </button>
            <button
              type="button"
              onClick={() => setGameMode('horse')}
              className={`rc-bevel-btn px-3 py-1 rounded-lg text-[11px] font-black uppercase ${
                isHorseMode ? 'rc-tile-pink text-white' : 'rc-sub-dark text-slate-300'
              }`}
            >
              H.O.R.S.E. DUEL
            </button>
          </div>
        )}
      </header>

      <main className="relative z-10 flex-1 min-h-0 flex items-center justify-center py-2">
        <div
          className={`w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 items-stretch ${
            isCompact ? 'gap-3' : 'gap-4'
          }`}
        >
          {/* Left 5 cols: Allowed Deaths (1-3) & Mode Rules */}
          <div className="md:col-span-5 rc-console-tray p-4 flex flex-col justify-between gap-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-black uppercase tracking-widest">
                  NO LOBBY CODES · DIRECT QUEUE
                </span>
                <span className="text-xs font-black text-cyan-300">
                  {ACTIVE_RIVAL_PROFILES.length} RIVALS ONLINE
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-black italic text-white uppercase">
                {isHorseMode
                  ? 'H.O.R.S.E. TURN-BASED PHRASE DUEL'
                  : 'GD VERSUS HEAD-TO-HEAD RACE'}
              </h3>

              <p className="text-xs text-slate-300 leading-relaxed">
                {isHorseMode
                  ? 'Distinct from GD Versus: Take turns recording custom rhythm combos on the stage. Every failed phrase replay costs 1 Allowed Death!'
                  : 'Geometry Dash Versus-style live head-to-head race on the selected chart. Outlast your opponent before running out of Allowed Deaths!'}
              </p>

              {/* Allowed Deaths Selector (1, 2, or 3) */}
              <div className="rc-console-inset p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                    ALLOWED DEATHS (1 – 3)
                  </span>
                  <span className="text-xs font-black text-white">
                    {allowedDeaths} {allowedDeaths === 1 ? 'DEATH' : 'DEATHS'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((cnt) => {
                    const active = allowedDeaths === cnt;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        data-testid={`lobby-allowed-deaths-${cnt}`}
                        onClick={() => {
                          AudioEngine.playUI('move');
                          setAllowedDeaths(cnt);
                        }}
                        className={`rc-bevel-btn py-2.5 px-2 rounded-xl font-black text-xs uppercase flex flex-col items-center gap-0.5 ${
                          active
                            ? 'rc-tile-pink text-white'
                            : 'rc-sub-dark text-slate-300 hover:text-white'
                        }`}
                      >
                        <span className="text-sm font-black">{cnt} ❤️</span>
                        <span className="text-[9px] opacity-85">
                          {cnt === 1 ? 'SUDDEN' : cnt === 2 ? 'STANDARD' : 'MARATHON'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-black text-cyan-300 text-center truncate">
                {matchStatus}
              </div>
              <button
                type="button"
                data-testid="lobby-instant-match-btn"
                disabled={isSearching}
                onClick={() => handleStartCodeFreeMatch(selectedRival)}
                className="w-full rc-bevel-btn rc-tile-gold text-black font-black text-sm sm:text-base py-3 uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {isSearching
                    ? 'LAUNCHING 1V1 ARENA...'
                    : `QUEUE 1V1 VS ${selectedRival.displayName}`}
                </span>
              </button>
            </div>
          </div>

          {/* Right 7 cols: Online Rivals Directory for Direct 1v1 Queue / Invite */}
          <div className="md:col-span-7 rc-console-tray p-4 flex flex-col justify-between gap-2.5 overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-fuchsia-400" />
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                  SELECT ONLINE OPPONENT OR AUTO-MATCH
                </span>
              </div>
              <span className="text-[10px] font-black uppercase text-emerald-300 flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" /> LIVE QUEUE
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto pr-1 max-h-[300px]">
              {ACTIVE_RIVAL_PROFILES.map((rival) => {
                const isSel = selectedRival.uid === rival.uid;
                return (
                  <div
                    key={rival.uid}
                    onClick={() => setSelectedRival(rival)}
                    className={`rc-console-inset p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isSel
                        ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_16px_rgba(54,226,255,0.25)]'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{rival.avatarEmoji || '⚡'}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-white truncate">
                            {rival.displayName}
                          </div>
                          <div className="text-[10px] font-black text-cyan-300 truncate">
                            {rival.titleBadge}
                          </div>
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-[9px] font-black text-emerald-300 shrink-0">
                        {rival.wins1v1}W / {rival.losses1v1}L
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-300 line-clamp-1">{rival.bio}</p>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartCodeFreeMatch(rival);
                      }}
                      className="w-full rc-bevel-btn rc-tile-cyan text-black py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider"
                    >
                      CHALLENGE 1V1 ({allowedDeaths} ❤️)
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
