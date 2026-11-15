import React from 'react';
import { Activity, Coins, Monitor, PenTool, Unlock, X } from 'lucide-react';
import { SHAPES, SKINS } from '../game/constants';
import type { PlayerInfo } from '../game/types';

interface DevConsoleProps {
  playerInfo: PlayerInfo;
  setPlayerInfo: React.Dispatch<React.SetStateAction<PlayerInfo>>;
  setShowDevConsole: (v: boolean) => void;
}

export const DevConsole: React.FC<DevConsoleProps> = ({ playerInfo, setPlayerInfo, setShowDevConsole }) => {
  const handleMaxCoins = () => {
    setPlayerInfo((prev) => {
      const newData = { ...prev, coins: 9999999 };
      localStorage.setItem('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  const handleUnlockAll = () => {
    setPlayerInfo((prev) => {
      const newData = {
        ...prev,
        unlockedSkins: Object.keys(SKINS),
        unlockedShapes: Object.keys(SHAPES),
      };
      localStorage.setItem('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  const handleToggleBotplay = () => {
    setPlayerInfo((prev) => {
      const newData = { ...prev, botplay: !prev.botplay };
      localStorage.setItem('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  const handleColorChange = (index: number, val: string) => {
    setPlayerInfo((prev) => {
      const newColors = [...prev.customColors];
      newColors[index] = val;
      const newData = { ...prev, customColors: newColors };
      localStorage.setItem('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  const handleEquipCustom = () => {
    setPlayerInfo((prev) => {
      const newData = {
        ...prev,
        equippedSkin: 'custom',
        unlockedSkins: prev.unlockedSkins.includes('custom') ? prev.unlockedSkins : [...prev.unlockedSkins, 'custom'],
      };
      localStorage.setItem('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-black border-4 sm:border-8 border-green-500 shadow-[0_0_40px_#22c55e] p-4 sm:p-8 font-mono text-green-400 max-h-[92dvh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 border-b-4 border-green-500 pb-3">
          <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-widest flex items-center gap-3">
            <Monitor className="w-7 h-7 sm:w-10 sm:h-10" /> DEV CONSOLE
          </h2>
          <button
            onClick={() => setShowDevConsole(false)}
            className="text-green-500 hover:text-white transition-colors bg-gray-900 border-2 border-green-500 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close Dev Console"
          >
            <X className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          <div className="flex flex-col gap-3 sm:gap-4">
            <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-widest text-white border-l-4 border-green-500 pl-3">
              Cheats
            </h3>

            <button
              onClick={handleMaxCoins}
              className="bg-gray-900 border-2 border-green-500 hover:bg-green-900 transition-colors p-4 flex justify-between items-center group"
            >
              <span className="font-bold text-lg sm:text-xl uppercase group-hover:text-white">Give Max Coins</span>
              <Coins className="w-6 h-6" />
            </button>

            <button
              onClick={handleUnlockAll}
              className="bg-gray-900 border-2 border-green-500 hover:bg-green-900 transition-colors p-4 flex justify-between items-center group"
            >
              <span className="font-bold text-lg sm:text-xl uppercase group-hover:text-white">Unlock Everything</span>
              <Unlock className="w-6 h-6" />
            </button>

            <button
              onClick={handleToggleBotplay}
              className={`border-2 p-4 flex justify-between items-center group transition-colors ${
                playerInfo.botplay
                  ? 'bg-green-500 text-black border-green-400 shadow-[0_0_15px_#22c55e]'
                  : 'bg-gray-900 border-green-500 hover:bg-green-900'
              }`}
            >
              <span className="font-bold text-lg sm:text-xl uppercase">
                {playerInfo.botplay ? 'Botplay: ON' : 'Botplay: OFF'}
              </span>
              <Activity className="w-6 h-6" />
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:gap-4">
            <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-widest text-white border-l-4 border-green-500 pl-3">
              Hex Injector
            </h3>
            <p className="text-xs sm:text-sm text-green-600 mb-1">Override the &quot;Dev Custom&quot; hidden skin colors.</p>

            <div className="grid grid-cols-2 gap-3">
              {playerInfo.customColors.map((color, i) => (
                <div key={i} className="flex flex-col">
                  <label className="text-xs uppercase font-bold text-gray-400 mb-1">Lane {i + 1}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleColorChange(i, e.target.value)}
                      className="w-10 h-10 border-2 border-green-500 bg-transparent p-0 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => handleColorChange(i, e.target.value)}
                      className="min-w-0 flex-1 bg-gray-900 border-2 border-green-500 text-green-400 px-2 font-mono uppercase text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleEquipCustom}
              className="mt-2 bg-gray-900 border-2 border-green-500 hover:bg-green-900 transition-colors p-4 font-bold text-lg sm:text-xl uppercase group flex justify-between items-center"
            >
              <span className="group-hover:text-white">Equip Custom Skin</span>
              <PenTool className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
