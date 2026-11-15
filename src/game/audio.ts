// Web Audio API engine with mobile touch-unlock & pre-decoded hit-sound buffers for zero input audio latency

const decodedSoundCache = new Map<string, AudioBuffer>();
const decodingInFlight = new Map<string, Promise<AudioBuffer | null>>();

export const AudioEngine = {
  ctx: null as AudioContext | null,
  unlocked: false,

  init(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        this.ctx = new Ctx({ latencyHint: 'interactive' });
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.unlocked) {
      try {
        // Silent 1-sample buffer unlocks iOS/Android WebKit audio output synchronously inside user gesture
        const buf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
        this.unlocked = true;
      } catch {
        // ignore
      }
    }
    return this.ctx;
  },

  playTone(freq: number, type: OscillatorType = 'sine', duration = 0.1, vol = 0.1) {
    const ctx = this.ctx || this.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  },

  async preloadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!url) return null;
    if (decodedSoundCache.has(url)) return decodedSoundCache.get(url)!;
    if (decodingInFlight.has(url)) return decodingInFlight.get(url)!;
    const ctx = this.init();
    if (!ctx) return null;
    const job = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        decodedSoundCache.set(url, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        decodingInFlight.delete(url);
      }
    })();
    decodingInFlight.set(url, job);
    return job;
  },

  playCachedBuffer(url: string, vol = 0.7): boolean {
    const buf = decodedSoundCache.get(url);
    const ctx = this.ctx;
    if (!buf || !ctx) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
    return true;
  },

  playHitSound() {
    this.playTone(800, 'square', 0.05, 0.05);
  },

  playDemonSound() {
    this.playTone(150, 'sawtooth', 0.3, 0.1);
  },

  playUI(kind: 'move' | 'confirm' = 'move') {
    this.init();
    this.playTone(kind === 'confirm' ? 620 : 420, 'sine', 0.07, 0.045);
    setTimeout(() => this.playTone(kind === 'confirm' ? 930 : 520, 'triangle', 0.05, 0.025), 35);
  },

  playTactileThump(intensity01 = 0.75, freq = 140, durationMs = 28) {
    const ctx = this.ctx || this.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const dur = Math.max(0.018, Math.min(0.11, durationMs / 1000));
    const norm = Math.max(0.1, Math.min(1.2, intensity01));

    // Low-mid body thump (tuned above mobile micro-speaker ~120Hz cutoff so chassis physically vibrates)
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    const startFreq = Math.max(115, Math.min(260, freq * 2.1));
    const endFreq = Math.max(52, freq * 0.85);
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(startFreq, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    bodyGain.gain.setValueAtTime(Math.min(0.42, norm * 0.34), now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + dur);

    // Crisp 12ms tactile click transient for immediate finger-tap perception
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(Math.min(320, startFreq * 1.45), now);
    clickOsc.frequency.exponentialRampToValueAtTime(95, now + 0.014);
    clickGain.gain.setValueAtTime(Math.min(0.26, norm * 0.2), now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.016);
  },
};

export const WaveformPulse = {
  attach(audio: HTMLAudioElement, selector: string): () => void {
    let raf = 0;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let stream: MediaStream | null = null;
    let stopped = false;
    let smooth = 0;
    let decodedBuffer: AudioBuffer | null = null;
    let graphRunning = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let captureRetries = 0;
    let adaptiveFloor = 0.015;
    let adaptivePeak = 0.12;
    let previousRaw = 0;

    const reset = () =>
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.style.transform = 'scale(1)';
        el.style.filter = '';
      });

    const paint = (raw: number) => {
      raw = Math.max(0, raw);
      if (previousRaw === 0 && raw > 0) {
        adaptiveFloor = raw * 0.72;
        adaptivePeak = Math.max(raw * 1.18, adaptiveFloor + 0.018);
      } else {
        const floorRate = raw < adaptiveFloor ? 0.07 : 0.004;
        adaptiveFloor = adaptiveFloor * (1 - floorRate) + raw * floorRate;
        adaptivePeak = Math.max(raw, adaptiveFloor + 0.018, adaptivePeak * 0.975);
      }
      const normalized = Math.max(0, Math.min(1, (raw - adaptiveFloor) / (adaptivePeak - adaptiveFloor)));
      const onset = Math.max(0, raw - previousRaw);
      previousRaw = raw;
      const target = Math.min(1, normalized * 0.68 + onset * 9);
      smooth = target > smooth ? smooth * 0.38 + target * 0.62 : smooth * 0.84 + target * 0.16;
      if (raw < 0.003) smooth *= 0.75;
      const scale = 1 + smooth * 0.19;
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.style.transform = `scale(${scale.toFixed(4)})`;
        el.style.filter = `brightness(${1 + smooth * 0.26}) saturate(${1 + smooth * 0.48}) drop-shadow(0 0 ${6 + smooth * 34}px #ffd21b)`;
      });
    };

    const tickGraph = () => {
      if (stopped || !analyser) return;
      const wave = new Uint8Array(analyser.fftSize);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(wave);
      analyser.getByteFrequencyData(freq);
      let sum = 0;
      for (let i = 0; i < wave.length; i++) {
        const v = (wave[i] - 128) / 128;
        sum += v * v;
      }
      let bass = 0;
      const bins = Math.min(24, freq.length);
      for (let i = 1; i < bins; i++) bass += freq[i] / 255;
      bass /= Math.max(1, bins - 1);
      paint(Math.max(Math.sqrt(sum / wave.length), bass * 0.42));
      raf = requestAnimationFrame(tickGraph);
    };

    const tickBuffer = () => {
      if (stopped) return;
      if (decodedBuffer && decodedBuffer.length) {
        const ch = decodedBuffer.getChannelData(0);
        const at = Math.max(0, Math.floor((audio.currentTime % decodedBuffer.duration) * decodedBuffer.sampleRate));
        const count = Math.min(4096, ch.length - at);
        let sum = 0;
        for (let i = 0; i < count; i++) {
          const v = ch[at + i];
          sum += v * v;
        }
        paint(count ? Math.sqrt(sum / count) : 0);
      }
      raf = requestAnimationFrame(tickBuffer);
    };

    const startCapture = () => {
      if (stopped || graphRunning) return false;
      try {
        stream = (audio as any).captureStream?.() || (audio as any).mozCaptureStream?.();
        if (!stream || stream.getAudioTracks().length === 0) return false;
        const ctx = AudioEngine.init();
        if (!ctx) return false;
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.62;
        source.connect(analyser);
        graphRunning = true;
        tickGraph();
        return true;
      } catch (err) {
        console.warn('Live capture analyser unavailable', err);
        return false;
      }
    };

    const startDecodedFallback = async () => {
      if (stopped || graphRunning || decodedBuffer) return;
      try {
        const url = audio.currentSrc || audio.src;
        if (!url) return;
        const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
        if (!response.ok) throw new Error(`analysis HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const ctx = AudioEngine.init();
        if (!ctx) return;
        decodedBuffer = await ctx.decodeAudioData(bytes.slice(0));
        if (!stopped && !graphRunning) tickBuffer();
      } catch (err) {
        console.warn('Decoded waveform unavailable; audio playback is unaffected.', err);
      }
    };

    const onPlaying = () => {
      if (startCapture()) return;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (captureRetries++ < 8) fallbackTimer = setTimeout(onPlaying, 180);
      else fallbackTimer = setTimeout(startDecodedFallback, 50);
    };

    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('loadeddata', onPlaying);
    audio.addEventListener('timeupdate', onPlaying, { once: true });

    if (!audio.paused) setTimeout(onPlaying, 0);
    else fallbackTimer = setTimeout(startDecodedFallback, 1200);

    return () => {
      stopped = true;
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('loadeddata', onPlaying);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (raf) cancelAnimationFrame(raf);
      reset();
      try {
        source?.disconnect();
      } catch {
        // ignore
      }
    };
  },
};
