import React, { useEffect, useState } from 'react';
import { db } from '../firebaseClient';
import { AudioEngine } from '../game/audio';
import { ADMIN_EMAILS, NOTE_EFFECTS, NOTE_RARITIES } from '../game/constants';
import type { FirebaseUser, NoteEffectConfig, ScreenId, Song } from '../game/types';
import { NoteTestArena } from './ShopMenu';

interface AdminStudioProps {
  setScreen: (s: ScreenId) => void;
  songs: Song[];
  user: FirebaseUser | null;
}

export const AdminStudio: React.FC<AdminStudioProps> = ({ setScreen, songs, user }) => {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState('');
  const [tab, setTab] = useState<'notes' | 'sounds' | 'rhythm'>('notes');
  const [name, setName] = useState('NEW NOTE');
  const [description, setDescription] = useState('');
  const [fill, setFill] = useState('#ff3cac');
  const [outline, setOutline] = useState('#ffffff');
  const [text, setText] = useState('★');
  const [sticker, setSticker] = useState('');
  const [rarity, setRarity] = useState('common');
  const [price, setPrice] = useState(500);
  const [effects, setEffects] = useState<NoteEffectConfig[]>([]);
  const [busy, setBusy] = useState(false);
  const [rhythm, setRhythm] = useState<Array<string | number>>([]);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [testMode, setTestMode] = useState(false);
  const [soundName, setSoundName] = useState('NEW HIT SOUND');
  const [soundPrice, setSoundPrice] = useState(250);
  const [soundKind, setSoundKind] = useState<'single' | 'pack'>('single');
  const [soundFiles, setSoundFiles] = useState<Array<string | null>>([null, null, null, null]);
  const [soundBusy, setSoundBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!unlocked || !db) return;
    return db.collection('system').doc('rhythmList').onSnapshot((d: any) => setRhythm(d.data()?.top10 || []));
  }, [unlocked]);

  const toggleEffect = (id: string) =>
    setEffects((v) =>
      v.some((x) => x.id === id) ? v.filter((x) => x.id !== id) : v.length < 3 ? [...v, { id, intensity: 50 }] : v
    );

  const uploadSticker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(f.type)) {
      setNotice('Choose a PNG or JPEG image.');
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 512;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * ratio));
        c.height = Math.max(1, Math.round(img.height * ratio));
        const x = c.getContext('2d')!;
        x.clearRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        let data = c.toDataURL('image/webp', 0.88);
        if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/png');
        setSticker(data);
      };
      img.onerror = () => setNotice('The image could not be decoded.');
      img.src = String(r.result || '');
    };
    r.onerror = () => setNotice('The image could not be read.');
    r.readAsDataURL(f);
  };

  const publish = async () => {
    if (!name.trim()) {
      setNotice('Enter a note name before publishing.');
      return;
    }
    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
      setNotice('Restricted to authorized administrator account.');
      return;
    }
    setBusy(true);
    try {
      const id = Date.now().toString();
      const product = {
        id,
        name: name.trim(),
        description: description || '',
        fill,
        outline,
        text: text || '',
        sticker: sticker || '',
        stickerScaleX: Number(scaleX) || 1,
        stickerScaleY: Number(scaleY) || 1,
        rarity,
        price: Number(price) || 0,
        effects: Array.isArray(effects) ? effects : [],
        createdAt: Date.now(),
        createdBy: user.uid,
        active: true,
      };
      try {
        const raw = JSON.parse(localStorage.getItem('rhythmCanvasNoteProducts') || '[]');
        const local = Array.isArray(raw) ? raw : [];
        localStorage.setItem(
          'rhythmCanvasNoteProducts',
          JSON.stringify([product, ...local.filter((x: any) => String(x.id) !== id)])
        );
      } catch (localError) {
        console.warn('Local product cache full', localError);
      }
      let savedAt = 'local device';
      let lastError: any = null;
      const timed = (promise: Promise<any>, ms = 7000) =>
        Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Database request timed out')), ms))]);
      if (db) {
        try {
          await timed(db.collection('note_products').doc(id).set(product));
          savedAt = 'note_products database';
        } catch (e1) {
          lastError = e1;
          try {
            await timed(
              db.collection('community_tracks').doc(`note-product-${id}`).set({
                entityType: 'note_product',
                product,
                ownerUid: user.uid,
                createdAt: Date.now(),
              })
            );
            savedAt = 'community database fallback';
          } catch (e2) {
            lastError = e2;
            try {
              const ref = db.collection('system').doc('noteProducts');
              const snap = await timed(ref.get());
              const products = (snap.data()?.products || []).filter((x: any) => String(x.id) !== id);
              await timed(ref.set({ products: [product, ...products], updatedAt: Date.now() }, { merge: true }));
              savedAt = 'system database fallback';
            } catch (e3) {
              lastError = e3;
            }
          }
        }
      }
      setNotice(
        savedAt === 'local device'
          ? `Saved locally, but Firebase rejected the upload: ${lastError?.message || 'database unavailable'}`
          : `Uploaded successfully to ${savedAt}!`
      );
      setName('NEW NOTE');
      setDescription('');
      setSticker('');
    } catch (e: any) {
      console.error(e);
      setNotice('Note creation failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const readSound = async (file: File | undefined, index: number) => {
    if (!file || !(/^audio\/(wav|wave|mpeg|mp3)/i.test(file.type) || /\.(wav|mp3)$/i.test(file.name))) {
      setNotice('Choose a WAV or MP3 file.');
      return;
    }
    if (file.size > 12000000) {
      setNotice('Audio must be under 12 MB.');
      return;
    }
    try {
      const ctx = AudioEngine.init();
      if (!ctx) throw new Error('AudioContext unavailable');
      const source = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(source.slice(0));
      const rate = 12000;
      const duration = Math.min(2, decoded.duration);
      const frames = Math.max(1, Math.floor(duration * rate));
      const pcm = new Int16Array(frames);
      for (let i = 0; i < frames; i++) {
        const src = Math.min(decoded.length - 1, Math.floor((i * decoded.sampleRate) / rate));
        let sample = 0;
        for (let c = 0; c < decoded.numberOfChannels; c++) sample += decoded.getChannelData(c)[src] || 0;
        sample /= decoded.numberOfChannels;
        pcm[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      }
      const buf = new ArrayBuffer(44 + pcm.length * 2);
      const v = new DataView(buf);
      const write = (o: number, t: string) => {
        for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
      };
      write(0, 'RIFF');
      v.setUint32(4, 36 + pcm.length * 2, true);
      write(8, 'WAVE');
      write(12, 'fmt ');
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, rate, true);
      v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      write(36, 'data');
      v.setUint32(40, pcm.length * 2, true);
      for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const url = 'data:audio/wav;base64,' + btoa(binary);
      setSoundFiles((a) => a.map((x, i) => (i === index ? url : x)));
      if (decoded.duration > 2) setNotice('Hit sound loaded and trimmed to the first 2 seconds.');
    } catch (e: any) {
      console.error(e);
      setNotice('Could not decode this audio. Try another WAV or MP3. ' + e.message);
    }
  };

  const publishSound = async () => {
    if (!user || !ADMIN_EMAILS.includes(user.email || '')) return;
    const needed = soundKind === 'pack' ? 4 : 1;
    if (!soundName.trim()) {
      setNotice('Name required');
      return;
    }
    if (soundFiles.slice(0, needed).some((x) => !x)) {
      setNotice(`Upload ${needed} sound file${needed > 1 ? 's' : ''}.`);
      return;
    }
    setSoundBusy(true);
    try {
      const id = Date.now().toString();
      const urls = [...soundFiles.slice(0, needed)];
      const product = {
        id,
        name: soundName.trim(),
        price: Number(soundPrice) || 0,
        kind: soundKind,
        sound: soundKind === 'single' ? urls[0] : null,
        sounds: soundKind === 'pack' ? urls : null,
        active: true,
        createdBy: user.uid,
        createdAt: Date.now(),
      };
      try {
        const old = JSON.parse(localStorage.getItem('rhythmCanvasHitSounds') || '[]');
        const list = Array.isArray(old) ? old : [];
        localStorage.setItem(
          'rhythmCanvasHitSounds',
          JSON.stringify([product, ...list.filter((x: any) => String(x.id) !== id)])
        );
      } catch (e) {
        console.warn('Local hit sound cache failed', e);
      }
      let saved = false;
      let last: any = null;
      if (db) {
        try {
          await db.collection('hit_sound_products').doc(id).set(product);
          saved = true;
        } catch (e) {
          last = e;
          try {
            await db.collection('community_tracks').doc(`hit-sound-${id}`).set({
              entityType: 'hit_sound_product',
              product,
              ownerUid: user.uid,
            });
            saved = true;
          } catch (e2) {
            last = e2;
          }
        }
      }
      setNotice(saved ? 'Hit sound uploaded to the shop!' : 'Saved locally; Firebase rejected: ' + (last?.message || 'unavailable'));
      setSoundFiles([null, null, null, null]);
    } catch (e: any) {
      console.error(e);
      setNotice('Hit sound creation failed: ' + e.message);
    } finally {
      setSoundBusy(false);
    }
  };

  const saveRhythm = async (list: Array<string | number>) => {
    if (!ADMIN_EMAILS.includes(user?.email || '')) return;
    setRhythm(list);
    if (!db) {
      setNotice('Saved locally; cloud sync unavailable.');
      return;
    }
    await db.collection('system').doc('rhythmList').set({ top10: list, updatedAt: Date.now() }, { merge: true });
  };
  const addTrack = (id: string | number) => {
    if (!rhythm.map(String).includes(String(id))) saveRhythm([...rhythm, id]);
  };
  const move = (i: number, d: number) => {
    const n = [...rhythm];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    saveRhythm(n);
  };

  if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
    return (
      <div className="rc-stage w-full h-full flex items-center justify-center p-6 text-white">
        <div className="rc-stage-dots absolute inset-0 pointer-events-none" />
        <div className="relative z-10 rc-console-tray p-8 text-center max-w-lg border-red-500">
          <h2 className="text-3xl font-black italic text-red-400">ACCESS DENIED</h2>
          <p className="my-4 font-bold text-slate-200">
            This studio is restricted to the authorized administrator account.
          </p>
          <button
            onClick={() => setScreen('shop')}
            className="rc-bevel-btn rc-tile-gold text-black px-6 py-2.5 font-black whitespace-nowrap"
          >
            RETURN TO SHOP
          </button>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="rc-stage w-full h-full flex items-center justify-center p-4 text-white">
        <div className="rc-stage-dots absolute inset-0 pointer-events-none" />
        <div className="relative z-10 max-w-md w-full rc-console-tray p-6 space-y-3">
          <h2 className="text-2xl font-black italic text-yellow-300">ADMIN ACCESS</h2>
          {notice && <div className="rc-console-inset border-red-400 text-red-300 p-2 text-xs font-bold">{notice}</div>}
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full p-3 rounded-lg bg-[#0d1018] border border-white/25 text-white font-black"
            placeholder="PASSCODE"
          />
          <button
            onClick={() => (code === 'ILIKEAPPLES2013' ? setUnlocked(true) : setNotice('Incorrect passcode'))}
            className="rc-bevel-btn rc-tile-gold w-full text-black p-3 font-black min-h-[44px]"
          >
            UNLOCK
          </button>
          <button
            onClick={() => setScreen('shop')}
            className="rc-bevel-btn rc-tile-slate w-full text-white p-3 font-black min-h-[44px]"
          >
            BACK
          </button>
        </div>
      </div>
    );
  }

  const previewStyle = {
    '--note-fill': fill,
    '--note-outline': outline,
    boxShadow: `0 0 30px ${NOTE_RARITIES[rarity]}`,
  } as React.CSSProperties;
  const draftProduct = { fill, outline, text, sticker, stickerScaleX: scaleX, stickerScaleY: scaleY, effects };

  return (
    <div className="rc-stage w-full h-full overflow-y-auto p-3 sm:p-5 text-white custom-scrollbar safe-top safe-bottom">
      <div className="rc-stage-dots absolute inset-0 pointer-events-none" />
      <div className="relative z-10 max-w-6xl mx-auto space-y-4">
        <header className="rc-dock-rail flex flex-wrap justify-between items-center gap-3 px-4 py-2 pr-14 sm:pr-16">
          <button
            onClick={() => setScreen('shop')}
            className="rc-bevel-btn rc-tile-slate text-white px-4 py-2 font-black text-xs sm:text-sm whitespace-nowrap"
          >
            ← SHOP
          </button>
          <h1 className="text-xl sm:text-2xl font-black italic text-yellow-300">ADMIN CREATOR</h1>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTab('notes')}
              className={`rc-bevel-btn px-3.5 py-1.5 font-black text-xs whitespace-nowrap ${
                tab === 'notes' ? 'rc-tile-pink text-white' : 'rc-sub-dark text-slate-300'
              }`}
            >
              NOTE LAB
            </button>
            <button
              onClick={() => setTab('sounds')}
              className={`rc-bevel-btn px-3.5 py-1.5 font-black text-xs whitespace-nowrap ${
                tab === 'sounds' ? 'rc-tile-gold text-black' : 'rc-sub-dark text-slate-300'
              }`}
            >
              HIT SOUNDS
            </button>
            <button
              onClick={() => setTab('rhythm')}
              className={`rc-bevel-btn px-3.5 py-1.5 font-black text-xs whitespace-nowrap ${
                tab === 'rhythm' ? 'rc-tile-cyan text-black' : 'rc-sub-dark text-slate-300'
              }`}
            >
              RHYTHM LIST
            </button>
          </div>
        </header>

        {notice && (
          <div className="rc-console-inset border-cyan-400 p-3 flex justify-between items-center gap-2">
            <span className="font-bold text-sm text-cyan-200">{notice}</span>
            <button
              onClick={() => setNotice('')}
              className="rc-bevel-btn rc-tile-cyan text-black px-3 py-1 font-black text-xs"
            >
              OK
            </button>
          </div>
        )}

        {testMode && <NoteTestArena product={draftProduct} onClose={() => setTestMode(false)} />}

        {tab === 'notes' ? (
          <div className="grid grid-cols-[310px_1fr] gap-4">
            <aside className="rc-console-tray p-4 space-y-2.5">
              <div
                className="note-cutout w-36 h-36 mx-auto flex items-center justify-center text-4xl font-black"
                style={previewStyle}
              >
                {sticker && (
                  <img
                    src={sticker}
                    alt="Note sticker"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: `scale(${scaleX},${scaleY})` }}
                  />
                )}
                <span className="relative z-10">{text}</span>
              </div>
              <label className="block text-xs font-black text-slate-300">
                FILL
                <input type="color" value={fill} onChange={(e) => setFill(e.target.value)} className="w-full h-9 mt-1 rounded" />
              </label>
              <label className="block text-xs font-black text-slate-300">
                OUTLINE
                <input type="color" value={outline} onChange={(e) => setOutline(e.target.value)} className="w-full h-9 mt-1 rounded" />
              </label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 8))}
                className="w-full p-2 rounded-lg bg-[#0d1018] border border-white/25 text-white font-black text-sm"
                placeholder="NOTE TEXT"
              />
              <label className="block rc-bevel-btn rc-tile-cyan text-black p-2.5 text-center font-black text-xs cursor-pointer">
                UPLOAD PNG/JPEG
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadSticker} />
              </label>
              <label className="block text-xs font-bold text-slate-300">
                PNG WIDTH ×{scaleX.toFixed(2)}
                <input
                  type="range"
                  min="0.1"
                  max="2.5"
                  step="0.05"
                  value={scaleX}
                  onChange={(e) => setScaleX(+e.target.value)}
                  className="w-full accent-cyan-400"
                />
              </label>
              <label className="block text-xs font-bold text-slate-300">
                PNG HEIGHT ×{scaleY.toFixed(2)}
                <input
                  type="range"
                  min="0.1"
                  max="2.5"
                  step="0.05"
                  value={scaleY}
                  onChange={(e) => setScaleY(+e.target.value)}
                  className="w-full accent-cyan-400"
                />
              </label>
              <button
                onClick={() => setTestMode(true)}
                className="rc-bevel-btn rc-tile-gold w-full text-black p-2.5 font-black text-xs min-h-[40px]"
              >
                TEST ON NEON DRIFT
              </button>
            </aside>

            <main className="space-y-4">
              <section className="rc-console-inset grid grid-cols-2 gap-3 p-4">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="p-2.5 rounded-lg bg-[#0d1018] border border-white/25 text-white font-black text-sm"
                  placeholder="NAME"
                />
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="p-2.5 rounded-lg bg-[#0d1018] border border-white/25 text-white font-black text-sm tabular-nums"
                  placeholder="PRICE"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="p-2.5 rounded-lg bg-[#0d1018] border border-white/25 text-white text-sm col-span-2"
                  placeholder="DESCRIPTION"
                />
                <select
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                  className="p-2.5 rounded-lg bg-[#0d1018] border border-white/25 text-white font-black text-sm"
                >
                  {Object.keys(NOTE_RARITIES).map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </section>

              <section className="rc-console-tray p-4">
                <h3 className="text-sm font-black mb-2.5 text-yellow-300 tracking-wider">EFFECTS — SELECT UP TO 3</h3>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                  {NOTE_EFFECTS.map((f) => {
                    const chosen = effects.find((x) => x.id === f.id);
                    return (
                      <div
                        key={f.id}
                        className={`rc-panel p-2.5 ${chosen ? 'border-violet-400' : ''}`}
                      >
                        <button className="w-full text-left font-black text-xs text-white" onClick={() => toggleEffect(f.id)}>
                          {f.name}
                          <small className="block text-slate-400 font-semibold mt-0.5">{f.description}</small>
                        </button>
                        {chosen && (
                          <label className="text-[11px] block mt-1.5 text-cyan-300 font-bold">
                            INTENSITY {chosen.intensity}%
                            <input
                              type="range"
                              min="1"
                              max="100"
                              value={chosen.intensity}
                              onChange={(e) =>
                                setEffects((v) =>
                                  v.map((x) => (x.id === f.id ? { ...x, intensity: +e.target.value } : x))
                                )
                              }
                              className="w-full accent-violet-400"
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <button
                disabled={busy}
                onClick={publish}
                className="rc-bevel-btn rc-tile-green w-full text-black p-3.5 text-lg font-black min-h-[48px]"
              >
                {busy ? 'UPLOADING...' : 'PUBLISH TO SHOP'}
              </button>
            </main>
          </div>
        ) : tab === 'sounds' ? (
          <div className="max-w-3xl mx-auto rc-console-tray p-5 space-y-4">
            <h2 className="text-xl font-black italic text-yellow-300">HIT SOUND CREATOR</h2>
            <div className="grid grid-cols-3 gap-3">
              <input
                value={soundName}
                onChange={(e) => setSoundName(e.target.value)}
                className="p-2.5 rounded-lg bg-[#0d1018] border border-white/25 text-white font-black text-sm"
                placeholder="NAME"
              />
              <input
                type="number"
                value={soundPrice}
                onChange={(e) => setSoundPrice(Number(e.target.value))}
                className="p-2.5 rounded-lg bg-[#0d1018] border border-white/25 text-white font-black text-sm tabular-nums"
                placeholder="PRICE"
              />
              <select
                value={soundKind}
                onChange={(e) => setSoundKind(e.target.value as 'single' | 'pack')}
                className="p-2.5 rounded-lg bg-[#0d1018] border border-white/25 text-white font-black text-sm"
              >
                <option value="single">SINGLE SOUND</option>
                <option value="pack">4-NOTE PACK</option>
              </select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: soundKind === 'pack' ? 4 : 1 }).map((_, i) => (
                <label key={i} className="rc-console-inset p-4 text-center font-black cursor-pointer border-cyan-400/50 text-xs">
                  {soundKind === 'pack' ? ['LEFT', 'DOWN', 'UP', 'RIGHT'][i] : 'ALL NOTES'}
                  <input
                    type="file"
                    accept="audio/wav,audio/mpeg,.wav,.mp3"
                    className="hidden"
                    onChange={(e) => readSound(e.target.files?.[0], i)}
                  />
                  {soundFiles[i] && (
                    <>
                      <div className="text-emerald-400 text-xs mt-2">LOADED</div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          new Audio(soundFiles[i]!).play().catch(() => {});
                        }}
                        className="mt-2 rc-bevel-btn rc-tile-gold text-black px-3 py-1 text-xs font-black"
                      >
                        TEST
                      </button>
                    </>
                  )}
                </label>
              ))}
            </div>
            <button
              disabled={soundBusy}
              onClick={publishSound}
              className="rc-bevel-btn rc-tile-green w-full text-black p-3.5 font-black text-lg min-h-[48px]"
            >
              {soundBusy ? 'UPLOADING...' : 'PUBLISH HIT SOUND'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <section className="rc-console-tray p-4">
              <h2 className="text-lg font-black italic text-yellow-300 mb-3">CURRENT RHYTHM LIST</h2>
              <div className="space-y-2 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                {rhythm.map((id, i) => {
                  const song = songs.find((x) => String(x.id) === String(id));
                  return (
                    <div key={`${id}_${i}`} className="rc-console-inset flex items-center gap-2 p-2.5 text-sm">
                      <b className="w-8 text-yellow-300 tabular-nums">#{i + 1}</b>
                      <span className="flex-1 truncate font-black">{song?.title || id}</span>
                      <button onClick={() => move(i, -1)} className="rc-bevel-btn rc-tile-slate px-2 py-1 text-xs">▲</button>
                      <button onClick={() => move(i, 1)} className="rc-bevel-btn rc-tile-slate px-2 py-1 text-xs">▼</button>
                      <button onClick={() => saveRhythm(rhythm.filter((_, x) => x !== i))} className="rc-bevel-btn rc-tile-red text-white px-2 py-1 text-xs">
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="rc-console-tray p-4">
              <h2 className="text-lg font-black italic text-cyan-300 mb-3">ADD TRACK</h2>
              <div className="max-h-[440px] overflow-y-auto custom-scrollbar pr-1 space-y-2">
                {songs.map((song) => (
                  <button
                    key={song.id}
                    onClick={() => addTrack(song.id)}
                    className="rc-bevel-btn rc-tile-slate w-full text-left px-3.5 py-2.5 text-white"
                  >
                    <b className="block text-sm truncate">{song.title}</b>
                    <small className="block text-xs text-slate-300 truncate">{song.artist}</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
