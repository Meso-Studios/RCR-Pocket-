import React from 'react';
import { Activity, Coins, Monitor, PenTool, Unlock, X } from 'lucide-react';
import { SHAPES, SKINS } from '../game/constants';
import { safeSetStorage } from '../game/storage';
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
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
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
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  const handleToggleBotplay = () => {
    setPlayerInfo((prev) => {
      const newData = { ...prev, botplay: !prev.botplay };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  const handleColorChange = (index: number, val: string) => {
    setPlayerInfo((prev) => {
      const newColors = [...prev.customColors];
      newColors[index] = val;
      const newData = { ...prev, customColors: newColors };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
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
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-md p-2.5 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-black border-4 sm:border-8 border-green-500 shadow-[0_0_40px_#22c55e] p-3.5 sm:p-6 font-mono text-green-400 max-h-[92dvh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 border-b-4 border-green-500 pb-2.5">
          <h2 className="text-xl sm:text-3xl font-black uppercase tracking-widest flex items-center gap-2.5">
            <Monitor className="w-6 h-6 sm:w-8 sm:h-8" /> DEV CONSOLE
          </h2>
          <button
            onClick={() => setShowDevConsole(false)}
            className="text-green-500 hover:text-white transition-colors bg-gray-900 border-2 border-green-500 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Close Dev Console"
          >
            <X className="w-5 h-5 sm:w-7 sm:h-7" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="flex flex-col gap-2.5">
            <h3 className="text-base sm:text-xl font-bold uppercase tracking-widest text-white border-l-4 border-green-500 pl-3">
              Cheats
            </h3>

            <button
              onClick={handleMaxCoins}
              className="bg-gray-900 border-2 border-green-500 hover:bg-green-900 transition-colors p-3 flex justify-between items-center group"
            >
              <span className="font-bold text-sm sm:text-lg uppercase group-hover:text-white">Give Max Coins</span>
              <Coins className="w-5 h-5" />
            </button>

            <button
              onClick={handleUnlockAll}
              className="bg-gray-900 border-2 border-green-500 hover:bg-green-900 transition-colors p-3 flex justify-between items-center group"
            >
              <span className="font-bold text-sm sm:text-lg uppercase group-hover:text-white">Unlock Everything</span>
              <Unlock className="w-5 h-5" />
            </button>

            <button
              onClick={handleToggleBotplay}
              className={`border-2 p-3 flex justify-between items-center group transition-colors ${
                playerInfo.botplay
                  ? 'bg-green-500 text-black border-green-400 shadow-[0_0_15px_#22c55e]'
                  : 'bg-gray-900 border-green-500 hover:bg-green-900'
              }`}
            >
              <span className="font-bold text-sm sm:text-lg uppercase">
                {playerInfo.botplay ? 'Botplay: ON' : 'Botplay: OFF'}
              </span>
              <Activity className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-base sm:text-xl font-bold uppercase tracking-widest text-white border-l-4 border-green-500 pl-3">
              Hex Injector
            </h3>
            <p className="text-xs text-green-600">Override the &quot;Dev Custom&quot; hidden skin colors.</p>

            <div className="grid grid-cols-2 gap-2">
              {playerInfo.customColors.map((color, i) => (
                <div key={i} className="flex flex-col">
                  <label className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Lane {i + 1}</label>
                  <div className="flex gap-1.5">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleColorChange(i, e.target.value)}
                      className="w-8 h-8 border-2 border-green-500 bg-transparent p-0 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => handleColorChange(i, e.target.value)}
                      className="min-w-0 flex-1 bg-gray-900 border-2 border-green-500 text-green-400 px-1.5 font-mono uppercase text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleEquipCustom}
              className="mt-1 bg-gray-900 border-2 border-green-500 hover:bg-green-900 transition-colors p-3 font-bold text-sm sm:text-lg uppercase group flex justify-between items-center"
            >
              <span className="group-hover:text-white">Equip Custom Skin</span>
              <PenTool className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
