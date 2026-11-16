import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Coins, ShoppingCart } from 'lucide-react';
import { db } from '../firebaseClient';
import { AudioEngine } from '../game/audio';
import {
  ADMIN_EMAILS,
  KEY_MAP,
  NOTE_EFFECTS,
  NOTE_RARITIES,
  ROYALTY_FREE_SONGS,
  SHAPES,
} from '../game/constants';
import { drawNote } from '../game/renderer';
import { safeGetStorage, safeSetStorage } from '../game/storage';
import { useIsCompactLandscape } from '../game/useViewport';
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
      g.addColorStop(0, '#161136');
      g.addColorStop(1, '#080a12');
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
      ctx.fillText('NEON DRIFT · NOTE TEST', 14, 28);
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

  const isCompact = useIsCompactLandscape();

  return (
    <div className="fixed inset-0 z-[999] bg-black/85 flex items-center justify-center p-3">
      <div className="rc-panel max-w-3xl w-full flex flex-row p-3 sm:p-4 gap-4 max-h-[94dvh] overflow-y-auto text-white">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <canvas
            ref={canvasRef}
            width="360"
            height="520"
            onPointerDown={(e) => {
              e.preventDefault();
              hit();
            }}
            className={`touch-surface rounded-xl border-2 border-cyan-400 ${
              isCompact ? 'max-h-[58dvh]' : 'max-h-[65dvh]'
            } w-auto`}
          />
          <TouchLanePads colors={['#ec4899', '#22d3ee', '#4ade80', '#ef4444']} onLaneDown={() => hit()} compact />
        </div>
        <div className="flex-1 flex flex-col gap-2.5 min-w-0">
          <h2 className="text-xl sm:text-2xl font-black italic text-cyan-300 uppercase">Note Effect Test</h2>
          <p className="text-xs sm:text-sm text-slate-300 font-bold">
            Tap the touch pads, canvas, or press arrow/WASD keys to test hits.
          </p>
          <audio ref={audioRef} src={ROYALTY_FREE_SONGS[0].audioUrl || undefined} loop playsInline />
          <button
            type="button"
            onClick={startTest}
            className="w-full rc-bevel-btn rc-tile-green text-black font-black py-2.5 text-sm uppercase min-h-[42px]"
          >
            START TEST
          </button>
          <button
            type="button"
            onClick={hit}
            className="w-full rc-bevel-btn rc-tile-pink text-white font-black py-2.5 text-sm uppercase min-h-[42px]"
          >
            SIMULATE HIT + EFFECTS
          </button>
          <div className="space-y-1.5 overflow-y-auto">
            {(product.effects || []).map((e) => (
              <div className="rc-dock-well px-2.5 py-1.5 text-xs font-bold text-violet-200" key={e.id}>
                {NOTE_EFFECTS.find((x) => x.id === e.id)?.name} · {e.intensity}%
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause();
              onClose();
            }}
            className="w-full rc-bevel-btn rc-tile-slate text-white font-black py-2.5 text-sm uppercase mt-auto min-h-[42px]"
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
  const isCompact = useIsCompactLandscape();
  const [shopTab, setShopTab] = useState<'shapes' | 'notes' | 'sounds' | 'mods'>('notes');
  const [noteProducts, setNoteProducts] = useState<NoteProduct[]>(() => {
    try {
      return JSON.parse(safeGetStorage('rhythmCanvasNoteProducts') || '[]');
    } catch {
      return [];
    }
  });
  const [hitSounds, setHitSounds] = useState<HitSoundProduct[]>(() => {
    try {
      const x = JSON.parse(safeGetStorage('rhythmCanvasHitSounds') || '[]');
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
      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
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
      safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
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
        safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
        return newData;
      });
    }
  };

  const handleEquipShape = (shapeKey: 'arrow' | 'circle') => {
    setPlayerInfo((prev) => {
      const newData = { ...prev, equippedShape: shapeKey };
      safeSetStorage('rhythmCanvasSave', JSON.stringify(newData));
      return newData;
    });
  };

  return (
    <div className="rc-stage w-full h-full flex flex-col overflow-hidden safe-top safe-bottom p-3 sm:p-4">
      <div className="absolute inset-0 rc-stage-dots pointer-events-none" />

      {/* Centered Top Store Dock */}
      <header className="relative z-10 w-full flex items-center justify-center pr-12 shrink-0 mb-3">
        <div className="rc-dock-rail flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="rc-bevel-btn rc-tile-slate text-white flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-lg min-h-[36px] whitespace-nowrap"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>

          <div className="rc-dock-well px-3.5 py-1.5 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-yellow-400 shrink-0" />
            <h2 className="text-sm sm:text-lg font-black italic text-yellow-300 uppercase tracking-wider whitespace-nowrap">
              STORE
            </h2>
          </div>

          <div className="rc-dock-well px-3 py-1.5 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="font-black text-sm sm:text-base text-white tabular-nums">{playerInfo.coins}</span>
          </div>

          {ADMIN_EMAILS.includes(user?.email || '') && (
            <button
              type="button"
              onClick={() => setScreen('admin_studio')}
              className="rc-bevel-btn rc-tile-red text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase min-h-[36px] whitespace-nowrap"
            >
              ADMIN STUDIO
            </button>
          )}
        </div>
      </header>

      {/* Category Tabs Dock */}
      <div className="relative z-10 flex justify-center mb-3 shrink-0">
        <div className="rc-dock-rail flex flex-wrap items-center justify-center gap-1.5 p-1.5">
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
              type="button"
              onClick={() => setShopTab(tab)}
              className={`rc-bevel-btn px-4 py-1.5 rounded-lg text-xs sm:text-sm font-black uppercase tracking-wide whitespace-nowrap min-h-[36px] ${
                shopTab === tab ? 'rc-tile-pink text-white' : 'rc-sub-dark text-slate-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1 pb-4">
        <div
          className={`max-w-6xl mx-auto grid ${
            isCompact ? 'grid-cols-2 lg:grid-cols-3 gap-3' : 'grid-cols-2 lg:grid-cols-3 gap-4'
          }`}
        >
          {shopTab === 'shapes' &&
            (Object.keys(SHAPES) as Array<'arrow' | 'circle'>).map((key) => {
              const shape = SHAPES[key];
              const isUnlocked = playerInfo.unlockedShapes.includes(key);
              const isEquipped = playerInfo.equippedShape === key;
              const canAfford = playerInfo.coins >= shape.price;

              return (
                <div
                  key={key}
                  className={`rc-panel p-4 flex flex-col gap-3 ${isEquipped ? 'border-emerald-400' : ''}`}
                >
                  <h3 className="text-lg sm:text-xl font-black italic text-center text-white uppercase">
                    {shape.name}
                  </h3>

                  <div className="rc-console-inset flex justify-center gap-4 items-center p-3 h-24">
                    {key === 'arrow' && (
                      <div className="w-12 h-12 rounded-lg border-2 border-black bg-pink-500 flex items-center justify-center shadow-md">
                        <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[15px] border-b-white" />
                      </div>
                    )}
                    {key === 'circle' && (
                      <div className="w-12 h-12 border-2 border-black bg-cyan-400 rounded-full flex items-center justify-center shadow-md">
                        <div className="w-7 h-7 rounded-full border-4 border-white" />
                      </div>
                    )}
                  </div>

                  <div className="mt-auto">
                    {isEquipped ? (
                      <button
                        type="button"
                        disabled
                        className="rc-bevel-btn rc-tile-green w-full py-2.5 font-black text-sm uppercase tracking-wider text-black min-h-[42px]"
                      >
                        EQUIPPED
                      </button>
                    ) : isUnlocked ? (
                      <button
                        type="button"
                        onClick={() => handleEquipShape(key)}
                        className="rc-bevel-btn rc-tile-cyan w-full py-2.5 font-black text-sm uppercase tracking-wider text-black min-h-[42px]"
                      >
                        EQUIP
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePurchaseShape(key)}
                        disabled={!canAfford}
                        className={`rc-bevel-btn w-full py-2.5 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 min-h-[42px] ${
                          canAfford ? 'rc-tile-gold text-black' : 'rc-sub-dark text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {shape.price === 0 ? (
                          'FREE'
                        ) : (
                          <>
                            <Coins className="w-4 h-4" />
                            <span>{shape.price}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

          {shopTab === 'notes' && noteProducts.length === 0 && (
            <div className="col-span-full rc-panel p-6 text-center text-sm font-bold text-slate-300">
              No custom note packs available right now. Check the SHAPES or MODS tabs!
            </div>
          )}

          {shopTab === 'notes' &&
            noteProducts.map((p) => {
              const owned = (playerInfo.unlockedNoteProducts || []).includes(p.id);
              const equipped = playerInfo.equippedNoteProduct?.id === p.id;
              return (
                <div
                  key={p.id}
                  className="rc-panel p-4 flex flex-col gap-2.5"
                  style={{ borderColor: NOTE_RARITIES[p.rarity] || '#080a0f' }}
                >
                  <div
                    className="note-cutout w-20 h-20 mx-auto flex items-center justify-center text-2xl font-black"
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
                  <h3 className="text-lg font-black text-white">{p.name}</h3>
                  <div className="uppercase font-black text-xs" style={{ color: NOTE_RARITIES[p.rarity] }}>
                    {p.rarity}
                  </div>
                  <p className="text-slate-300 flex-1 text-xs leading-relaxed">{p.description}</p>
                  <div className="text-[11px] flex flex-wrap gap-1.5 text-violet-300 font-bold">
                    {(p.effects || []).map((x) => (
                      <span key={x.id}>
                        {NOTE_EFFECTS.find((f) => f.id === x.id)?.name} {x.intensity}%
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => buyOrEquipProduct(p)}
                    className={`rc-bevel-btn py-2.5 font-black text-sm uppercase min-h-[42px] text-black ${
                      equipped ? 'rc-tile-green' : owned ? 'rc-tile-cyan' : 'rc-tile-gold'
                    }`}
                  >
                    {equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `BUY ${p.price}`}
                  </button>
                </div>
              );
            })}

          {shopTab === 'sounds' && hitSounds.length === 0 && (
            <div className="col-span-full rc-panel p-6 text-center text-sm font-bold text-slate-300">
              No custom hit sound packs available right now.
            </div>
          )}

          {shopTab === 'sounds' &&
            hitSounds.map((p) => {
              const owned = (playerInfo.unlockedHitSounds || []).includes(p.id);
              const equipped = playerInfo.equippedHitSound?.id === p.id;
              return (
                <div key={p.id} className="rc-panel p-4 flex flex-col gap-2.5">
                  <div className="text-4xl text-center text-cyan-300">♫</div>
                  <h3 className="text-lg font-black text-white">{p.name}</h3>
                  <p className="text-cyan-300 uppercase font-black text-xs">
                    {p.kind === 'pack' ? '4-LANE PACK' : 'HIT SOUND'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const u = p.kind === 'pack' ? p.sounds?.[0] : p.sound;
                      if (u) new Audio(u).play().catch(() => {});
                    }}
                    className="rc-bevel-btn rc-sub-dark text-white py-2 min-h-[38px] font-black text-xs uppercase"
                  >
                    PREVIEW
                  </button>
                  <button
                    type="button"
                    onClick={() => buyOrEquipSound(p)}
                    className={`rc-bevel-btn py-2.5 font-black text-sm uppercase min-h-[42px] text-black ${
                      equipped ? 'rc-tile-green' : owned ? 'rc-tile-cyan' : 'rc-tile-gold'
                    }`}
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
                <div key={m.id} className="rc-panel p-4 flex flex-col gap-3">
                  <div className={`h-32 relative overflow-hidden rounded-xl border border-black bg-gradient-to-br ${m.colors}`}>
                    <div className="absolute inset-x-[25%] top-2 bottom-0 bg-gray-950 [clip-path:polygon(40%_0,60%_0,100%_100%,0_100%)] border-b-4 border-yellow-300" />
                    {[0, 1, 2, 3].map((i) => (
                      <i
                        key={i}
                        className="absolute bottom-3 w-7 h-3 rounded-full border-2 border-white"
                        style={{ left: `${29 + i * 14}%`, background: ['#22c55e', '#ef4444', '#eab308', '#3b82f6'][i] }}
                      />
                    ))}
                    <b className="absolute left-2 top-2 text-xs text-yellow-300">RHYTHM HERO</b>
                  </div>
                  <h3 className="text-xl font-black text-yellow-300">{m.name}</h3>
                  <p className="text-slate-300 text-xs flex-1">{m.desc}</p>
                  <button
                    type="button"
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
                        safeSetStorage('rhythmCanvasSave', JSON.stringify(next));
                        return next;
                      })
                    }
                    className={`rc-bevel-btn py-2.5 font-black text-sm uppercase min-h-[42px] ${
                      owned
                        ? isEquipped
                          ? 'rc-tile-green text-black'
                          : 'rc-tile-cyan text-black'
                        : playerInfo.coins >= m.price
                        ? 'rc-tile-gold text-black'
                        : 'rc-sub-dark text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {owned ? (isEquipped ? 'EQUIPPED · UNEQUIP' : 'EQUIP DLC') : `BUY ${m.price}`}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
