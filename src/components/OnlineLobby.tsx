import React, { useEffect, useState } from 'react';
import { ChevronLeft, Globe } from 'lucide-react';
import { useIsCompactLandscape } from '../game/useViewport';
import type { GameMode, PeerConnectionLike, ScreenId } from '../game/types';

interface OnlineLobbyProps {
  peer: any;
  myPeerId: string;
  setNetworkConnection: (conn: PeerConnectionLike) => void;
  setScreen: (s: ScreenId) => void;
  gameMode: GameMode;
}

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  peer,
  myPeerId,
  setNetworkConnection,
  setScreen,
  gameMode,
}) => {
  const isCompact = useIsCompactLandscape();
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState('Initializing network...');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!peer) return;

    if (myPeerId) {
      setStatus('Waiting for opponent to connect...');
    } else {
      setStatus('GENERATING CODE...');
    }

    const handleConnection = (conn: any) => {
      conn._rhythmRole = 'host';
      setStatus('Opponent connected. Synchronizing...');
      const launch = () => {
        setNetworkConnection(conn);
        setStatus('Opponent Connected! Starting Game...');
        setTimeout(() => setScreen(gameMode === 'horse' ? 'horse' : 'game'), 800);
      };
      if (conn.open) launch();
      else conn.on('open', launch);
    };

    const handlePeerError = (err: any) => {
      if (err.type === 'peer-unavailable') {
        setStatus('Connection Failed. Code not found.');
      } else if (err.type === 'network') {
        setStatus('Network connection error.');
      } else {
        setStatus('Error: ' + err.type);
      }
    };

    peer.on('connection', handleConnection);
    peer.on('error', handlePeerError);

    return () => {
      peer.off('connection', handleConnection);
      peer.off('error', handlePeerError);
    };
  }, [peer, myPeerId, setScreen, gameMode, setNetworkConnection]);

  const handleJoin = () => {
    if (!joinCode || !peer) return;
    setStatus('Connecting to Host...');
    const safeJoinCode = joinCode.trim();
    const conn = peer.connect(safeJoinCode, { reliable: true });
    conn._rhythmRole = 'guest';

    conn.on('open', () => {
      setStatus('Connected to Host! Starting Game...');
      setNetworkConnection(conn);
      setTimeout(() => {
        setScreen(gameMode === 'horse' ? 'horse' : 'game');
      }, 2000);
    });

    conn.on('error', () => {
      setStatus('Connection Failed. Try again.');
    });
  };

  const copyCode = async () => {
    if (!myPeerId) return;
    try {
      await navigator.clipboard.writeText(myPeerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <div className="rc-stage w-full h-full flex flex-col overflow-hidden safe-top safe-bottom p-3 sm:p-4">
      <div className="absolute inset-0 rc-stage-dots pointer-events-none" />

      <header className="relative z-10 w-full flex items-center justify-center pr-12 shrink-0">
        <div className="rc-dock-rail flex items-center gap-3 sm:gap-5 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setScreen(gameMode === 'horse' ? 'events' : 'freeplay')}
            className="rc-bevel-btn rc-tile-slate text-white flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-lg min-h-[36px] whitespace-nowrap"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>
          <div className="rc-dock-well px-4 py-1.5 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="text-sm sm:text-lg font-black italic text-white uppercase tracking-wider whitespace-nowrap">
              MULTIPLAYER LOBBY
            </h2>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 flex items-center justify-center py-3">
        <div className={`w-full max-w-5xl grid grid-cols-2 items-stretch ${isCompact ? 'gap-3' : 'gap-5 sm:gap-6'}`}>
          <div className={`rc-console-tray flex flex-col justify-between ${isCompact ? 'p-3.5 gap-3' : 'p-5 sm:p-6 gap-4'}`}>
            <div className="flex flex-col gap-2">
              <h3 className={`font-black italic text-pink-400 uppercase ${isCompact ? 'text-xl' : 'text-2xl'}`}>
                HOST A GAME
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 font-bold">
                Tap below to copy &amp; share your lobby code:
              </p>
              <button
                type="button"
                onClick={copyCode}
                className="rc-dock-well w-full text-cyan-300 text-center font-black text-base sm:text-xl py-3 px-3 select-all cursor-pointer break-all hover:border-cyan-400/60 min-h-[48px]"
              >
                {copied ? 'COPIED CODE!' : myPeerId || 'GENERATING...'}
              </button>
            </div>
            <p className="text-cyan-300 font-black text-center text-xs sm:text-sm">{status}</p>
          </div>

          <div className={`rc-console-tray flex flex-col justify-between ${isCompact ? 'p-3.5 gap-3' : 'p-5 sm:p-6 gap-4'}`}>
            <div className="flex flex-col gap-2">
              <h3 className={`font-black italic text-yellow-300 uppercase ${isCompact ? 'text-xl' : 'text-2xl'}`}>
                JOIN A GAME
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 font-bold">
                Paste your friend&apos;s lobby code:
              </p>
              <input
                type="text"
                aria-label="Lobby code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ENTER CODE"
                className="rc-dock-well w-full text-white font-black text-base sm:text-lg p-3 uppercase text-center focus:outline-none focus:border-yellow-400 placeholder:text-slate-500 min-h-[48px]"
              />
            </div>
            <button
              type="button"
              onClick={handleJoin}
              className="rc-bevel-btn rc-tile-gold text-black font-black text-base sm:text-lg py-3 uppercase tracking-wider min-h-[46px]"
            >
              CONNECT
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
