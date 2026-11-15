import React from 'react';
import { ChevronLeft } from 'lucide-react';
import type { GameMode, ScreenId } from '../game/types';

interface EventsMenuProps {
  setScreen: (s: ScreenId) => void;
  setGameMode: (m: GameMode) => void;
}

export const EventsMenu: React.FC<EventsMenuProps> = ({ setScreen, setGameMode }) => {
  const events = [
    {
      id: 1,
      title: 'H.O.R.S.E. MODE',
      desc: 'Online 1v1. Host records a pattern, Guest tries to survive it!',
      type: 'horse' as const,
      active: true,
    },
    {
      id: 2,
      title: '50-PLAYER BATTLE ROYALE',
      desc: 'Survive a full track against 49 simulated live rivals.',
      type: 'br' as const,
      active: true,
    },
  ];

  return (
    <div className="w-full h-full bg-indigo-950 p-4 md:p-12 overflow-y-auto overflow-x-hidden flex flex-col items-center custom-scrollbar safe-top safe-bottom">
      <div className="w-full flex justify-start mb-4 sm:mb-8 pr-14 z-10">
        <button
          onClick={() => setScreen('menu')}
          className="bg-white text-black text-lg md:text-2xl font-black px-4 md:px-6 py-2 md:py-3 border-4 border-black shadow-[5px_5px_0_#000] transform skew-x-[-10deg] hover:bg-gray-200 transition-all min-h-[44px]"
        >
          <span className="transform skew-x-[10deg] flex items-center">
            <ChevronLeft className="inline mr-1" /> BACK
          </span>
        </button>
      </div>

      <h2 className="text-4xl sm:text-6xl md:text-8xl font-black italic text-cyan-400 drop-shadow-[6px_6px_0_#000] mb-6 sm:mb-12 transform -rotate-2 text-center">
        LIVE EVENTS
      </h2>

      <div className="flex flex-col gap-5 sm:gap-8 w-full max-w-4xl z-10 pb-12 px-1">
        {events.map((ev) => (
          <div
            key={ev.id}
            className={`border-4 sm:border-8 p-4 md:p-8 flex flex-col md:flex-row gap-4 md:gap-6 justify-between items-center sm:transform sm:skew-x-[-5deg] ${
              ev.active ? 'bg-pink-500 border-white shadow-[8px_8px_0_#000] md:shadow-[12px_12px_0_#000]' : 'bg-gray-800 border-gray-600'
            }`}
          >
            <div className="sm:transform sm:skew-x-[5deg] text-center md:text-left">
              <h3 className="text-2xl sm:text-4xl md:text-5xl font-black italic text-white uppercase drop-shadow-[3px_3px_0_#000]">
                {ev.title}
              </h3>
              <p className="text-sm sm:text-lg md:text-2xl font-bold text-black mt-2 bg-white/85 inline-block px-3 sm:px-4 py-1">
                {ev.desc}
              </p>
            </div>
            <button
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
              className={`w-full md:w-auto px-8 md:px-12 py-3 md:py-4 font-black text-xl sm:text-2xl md:text-4xl border-4 border-black sm:transform sm:skew-x-[5deg] transition-all min-h-[52px] ${
                ev.active
                  ? 'bg-yellow-400 text-black shadow-[5px_5px_0_#000] hover:-translate-y-1'
                  : 'bg-gray-500 text-gray-700'
              }`}
            >
              {ev.active ? 'ENTER' : 'LOCKED'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
