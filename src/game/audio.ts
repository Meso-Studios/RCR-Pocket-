// Web Audio API engine with mobile touch-unlock, pre-decoded hit-sound buffers, tactile haptics synth,
// and real-time procedural Rave / Dubstep / Hardtekk synthesizer with 60fps spectrum + beat telemetry.

import type { MenuGenre } from './types';

const decodedSoundCache = new Map<string, AudioBuffer>();
const decodingInFlight = new Map<string, Promise<AudioBuffer | null>>();

let sharedNoiseBuffer: AudioBuffer | null = null;
let sharedDistortionCurve: Float32Array<ArrayBuffer> | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (sharedNoiseBuffer && sharedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return sharedNoiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  sharedNoiseBuffer = buffer;
  return buffer;
}

function getDistortionCurve(amount = 42): Float32Array<ArrayBuffer> {
  if (sharedDistortionCurve) return sharedDistortionCurve;
  const samples = 1024;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  sharedDistortionCurve = curve;
  return curve;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

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
    if (!url || url.startsWith('synth:')) return null;
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
    const ctx = this.ctx || this.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    // Punchy arcade synth pluck + crisp transient click
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.045);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.052);
  },

  playDemonSound() {
    this.playTone(150, 'sawtooth', 0.3, 0.14);
    setTimeout(() => this.playTone(92, 'sawtooth', 0.28, 0.12), 45);
  },

  playUI(kind: 'move' | 'confirm' = 'move') {
    this.init();
    this.playTone(kind === 'confirm' ? 660 : 440, 'sine', 0.065, 0.05);
    setTimeout(() => this.playTone(kind === 'confirm' ? 990 : 560, 'triangle', 0.05, 0.032), 28);
  },

  playTactileThump(intensity01 = 0.75, freq = 140, durationMs = 28) {
    const ctx = this.ctx || this.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const dur = Math.max(0.02, Math.min(0.12, durationMs / 1000));
    const norm = Math.max(0.12, Math.min(1.35, intensity01));

    // 1. Sub-bass & low-mid resonant thump (tuned so phone/tablet speakers & headphones physically kick)
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    const startFreq = Math.max(120, Math.min(280, freq * 2.15));
    const endFreq = Math.max(48, freq * 0.72);
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(startFreq, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    bodyGain.gain.setValueAtTime(Math.min(0.52, norm * 0.42), now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + dur + 0.005);

    // 2. Crisp 11ms Taptic-style skin transient click for instantaneous finger-tap feedback
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(Math.min(420, startFreq * 1.65), now);
    clickOsc.frequency.exponentialRampToValueAtTime(90, now + 0.012);
    clickGain.gain.setValueAtTime(Math.min(0.32, norm * 0.25), now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.013);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.015);
  },
};

export interface BeatTelemetry {
  playing: boolean;
  genre: MenuGenre;
  bpm: number;
  pulse: number;
  kickPulse: number;
  snarePulse: number;
  stepIndex: number;
  barIndex: number;
  spectrum: number[];
}

const GENRE_BPM: Record<MenuGenre, number> = {
  rave: 155,
  dubstep: 140,
  hardtekk: 180,
};

// Euphoric Hyper-Rave 16-step lead patterns (F minor / C# major energy)
const RAVE_ARP_MIDI = [65, 68, 72, 77, 75, 72, 68, 72, 63, 67, 70, 75, 73, 70, 67, 72];
const RAVE_BASS_MIDI = [41, 41, 41, 41, 37, 37, 37, 37, 39, 39, 39, 39, 44, 44, 43, 43];

// Dubstep 16-step wobble LFO rates & bass notes
const DUBSTEP_BASS_MIDI = [38, 38, 38, 41, 38, 38, 46, 45, 38, 38, 38, 41, 34, 34, 36, 37];
const DUBSTEP_WOBBLE_HZ = [3, 6, 6, 12, 4, 8, 12, 6, 3, 6, 8, 12, 16, 16, 8, 4];

// Hardtekk 180 BPM Schranz industrial stabs & offbeat bass
const HARDTEKK_BASS_MIDI = [36, 48, 36, 48, 36, 48, 36, 51, 36, 48, 36, 48, 39, 51, 38, 50];
const HARDTEKK_STAB_MIDI = [60, 0, 0, 63, 0, 0, 60, 0, 58, 0, 0, 62, 0, 60, 0, 67];

class ProceduralSynthEngine {
  private genre: MenuGenre = 'rave';
  private playing = false;
  private muted = false;
  private volume = 0.34;
  private PlaybackRate = 1;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqBins: Uint8Array<ArrayBuffer> | null = null;
  private nextStepTime = 0;
  private currentStep = 0;
  private lastKickAt = 0;
  private lastSnareAt = 0;
  private spectrumOut: number[] = new Array(16).fill(0);

  private ensureGraph(): AudioContext | null {
    const ctx = AudioEngine.init();
    if (!ctx) return null;
    if (!this.masterGain || !this.analyser) {
      this.masterGain = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.65;
      this.freqBins = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.masterGain.gain.setValueAtTime(this.muted ? 0.0001 : this.volume, ctx.currentTime);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    }
    return ctx;
  }

  start(genre?: MenuGenre, rate = 1) {
    if (genre) this.genre = genre;
    this.PlaybackRate = Math.max(0.5, Math.min(2.5, rate));
    const ctx = this.ensureGraph();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0.0001 : this.volume, ctx.currentTime, 0.03);
    }
    if (this.playing) return;
    this.playing = true;
    this.currentStep = 0;
    this.nextStepTime = ctx.currentTime + 0.02;
    this.schedulerTick();
    this.timerId = setInterval(() => this.schedulerTick(), 25);
  }

  stop() {
    this.playing = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.masterGain && AudioEngine.ctx) {
      try {
        this.masterGain.gain.setTargetAtTime(0.0001, AudioEngine.ctx.currentTime, 0.025);
      } catch {
        // ignore
      }
    }
  }

  setGenre(genre: MenuGenre) {
    if (this.genre === genre && this.playing) return;
    this.genre = genre;
    if (this.playing && AudioEngine.ctx) {
      this.currentStep = 0;
      this.nextStepTime = AudioEngine.ctx.currentTime + 0.015;
    }
  }

  getGenre(): MenuGenre {
    return this.genre;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && AudioEngine.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0.0001 : this.volume, AudioEngine.ctx.currentTime, 0.025);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && AudioEngine.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, AudioEngine.ctx.currentTime, 0.03);
    }
  }

  setPlaybackRate(rate: number) {
    this.PlaybackRate = Math.max(0.5, Math.min(2.5, rate));
  }

  private getStepDurationSec(): number {
    const bpm = GENRE_BPM[this.genre] * this.PlaybackRate;
    return 60 / bpm / 4; // 16th note
  }

  private schedulerTick() {
    const ctx = AudioEngine.ctx;
    if (!this.playing || !ctx || !this.masterGain) return;
    if (ctx.state === 'suspended') return;

    const lookahead = 0.11;
    // Guard against huge catch-up bursts after backgrounding tab
    if (this.nextStepTime < ctx.currentTime - 0.25) {
      this.nextStepTime = ctx.currentTime + 0.01;
    }

    while (this.nextStepTime < ctx.currentTime + lookahead) {
      this.scheduleStep(ctx, this.masterGain, this.currentStep, this.nextStepTime);
      this.nextStepTime += this.getStepDurationSec();
      this.currentStep = (this.currentStep + 1) % 64;
    }
  }

  private scheduleStep(ctx: AudioContext, dest: AudioNode, step64: number, time: number) {
    const step16 = step64 % 16;
    const stepDur = this.getStepDurationSec();
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);

    if (this.genre === 'rave') {
      // 4-on-the-floor punchy 909 rave kick + end-of-phrase double kick
      if (step16 % 4 === 0 || (step64 >= 60 && step16 % 2 === 1)) {
        this.triggerRaveKick(ctx, dest, time, 0.72);
        setTimeout(() => {
          this.lastKickAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        }, delayMs);
      }
      // Clap/Snare on beats 2 & 4 (steps 4 & 12)
      if (step16 === 4 || step16 === 12) {
        this.triggerSnare(ctx, dest, time, 0.36, 0.14);
        setTimeout(() => {
          this.lastSnareAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        }, delayMs);
      }
      // Crisp 909 open hi-hat on offbeats (steps 2, 6, 10, 14) + closed 16th hats
      this.triggerHiHat(ctx, dest, time, step16 % 4 === 2 ? 0.24 : 0.09, step16 % 4 === 2 ? 0.11 : 0.035);

      // Driving offbeat rave sub-bass
      if (step16 % 2 === 1 || step16 % 4 === 2) {
        const bassNote = RAVE_BASS_MIDI[step16] + (step64 >= 32 ? 2 : 0);
        this.triggerBassPluck(ctx, dest, time, midiToFreq(bassNote), stepDur * 0.9, 0.34);
      }

      // Euphoric detuned supersaw rave lead arpeggio
      const leadNote = RAVE_ARP_MIDI[step16] + (step64 >= 48 ? 5 : step64 >= 32 ? 3 : 0);
      this.triggerSupersawLead(ctx, dest, time, midiToFreq(leadNote), stepDur * 0.88, 0.18);
    } else if (this.genre === 'dubstep') {
      // Heavy half-time Dubstep kick on step 0 (and syncopated step 10)
      if (step16 === 0 || step16 === 10 || (step64 % 32 === 22)) {
        this.triggerRaveKick(ctx, dest, time, 0.85, 165, 38);
        setTimeout(() => {
          this.lastKickAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        }, delayMs);
      }
      // Massive Dubstep half-time snare on beat 3 (step 8)
      if (step16 === 8 || (step64 % 32 === 30)) {
        this.triggerSnare(ctx, dest, time, 0.62, 0.24);
        setTimeout(() => {
          this.lastSnareAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
          this.lastKickAt = this.lastSnareAt;
        }, delayMs);
      }
      // Metallic dubstep hats
      if (step16 % 2 === 0 || step16 === 7 || step16 === 15) {
        this.triggerHiHat(ctx, dest, time, step16 % 4 === 2 ? 0.2 : 0.11, 0.05);
      }
      // LFO-modulated Wobble Bass Growl on every 8th/16th slot
      if (step16 % 2 === 0 || step16 === 3 || step16 === 11 || step16 === 15) {
        const bassMidi = DUBSTEP_BASS_MIDI[step16];
        const lfoHz = DUBSTEP_WOBBLE_HZ[step16];
        this.triggerWobbleBass(ctx, dest, time, midiToFreq(bassMidi), stepDur * 1.85, lfoHz, 0.42);
      }
    } else {
      // HARDTEKK 180 BPM: Relentless distorted Schranz four-on-the-floor kick + pounding offbeat Tekk bass
      if (step16 % 4 === 0 || (step64 % 32 >= 28 && step16 % 2 === 0)) {
        this.triggerHardtekkKick(ctx, dest, time, stepDur * 1.9, 0.78);
        setTimeout(() => {
          this.lastKickAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        }, delayMs);
      }
      // Offbeat Schranz Tekk bass bounce
      if (step16 % 4 === 2) {
        const bassMidi = HARDTEKK_BASS_MIDI[step16];
        this.triggerBassPluck(ctx, dest, time, midiToFreq(bassMidi), stepDur * 1.35, 0.44, 'sawtooth');
      }
      // Industrial metallic Ride / Hat on offbeats
      if (step16 % 2 === 0) {
        this.triggerHiHat(ctx, dest, time, step16 % 4 === 2 ? 0.26 : 0.12, step16 % 4 === 2 ? 0.09 : 0.03);
      }
      // Industrial clap on 4 and 12
      if (step16 === 4 || step16 === 12) {
        this.triggerSnare(ctx, dest, time, 0.35, 0.11);
        setTimeout(() => {
          this.lastSnareAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        }, delayMs);
      }
      // Dark rave stabs
      const stabMidi = HARDTEKK_STAB_MIDI[step16];
      if (stabMidi > 0) {
        this.triggerHardtekkStab(ctx, dest, time, midiToFreq(stabMidi), stepDur * 1.4, 0.22);
      }
    }
    void nowPerf;
  }

  private triggerRaveKick(ctx: AudioContext, dest: AudioNode, time: number, level = 0.7, startF = 185, endF = 44) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startF, time);
    osc.frequency.exponentialRampToValueAtTime(endF, time + 0.16);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.21);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.22);

    // Beater click
    const click = ctx.createOscillator();
    const cGain = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(720, time);
    click.frequency.exponentialRampToValueAtTime(90, time + 0.018);
    cGain.gain.setValueAtTime(level * 0.4, time);
    cGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    click.connect(cGain);
    cGain.connect(dest);
    click.start(time);
    click.stop(time + 0.022);
  }

  private triggerHardtekkKick(ctx: AudioContext, dest: AudioNode, time: number, dur: number, level = 0.78) {
    const osc = ctx.createOscillator();
    const shaper = ctx.createWaveShaper();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, time);
    osc.frequency.exponentialRampToValueAtTime(62, time + 0.065);
    osc.frequency.exponentialRampToValueAtTime(42, time + dur);

    shaper.curve = getDistortionCurve(55);
    shaper.oversample = '2x';

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(240, time + dur);

    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(shaper);
    shaper.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  private triggerSnare(ctx: AudioContext, dest: AudioNode, time: number, level = 0.4, dur = 0.16) {
    // Noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(650, time);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(level, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(dest);
    noise.start(time);
    noise.stop(time + dur + 0.01);

    // Snare body tone
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, time);
    osc.frequency.exponentialRampToValueAtTime(115, time + 0.08);
    oGain.gain.setValueAtTime(level * 0.7, time);
    oGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    osc.connect(oGain);
    oGain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.095);
  }

  private triggerHiHat(ctx: AudioContext, dest: AudioNode, time: number, level = 0.15, dur = 0.05) {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6800, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(time);
    noise.stop(time + dur + 0.005);
  }

  private triggerBassPluck(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    freq: number,
    dur: number,
    level = 0.32,
    type: OscillatorType = 'sawtooth'
  ) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(5.5, time);
    filter.frequency.setValueAtTime(freq * 7, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.4, time + dur);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  private triggerSupersawLead(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    freq: number,
    dur: number,
    level = 0.18
  ) {
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(3.2, time);
    filter.frequency.setValueAtTime(4200, time);
    filter.frequency.exponentialRampToValueAtTime(1400, time + dur);

    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    filter.connect(gain);
    gain.connect(dest);

    const detunes = [-14, 0, 14];
    for (let i = 0; i < detunes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(detunes[i], time);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.01);
    }
  }

  private triggerWobbleBass(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    freq: number,
    dur: number,
    lfoHz: number,
    level = 0.42
  ) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const shaper = ctx.createWaveShaper();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(freq * 2, time);
    osc2.detune.setValueAtTime(9, time);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(9.5, time);
    filter.frequency.setValueAtTime(520, time);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(lfoHz, time);
    lfoGain.gain.setValueAtTime(420, time);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    shaper.curve = getDistortionCurve(24);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(shaper);
    shaper.connect(gain);
    gain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    lfo.start(time);
    osc1.stop(time + dur + 0.01);
    osc2.stop(time + dur + 0.01);
    lfo.stop(time + dur + 0.01);
  }

  private triggerHardtekkStab(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    freq: number,
    dur: number,
    level = 0.22
  ) {
    // Minor rave chord stab (root + minor 3rd + 5th)
    const intervals = [1, Math.pow(2, 3 / 12), Math.pow(2, 7 / 12)];
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.4, time);
    filter.frequency.setValueAtTime(1900, time);
    filter.frequency.exponentialRampToValueAtTime(650, time + dur);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    filter.connect(gain);
    gain.connect(dest);

    for (let i = 0; i < intervals.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * intervals[i], time);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.01);
    }
  }

  getBeatState(): BeatTelemetry {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const bpm = GENRE_BPM[this.genre] * this.PlaybackRate;
    const beatMs = 60000 / bpm;
    const phase = (now % beatMs) / beatMs;
    const mathBeatPulse = Math.pow(Math.max(0, 1 - phase * 1.65), 2);

    const kickAge = now - this.lastKickAt;
    const snareAge = now - this.lastSnareAt;
    const kickPulse = kickAge >= 0 && kickAge < 220 ? Math.pow(1 - kickAge / 220, 1.6) : mathBeatPulse * 0.65;
    const snarePulse = snareAge >= 0 && snareAge < 200 ? Math.pow(1 - snareAge / 200, 1.5) : 0;

    let energySum = 0;
    if (this.playing && !this.muted && this.analyser && this.freqBins) {
      this.analyser.getByteFrequencyData(this.freqBins);
      for (let i = 0; i < 16; i++) {
        const idx = Math.min(this.freqBins.length - 1, i * 2 + 1);
        const val = this.freqBins[idx] / 255;
        this.spectrumOut[i] = this.spectrumOut[i] * 0.35 + val * 0.65;
        energySum += this.spectrumOut[i];
      }
    } else {
      // Fallback procedural visualizer wave when muted or before audio unlock
      for (let i = 0; i < 16; i++) {
        const wave =
          0.18 +
          0.42 * mathBeatPulse * Math.max(0.15, 1 - i / 18) +
          0.2 * Math.abs(Math.sin(now * 0.006 + i * 0.55));
        this.spectrumOut[i] = wave;
        energySum += wave;
      }
    }

    const avgEnergy = energySum / 16;
    const pulse = Math.min(1, Math.max(kickPulse * 0.85, snarePulse * 0.75, avgEnergy * 0.9, mathBeatPulse * 0.75));

    return {
      playing: this.playing,
      genre: this.genre,
      bpm: Math.round(bpm),
      pulse,
      kickPulse,
      snarePulse,
      stepIndex: this.currentStep % 16,
      barIndex: Math.floor(this.currentStep / 16),
      spectrum: this.spectrumOut,
    };
  }
}

export const MenuMusicEngine = new ProceduralSynthEngine();

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
        if (!url || url.startsWith('synth:')) return;
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
