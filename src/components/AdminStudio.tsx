import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Crown,
  Lock,
  Plus,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';
import { db } from '../firebaseClient';
import {
  ACTIVE_RIVAL_PROFILES,
  ADMIN_EMAILS,
  CUSTOM_ADMINS_STORAGE_KEY,
  DEFAULT_OWNER_EMAIL,
  NOTE_EFFECTS,
  NOTE_RARITIES,
  RHYTHM_LIST_STORAGE_KEY,
  ROYALTY_FREE_SONGS,
  SECRET_DEV_CODE,
  SHOP_SHUTDOWN_STORAGE_KEY,
  TRACK_RATINGS_STORAGE_KEY,
  isUserAdmin,
} from '../game/constants';
import { AudioEngine } from '../game/audio';
import {
  autoIndexFeaturedTracks,
  formatTrackRatingBadge,
  getCommunityVoteStats,
  getDisplayTrackRating,
  getEffectiveTrackRating,
  getHighestTrackRating,
  isTrackLabeledNewTop1,
} from '../game/rhythmLogic';
import type {
  FirebaseUser,
  HitSoundProduct,
  InterruptionData,
  NoteEffectConfig,
  NoteProduct,
  ScreenId,
  ShopShutdownConfig,
  Song,
  TrackRatingsMap,
} from '../game/types';

interface AdminStudioProps {
  user: FirebaseUser | null;
  setScreen?: (s: ScreenId) => void;
  songs?: Song[];
  isAdminUser?: boolean;
  noteProducts?: NoteProduct[];
  setNoteProducts?: React.Dispatch<React.SetStateAction<NoteProduct[]>>;
  hitSoundProducts?: HitSoundProduct[];
  setHitSoundProducts?: React.Dispatch<React.SetStateAction<HitSoundProduct[]>>;
  rhythmList?: (string | number)[];
  setRhythmList?: React.Dispatch<React.SetStateAction<(string | number)[]>>;
  customSongs?: Song[];
  onlineSongs?: Song[];
  interruption?: InterruptionData | null;
  trackRatings?: TrackRatingsMap;
  setTrackRatings?: React.Dispatch<React.SetStateAction<TrackRatingsMap>>;
  shopShutdown?: ShopShutdownConfig;
  setShopShutdown?: React.Dispatch<React.SetStateAction<ShopShutdownConfig>>;
  onBack?: () => void;
}

export const AdminStudio: React.FC<AdminStudioProps> = ({
  user,
  setScreen,
  songs = [],
  isAdminUser: externalIsAdmin,
  noteProducts: externalNoteProducts,
  setNoteProducts: setExternalNoteProducts,
  hitSoundProducts: externalHitSounds,
  setHitSoundProducts: setExternalHitSounds,
  rhythmList: externalRhythmList,
  setRhythmList: setExternalRhythmList,
  customSongs = [],
  onlineSongs = [],
  interruption: externalInterruption,
  trackRatings: externalRatings,
  setTrackRatings: setExternalRatings,
  shopShutdown: externalShopShutdown,
  setShopShutdown: setExternalShopShutdown,
  onBack,
}) => {
  const [customAdmins, setCustomAdmins] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_ADMINS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const isAdminUser =
    externalIsAdmin ??
    isUserAdmin(user?.email || DEFAULT_OWNER_EMAIL, customAdmins);
  const handleBack = () => {
    if (onBack) onBack();
    else if (setScreen) setScreen('menu');
  };

  const [unlocked, setUnlocked] = useState<boolean>(true);
  const [passInput, setPassInput] = useState('');
  const [passErr, setPassErr] = useState('');
  const [tab, setTab] = useState<
    'list' | 'accounts' | 'shop_control' | 'note' | 'sound' | 'interrupt'
  >('list');
  const [statusBanner, setStatusBanner] = useState('');

  const saveCustomAdmins = (nextList: string[]) => {
    setCustomAdmins(nextList);
    try {
      localStorage.setItem(CUSTOM_ADMINS_STORAGE_KEY, JSON.stringify(nextList));
    } catch {}
    if (db) {
      db.collection('system')
        .doc('admins')
        .set({ customAdmins: nextList, updatedAt: Date.now() }, { merge: true })
        .catch(() => {});
    }
  };

  const handleAddAdminEmail = (emailToAdd: string) => {
    const clean = emailToAdd.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setStatusBanner('Enter a valid email address to grant Admin privileges.');
      return;
    }
    if (isUserAdmin(clean, customAdmins)) {
      setStatusBanner(`${clean} already has Admin access.`);
      return;
    }
    const next = [...customAdmins, clean];
    saveCustomAdmins(next);
    setNewAdminEmail('');
    AudioEngine.playUI('confirm');
    setStatusBanner(`Granted Admin Studio & Track Rating privileges to ${clean}!`);
  };

  const handleRemoveAdminEmail = (emailToRemove: string) => {
    const clean = emailToRemove.trim().toLowerCase();
    const next = customAdmins.filter((e) => e.trim().toLowerCase() !== clean);
    saveCustomAdmins(next);
    AudioEngine.playUI('back');
    setStatusBanner(`Revoked dynamic Admin privileges for ${clean}.`);
  };

  const [localNoteProducts, setLocalNoteProducts] = useState<NoteProduct[]>([]);
  const [localHitSounds, setLocalHitSounds] = useState<HitSoundProduct[]>([]);
  const [localRhythmList, setLocalRhythmList] = useState<(string | number)[]>(() => {
    try {
      const saved = localStorage.getItem(RHYTHM_LIST_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ROYALTY_FREE_SONGS.slice(0, 30).map((s) => s.id);
  });
  const [localInterruption, setLocalInterruption] = useState<InterruptionData | null>(null);

  const noteProducts = externalNoteProducts ?? localNoteProducts;
  const setNoteProducts = setExternalNoteProducts ?? setLocalNoteProducts;
  const hitSoundProducts = externalHitSounds ?? localHitSounds;
  const setHitSoundProducts = setExternalHitSounds ?? setLocalHitSounds;
  const rhythmList = externalRhythmList && externalRhythmList.length > 0 ? externalRhythmList : localRhythmList;
  const setRhythmList = (next: (string | number)[]) => {
    setLocalRhythmList(next);
    if (setExternalRhythmList) setExternalRhythmList(next);
  };
  const interruption = externalInterruption ?? localInterruption;

  // Local fallback state if parent doesn't pass trackRatings or shopShutdown
  const [localRatings, setLocalRatings] = useState<TrackRatingsMap>(() => {
    try {
      const saved = localStorage.getItem(TRACK_RATINGS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [localShopShutdown, setLocalShopShutdown] = useState<ShopShutdownConfig>(() => {
    try {
      const saved = localStorage.getItem(SHOP_SHUTDOWN_STORAGE_KEY);
      return saved
        ? JSON.parse(saved)
        : { closed: false, message: 'Shop is temporarily undergoing scheduled maintenance.' };
    } catch {
      return { closed: false, message: 'Shop is temporarily undergoing scheduled maintenance.' };
    }
  });

  const trackRatings = externalRatings ?? localRatings;
  const updateTrackRatings = (updater: (prev: TrackRatingsMap) => TrackRatingsMap) => {
    const next = updater(trackRatings);
    setLocalRatings(next);
    if (setExternalRatings) setExternalRatings(next);
    try {
      localStorage.setItem(TRACK_RATINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    if (db) {
      db.collection('system')
        .doc('trackRatings')
        .set({ ratings: next, updatedAt: Date.now() }, { merge: true })
        .catch(() => {});
    }
  };

  const shopShutdown = externalShopShutdown ?? localShopShutdown;
  const [shopReasonDraft, setShopReasonDraft] = useState(
    shopShutdown.message || 'Shop is temporarily closed by Admin for item balancing.'
  );

  useEffect(() => {
    if (shopShutdown.message) {
      setShopReasonDraft(shopShutdown.message);
    }
  }, [shopShutdown.message]);

  useEffect(() => {
    if (!db) return;
    const unsubRatings = db
      .collection('system')
      .doc('trackRatings')
      .onSnapshot(
        (snap: any) => {
          if (snap.exists) {
            const data = snap.data();
            if (data?.ratings && typeof data.ratings === 'object') {
              setLocalRatings(data.ratings);
              if (setExternalRatings) setExternalRatings(data.ratings);
              try {
                localStorage.setItem(TRACK_RATINGS_STORAGE_KEY, JSON.stringify(data.ratings));
              } catch {}
            }
          }
        },
        () => {}
      );
    const unsubShop = db
      .collection('system')
      .doc('shopStatus')
      .onSnapshot(
        (snap: any) => {
          if (snap.exists) {
            const data = snap.data() as ShopShutdownConfig;
            setLocalShopShutdown(data);
            if (setExternalShopShutdown) setExternalShopShutdown(data);
            try {
              localStorage.setItem(SHOP_SHUTDOWN_STORAGE_KEY, JSON.stringify(data));
            } catch {}
          }
        },
        () => {}
      );
    const unsubList = db
      .collection('system')
      .doc('rhythmList')
      .onSnapshot(
        (snap: any) => {
          if (snap.exists) {
            const data = snap.data();
            const list = data?.tracks || data?.top10;
            if (Array.isArray(list) && list.length > 0) {
              setLocalRhythmList(list);
              if (setExternalRhythmList) setExternalRhythmList(list);
            }
          }
        },
        () => {}
      );
    const unsubInterrupt = db
      .collection('system')
      .doc('interruption')
      .onSnapshot(
        (snap: any) => {
          if (snap.exists) setLocalInterruption(snap.data());
        },
        () => {}
      );
    return () => {
      unsubRatings?.();
      unsubShop?.();
      unsubList?.();
      unsubInterrupt?.();
    };
  }, [setExternalRatings, setExternalShopShutdown, setExternalRhythmList]);

  const updateShopShutdown = async (closed: boolean, message: string) => {
    const payload: ShopShutdownConfig = {
      closed,
      message: message.trim() || 'The Shop is temporarily shut down by an administrator.',
      updatedAt: Date.now(),
      updatedBy: user?.email || 'admin',
    };
    setLocalShopShutdown(payload);
    if (setExternalShopShutdown) setExternalShopShutdown(payload);
    try {
      localStorage.setItem(SHOP_SHUTDOWN_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
    if (db) {
      try {
        await db.collection('system').doc('shopStatus').set(payload);
      } catch {}
    }
    AudioEngine.playUI('confirm');
    setStatusBanner(
      closed
        ? `SHOP SHUT DOWN: "${payload.message}"`
        : 'SHOP REOPENED! Players can now browse and purchase items.'
    );
  };

  // Draft input values for per-song numerical ratings
  const [ratingInputs, setRatingInputs] = useState<Record<string, string>>({});

  // Note Product Builder state
  const [noteName, setNoteName] = useState('');
  const [noteDesc, setNoteDesc] = useState('');
  const [noteFill, setNoteFill] = useState('#ff0055');
  const [noteOutline, setNoteOutline] = useState('#ffffff');
  const [noteText, setNoteText] = useState('');
  const [noteSticker, setNoteSticker] = useState('');
  const [noteScaleX, setNoteScaleX] = useState(1);
  const [noteScaleY, setNoteScaleY] = useState(1);
  const [noteRarity, setNoteRarity] = useState('rare');
  const [notePrice, setNotePrice] = useState(500);
  const [selectedEffects, setSelectedEffects] = useState<NoteEffectConfig[]>([]);
  const [publishingNote, setPublishingNote] = useState(false);

  // Hit Sound Builder state
  const [soundName, setSoundName] = useState('');
  const [soundPrice, setSoundPrice] = useState(400);
  const [soundKind, setSoundKind] = useState<'single' | 'pack'>('single');
  const [singleSoundData, setSingleSoundData] = useState<string | null>(null);
  const [packSoundsData, setPackSoundsData] = useState<(string | null)[]>([null, null, null, null]);
  const [publishingSound, setPublishingSound] = useState(false);

  // Interruption state
  const [interruptMsg, setInterruptMsg] = useState('');
  const [sendingInterrupt, setSendingInterrupt] = useState(false);

  const allAvailableTracks = useMemo(() => {
    const map = new Map<string, Song>();
    [...ROYALTY_FREE_SONGS, ...songs, ...customSongs, ...onlineSongs].forEach((s) => {
      if (s && s.id !== undefined) map.set(String(s.id), s);
    });
    return Array.from(map.values());
  }, [songs, customSongs, onlineSongs]);

  const highestRating = useMemo(
    () => getHighestTrackRating(allAvailableTracks, trackRatings),
    [allAvailableTracks, trackRatings]
  );

  const handleSetAdminRating = (song: Song, rawValue?: string) => {
    const strVal = rawValue ?? ratingInputs[String(song.id)] ?? String(getEffectiveTrackRating(song, trackRatings));
    const parsed = parseFloat(strVal);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStatusBanner('Enter a valid positive difficulty number (e.g. 14.5 or 32.0).');
      return;
    }
    const currentTopExcludingThis = getHighestTrackRating(allAvailableTracks, trackRatings, song.id);
    const labeledTop1 = isTrackLabeledNewTop1(song, trackRatings);

    // If admin sets a rating above current Top 1, automatically label as New Top 1 or honor New Top 1!
    const willBeTop1 = labeledTop1 || parsed > currentTopExcludingThis;

    updateTrackRatings((prev) => {
      const key = String(song.id);
      const existing = prev[key] || { songId: song.id };
      return {
        ...prev,
        [key]: {
          ...existing,
          songId: song.id,
          adminRating: Number(parsed.toFixed(2)),
          isNewTop1: willBeTop1,
          updatedAt: Date.now(),
          updatedBy: user?.email || 'admin',
        },
      };
    });
    AudioEngine.playUI('confirm');
    setStatusBanner(
      `Set "${song.title}" Difficulty Rating to ★ ${parsed.toFixed(2)}${
        willBeTop1 ? ' (LABELED NEW TOP 1!)' : ''
      }`
    );
  };

  const handleToggleNewTop1 = (song: Song) => {
    const currentlyTop1 = isTrackLabeledNewTop1(song, trackRatings);
    const nextTop1 = !currentlyTop1;
    updateTrackRatings((prev) => {
      const key = String(song.id);
      const existing = prev[key] || { songId: song.id };
      return {
        ...prev,
        [key]: {
          ...existing,
          songId: song.id,
          isNewTop1: nextTop1,
          updatedAt: Date.now(),
          updatedBy: user?.email || 'admin',
        },
      };
    });
    AudioEngine.playUI('confirm');
    setStatusBanner(
      nextTop1
        ? `"${song.title}" is now labeled NEW TOP 1! Players and admins can vote/rate above ★ ${highestRating}.`
        : `Removed NEW TOP 1 label from "${song.title}".`
    );
  };

  const handleAutoIndex30Featured = async () => {
    const sorted30 = autoIndexFeaturedTracks(allAvailableTracks, trackRatings, 30);
    setRhythmList(sorted30);
    try {
      localStorage.setItem(RHYTHM_LIST_STORAGE_KEY, JSON.stringify(sorted30));
    } catch {}
    if (db) {
      try {
        await db.collection('system').doc('rhythmList').set(
          {
            tracks: sorted30,
            top10: sorted30,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } catch {}
    }
    AudioEngine.playUI('confirm');
    const firstSong = allAvailableTracks.find((s) => String(s.id) === String(sorted30[0]));
    const lastSong = allAvailableTracks.find(
      (s) => String(s.id) === String(sorted30[sorted30.length - 1])
    );
    const minR = firstSong ? getEffectiveTrackRating(firstSong, trackRatings) : 0;
    const maxR = lastSong ? getEffectiveTrackRating(lastSong, trackRatings) : 0;
    setStatusBanner(
      `AUTO-INDEXED ${sorted30.length} FEATURED TRACKS (Least → Greatest: ★ ${minR} to ★ ${maxR})!`
    );
  };

  const toggleEffect = (effId: string) => {
    setSelectedEffects((prev) => {
      const exists = prev.find((e) => e.id === effId);
      if (exists) return prev.filter((e) => e.id !== effId);
      return [...prev, { id: effId, intensity: 1 }];
    });
  };

  const updateEffectIntensity = (effId: string, intensity: number) => {
    setSelectedEffects((prev) => prev.map((e) => (e.id === effId ? { ...e, intensity } : e)));
  };

  const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setNoteSticker(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSingleSoundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setSingleSoundData(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePackSoundUpload = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPackSoundsData((prev) => {
          const next = [...prev];
          next[idx] = reader.result as string;
          return next;
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const publishNoteProduct = async () => {
    if (!noteName.trim()) return;
    setPublishingNote(true);
    const prod: NoteProduct = {
      id: `np_${Date.now()}`,
      name: noteName.trim(),
      description: noteDesc.trim() || 'Custom Admin Note Skin',
      fill: noteFill,
      outline: noteOutline,
      text: noteText.trim(),
      sticker: noteSticker,
      stickerScaleX: noteScaleX,
      stickerScaleY: noteScaleY,
      rarity: noteRarity,
      price: Math.max(0, Number(notePrice) || 0),
      effects: selectedEffects,
      createdAt: Date.now(),
      createdBy: user?.email || 'admin',
      active: true,
    };

    try {
      setNoteProducts((prev) => [prod, ...prev]);
      if (db) {
        await db.collection('noteProducts').doc(prod.id).set(prod);
      }
      setNoteName('');
      setNoteDesc('');
      setNoteText('');
      setNoteSticker('');
      setSelectedEffects([]);
    } catch (e) {
      console.error('Failed to publish note product:', e);
    } finally {
      setPublishingNote(false);
    }
  };

  const deleteNoteProduct = async (id: string) => {
    setNoteProducts((prev) => prev.filter((p) => p.id !== id));
    if (db) {
      try {
        await db.collection('noteProducts').doc(id).set({ active: false }, { merge: true });
      } catch {}
    }
  };

  const publishHitSound = async () => {
    if (!soundName.trim()) return;
    setPublishingSound(true);
    const item: HitSoundProduct = {
      id: `hs_${Date.now()}`,
      name: soundName.trim(),
      price: Math.max(0, Number(soundPrice) || 0),
      kind: soundKind,
      sound: soundKind === 'single' ? singleSoundData : null,
      sounds: soundKind === 'pack' ? packSoundsData : null,
      active: true,
      createdBy: user?.email || 'admin',
      createdAt: Date.now(),
    };
    try {
      setHitSoundProducts((prev) => [item, ...prev]);
      if (db) {
        await db.collection('hitSoundProducts').doc(item.id).set(item);
      }
      setSoundName('');
      setSingleSoundData(null);
      setPackSoundsData([null, null, null, null]);
    } catch (e) {
      console.error('Failed to publish hit sound:', e);
    } finally {
      setPublishingSound(false);
    }
  };

  const saveRhythmList = async (nextList: (string | number)[]) => {
    setRhythmList(nextList);
    try {
      localStorage.setItem(RHYTHM_LIST_STORAGE_KEY, JSON.stringify(nextList));
    } catch {}
    if (db) {
      try {
        await db.collection('system').doc('rhythmList').set(
          {
            tracks: nextList,
            top10: nextList,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } catch (e) {
        console.error('Failed to update rhythm list:', e);
      }
    }
  };

  const moveTrackInList = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rhythmList.length) return;
    const next = [...rhythmList];
    const temp = next[idx];
    next[idx] = next[target];
    next[target] = temp;
    saveRhythmList(next);
  };

  const toggleTrackInList = (songId: string | number) => {
    const exists = rhythmList.some((id) => String(id) === String(songId));
    if (exists) {
      saveRhythmList(rhythmList.filter((id) => String(id) !== String(songId)));
    } else {
      saveRhythmList([...rhythmList, songId]);
    }
  };

  const triggerInterruption = async (active: boolean) => {
    if (!db) return;
    setSendingInterrupt(true);
    try {
      await db.collection('system').doc('interruption').set({
        active,
        message: interruptMsg.trim() || 'Emergency Admin Broadcast!',
        issuedBy: user?.email || 'admin',
        issuedAt: Date.now(),
      });
    } catch (e) {
      console.error('Failed to broadcast interruption:', e);
    } finally {
      setSendingInterrupt(false);
    }
  };

  if (!unlocked && !isAdminUser) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 z-10">
        <div className="w-full max-w-md rc-panel p-6 rounded-3xl border border-rose-500/40 bg-black/80 text-center">
          <Lock className="w-12 h-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-2xl font-black italic tracking-tighter mb-2">ADMIN STUDIO LOCKED</h2>
          <p className="text-xs text-white/60 mb-4">
            Enter the secret developer code to unlock Admin Studio controls.
          </p>
          <input
            type="password"
            value={passInput}
            onChange={(e) => {
              setPassInput(e.target.value);
              setPassErr('');
            }}
            placeholder="Secret Dev Code..."
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm font-bold mb-3 focus:outline-none focus:border-rose-400"
          />
          {passErr && <div className="text-xs text-rose-400 font-bold mb-3">{passErr}</div>}
          <div className="flex gap-2">
            <button
              onClick={handleBack}
              className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 font-bold text-sm"
            >
              BACK
            </button>
            <button
              onClick={() => {
                if (passInput === SECRET_DEV_CODE) {
                  setUnlocked(true);
                } else {
                  setPassErr('Invalid code.');
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-black text-sm"
            >
              UNLOCK
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full max-w-6xl mx-auto flex flex-col p-3 lg:p-5 z-10 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-black/65 px-4 py-2.5 rounded-2xl border-2 border-rose-500/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-rose-400" />
          <div>
            <h2 className="text-xl lg:text-2xl font-black italic tracking-tighter text-rose-300 leading-none">
              ADMIN STUDIO
            </h2>
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-0.5">
              Difficulty Ratings · 30-Track Auto-Index · Top 1 Control · Shop Shutdown
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['list', 'RATINGS & AUTO-INDEX'],
              ['accounts', 'ACCOUNTS & ADMINS'],
              ['shop_control', shopShutdown.closed ? 'SHOP: SHUT DOWN' : 'SHOP CONTROL'],
              ['note', 'NOTE BUILDER'],
              ['sound', 'HIT SOUNDS'],
              ['interrupt', 'BROADCAST'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              data-testid={`admin-tab-${id}`}
              onClick={() => {
                AudioEngine.playUI('move');
                setTab(id);
              }}
              className={`px-3 py-1.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all border ${
                tab === id
                  ? 'bg-rose-500 text-white border-white shadow-[0_0_15px_rgba(244,63,94,0.45)]'
                  : id === 'shop_control' && shopShutdown.closed
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                    : 'bg-white/5 text-white/65 border-white/15 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            data-testid="admin-exit-btn"
            onClick={handleBack}
            className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl font-black text-xs border border-white/20"
          >
            EXIT
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="mb-3 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-black flex items-center justify-between shrink-0">
          <span>{statusBanner}</span>
          <button
            onClick={() => setStatusBanner('')}
            className="text-[10px] underline uppercase ml-4 text-emerald-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {tab === 'list' && (
          <div className="flex flex-col gap-4">
            {/* Top Auto-Index & Rating Summary Bar */}
            <div className="bg-black/65 border-2 border-cyan-400/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <span className="text-sm font-black uppercase tracking-wider text-white">
                    FEATURED DIFFICULTY RATING & 30-TRACK AUTO-INDEXER
                  </span>
                </div>
                <p className="text-xs text-white/65 mt-1">
                  Current Top 1 Difficulty Rating:{' '}
                  <span className="text-amber-300 font-black">★ {highestRating.toFixed(1)}</span> ·
                  Indexed Tracks:{' '}
                  <span className="text-cyan-300 font-black">{rhythmList.length} / 30</span>
                </p>
                <p className="text-[11px] text-white/50 mt-0.5">
                  Non-admins can vote up to ★ {highestRating.toFixed(1)}, UNLESS you label a track as{' '}
                  <span className="text-amber-300 font-bold">NEW TOP 1</span> — then both players and
                  admins can vote/set above the current Top 1!
                </p>
              </div>
              <button
                data-testid="admin-auto-index-btn"
                onClick={handleAutoIndex30Featured}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500 text-white font-black text-xs uppercase tracking-wider border-2 border-white/80 shadow-[0_0_24px_rgba(54,226,255,0.45)] flex items-center gap-2 cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4" />
                AUTO-INDEX 30 FEATURED TRACKS (LEAST → GREATEST)
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left 5 cols: Active Indexed Rhythm List (Least to Greatest) */}
              <div className="lg:col-span-5 bg-black/55 border border-white/15 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-cyan-300">
                    INDEXED FEATURED LIST ({rhythmList.length} TRACKS · LEAST → GREATEST)
                  </h3>
                </div>
                {rhythmList.length === 0 ? (
                  <div className="text-xs text-white/45 py-8 text-center">
                    Click &ldquo;AUTO-INDEX 30 FEATURED TRACKS&rdquo; above to automatically sort 30
                    featured tracks from least to greatest numerical difficulty rating!
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                    {rhythmList.map((id, idx) => {
                      const track = allAvailableTracks.find((s) => String(s.id) === String(id));
                      const rating = track
                        ? getDisplayTrackRating(track, trackRatings, rhythmList.map(String))
                        : null;
                      const isTop1 = track ? isTrackLabeledNewTop1(track, trackRatings) : false;
                      return (
                        <div
                          key={String(id)}
                          className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-xl border border-white/10"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>
                            <div className="truncate">
                              <div className="text-xs font-black truncate flex items-center gap-1.5">
                                <span className="truncate">{track ? track.title : `Track ID: ${id}`}</span>
                                {isTop1 && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/30 border border-amber-400 text-[9px] font-black text-amber-200 shrink-0">
                                    NEW TOP 1
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-white/55 font-bold">
                                Rating:{' '}
                                <span className="text-amber-300 font-black">
                                  ★ {formatTrackRatingBadge(rating)}
                                </span>{' '}
                                · {track?.bpm || 120} BPM
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => moveTrackInList(idx, -1)}
                              className="p-1 bg-white/10 hover:bg-white/20 rounded"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveTrackInList(idx, 1)}
                              className="p-1 bg-white/10 hover:bg-white/20 rounded"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => toggleTrackInList(id)}
                              className="p-1 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded"
                              title="Remove from Index"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right 7 cols: Admin Track Numerical Rating & New Top 1 Controls */}
              <div className="lg:col-span-7 bg-black/55 border border-white/15 rounded-2xl p-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-amber-300 mb-3">
                  SET TRACK NUMERICAL DIFFICULTY RATING & &ldquo;NEW TOP 1&rdquo; LABEL ({allAvailableTracks.length} TRACKS)
                </h3>
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {allAvailableTracks.map((song) => {
                    const inList = rhythmList.some((id) => String(id) === String(song.id));
                    const effectiveRating = getDisplayTrackRating(
                      song,
                      trackRatings,
                      rhythmList.map(String)
                    );
                    const voteStats = getCommunityVoteStats(song, trackRatings);
                    const labeledTop1 = isTrackLabeledNewTop1(song, trackRatings);
                    const draftVal =
                      ratingInputs[String(song.id)] !== undefined
                        ? ratingInputs[String(song.id)]
                        : effectiveRating !== null
                        ? String(effectiveRating)
                        : '';

                    return (
                      <div
                        key={String(song.id)}
                        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                          labeledTop1
                            ? 'bg-amber-500/15 border-amber-400/60 shadow-[0_0_16px_rgba(245,158,11,0.2)]'
                            : 'bg-white/5 border-white/10'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-white truncate">{song.title}</span>
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/25 border border-amber-400/50 text-amber-300 text-[10px] font-black">
                              ★ {formatTrackRatingBadge(effectiveRating)}
                            </span>
                            {labeledTop1 && (
                              <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-rose-500 text-white text-[9px] font-black uppercase tracking-wider">
                                👑 NEW TOP 1 UNLOCKED
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-white/55 font-bold mt-0.5">
                            {song.artist} · {song.bpm} BPM
                            {voteStats.count > 0 && (
                              <span className="text-cyan-300 ml-2">
                                · Public Votes: {voteStats.count} (Avg ★ {voteStats.average})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={draftVal}
                            onChange={(e) =>
                              setRatingInputs((prev) => ({
                                ...prev,
                                [String(song.id)]: e.target.value,
                              }))
                            }
                            className="w-20 bg-black/60 border border-white/25 rounded-lg px-2 py-1 text-xs font-black text-amber-300 text-center focus:outline-none focus:border-amber-400"
                            title="Set any numerical difficulty rating"
                          />
                          <button
                            onClick={() => handleSetAdminRating(song)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase tracking-wider cursor-pointer"
                          >
                            SET ★
                          </button>
                          <button
                            onClick={() => handleToggleNewTop1(song)}
                            className={`px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider border cursor-pointer transition-all ${
                              labeledTop1
                                ? 'bg-amber-400 text-black border-white shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                                : 'bg-white/10 text-white/75 border-white/20 hover:bg-white/20'
                            }`}
                            title="Label as New Top 1 so players and admins can vote/rate over the current Top 1"
                          >
                            {labeledTop1 ? '👑 TOP 1 ON' : 'SET TOP 1'}
                          </button>
                          <button
                            onClick={() => toggleTrackInList(song.id)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                              inList
                                ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                                : 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            {inList ? 'IN LIST' : '+ INDEX'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'shop_control' && (
          <div className="max-w-2xl mx-auto bg-black/65 border-2 border-amber-500/40 rounded-3xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 ${
                    shopShutdown.closed
                      ? 'bg-rose-500/25 border-rose-400 text-rose-300'
                      : 'bg-emerald-500/25 border-emerald-400 text-emerald-300'
                  }`}
                >
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black italic tracking-tight text-white">
                    ADMIN SHOP SHUTDOWN CONTROL
                  </h3>
                  <p className="text-xs font-bold text-white/60">
                    Current Shop Status:{' '}
                    <span
                      className={
                        shopShutdown.closed ? 'text-rose-400 font-black' : 'text-emerald-400 font-black'
                      }
                    >
                      {shopShutdown.closed ? 'SHUT DOWN (CLOSED TO PLAYERS)' : 'OPEN & ACTIVE'}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-white/75 font-black uppercase tracking-wider block mb-2">
                Shutdown Reason / Message Shown to Players in Shop
              </label>
              <textarea
                data-testid="admin-shop-shutdown-message"
                value={shopReasonDraft}
                onChange={(e) => setShopReasonDraft(e.target.value)}
                rows={3}
                placeholder="Enter message explaining why the shop is shut down..."
                className="w-full bg-black/60 border-2 border-white/20 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                data-testid="admin-shutdown-shop-btn"
                onClick={() => updateShopShutdown(true, shopReasonDraft)}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs uppercase tracking-wider border-2 border-white/80 shadow-[0_0_24px_rgba(244,63,94,0.4)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                SHUT DOWN SHOP NOW & DISPLAY MESSAGE
              </button>
              <button
                data-testid="admin-reopen-shop-btn"
                onClick={() => updateShopShutdown(false, shopReasonDraft)}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider border-2 border-white/80 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                REOPEN SHOP
              </button>
            </div>
          </div>
        )}

        {tab === 'note' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-black/50 border border-white/10 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-rose-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Create Custom Note Skin
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Name</label>
                  <input
                    type="text"
                    value={noteName}
                    onChange={(e) => setNoteName(e.target.value)}
                    placeholder="Cyber Blade..."
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Price (Coins)</label>
                  <input
                    type="number"
                    value={notePrice}
                    onChange={(e) => setNotePrice(Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-white/60 font-bold block mb-1">Description</label>
                <input
                  type="text"
                  value={noteDesc}
                  onChange={(e) => setNoteDesc(e.target.value)}
                  placeholder="Special effects and custom look..."
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Fill Color</label>
                  <input
                    type="color"
                    value={noteFill}
                    onChange={(e) => setNoteFill(e.target.value)}
                    className="w-full h-9 rounded cursor-pointer bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Outline</label>
                  <input
                    type="color"
                    value={noteOutline}
                    onChange={(e) => setNoteOutline(e.target.value)}
                    className="w-full h-9 rounded cursor-pointer bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Rarity</label>
                  <select
                    value={noteRarity}
                    onChange={(e) => setNoteRarity(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-2 text-xs font-bold uppercase"
                  >
                    {Object.keys(NOTE_RARITIES).map((r) => (
                      <option key={r} value={r} className="bg-zinc-900">
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Center Text</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="MAX 6"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Sticker Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleStickerUpload}
                    className="w-full text-xs text-white/60"
                  />
                </div>
              </div>

              {noteSticker && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/60 font-bold block mb-1">
                      Sticker Scale X ({noteScaleX.toFixed(1)})
                    </label>
                    <input
                      type="range"
                      min="0.4"
                      max="2"
                      step="0.1"
                      value={noteScaleX}
                      onChange={(e) => setNoteScaleX(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 font-bold block mb-1">
                      Sticker Scale Y ({noteScaleY.toFixed(1)})
                    </label>
                    <input
                      type="range"
                      min="0.4"
                      max="2"
                      step="0.1"
                      value={noteScaleY}
                      onChange={(e) => setNoteScaleY(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-white/60 font-bold block mb-2">
                  Note Gameplay Effects ({selectedEffects.length} selected)
                </label>
                <div className="max-h-48 overflow-y-auto grid grid-cols-2 gap-1.5 p-2 bg-black/40 rounded-xl border border-white/10">
                  {NOTE_EFFECTS.map((eff) => {
                    const sel = selectedEffects.find((e) => e.id === eff.id);
                    return (
                      <div
                        key={eff.id}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          sel ? 'bg-rose-500/20 border-rose-400' : 'bg-white/5 border-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleEffect(eff.id)}
                          className="w-full text-left"
                        >
                          <div className="text-xs font-black">{eff.name}</div>
                          <div className="text-[10px] text-white/50">{eff.desc}</div>
                        </button>
                        {sel && (
                          <input
                            type="range"
                            min="0.5"
                            max="3"
                            step="0.25"
                            value={sel.intensity}
                            onChange={(e) => updateEffectIntensity(eff.id, Number(e.target.value))}
                            className="w-full mt-1"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={publishNoteProduct}
                disabled={publishingNote || !noteName.trim()}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 font-black text-sm flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> PUBLISH TO SHOP
              </button>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-white/60 mb-3">
                Existing Note Products ({noteProducts.length})
              </h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {noteProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg border-2 flex items-center justify-center text-[10px] font-black"
                        style={{ backgroundColor: prod.fill, borderColor: prod.outline }}
                      >
                        {prod.text || '★'}
                      </div>
                      <div>
                        <div className="text-sm font-black">{prod.name}</div>
                        <div className="text-[10px] text-white/50">
                          {prod.price} Coins · {prod.rarity.toUpperCase()} · {prod.effects?.length || 0} Effects
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteNoteProduct(prod.id)}
                      className="p-2 text-rose-400 hover:bg-rose-500/20 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'sound' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-black/50 border border-white/10 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-cyan-400 flex items-center gap-2">
                <Volume2 className="w-4 h-4" /> Publish Hit Sound Product
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Sound Name</label>
                  <input
                    type="text"
                    value={soundName}
                    onChange={(e) => setSoundName(e.target.value)}
                    placeholder="Mechanical Click..."
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Price (Coins)</label>
                  <input
                    type="number"
                    value={soundPrice}
                    onChange={(e) => setSoundPrice(Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setSoundKind('single')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold ${
                    soundKind === 'single' ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/60'
                  }`}
                >
                  SINGLE SOUND
                </button>
                <button
                  onClick={() => setSoundKind('pack')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold ${
                    soundKind === 'pack' ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/60'
                  }`}
                >
                  4-LANE PACK
                </button>
              </div>

              {soundKind === 'single' ? (
                <div>
                  <label className="text-xs text-white/60 font-bold block mb-1">Upload Audio</label>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleSingleSoundUpload}
                    className="w-full text-xs text-white/60"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  {['Left Lane', 'Down Lane', 'Up Lane', 'Right Lane'].map((label, idx) => (
                    <div key={label}>
                      <label className="text-xs text-white/60 font-bold block mb-0.5">{label}</label>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => handlePackSoundUpload(idx, e)}
                        className="w-full text-xs text-white/60"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={publishHitSound}
                disabled={publishingSound || !soundName.trim()}
                className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black disabled:opacity-40 font-black text-sm"
              >
                PUBLISH HIT SOUND
              </button>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-white/60 mb-3">
                Published Hit Sounds ({hitSoundProducts.length})
              </h3>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {hitSoundProducts.map((hs) => (
                  <div
                    key={hs.id}
                    className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10"
                  >
                    <div>
                      <div className="text-sm font-black">{hs.name}</div>
                      <div className="text-[10px] text-white/50">
                        {hs.price} Coins · {hs.kind.toUpperCase()}
                      </div>
                    </div>
                    <Star className="w-4 h-4 text-amber-400" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'interrupt' && (
          <div className="max-w-xl mx-auto bg-black/50 border border-rose-500/30 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-black uppercase tracking-widest text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Global Live Broadcast
            </h3>
            <p className="text-xs text-white/60">
              Send an instant overlay banner to all connected clients in real-time.
            </p>
            <textarea
              value={interruptMsg}
              onChange={(e) => setInterruptMsg(e.target.value)}
              placeholder="Enter broadcast message..."
              rows={3}
              className="w-full bg-white/10 border border-white/20 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-rose-400"
            />
            <div className="flex gap-3">
              <button
                onClick={() => triggerInterruption(true)}
                disabled={sendingInterrupt}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl font-black text-sm"
              >
                BROADCAST NOW
              </button>
              <button
                onClick={() => triggerInterruption(false)}
                disabled={sendingInterrupt}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm"
              >
                CLEAR BROADCAST
              </button>
            </div>
            {interruption?.active && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs font-bold text-rose-200">
                Active Broadcast: &ldquo;{interruption.message}&rdquo;
              </div>
            )}
          </div>
        )}

        {tab === 'accounts' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 6 cols: Add & Manage Admin Emails */}
            <div className="lg:col-span-6 bg-black/60 border-2 border-cyan-400/40 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-cyan-300" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    ADMIN ACCESS & PRIVILEGE MANAGER
                  </h3>
                  <p className="text-xs text-white/60">
                    Grant or revoke Admin Studio & Track Rating privileges for any account email.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  data-testid="admin-add-email-input"
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="Enter player email (e.g. friend@gmail.com)..."
                  className="flex-1 bg-white/10 border border-white/25 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  data-testid="admin-add-email-btn"
                  onClick={() => handleAddAdminEmail(newAdminEmail)}
                  className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs uppercase tracking-wider cursor-pointer"
                >
                  + ADD ADMIN
                </button>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-black uppercase tracking-widest text-amber-300">
                  CORE & GRANTED ADMIN ACCOUNTS ({ADMIN_EMAILS.length + customAdmins.length})
                </div>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {ADMIN_EMAILS.map((email) => (
                    <div
                      key={email}
                      className="flex items-center justify-between bg-amber-500/10 border border-amber-400/40 px-3 py-2 rounded-xl"
                    >
                      <div className="text-xs font-black text-white truncate">{email}</div>
                      <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[9px] font-black uppercase">
                        CORE OWNER / ADMIN
                      </span>
                    </div>
                  ))}
                  {customAdmins.map((email) => (
                    <div
                      key={email}
                      className="flex items-center justify-between bg-cyan-500/10 border border-cyan-400/40 px-3 py-2 rounded-xl"
                    >
                      <div className="text-xs font-black text-cyan-200 truncate">{email}</div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAdminEmail(email)}
                        className="px-2.5 py-1 rounded bg-rose-500/30 hover:bg-rose-500/50 border border-rose-400/50 text-rose-200 text-[10px] font-black uppercase cursor-pointer"
                      >
                        REMOVE ADMIN
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 6 cols: Player Accounts Directory with One-Click Promote/Demote */}
            <div className="lg:col-span-6 bg-black/60 border border-white/15 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-fuchsia-400" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    REGISTERED PLAYER ACCOUNTS ({ACTIVE_RIVAL_PROFILES.length + 1})
                  </h3>
                  <p className="text-xs text-white/60">
                    Inspect player accounts and toggle their Admin permissions with one click.
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {[
                  {
                    uid: user?.uid || 'owner-01',
                    displayName: user?.displayName || 'Marin (Owner)',
                    email: user?.email || DEFAULT_OWNER_EMAIL,
                    titleBadge: 'GAME CREATOR & TOP 1 JUDGE',
                    ratingPoints: 3100,
                    wins1v1: 95,
                  },
                  ...ACTIVE_RIVAL_PROFILES,
                ].map((acct) => {
                  const acctEmail = acct.email || '';
                  const isCore = ADMIN_EMAILS.some(
                    (e) => e.toLowerCase() === acctEmail.toLowerCase()
                  );
                  const isPromoted = isUserAdmin(acctEmail, customAdmins);
                  return (
                    <div
                      key={acct.uid || acctEmail}
                      className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 px-3.5 py-2.5 rounded-xl"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white truncate">
                            {acct.displayName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/20 border border-fuchsia-400/40 text-[9px] font-black text-fuchsia-200">
                            {acct.titleBadge}
                          </span>
                        </div>
                        <div className="text-[11px] text-cyan-300 font-bold truncate">
                          {acctEmail} · {acct.wins1v1 || 0}W 1v1
                        </div>
                      </div>

                      {isCore ? (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-400/60 text-amber-300 text-[10px] font-black uppercase shrink-0">
                          CORE ADMIN
                        </span>
                      ) : isPromoted ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveAdminEmail(acctEmail)}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 text-rose-200 text-[10px] font-black uppercase shrink-0 cursor-pointer"
                        >
                          REVOKE ADMIN
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddAdminEmail(acctEmail)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400/60 text-emerald-200 text-[10px] font-black uppercase shrink-0 cursor-pointer"
                        >
                          + MAKE ADMIN
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
