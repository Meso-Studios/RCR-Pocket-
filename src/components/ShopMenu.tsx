import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Coins } from 'lucide-react';
import { db } from '../firebaseClient';
import { AudioEngine } from '../game/audio';
import {
  ADMIN_EMAILS,
  KEY_MAP,
  NOTE_EFFECTS,
  NOTE_RARITIES,
  ROYALTY_FREE_SONGS,
  SHAPES,
  SKINS,
} from '../game/constants';
import { drawNote } from '../game/renderer';
import type { FirebaseUser, HitSoundProduct, NoteProduct, PlayerInfo, ScreenId } from '../game/types';
import { TouchLanePads } from './TouchControls';

export const NoteTestArena: React.FC<{ product: Partial<NoteProduct>; onClose: () => void }> = ({
  product,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const start = useRef(performance.now());
  const lastHit = useRef(0);
  const [running, setRunning] = useState(false);
  const [hits, setHits] = useState(0);
  const hitsRef = useRef(0);
  hitsRef.current = hits;

  const lastFrameRef = useRef(performance.now());
  const smoothTimeRef = useRef(0);
  const lastRawRef = useRef(-1);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d', { alpha: false });
    if (!ctx) return;
    lastFrameRef.current = performance.now();
    smoothTimeRef.current = 0;
    lastRawRef.current = -1;
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(50, now - lastFrameRef.current));
      lastFrameRef.current = now;
      if (running && audioRef.current && !audioRef.current.paused) {
        smoothTimeRef.current += dt;
        const raw = audioRef.current.currentTime * 1000;
        if (Math.abs(raw - lastRawRef.current) > 0.5) {
          lastRawRef.current = raw;
          const drift = raw - smoothTimeRef.current;
          smoothTimeRef.current = Math.abs(drift) > 180 ? raw : smoothTimeRef.current + drift * 0.05;
        }
      } else {
        smoothTimeRef.current = now - start.current;
      }
      const t = smoothTimeRef.current;
      const g = ctx.createLinearGradient(0, 0, 0, 520);
      g.addColorStop(0, '#121633');
      g.addColorStop(1, '#05060d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 360, 520);
      for (let l = 0; l < 4; l++) {
        ctx.fillStyle = '#ffffff0c';
        ctx.fillRect(10 + l * 85, 0, 80, 520);
        drawNote(ctx, 20 + l * 85, 420, 60, l, null, false, 'arrow', 'normal', null);
      }
      for (let i = 0; i < 18; i++) {
        const lane = (i * 3 + (i % 2)) % 4;
        const y = 420 + ((((i * 500 - t) % 900) + 900) % 900) - 900;
        if (y > -80 && y < 520) {
          drawNote(
            ctx,
            20 + lane * 85,
            y,
            60,
            lane,
            ['#ec4899', '#22d3ee', '#4ade80', '#ef4444'][lane],
            false,
            'arrow',
            'normal',
            product as NoteProduct
          );
        }
      }
      const hitLife = Math.max(0, 1 - (performance.now() - lastHit.current) / 500);
      if (hitLife > 0) {
        ctx.strokeStyle = product.fill || '#fff';
        ctx.lineWidth = 5;
        ctx.globalAlpha = hitLife;
        ctx.beginPath();
        ctx.arc(180, 420, 30 + (1 - hitLife) * 150, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#fff';
      ctx.font = '900 18px Saira';
      ctx.fillText('NEON DRIFT • NOTE TEST', 14, 28);
      ctx.fillStyle = '#facc15';
      ctx.fillText(`TEST HITS ${hitsRef.current}`, 14, 52);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [running, product]);

  const startTest = () => {
    AudioEngine.init();
    if (audioRef.current) {
      audioRef.current.volume = 0.35;
      audioRef.current.currentTime = 0;
      audioRef.current
        .play()
        .then(() => setRunning(true))
        .catch(() => setRunning(true));
    }
    start.current = performance.now();
  };

  const hit = () => {
    AudioEngine.init();
    lastHit.current = performance.now();
    setHits((x) => x + 1);
    AudioEngine.playHitSound();
    (product.effects || []).forEach((_, i) =>
      setTimeout(() => AudioEngine.playTone(500 + i * 180, 'triangle', 0.09, 0.03), i * 45)
    );
  };

  const hitRef = useRef(hit);
  hitRef.current = hit;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (KEY_MAP[e.key.toLowerCase()] !== undefined) hitRef.current();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <div className="fixed inset-0 z-[999] bg-black/90 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-gray-950 border-4 border-cyan-400 p-3 sm:p-4 max-w-3xl w-full flex flex-col md:flex-row gap-4 max-h-[95dvh] overflow-y-auto">
        <div className="flex flex-col items-center gap-2">
          <canvas
            ref={canvasRef}
            width="360"
            height="520"
            onPointerDown={(e) => {
              e.preventDefault();
              hit();
            }}
            className="touch-surface max-h-[45dvh] md:max-h-[65dvh] w-auto border-4 border-white mx-auto"
          />
          <TouchLanePads
            colors={['#ec4899', '#22d3ee', '#4ade80', '#ef4444']}
            onLaneDown={() => hit()}
            compact
          />
        </div>
        <div className="flex-1 flex flex-col">
          <h2 className="text-2xl sm:text-3xl font-black text-cyan-300">NEON DRIFT TEST</h2>
          <p className="text-gray-300 mb-3 text-sm sm:text-base">
            Tap the touch pads, canvas, or press arrow/WASD keys to test hits.
          </p>
          <audio ref={audioRef} src={ROYALTY_FREE_SONGS[0].audioUrl || undefined} loop playsInline />
          <button onClick={startTest} className="w-full bg-green-400 text-black p-3 font-black min-h-[48px]">
            START TEST
          </button>
          <button onClick={hit} className="w-full bg-pink-500 text-black p-3 font-black mt-2 min-h-[48px]">
            SIMULATE HIT + EFFECTS
          </button>
          <div className="mt-3 space-y-2">
            {(product.effects || []).map((e) => (
              <div className="bg-purple-900 p-2 text-sm" key={e.id}>
                {NOTE_EFFECTS.find((x) => x.id === e.id)?.name} • {e.intensity}%
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              audioRef.current?.pause();
              onClose();
            }}
            className="w-full bg-white text-black p-3 font-black mt-auto pt-3 min-h-[48px]"
          >
            CLOSE TEST
          </button>
        </div>
      </div>
    </div>
  );
};

interface ShopMenuProps {
  setScreen: (s: ScreenId) => void;
  playerInfo: PlayerInfo;
  setPlayerInfo: React.Dispatch<React.SetStateAction<PlayerInfo>>;
  user: FirebaseUser | null;
}

export const ShopMenu: React.FC<ShopMenuProps> = ({ setScreen, playerInfo, setPlayerInfo, user }) => {
  const [shopTab, setShopTab] = useState<'shapes' | 'notes' | 'sounds' | 'mods'>('notes');
  const [noteProducts, setNoteProducts] = useState<NoteProduct[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rhythmCanvasNoteProducts') || '[]');
    } catch {
      return [];
    }
  });
  const [hitSounds, setHitSounds] = useState<HitSoundProduct[]>(() => {
    try {
      const x = JSON.parse(localStorage.getItem('rhythmCanvasHitSounds') || '[]');
      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!db) return;
    const merge = (items: any[]) =>
      setNoteProducts((prev) => {
        const m = new Map(prev.map((x) => [String(x.id), x]));
        items
          .filter((x) => x && x.active !== false)
          .forEach((x) => m.set(String(x.id), x));
        return [...m.values()];
      });
    const u1 = db.collection('note_products').onSnapshot(
      (q: any) => merge(q.docs.map((d: any) => ({ id: d.id, ...d.data() }))),
      (e: any) => console.warn('Primary note shop unavailable', e)
    );
    const u2 = db.collection('system').doc('noteProducts').onSnapshot(
      (d: any) => merge(d.data()?.products || []),
      (e: any) => console.warn('Backup note shop unavailable', e)
    );
    const u3 = db.collection('community_tracks').onSnapshot(
      (q: any) =>
        merge(
          q.docs
            .map((d: any) => ({ id: d.id, ...d.data() }))
            .filter((x: any) => x.entityType === 'note_product')
            .map((x: any) => x.product || x)
        ),
      (e: any) => console.warn('Community product fallback unavailable', e)
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const buyOrEquipProduct = (p: NoteProduct) =>
    setPlayerInfo((prev) => {
      const unlocked = prev.unlockedNoteProducts || [];
      const owned = unlocked.includes(p.id);
      if (!owned && prev.coins < (p.price || 0)) return prev;
      const next: PlayerInfo = {
        ...prev,
        coins: owned ? prev.coins : prev.coins - (p.price || 0),
        unlockedNoteProducts: owned ? unlocked : [...unlocked, p.id],
        equippedNoteProduct: p,
      };
      localStorage.setItem('rhythmCanvasSave', JSON.stringify(next));
      return next;
    });

  useEffect(() => {
    if (!db) return;
    const merge = (a: any[]) =>
      setHitSounds((prev) => {
        const m = new Map(prev.map((x) => [String(x.id), x]));
        a.forEach((x) => x && m.set(String(x.id), x));
        return [...m.values()];
      });
    const a = db.collection('hit_sound_products').onSnapshot(
      (q: any) => merge(q.docs.map((d: any) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    const b = db.collection('community_tracks').onSnapshot(
      (q: any) =>
        merge(
          q.docs
            .map((d: any) => d.data())
            .filter((x: any) => x.entityType === 'hit_sound_product')
            .map((x: any) => x.product)
        ),
      () => {}
    );
    return () => {
      a();
      b();
    };
  }, []);

  const buyOrEquipSound = (p: HitSoundProduct) =>
    setPlayerInfo((prev) => {
      const u = prev.unlockedHitSounds || [];
      const owned = u.includes(p.id);
      if (!owned && prev.coins < (p.price || 0)) return prev;
      const next: PlayerInfo = {
        ...prev,
        coins: owned ? prev.coins : prev.coins - (p.price || 0),
        unlockedHitSounds: owned ? u : [...u, p.id],
        equippedHitSound: p,
      };
      localStorage.setItem('rhythmCanvasSave', JSON.stringify(next));
      return next;
    });

  const handlePurchaseShape = (shapeKey: 'arrow' | 'circle') => {
    const shape = SHAPES[shapeKey];
    if (playerInfo.coins >= shape.price && !playerInfo.unlockedShapes.includes(shapeKey)) {
      setPlayerInfo((prev) => {
        const newData: PlayerInfo = {
          ...prev,
          coins: prev.coins - shape.price,
          unlockedShapes: [...prev.unlockedShapes, shapeKey],
          equippedShape: shapeKey,
        };
        localStorage.setItem('rhythmCanvasSave', JSON.stringify(newData));
        return newData;
      });
    }
  };

  const handleEquipShape = (shapeKey: 'arrow' | 'circle') => {
    setPlayerInfo((prev) => {
      const newData = { ...prev, equippedShape: shapeKey };
      localStorage.setItem('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  return (
    <div className="w-full h-full bg-indigo-950 flex flex-col pt-3 md:pt-8 pb-8 md:pb-12 px-3 sm:px-6 md:px-12 overflow-y-auto overflow-x-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGVsbGlwc2UgY3g9IjEwIiBjeT0iMTAiIHJ4PSI1IiByeT0iNSIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')] bg-repeat relative custom-scrollbar safe-top safe-bottom">
      <div className="flex flex-wrap justify-between items-center z-10 mb-5 sm:mb-8 pr-12 sm:pr-16 gap-3">
        <button
          onClick={() => setScreen('menu')}
          className="flex items-center gap-1 text-base md:text-2xl font-black bg-white border-4 border-black text-black px-3 md:px-6 py-2 md:py-3 hover:bg-gray-200 transition-all shadow-[5px_5px_0_#000] transform skew-x-[-10deg] min-h-[44px]"
        >
          <span className="transform skew-x-[10deg] flex items-center">
            <ChevronLeft className="w-5 h-5 md:w-7 md:h-7" /> BACK
          </span>
        </button>
        {ADMIN_EMAILS.includes(user?.email || '') && (
          <button onClick={() => setScreen('admin_studio')} className="bg-red-600 border-4 border-white px-3 sm:px-4 py-2 font-black text-sm sm:text-base min-h-[44px]">
            ADMIN STUDIO
          </button>
        )}
        <h2 className="text-4xl sm:text-6xl md:text-8xl font-black italic tracking-wider text-yellow-400 drop-shadow-[4px_4px_0_#000] md:drop-shadow-[8px_8px_0_#000] transform -rotate-2">
          STORE
        </h2>
        <div className="flex items-center gap-2 bg-black px-3 md:px-6 py-2 md:py-3 border-4 border-yellow-400 shadow-[5px_5px_0_#facc15] transform skew-x-[8deg]">
          <Coins className="w-6 h-6 md:w-9 md:h-9 text-yellow-400 transform skew-x-[-8deg]" />
          <span className="font-black text-xl md:text-4xl text-white tracking-widest transform skew-x-[-8deg]">
            {playerInfo.coins}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sm:gap-4 mb-6 sm:mb-8 z-10 w-full justify-center">
        {(
          [
            ['shapes', 'SHAPES'],
            ['notes', 'NOTES'],
            ['sounds', 'HIT SOUNDS'],
            ['mods', 'MODS'],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setShopTab(tab)}
            className={`px-4 py-2.5 sm:px-8 sm:py-3 font-black text-sm sm:text-xl md:text-2xl border-4 border-black min-h-[44px] shadow-[4px_4px_0_#000] ${
              shopTab === tab ? 'bg-pink-500 text-white' : 'bg-white text-black hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-8 pb-12 z-10">
        {shopTab === 'shapes' &&
          (Object.keys(SHAPES) as Array<'arrow' | 'circle'>).map((key) => {
            const shape = SHAPES[key];
            const isUnlocked = playerInfo.unlockedShapes.includes(key);
            const isEquipped = playerInfo.equippedShape === key;
            const canAfford = playerInfo.coins >= shape.price;

            return (
              <div
                key={key}
                className={`flex flex-col bg-white border-4 sm:border-8 p-4 md:p-6 shadow-[8px_8px_0_#000] sm:transform sm:skew-x-[-4deg] transition-all ${
                  isEquipped ? 'border-green-500' : 'border-black'
                }`}
              >
                <h3 className="text-2xl md:text-4xl font-black italic text-center mb-4 text-black uppercase">
                  {shape.name}
                </h3>

                <div className="flex justify-center gap-4 mb-5 bg-gray-200 border-4 border-black p-4 h-28 md:h-36 items-center">
                  {key === 'arrow' && (
                    <div className="w-16 h-16 border-4 border-black bg-pink-500 flex items-center justify-center shadow-[4px_4px_0_#000]">
                      <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[15px] border-b-white" />
                    </div>
                  )}
                  {key === 'circle' && (
                    <div className="w-16 h-16 border-4 border-black bg-cyan-400 rounded-full flex items-center justify-center shadow-[4px_4px_0_#000]">
                      <div className="w-8 h-8 rounded-full border-4 border-white" />
                    </div>
                  )}
                </div>

                <div className="mt-auto">
                  {isEquipped ? (
                    <button
                      disabled
                      className="w-full py-3 border-4 border-black font-black text-xl md:text-2xl tracking-widest bg-green-500 text-black shadow-[4px_4px_0_#000] min-h-[48px]"
                    >
                      EQUIPPED
                    </button>
                  ) : isUnlocked ? (
                    <button
                      onClick={() => handleEquipShape(key)}
                      className="w-full py-3 border-4 border-black font-black text-xl md:text-2xl tracking-widest bg-blue-500 hover:bg-blue-400 text-black shadow-[4px_4px_0_#000] min-h-[48px]"
                    >
                      EQUIP
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePurchaseShape(key)}
                      disabled={!canAfford}
                      className={`w-full py-3 border-4 border-black font-black text-xl md:text-2xl tracking-widest flex items-center justify-center gap-2 shadow-[4px_4px_0_#000] min-h-[48px] ${
                        canAfford ? 'bg-yellow-400 text-black' : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {shape.price === 0 ? 'FREE' : <><Coins className="w-6 h-6" /> {shape.price}</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

        {shopTab === 'notes' &&
          noteProducts.map((p) => {
            const owned = (playerInfo.unlockedNoteProducts || []).includes(p.id);
            const equipped = playerInfo.equippedNoteProduct?.id === p.id;
            return (
              <div
                key={p.id}
                className="bg-gray-950 border-4 p-5 flex flex-col"
                style={{
                  borderColor: NOTE_RARITIES[p.rarity] || '#fff',
                  boxShadow: `0 0 24px ${NOTE_RARITIES[p.rarity] || '#fff'}66`,
                }}
              >
                <div
                  className="note-cutout w-28 h-28 mx-auto flex items-center justify-center text-3xl font-black"
                  style={{ '--note-fill': p.fill, '--note-outline': p.outline } as React.CSSProperties}
                >
                  {p.sticker && (
                    <img
                      src={p.sticker}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ transform: `scale(${p.stickerScaleX || 1},${p.stickerScaleY || 1})` }}
                    />
                  )}
                  <span className="relative">{p.text}</span>
                </div>
                <h3 className="text-2xl font-black mt-3">{p.name}</h3>
                <div className="uppercase font-black" style={{ color: NOTE_RARITIES[p.rarity] }}>
                  {p.rarity}
                </div>
                <p className="text-gray-300 flex-1 text-sm">{p.description}</p>
                <div className="text-xs my-3 flex flex-wrap gap-1">
                  {(p.effects || []).map((x) => (
                    <span key={x.id} className="inline-block bg-purple-800 px-2 py-1">
                      {NOTE_EFFECTS.find((f) => f.id === x.id)?.name} {x.intensity}%
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => buyOrEquipProduct(p)}
                  className={`p-3 font-black text-xl min-h-[48px] ${
                    equipped ? 'bg-green-500 text-black' : owned ? 'bg-cyan-500 text-black' : 'bg-yellow-400 text-black'
                  }`}
                >
                  {equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `BUY ${p.price}`}
                </button>
              </div>
            );
          })}

        {shopTab === 'sounds' &&
          hitSounds.map((p) => {
            const owned = (playerInfo.unlockedHitSounds || []).includes(p.id);
            const equipped = playerInfo.equippedHitSound?.id === p.id;
            return (
              <div key={p.id} className="bg-gray-950 border-4 border-cyan-400 p-5 flex flex-col">
                <div className="text-5xl text-center">♫</div>
                <h3 className="text-2xl font-black">{p.name}</h3>
                <p className="text-cyan-300 uppercase font-black">{p.kind === 'pack' ? '4-LANE PACK' : 'HIT SOUND'}</p>
                <button
                  onClick={() => {
                    const u = p.kind === 'pack' ? p.sounds?.[0] : p.sound;
                    if (u) new Audio(u).play().catch(() => {});
                  }}
                  className="bg-gray-700 p-2 my-3 min-h-[44px] font-black"
                >
                  PREVIEW
                </button>
                <button
                  onClick={() => buyOrEquipSound(p)}
                  className={`p-3 font-black text-xl min-h-[48px] ${
                    equipped ? 'bg-green-500' : owned ? 'bg-cyan-500' : 'bg-yellow-400'
                  } text-black`}
                >
                  {equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `BUY ${p.price}`}
                </button>
              </div>
            );
          })}

        {shopTab === 'mods' &&
          [
            {
              id: 'rhythm_hero',
              name: 'RHYTHM HERO DLC',
              price: 5000,
              desc: 'Four-lane perspective note highway.',
              colors: 'from-yellow-500 to-purple-900',
            },
          ].map((m) => {
            const owned = (playerInfo.unlockedGameMods || []).includes(m.id);
            const isEquipped = (playerInfo.activeGameMods || []).includes(m.id);
            return (
              <div key={m.id} className="bg-black border-4 border-yellow-400 p-5 sm:p-6 flex flex-col">
                <div className={`h-40 sm:h-44 relative overflow-hidden bg-gradient-to-br ${m.colors}`}>
                  <div className="absolute inset-x-[25%] top-2 bottom-0 bg-gray-950 [clip-path:polygon(40%_0,60%_0,100%_100%,0_100%)] border-b-4 border-yellow-300" />
                  {[0, 1, 2, 3].map((i) => (
                    <i
                      key={i}
                      className="absolute bottom-3 w-7 h-3 rounded-full border-2 border-white"
                      style={{ left: `${29 + i * 14}%`, background: ['#22c55e', '#ef4444', '#eab308', '#3b82f6'][i] }}
                    />
                  ))}
                  <b className="absolute left-2 top-2 text-yellow-300">RHYTHM HERO</b>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-yellow-300 mt-4">{m.name}</h3>
                <p className="text-gray-300 flex-1">{m.desc}</p>
                <button
                  disabled={!owned && playerInfo.coins < m.price}
                  onClick={() =>
                    setPlayerInfo((p) => {
                      const unlocked = p.unlockedGameMods || [];
                      const active = p.activeGameMods || [];
                      const next: PlayerInfo = owned
                        ? {
                            ...p,
                            activeGameMods: active.includes(m.id)
                              ? active.filter((id) => id !== m.id)
                              : [...active.filter((id) => !['rhythm_hero', 'dance_rhythm_pitch'].includes(id)), m.id],
                          }
                        : {
                            ...p,
                            coins: p.coins - m.price,
                            unlockedGameMods: [...unlocked, m.id],
                            activeGameMods: [...active.filter((id) => !['rhythm_hero', 'dance_rhythm_pitch'].includes(id)), m.id],
                          };
                      localStorage.setItem('rhythmCanvasSave', JSON.stringify(next));
                      return next;
                    })
                  }
                  className={`p-4 font-black text-xl mt-4 min-h-[48px] ${
                    owned
                      ? isEquipped
                        ? 'bg-green-500 text-black'
                        : 'bg-cyan-400 text-black'
                      : playerInfo.coins >= m.price
                      ? 'bg-yellow-400 text-black'
                      : 'bg-gray-700'
                  }`}
                >
                  {owned ? (isEquipped ? 'EQUIPPED • UNEQUIP' : 'EQUIP DLC') : `BUY ${m.price}`}
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
};
