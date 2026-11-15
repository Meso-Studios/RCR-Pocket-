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
  const isLandscapeCompact = useIsCompactLandscape();
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

  if (isLandscapeCompact) {
    return (
      <div className="w-full h-full flex flex-col bg-indigo-950 p-3 overflow-hidden safe-top safe-bottom">
        <div className="w-full flex items-center justify-between gap-2 pr-12 pb-2 border-b border-white/15 shrink-0">
          <button
            onClick={() => setScreen(gameMode === 'horse' ? 'events' : 'freeplay')}
            className="flex items-center gap-1 text-xs font-black bg-white border-2 border-black text-black px-3 py-1.5 rounded-lg shadow-[3px_3px_0_#000] min-h-[38px]"
          >
            <ChevronLeft className="w-4 h-4" /> BACK
          </button>
          <h2 className="text-xl font-black italic text-cyan-400 drop-shadow-[3px_3px_0_#000] flex items-center gap-2">
            <Globe className="w-5 h-5 shrink-0" /> MULTIPLAYER LOBBY
          </h2>
          <div className="w-16" />
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 py-3 px-2 max-w-5xl w-full mx-auto items-stretch">
          <div className="bg-black p-4 border-4 border-pink-500 rounded-xl shadow-[6px_6px_0_#ec4899] flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-black text-white italic mb-1">HOST A GAME</h3>
              <p className="text-xs text-gray-300 font-bold mb-2">Tap to copy &amp; share with your friend:</p>
              <button
                type="button"
                onClick={copyCode}
                className="w-full bg-white text-black text-center font-black text-base py-2 px-3 border-2 border-black rounded-lg select-all cursor-pointer break-all min-h-[44px]"
              >
                {copied ? 'COPIED CODE!' : myPeerId || 'GENERATING...'}
              </button>
            </div>
            <p className="text-cyan-400 font-black animate-pulse text-center text-xs mt-2">{status}</p>
          </div>

          <div className="bg-black p-4 border-4 border-yellow-400 rounded-xl shadow-[6px_6px_0_#facc15] flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-black text-white italic mb-1">JOIN A GAME</h3>
              <p className="text-xs text-gray-300 font-bold mb-2">Paste your friend&apos;s code here:</p>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ENTER CODE"
                className="w-full bg-white text-black font-black text-base p-2 border-2 border-black rounded-lg uppercase text-center focus:outline-none focus:ring-2 focus:ring-yellow-400 min-h-[42px]"
              />
            </div>
            <button
              onClick={handleJoin}
              className="w-full bg-yellow-400 text-black font-black text-lg py-2 border-2 border-black rounded-lg shadow-[3px_3px_0_#000] min-h-[44px] mt-2"
            >
              CONNECT
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center bg-indigo-950 p-4 md:p-10 overflow-y-auto overflow-x-hidden custom-scrollbar safe-top safe-bottom">
      <div className="w-full flex justify-start mb-4 sm:mb-8 pr-14 shrink-0">
        <button
          onClick={() => setScreen(gameMode === 'horse' ? 'events' : 'freeplay')}
          className="flex items-center gap-2 text-lg md:text-2xl font-black bg-white border-4 border-black text-black px-4 md:px-6 py-2 md:py-3 shadow-[5px_5px_0_#000] transform skew-x-[-10deg] hover:bg-gray-200 transition-colors min-h-[44px]"
        >
          <span className="transform skew-x-[10deg] flex items-center">
            <ChevronLeft className="w-6 h-6 md:w-8 md:h-8" /> BACK
          </span>
        </button>
      </div>

      <h2 className="text-3xl sm:text-5xl md:text-7xl font-black italic text-cyan-400 drop-shadow-[4px_4px_0_#000] md:drop-shadow-[8px_8px_0_#000] transform skew-x-[-5deg] mb-6 md:mb-10 flex items-center gap-3 md:gap-6 text-center">
        <Globe className="w-9 h-9 md:w-[68px] md:h-[68px] shrink-0" /> MULTIPLAYER LOBBY
      </h2>

      <div className="flex flex-col md:flex-row gap-6 md:gap-12 w-full max-w-5xl pb-12">
        <div className="flex-1 bg-black p-5 md:p-8 border-4 sm:border-8 border-pink-500 shadow-[6px_6px_0_#ec4899] md:shadow-[12px_12px_0_#ec4899] sm:transform sm:skew-x-[-4deg]">
          <h3 className="text-2xl md:text-4xl font-black text-white italic mb-2 sm:mb-4">HOST A GAME</h3>
          <p className="text-sm sm:text-lg md:text-xl text-gray-300 mb-4 font-bold">
            Tap to copy &amp; give this code to your friend:
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="w-full bg-white text-black text-center font-black text-lg sm:text-2xl md:text-3xl py-3 md:py-4 px-3 border-4 border-black select-all cursor-pointer break-all shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] min-h-[52px]"
          >
            {copied ? 'COPIED CODE!' : myPeerId || 'GENERATING...'}
          </button>
          <p className="mt-4 md:mt-6 text-cyan-400 font-black animate-pulse text-center text-base md:text-xl">
            {status}
          </p>
        </div>

        <div className="flex-1 bg-black p-5 md:p-8 border-4 sm:border-8 border-yellow-400 shadow-[6px_6px_0_#facc15] md:shadow-[12px_12px_0_#facc15] sm:transform sm:skew-x-[4deg]">
          <h3 className="text-2xl md:text-4xl font-black text-white italic mb-2 sm:mb-4">JOIN A GAME</h3>
          <p className="text-sm sm:text-lg md:text-xl text-gray-300 mb-4 font-bold">
            Paste your friend&apos;s code here:
          </p>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ENTER CODE"
            className="w-full bg-white text-black font-black text-lg md:text-2xl p-3 md:p-4 border-4 border-black mb-4 uppercase text-center focus:outline-none focus:ring-4 focus:ring-yellow-400"
          />
          <button
            onClick={handleJoin}
            className="w-full bg-yellow-400 text-black font-black text-xl md:text-3xl py-3 md:py-4 border-4 border-black shadow-[4px_4px_0_#000] md:shadow-[6px_6px_0_#000] min-h-[52px]"
          >
            CONNECT
          </button>
        </div>
      </div>
    </div>
  );
};
