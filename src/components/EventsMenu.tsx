import React from 'react';
import { Calendar, ChevronLeft, Trophy, Users } from 'lucide-react';
import { useIsCompactLandscape } from '../game/useViewport';
import type { GameMode, ScreenId } from '../game/types';

interface EventsMenuProps {
  setScreen: (s: ScreenId) => void;
  setGameMode: (m: GameMode) => void;
}

export const EventsMenu: React.FC<EventsMenuProps> = ({ setScreen, setGameMode }) => {
  const isCompact = useIsCompactLandscape();
  const events = [
    {
      id: 1,
      title: 'H.O.R.S.E. MODE',
      desc: 'Online 1v1 duel. Host records a custom pattern, Guest must match and survive it!',
      type: 'horse' as const,
      tileClass: 'rc-tile-pink text-white',
      icon: <Trophy className="w-6 h-6 text-yellow-300 shrink-0" />,
      active: true,
    },
    {
      id: 2,
      title: '50-PLAYER BATTLE ROYALE',
      desc: 'Survive a full track head-to-head against 49 simulated live rivals.',
      type: 'br' as const,
      tileClass: 'rc-tile-green text-black',
      icon: <Users className="w-6 h-6 text-emerald-300 shrink-0" />,
      active: true,
    },
  ];

  return (
    <div className="rc-stage w-full h-full flex flex-col overflow-hidden safe-top safe-bottom p-3 sm:p-4">
      <div className="absolute inset-0 rc-stage-dots pointer-events-none" />

      {/* Centered Header Dock */}
      <header className="relative z-10 w-full flex items-center justify-center pr-12 shrink-0">
        <div className="rc-dock-rail flex items-center gap-3 sm:gap-5 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="rc-bevel-btn rc-tile-slate text-white text-xs font-black px-3 py-1.5 rounded-lg min-h-[36px] flex items-center gap-1 whitespace-nowrap"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>
          <div className="rc-dock-well px-4 py-1.5 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm sm:text-lg font-black italic text-white uppercase tracking-wider whitespace-nowrap">
              LIVE EVENTS
            </h2>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 flex items-center justify-center py-3">
        <div
          className={`w-full max-w-4xl grid grid-cols-2 items-stretch ${
            isCompact ? 'gap-3' : 'gap-5 sm:gap-6'
          }`}
        >
          {events.map((ev) => (
            <div
              key={ev.id}
              className={`rc-console-tray flex flex-col justify-between ${
                isCompact ? 'p-3.5 gap-3' : 'p-5 sm:p-6 gap-5'
              }`}
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  {ev.icon}
                  <h3
                    className={`font-black italic text-white uppercase tracking-wide ${
                      isCompact ? 'text-xl' : 'text-2xl sm:text-3xl'
                    }`}
                  >
                    {ev.title}
                  </h3>
                </div>
                <p className="rc-console-inset p-3 text-xs sm:text-sm font-bold text-slate-200 leading-relaxed">
                  {ev.desc}
                </p>
              </div>
              <button
                type="button"
                disabled={!ev.active}
                onClick={() => {
                  if (ev.type === 'horse') {
                    setGameMode('horse');
                    setScreen('lobby');
                  } else if (ev.type === 'br') {
                    setGameMode('battle_royale');
                    setScreen('freeplay');
                  }
                }}
                className={`rc-bevel-btn w-full py-3 font-black text-base sm:text-xl uppercase tracking-wider min-h-[46px] ${
                  ev.active ? ev.tileClass : 'rc-sub-dark text-slate-500 cursor-not-allowed'
                }`}
              >
                {ev.active ? 'ENTER EVENT' : 'LOCKED'}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
