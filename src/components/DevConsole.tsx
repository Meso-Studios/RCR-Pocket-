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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-2.5 sm:p-4 overflow-y-auto">
      <div className="rc-console-tray w-full max-w-3xl p-4 sm:p-5 tabular-nums text-emerald-400 max-h-[92dvh] overflow-y-auto">
        <div className="rc-dock-rail flex justify-between items-center mb-4 px-3.5 py-2">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-widest flex items-center gap-2.5 text-emerald-400">
            <Monitor className="w-5 h-5 sm:w-6 sm:h-6" /> DEV CONSOLE
          </h2>
          <button
            onClick={() => setShowDevConsole(false)}
            className="rc-bevel-btn rc-tile-slate text-emerald-400 hover:text-white p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Close Dev Console"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rc-console-inset p-3.5 flex flex-col gap-2.5">
            <h3 className="text-sm sm:text-base font-black uppercase tracking-widest text-white">
              Cheats
            </h3>

            <button
              onClick={handleMaxCoins}
              className="rc-bevel-btn rc-tile-slate text-emerald-300 p-3 flex justify-between items-center group"
            >
              <span className="font-bold text-xs sm:text-sm uppercase group-hover:text-white">Give Max Coins</span>
              <Coins className="w-4 h-4" />
            </button>

            <button
              onClick={handleUnlockAll}
              className="rc-bevel-btn rc-tile-slate text-emerald-300 p-3 flex justify-between items-center group"
            >
              <span className="font-bold text-xs sm:text-sm uppercase group-hover:text-white">Unlock Everything</span>
              <Unlock className="w-4 h-4" />
            </button>

            <button
              onClick={handleToggleBotplay}
              className={`rc-bevel-btn p-3 flex justify-between items-center group ${
                playerInfo.botplay ? 'rc-tile-green text-black' : 'rc-tile-slate text-emerald-300'
              }`}
            >
              <span className="font-bold text-xs sm:text-sm uppercase">
                {playerInfo.botplay ? 'Botplay: ON' : 'Botplay: OFF'}
              </span>
              <Activity className="w-4 h-4" />
            </button>
          </div>

          <div className="rc-console-inset p-3.5 flex flex-col gap-2.5">
            <h3 className="text-sm sm:text-base font-black uppercase tracking-widest text-white">
              Hex Injector
            </h3>
            <p className="text-[11px] text-emerald-500">Override the &quot;Dev Custom&quot; hidden skin colors.</p>

            <div className="grid grid-cols-2 gap-2">
              {playerInfo.customColors.map((color, i) => (
                <div key={i} className="flex flex-col">
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Lane {i + 1}</label>
                  <div className="flex gap-1.5">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleColorChange(i, e.target.value)}
                      className="w-8 h-8 rounded border border-emerald-500 bg-transparent p-0 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => handleColorChange(i, e.target.value)}
                      className="min-w-0 flex-1 bg-[#0d1018] border border-emerald-500/60 rounded text-emerald-400 px-1.5 tabular-nums uppercase text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleEquipCustom}
              className="mt-auto rc-bevel-btn rc-tile-green text-black p-3 font-black text-xs sm:text-sm uppercase flex justify-between items-center"
            >
              <span>Equip Custom Skin</span>
              <PenTool className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
