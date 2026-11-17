import React, { useEffect, useRef } from 'react';
import { MenuMusicEngine } from '../game/audio';
import { MENU_GENRE_CONFIGS } from '../game/constants';
import type { MenuGenre } from '../game/types';

interface RaveStageCanvasProps {
  genre?: MenuGenre;
  intensity?: number;
  showFloatingNotes?: boolean;
}

interface FloatingArrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  dir: number;
  colorIdx: number;
  phase: number;
}

const ARROW_COLORS = ['#ff2e88', '#36e2ff', '#32ef74', '#ffe23b', '#a855f7'];

const traceMiniArrow = (ctx: CanvasRenderingContext2D, r: number) => {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.92, -r * 0.05);
  ctx.lineTo(r * 0.42, -r * 0.05);
  ctx.lineTo(r * 0.42, r * 0.92);
  ctx.lineTo(-r * 0.42, r * 0.92);
  ctx.lineTo(-r * 0.42, -r * 0.05);
  ctx.lineTo(-r * 0.92, -r * 0.05);
  ctx.closePath();
};

export const RaveStageCanvas: React.FC<RaveStageCanvasProps> = ({
  genre = 'spotify',
  intensity = 1,
  showFloatingNotes = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const genreRef = useRef<MenuGenre>(genre);
  const showNotesRef = useRef<boolean>(showFloatingNotes);
  genreRef.current = genre;
  showNotesRef.current = showFloatingNotes;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let width = (canvas.width = window.innerWidth || 1280);
    let height = (canvas.height = window.innerHeight || 720);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth || 1280;
      height = canvas.height = window.innerHeight || 720;
    };
    window.addEventListener('resize', onResize);

    // Pre-allocated floating rhythm arrows (zero GC in loop)
    const arrows: FloatingArrow[] = Array.from({ length: 18 }, (_, i) => ({
      x: ((i * 197) % 100) / 100,
      y: ((i * 131) % 100) / 100,
      vx: (i % 2 === 0 ? 1 : -1) * (0.00012 + (i % 5) * 0.00004),
      vy: -(0.00045 + (i % 4) * 0.00018),
      size: 13 + (i % 4) * 5,
      dir: i % 4,
      colorIdx: i % ARROW_COLORS.length,
      phase: i * 0.7,
    }));

    const render = (now: number) => {
      const telemetry = MenuMusicEngine.getBeatState();
      const activeGenre = genreRef.current || telemetry.genre || 'spotify';
      const baseCfg = MENU_GENRE_CONFIGS[activeGenre] || MENU_GENRE_CONFIGS.spotify;
      const spTrack = MenuMusicEngine.getSpotifyTrack();
      const accent = activeGenre === 'spotify' ? spTrack.accent : baseCfg.accent;
      const secondaryAccent = activeGenre === 'spotify' ? spTrack.secondaryAccent : baseCfg.secondaryAccent;
      const activeBpm = activeGenre === 'spotify' ? spTrack.bpm : baseCfg.bpm;

      const pulse = telemetry.pulse * intensity;
      const kick = telemetry.kickPulse * intensity;
      const bins = telemetry.spectrum;

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.42;

      // 1. Beat-reactive radial stage bloom behind logo & console tray
      const bloomRadius = Math.max(width, height) * (0.44 + kick * 0.16);
      const bloom = ctx.createRadialGradient(cx, cy, 10, cx, cy, bloomRadius);
      bloom.addColorStop(0, `${accent}${kick > 0.38 ? '66' : '44'}`);
      bloom.addColorStop(0.45, `${secondaryAccent}28`);
      bloom.addColorStop(1, 'rgba(6, 4, 16, 0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, width, height);

      // 2. Sweeping Rave Stage Laser Beams from top truss
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const numLasers = 6;
      for (let i = 0; i < numLasers; i++) {
        const originX = width * (0.12 + (i / (numLasers - 1)) * 0.76);
        const sway = Math.sin(now * 0.0018 + i * 1.15) * (width * 0.18);
        const targetX = cx + (i - 2.5) * (width * 0.14) + sway;
        const beamColor = i % 2 === 0 ? accent : secondaryAccent;

        const beamGrad = ctx.createLinearGradient(originX, 0, targetX, height * 0.95);
        beamGrad.addColorStop(0, beamColor);
        beamGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = beamGrad;
        ctx.globalAlpha = 0.08 + pulse * 0.17 + (i % 2 === telemetry.stepIndex % 2 ? kick * 0.14 : 0);
        ctx.beginPath();
        ctx.moveTo(originX - 4, 0);
        ctx.lineTo(originX + 4, 0);
        ctx.lineTo(targetX + 48 + kick * 30, height);
        ctx.lineTo(targetX - 48 - kick * 30, height);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 3. Perspective 3D Neon Rhythm Highway Grid along lower stage
      const horizonY = height * 0.54;
      const bottomY = height;
      ctx.save();
      ctx.strokeStyle = secondaryAccent;
      ctx.lineWidth = 1.6;

      const laneCount = 8;
      for (let i = -laneCount; i <= laneCount; i++) {
        const topSpread = i * (width * 0.025);
        const botSpread = i * (width * 0.11);
        ctx.globalAlpha = i === 0 ? 0.3 + kick * 0.28 : 0.13 + pulse * 0.14;
        ctx.beginPath();
        ctx.moveTo(cx + topSpread, horizonY);
        ctx.lineTo(cx + botSpread, bottomY);
        ctx.stroke();
      }

      // Scrolling horizontal beat bars coming toward camera
      const scrollPhase = (((now * (activeBpm / 140) * 0.0013) % 1) + 1) % 1;
      for (let r = 0; r < 8; r++) {
        const q = (r + scrollPhase) / 8;
        const yPos = horizonY + (bottomY - horizonY) * (q * q);
        ctx.strokeStyle = r % 2 === 0 ? accent : secondaryAccent;
        ctx.globalAlpha = q * (0.18 + kick * 0.24);
        ctx.lineWidth = 1.1 + q * 2.4;
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(width, yPos);
        ctx.stroke();
      }
      ctx.restore();

      // 4. osu!-style Center Beat-Pulse Ring & Radial Spectrum Spokes behind Hero Wordmark
      const ringCenterY = height * 0.28;
      const baseRingR = Math.min(width, height) * (0.14 + kick * 0.032);
      ctx.save();
      for (let r = 0; r < 2; r++) {
        const ringPhase = (((now * 0.0015 + r * 0.5) % 1) + 1) % 1;
        const rad = baseRingR + ringPhase * Math.min(width, height) * 0.34;
        ctx.strokeStyle = r === 0 ? accent : secondaryAccent;
        ctx.globalAlpha = (1 - ringPhase) * (0.26 + kick * 0.38);
        ctx.lineWidth = 2.5 + (1 - ringPhase) * 3.2;
        ctx.beginPath();
        ctx.arc(cx, ringCenterY, rad, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Radial Equalizer Spokes around the osu! emblem ring
      const spokes = 32;
      for (let s = 0; s < spokes; s++) {
        const angle = (s / spokes) * Math.PI * 2 + now * 0.0005;
        const binVal = bins[s % 16] ?? 0.3;
        const innerR = baseRingR * 0.92;
        const outerR = innerR + 10 + binVal * (28 + kick * 26);
        ctx.strokeStyle = s % 2 === 0 ? accent : secondaryAccent;
        ctx.globalAlpha = 0.28 + binVal * 0.45;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * innerR, ringCenterY + Math.sin(angle) * innerR);
        ctx.lineTo(cx + Math.cos(angle) * outerR, ringCenterY + Math.sin(angle) * outerR);
        ctx.stroke();
      }
      ctx.restore();

      // 5. Mirrored 16-Band Spectrum Visualizer Wings on Left & Right Edges
      ctx.save();
      const wingBins = 12;
      const barHMax = Math.min(136, height * 0.27);
      const baseWingY = height * 0.89;
      const barW = Math.max(5, Math.min(12, Math.floor(width * 0.008)));
      const gap = barW + 4;

      for (let i = 0; i < wingBins; i++) {
        const val = bins[i] ?? 0.25;
        const barH = Math.max(8, val * barHMax * (0.85 + kick * 0.38));
        const color = i % 3 === 0 ? accent : i % 3 === 1 ? secondaryAccent : '#ffe23b';

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.58 + val * 0.4;

        // Left Wing
        const lx = 18 + i * gap;
        ctx.fillRect(lx, baseWingY - barH, barW, barH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(lx, baseWingY - barH - 4, barW, 2.5);

        // Right Wing
        ctx.fillStyle = color;
        const rx = width - 18 - (i + 1) * gap;
        ctx.fillRect(rx, baseWingY - barH, barW, barH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rx, baseWingY - barH - 4, barW, 2.5);
      }
      ctx.restore();

      // 6. Optional Floating Arcade Rhythm Notes rising & pulsing to the beat
      if (showNotesRef.current) {
        ctx.save();
        const speedMult = 1 + kick * 1.45;
        for (let i = 0; i < arrows.length; i++) {
          const a = arrows[i];
          a.x += a.vx * speedMult;
          a.y += a.vy * speedMult;
          if (a.y < -0.08) {
            a.y = 1.06;
            a.x = ((a.x * 1.37 + 0.19) % 0.92) + 0.04;
          }
          if (a.x < 0.02) a.x = 0.96;
          if (a.x > 0.98) a.x = 0.04;

          const px = a.x * width;
          const py = a.y * height;
          const scale = 1 + kick * 0.3 + 0.1 * Math.sin(now * 0.005 + a.phase);
          const col = ARROW_COLORS[a.colorIdx];

          ctx.save();
          ctx.translate(px, py);
          if (a.dir === 0) ctx.rotate(-Math.PI / 2);
          if (a.dir === 1) ctx.rotate(Math.PI);
          if (a.dir === 3) ctx.rotate(Math.PI / 2);
          ctx.scale(scale, scale);

          ctx.globalAlpha = 0.3 + pulse * 0.28;
          ctx.fillStyle = col;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          traceMiniArrow(ctx, a.size);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
};
