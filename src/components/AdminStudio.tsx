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
      <div className="w-full h-full bg-black flex items-center justify-center p-6">
        <div className="border-4 border-red-500 bg-gray-950 p-8 text-center max-w-lg">
          <h2 className="text-3xl sm:text-4xl font-black text-red-400">ACCESS DENIED</h2>
          <p className="my-4 font-bold">This studio is restricted to the authorized administrator account.</p>
          <button onClick={() => setScreen('shop')} className="bg-white text-black px-6 py-3 font-black">
            RETURN TO SHOP
          </button>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-4">
        <div className="max-w-md w-full border-4 border-yellow-400 p-6 sm:p-8 bg-gray-950 shadow-[0_0_40px_#facc15]">
          <h2 className="text-3xl font-black text-yellow-300 mb-4">ADMIN ACCESS</h2>
          {notice && <div className="mb-3 bg-red-600 text-white p-2 text-sm font-bold">{notice}</div>}
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full p-3 text-black bg-white font-black"
            placeholder="PASSCODE"
          />
          <button
            onClick={() => (code === 'ILIKEAPPLES2013' ? setUnlocked(true) : setNotice('Incorrect passcode'))}
            className="w-full mt-4 bg-yellow-400 text-black p-3 font-black min-h-[48px]"
          >
            UNLOCK
          </button>
          <button onClick={() => setScreen('shop')} className="w-full mt-3 bg-gray-700 p-3 font-black min-h-[48px]">
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
    <div className="w-full h-full overflow-y-auto bg-[#080a13] p-4 md:p-8 text-white custom-scrollbar safe-top safe-bottom">
      <header className="flex flex-wrap justify-between items-center gap-3 mb-5 pr-14">
        <button onClick={() => setScreen('shop')} className="bg-white text-black px-5 py-3 font-black min-h-[44px]">
          ← SHOP
        </button>
        <h1 className="text-2xl sm:text-4xl font-black text-yellow-300">ADMIN CREATOR</h1>
        <div />
      </header>
      {notice && (
        <div className="mb-4 bg-cyan-950 border-2 border-cyan-400 p-3 flex justify-between items-center gap-2">
          <span className="font-bold text-sm">{notice}</span>
          <button onClick={() => setNotice('')} className="bg-cyan-400 text-black px-3 py-1 font-black text-xs">
            OK
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-5">
        <button onClick={() => setTab('notes')} className="bg-pink-500 px-4 py-2 font-black min-h-[44px]">
          NOTE LAB
        </button>
        <button onClick={() => setTab('sounds')} className="bg-yellow-400 text-black px-4 py-2 font-black min-h-[44px]">
          HIT SOUNDS
        </button>
        <button onClick={() => setTab('rhythm')} className="bg-cyan-500 text-black px-4 py-2 font-black min-h-[44px]">
          RHYTHM LIST
        </button>
      </div>
      {testMode && <NoteTestArena product={draftProduct} onClose={() => setTestMode(false)} />}
      {tab === 'notes' ? (
        <div className="grid lg:grid-cols-[330px_1fr] gap-6">
          <aside className="bg-gray-900 border-2 border-yellow-400 p-5">
            <div
              className="note-cutout w-40 h-40 sm:w-44 sm:h-44 mx-auto flex items-center justify-center text-4xl font-black"
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
            <label className="block mt-3 text-xs font-black">
              FILL
              <input type="color" value={fill} onChange={(e) => setFill(e.target.value)} className="w-full h-10" />
            </label>
            <label className="block mt-2 text-xs font-black">
              OUTLINE
              <input type="color" value={outline} onChange={(e) => setOutline(e.target.value)} className="w-full h-10" />
            </label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 8))}
              className="w-full p-2 mt-2 text-black bg-white font-black"
              placeholder="NOTE TEXT"
            />
            <label className="block bg-blue-500 p-3 mt-2 text-center font-black cursor-pointer">
              UPLOAD PNG/JPEG
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadSticker} />
            </label>
            <label className="block text-xs mt-3">
              PNG WIDTH ×{scaleX.toFixed(2)}
              <input
                type="range"
                min="0.1"
                max="2.5"
                step="0.05"
                value={scaleX}
                onChange={(e) => setScaleX(+e.target.value)}
                className="w-full"
              />
            </label>
            <label className="block text-xs mt-1">
              PNG HEIGHT ×{scaleY.toFixed(2)}
              <input
                type="range"
                min="0.1"
                max="2.5"
                step="0.05"
                value={scaleY}
                onChange={(e) => setScaleY(+e.target.value)}
                className="w-full"
              />
            </label>
            <button onClick={() => setTestMode(true)} className="w-full bg-cyan-400 text-black p-3 mt-3 font-black min-h-[48px]">
              TEST ON NEON DRIFT
            </button>
          </aside>
          <main className="space-y-5">
            <section className="grid md:grid-cols-2 gap-3 bg-gray-900 p-4 border border-white/20">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="p-3 text-black bg-white font-black"
                placeholder="NAME"
              />
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="p-3 text-black bg-white font-black"
                placeholder="PRICE"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="p-3 text-black bg-white md:col-span-2"
                placeholder="DESCRIPTION"
              />
              <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="p-3 text-black bg-white font-black">
                {Object.keys(NOTE_RARITIES).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </section>
            <section>
              <h3 className="text-xl font-black mb-2">EFFECTS — SELECT UP TO 3</h3>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[390px] overflow-y-auto">
                {NOTE_EFFECTS.map((f) => {
                  const chosen = effects.find((x) => x.id === f.id);
                  return (
                    <div
                      key={f.id}
                      className={`p-3 border ${chosen ? 'bg-purple-800 border-purple-300' : 'bg-gray-900 border-gray-700'}`}
                    >
                      <button className="w-full text-left font-black" onClick={() => toggleEffect(f.id)}>
                        {f.name}
                        <small className="block text-gray-400">{f.description}</small>
                      </button>
                      {chosen && (
                        <label className="text-xs block mt-1">
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
                            className="w-full"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            <button disabled={busy} onClick={publish} className="w-full bg-green-400 text-black p-4 text-2xl font-black min-h-[54px]">
              {busy ? 'UPLOADING...' : 'PUBLISH TO SHOP'}
            </button>
          </main>
        </div>
      ) : tab === 'sounds' ? (
        <div className="max-w-3xl mx-auto bg-gray-900 border-4 border-yellow-400 p-5 sm:p-6">
          <h2 className="text-2xl sm:text-3xl font-black mb-4">HIT SOUND CREATOR</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <input
              value={soundName}
              onChange={(e) => setSoundName(e.target.value)}
              className="p-3 text-black bg-white font-black"
              placeholder="NAME"
            />
            <input
              type="number"
              value={soundPrice}
              onChange={(e) => setSoundPrice(Number(e.target.value))}
              className="p-3 text-black bg-white font-black"
              placeholder="PRICE"
            />
            <select
              value={soundKind}
              onChange={(e) => setSoundKind(e.target.value as 'single' | 'pack')}
              className="p-3 text-black bg-white font-black"
            >
              <option value="single">SINGLE SOUND</option>
              <option value="pack">4-NOTE PACK</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {Array.from({ length: soundKind === 'pack' ? 4 : 1 }).map((_, i) => (
              <label key={i} className="bg-gray-800 border-2 border-cyan-400 p-4 text-center font-black cursor-pointer">
                {soundKind === 'pack' ? ['LEFT', 'DOWN', 'UP', 'RIGHT'][i] : 'ALL NOTES'}
                <input
                  type="file"
                  accept="audio/wav,audio/mpeg,.wav,.mp3"
                  className="hidden"
                  onChange={(e) => readSound(e.target.files?.[0], i)}
                />
                {soundFiles[i] && (
                  <>
                    <div className="text-green-400 text-xs mt-2">LOADED</div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        new Audio(soundFiles[i]!).play().catch(() => {});
                      }}
                      className="mt-2 bg-white text-black px-3 py-1"
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
            className="w-full bg-green-400 text-black p-4 font-black text-2xl mt-6 min-h-[54px]"
          >
            {soundBusy ? 'UPLOADING...' : 'PUBLISH HIT SOUND'}
          </button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-2xl font-black mb-3">CURRENT RHYTHM LIST</h2>
            {rhythm.map((id, i) => {
              const song = songs.find((x) => String(x.id) === String(id));
              return (
                <div key={`${id}_${i}`} className="flex items-center gap-2 bg-gray-900 border-l-4 border-yellow-400 p-3 mb-2">
                  <b className="w-8">#{i + 1}</b>
                  <span className="flex-1 truncate">{song?.title || id}</span>
                  <button onClick={() => move(i, -1)} className="px-2 py-1">▲</button>
                  <button onClick={() => move(i, 1)} className="px-2 py-1">▼</button>
                  <button onClick={() => saveRhythm(rhythm.filter((_, x) => x !== i))} className="text-red-400 px-2 py-1">
                    ✕
                  </button>
                </div>
              );
            })}
          </section>
          <section>
            <h2 className="text-2xl font-black mb-3">ADD TRACK</h2>
            <div className="max-h-[500px] overflow-y-auto">
              {songs.map((song) => (
                <button
                  key={song.id}
                  onClick={() => addTrack(song.id)}
                  className="w-full text-left p-3 mb-2 bg-gray-800 hover:bg-cyan-800"
                >
                  <b>{song.title}</b>
                  <small className="block">{song.artist}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
