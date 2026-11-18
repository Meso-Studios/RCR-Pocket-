import { MENU_GENRE_CONFIGS, SPOTIFY_PLAYLIST_TRACKS } from './constants';
import type { MenuGenre } from './types';

interface MikuHoldVoice {
  oscMain: OscillatorNode;
  oscSub: OscillatorNode;
  oscShimmer: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  shimmerGain: GainNode;
  startedAt: number;
}

class SoundGenerator {
  ctx: AudioContext | null = null;
  bufferCache = new Map<string, AudioBuffer>();
  activeMikuHolds = new Map<number, MikuHoldVoice>();

  init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playTone(freq: number, type: OscillatorType, duration: number, vol = 0.1) {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(Math.max(0.0001, vol), this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + Math.max(0.02, duration));
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + Math.max(0.02, duration));
    } catch {
      // Ignore audio errors
    }
  }

  playUI(type: 'confirm' | 'move' | 'back' = 'move') {
    if (type === 'confirm') {
      this.playTone(587.33, 'triangle', 0.09, 0.11);
      setTimeout(() => this.playTone(880, 'sine', 0.14, 0.12), 45);
    } else if (type === 'back') {
      this.playTone(360, 'sine', 0.1, 0.09);
    } else {
      this.playTone(520, 'sine', 0.055, 0.07);
    }
  }

  playHitSound(lane = 0, rating: 'SICK!' | 'GOOD' | 'BAD' | 'MISS' = 'SICK!') {
    const freqs = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.5, 1174.66];
    const baseFreq = freqs[lane % freqs.length] || 659.25;
    const mult = rating === 'SICK!' ? 1.25 : rating === 'GOOD' ? 1.0 : 0.8;
    this.playTone(baseFreq * mult, 'triangle', 0.075, 0.13);
  }

  playMissSound() {
    this.playTone(135, 'sawtooth', 0.18, 0.15);
  }

  playDemonSound() {
    this.playTone(92, 'sawtooth', 0.3, 0.24);
    setTimeout(() => this.playTone(68, 'square', 0.25, 0.2), 55);
  }

  /**
   * DJ Vinyl Record Spin-Down / Scratch Stop Sound Effect
   * Triggered automatically when the player loses (`health <= 0`).
   */
  playVinylStopSound(durationSec = 1.15) {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      sub.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + durationSec);

      sub.frequency.setValueAtTime(210, now);
      sub.frequency.exponentialRampToValueAtTime(18, now + durationSec);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1900, now);
      filter.frequency.exponentialRampToValueAtTime(75, now + durationSec);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      sub.start(now);
      osc.stop(now + durationSec);
      sub.stop(now + durationSec);
    } catch {
      // Ignore
    }
  }

  playHapticThump(
    kind: 'hit' | 'miss' | 'hold' | 'menu' = 'hit',
    intensity01 = 0.8
  ) {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const startFreq = kind === 'miss' ? 95 : kind === 'hold' ? 140 : 120;
      const endFreq = kind === 'miss' ? 36 : 48;
      const dur = kind === 'miss' ? 0.09 : 0.045;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
      gain.gain.setValueAtTime(Math.min(0.25, 0.14 * intensity01), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch {
      // Ignore
    }
  }

  /**
   * Hatsune Miku Project DIVA-style Hold Note Rising Synth Riser (for holds >= 1.0s):
   * Continuously glides pitch, harmonic shimmer, and filter cutoff upward as `progress01`
   * moves from 0.0 -> 1.0, controlled by the Hold Effect Volume slider (`holdEffectVolumePct`).
   */
  updateMikuHoldRiser(lane: number, progress01: number, holdEffectVolumePct = 80) {
    try {
      this.init();
      if (!this.ctx) return;
      const volNorm = Math.max(0, Math.min(1, holdEffectVolumePct <= 1 ? holdEffectVolumePct : holdEffectVolumePct / 100));
      if (volNorm <= 0.01) return;

      const p = Math.max(0, Math.min(1, progress01));
      const now = this.ctx.currentTime;
      const baseFreqs = [329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
      const rootFreq = baseFreqs[lane % baseFreqs.length] || 440;

      let voice = this.activeMikuHolds.get(lane);
      if (!voice) {
        const oscMain = this.ctx.createOscillator();
        const oscSub = this.ctx.createOscillator();
        const oscShimmer = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        const shimmerGain = this.ctx.createGain();

        oscMain.type = 'sawtooth';
        oscSub.type = 'triangle';
        oscShimmer.type = 'sine';

        filter.type = 'bandpass';
        filter.Q.setValueAtTime(3.8, now);

        gain.gain.setValueAtTime(0.001, now);
        shimmerGain.gain.setValueAtTime(0.001, now);

        oscMain.connect(filter);
        oscSub.connect(filter);
        filter.connect(gain);

        oscShimmer.connect(shimmerGain);
        shimmerGain.connect(gain);
        gain.connect(this.ctx.destination);

        oscMain.start(now);
        oscSub.start(now);
        oscShimmer.start(now);

        voice = {
          oscMain,
          oscSub,
          oscShimmer,
          filter,
          gain,
          shimmerGain,
          startedAt: now,
        };
        this.activeMikuHolds.set(lane, voice);
      }

      // Project DIVA style pitch glide: rises 1.5 octaves + fast vocal vibrato shimmer
      const pitchMultiplier = Math.pow(2, p * 1.45);
      const vibrato = 1 + Math.sin(now * 38) * 0.014 * (0.3 + p * 0.7);
      const targetMainFreq = rootFreq * pitchMultiplier * vibrato;
      const targetShimmerFreq = targetMainFreq * 2.0;

      voice.oscMain.frequency.setTargetAtTime(targetMainFreq, now, 0.025);
      voice.oscSub.frequency.setTargetAtTime(targetMainFreq * 0.5, now, 0.025);
      voice.oscShimmer.frequency.setTargetAtTime(targetShimmerFreq, now, 0.02);

      // Filter sweeps open from 650 Hz to 5200 Hz
      const cutoff = 650 + Math.pow(p, 1.35) * 4600;
      voice.filter.frequency.setTargetAtTime(cutoff, now, 0.03);

      // Amplitude swells as hold progresses toward completion
      const targetGain = (0.045 + Math.pow(p, 1.2) * 0.19) * volNorm;
      const targetShimmer = (0.02 + Math.pow(p, 1.5) * 0.14) * volNorm;
      voice.gain.gain.setTargetAtTime(targetGain, now, 0.03);
      voice.shimmerGain.gain.setTargetAtTime(targetShimmer, now, 0.03);
    } catch {
      // Ignore
    }
  }

  stopMikuHoldRiser(lane: number, completed = false, holdEffectVolumePct = 80) {
    const voice = this.activeMikuHolds.get(lane);
    if (voice && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
        voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
        setTimeout(() => {
          try {
            voice.oscMain.stop();
            voice.oscSub.stop();
            voice.oscShimmer.stop();
            voice.gain.disconnect();
          } catch {
            // Ignore
          }
        }, 80);
      } catch {
        // Ignore
      }
      this.activeMikuHolds.delete(lane);
    }

    if (completed) {
      this.playMikuHoldCompleteChime(lane, holdEffectVolumePct);
    }
  }

  stopAllMikuHoldRisers() {
    for (const lane of Array.from(this.activeMikuHolds.keys())) {
      this.stopMikuHoldRiser(lane, false);
    }
  }

  /**
   * Sparkling Project DIVA crystalline release chime at the end of a completed 1.0s+ hold note.
   */
  playMikuHoldCompleteChime(lane = 0, holdEffectVolumePct = 80) {
    try {
      this.init();
      if (!this.ctx) return;
      const volNorm = Math.max(0, Math.min(1, holdEffectVolumePct <= 1 ? holdEffectVolumePct : holdEffectVolumePct / 100));
      if (volNorm <= 0.01) return;

      const notes = [1046.5, 1318.5, 1567.98, 2093.0]; // High C6-E6-G6-C7 crystal arpeggio
      notes.forEach((freq, idx) => {
        setTimeout(() => {
          this.playTone(freq + (lane % 4) * 35, idx === 3 ? 'triangle' : 'sine', 0.16, 0.15 * volNorm);
        }, idx * 24);
      });
    } catch {
      // Ignore
    }
  }

  async preloadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!url) return null;
    if (this.bufferCache.has(url)) return this.bufferCache.get(url)!;
    try {
      this.init();
      if (!this.ctx) return null;
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr);
      this.bufferCache.set(url, buf);
      return buf;
    } catch {
      return null;
    }
  }

  playCachedBuffer(url: string, volume = 0.85): boolean {
    const buf = this.bufferCache.get(url);
    if (!buf || !this.ctx) return false;
    try {
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = buf;
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(0);
      return true;
    } catch {
      return false;
    }
  }

  startMenuMusic() {
    MenuMusicEngine.start();
  }

  stopMenuMusic() {
    MenuMusicEngine.stop();
  }
}

export const AudioEngine = new SoundGenerator();

class MenuMusicController {
  genre: MenuGenre = 'spotify';
  muted = false;
  playbackRate = 1.0;
  spotifyIndex = 0;
  startedAt = Date.now();
  stepTimer: ReturnType<typeof setInterval> | null = null;
  stepCounter = 0;

  start(genre?: MenuGenre, rate = 1.0) {
    if (genre) this.genre = genre;
    this.playbackRate = Math.max(0.25, Math.min(3.0, rate));
    if (typeof window === 'undefined') return;
    if (this.muted) {
      this.stop();
      return;
    }
    if (this.stepTimer) return;
    this.startedAt = Date.now();
    this.scheduleLoop();
  }

  private scheduleLoop() {
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    if (this.muted) return;
    const bpm =
      this.genre === 'spotify'
        ? this.getSpotifyTrack().bpm
        : MENU_GENRE_CONFIGS[this.genre]?.bpm || 150;
    const stepMs = Math.max(45, Math.round(60000 / (bpm * this.playbackRate * 4)));
    this.stepTimer = setInterval(() => {
      if (this.muted) return;
      const step = this.stepCounter++ % 16;
      const bassScale =
        this.genre === 'hardtekk'
          ? [55, 55, 65.4, 55, 73.4, 55, 61.7, 55]
          : this.genre === 'dubstep'
          ? [43.65, 43.65, 51.9, 46.25, 65.4, 58.27, 51.9, 43.65]
          : [65.4, 73.4, 82.4, 98.0, 87.3, 82.4, 73.4, 65.4];
      const leadScale = [261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 587.33, 659.25];
      if (step % 4 === 0) {
        // Kick drum
        AudioEngine.playTone(bassScale[(step / 4) % bassScale.length], 'sine', 0.11, 0.08);
      } else if (step % 2 === 1) {
        // Offbeat rave synth stab
        const freq = leadScale[(step + this.spotifyIndex * 2) % leadScale.length];
        AudioEngine.playTone(freq, this.genre === 'dubstep' ? 'sawtooth' : 'triangle', 0.07, 0.035);
      }
    }, stepMs);
  }

  stop() {
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
  }

  getCurrentTrackUrl(): string {
    if (this.genre === 'spotify') {
      const track = SPOTIFY_PLAYLIST_TRACKS[this.spotifyIndex % SPOTIFY_PLAYLIST_TRACKS.length];
      return track?.url || 'synth:spotify';
    }
    return MENU_GENRE_CONFIGS[this.genre]?.url || `synth:${this.genre}`;
  }

  setGenre(genre: MenuGenre) {
    this.genre = genre;
    this.stop();
    this.start(genre, this.playbackRate);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stop();
    } else {
      this.start(this.genre, this.playbackRate);
    }
  }

  setPlaybackRate(rate: number) {
    const next = Math.max(0.25, Math.min(3.0, rate));
    if (Math.abs(next - this.playbackRate) > 0.05) {
      this.playbackRate = next;
      if (this.stepTimer && !this.muted) {
        this.scheduleLoop();
      }
    }
  }

  setSpotifyTrackIndex(index: number) {
    this.spotifyIndex =
      ((index % SPOTIFY_PLAYLIST_TRACKS.length) + SPOTIFY_PLAYLIST_TRACKS.length) %
      SPOTIFY_PLAYLIST_TRACKS.length;
    if (this.genre === 'spotify' && !this.muted) {
      this.scheduleLoop();
    }
  }

  getSpotifyTrackIndex(): number {
    return this.spotifyIndex;
  }

  getSpotifyTrack() {
    return (
      SPOTIFY_PLAYLIST_TRACKS[this.spotifyIndex % SPOTIFY_PLAYLIST_TRACKS.length] ||
      SPOTIFY_PLAYLIST_TRACKS[0]
    );
  }

  getBeatState() {
    const bpm =
      this.genre === 'spotify'
        ? this.getSpotifyTrack().bpm
        : MENU_GENRE_CONFIGS[this.genre]?.bpm || 150;
    const nowSec = (Date.now() - this.startedAt) / 1000;
    const beatPeriod = 60 / Math.max(60, bpm * this.playbackRate);
    const beatProgress = (nowSec % beatPeriod) / beatPeriod;
    const kick = Math.pow(Math.max(0, 1 - beatProgress * 2.4), 2);
    const energy = 0.4 + kick * 0.6;
    const barIndex = Math.floor(nowSec / beatPeriod);
    const stepIndex = Math.floor((nowSec / beatPeriod) * 4);
    const spectrum = Array.from({ length: 24 }, (_, i) => {
      const wave = Math.sin(nowSec * 9 + i * 0.55) * 0.5 + 0.5;
      return Math.min(1, Math.max(0.08, kick * 0.55 + wave * 0.45));
    });
    return {
      genre: this.genre,
      trackIndex: this.spotifyIndex,
      kick,
      kickPulse: kick,
      pulse: kick,
      energy,
      bpm,
      barIndex,
      stepIndex,
      beatProgress,
      spectrum,
    };
  }
}

export const MenuMusicEngine = new MenuMusicController();

export const WaveformPulse = {
  attach(audioEl: HTMLAudioElement, selector: string): () => void {
    let rafId = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - started) / 1000;
      const t = audioEl && !audioEl.paused ? audioEl.currentTime : elapsed;
      const pulse = 1 + Math.max(0, Math.sin(t * Math.PI * 4.5)) * 0.045;
      if (typeof document !== 'undefined') {
        const nodes = document.querySelectorAll<HTMLElement>(selector);
        nodes.forEach((el) => {
          el.style.transform = `scale(${pulse.toFixed(4)})`;
        });
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  },
};
