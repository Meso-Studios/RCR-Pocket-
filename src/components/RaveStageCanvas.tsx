import React, { useEffect, useRef } from 'react';
import { MenuMusicEngine } from '../game/audio';
import { MENU_GENRE_CONFIGS } from '../game/constants';
import type { MenuGenre } from '../game/types';

interface RaveStageCanvasProps {
  genre?: MenuGenre;
  intensity?: number;
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

export const RaveStageCanvas: React.FC<RaveStageCanvasProps> = ({ genre = 'rave', intensity = 1 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const genreRef = useRef<MenuGenre>(genre);
  genreRef.current = genre;

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
      vx: ((i % 2 === 0 ? 1 : -1) * (0.00012 + (i % 5) * 0.00004)),
      vy: -(0.00045 + (i % 4) * 0.00018),
      size: 13 + (i % 4) * 5,
      dir: i % 4,
      colorIdx: i % ARROW_COLORS.length,
      phase: i * 0.7,
    }));

    const render = (now: number) => {
      const telemetry = MenuMusicEngine.getBeatState();
      const activeGenre = genreRef.current || telemetry.genre || 'rave';
      const cfg = MENU_GENRE_CONFIGS[activeGenre] || MENU_GENRE_CONFIGS.rave;
      const pulse = telemetry.pulse * intensity;
      const kick = telemetry.kickPulse * intensity;
      const bins = telemetry.spectrum;

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.42;

      // 1. Beat-reactive radial stage bloom behind logo & console tray
      const bloomRadius = Math.max(width, height) * (0.42 + kick * 0.14);
      const bloom = ctx.createRadialGradient(cx, cy, 10, cx, cy, bloomRadius);
      bloom.addColorStop(0, `${cfg.accent}${kick > 0.4 ? '55' : '38'}`);
      bloom.addColorStop(0.45, `${cfg.secondaryAccent}24`);
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
        const beamColor = i % 2 === 0 ? cfg.accent : cfg.secondaryAccent;

        const beamGrad = ctx.createLinearGradient(originX, 0, targetX, height * 0.95);
        beamGrad.addColorStop(0, beamColor);
        beamGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = beamGrad;
        ctx.globalAlpha = 0.08 + pulse * 0.16 + (i % 2 === telemetry.stepIndex % 2 ? kick * 0.12 : 0);
        ctx.beginPath();
        ctx.moveTo(originX - 4, 0);
        ctx.lineTo(originX + 4, 0);
        ctx.lineTo(targetX + 46 + kick * 28, height);
        ctx.lineTo(targetX - 46 - kick * 28, height);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 3. Perspective 3D Neon Rhythm Highway Grid along lower stage
      const horizonY = height * 0.54;
      const bottomY = height;
      ctx.save();
      ctx.strokeStyle = cfg.secondaryAccent;
      ctx.lineWidth = 1.5;

      const laneCount = 8;
      for (let i = -laneCount; i <= laneCount; i++) {
        const topSpread = i * (width * 0.025);
        const botSpread = i * (width * 0.11);
        ctx.globalAlpha = i === 0 ? 0.28 + kick * 0.25 : 0.12 + pulse * 0.12;
        ctx.beginPath();
        ctx.moveTo(cx + topSpread, horizonY);
        ctx.lineTo(cx + botSpread, bottomY);
        ctx.stroke();
      }

      // Scrolling horizontal beat bars coming toward camera
      const scrollPhase = ((now * (cfg.bpm / 140) * 0.0012) % 1 + 1) % 1;
      for (let r = 0; r < 8; r++) {
        const q = ((r + scrollPhase) / 8);
        const yPos = horizonY + (bottomY - horizonY) * (q * q);
        ctx.strokeStyle = r % 2 === 0 ? cfg.accent : cfg.secondaryAccent;
        ctx.globalAlpha = q * (0.16 + kick * 0.22);
        ctx.lineWidth = 1 + q * 2.2;
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(width, yPos);
        ctx.stroke();
      }
      ctx.restore();

      // 4. Center Bass Shockwave Rings behind Wordmark
      ctx.save();
      for (let r = 0; r < 2; r++) {
        const ringPhase = (((now * 0.0014 + r * 0.5) % 1) + 1) % 1;
        const rad = 70 + ringPhase * Math.min(width, height) * 0.42;
        ctx.strokeStyle = r === 0 ? cfg.accent : cfg.secondaryAccent;
        ctx.globalAlpha = (1 - ringPhase) * (0.22 + kick * 0.35);
        ctx.lineWidth = 2.5 + (1 - ringPhase) * 3;
        ctx.beginPath();
        ctx.arc(cx, height * 0.3, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // 5. Mirrored 16-Band Spectrum Visualizer Wings on Left & Right Edges
      ctx.save();
      const wingBins = 12;
      const barHMax = Math.min(130, height * 0.26);
      const baseWingY = height * 0.88;
      const barW = Math.max(5, Math.min(12, Math.floor(width * 0.008)));
      const gap = barW + 4;

      for (let i = 0; i < wingBins; i++) {
        const val = bins[i] ?? 0.25;
        const barH = Math.max(8, val * barHMax * (0.85 + kick * 0.35));
        const color = i % 3 === 0 ? cfg.accent : i % 3 === 1 ? cfg.secondaryAccent : '#ffe23b';

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.55 + val * 0.4;

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

      // 6. Floating Arcade Rhythm Arrows rising & pulsing to the beat
      ctx.save();
      const speedMult = 1 + kick * 1.4;
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
        const scale = 1 + kick * 0.28 + 0.1 * Math.sin(now * 0.005 + a.phase);
        const col = ARROW_COLORS[a.colorIdx];

        ctx.save();
        ctx.translate(px, py);
        if (a.dir === 0) ctx.rotate(-Math.PI / 2);
        if (a.dir === 1) ctx.rotate(Math.PI);
        if (a.dir === 3) ctx.rotate(Math.PI / 2);
        ctx.scale(scale, scale);

        ctx.globalAlpha = 0.28 + pulse * 0.26;
        ctx.fillStyle = col;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        traceMiniArrow(ctx, a.size);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

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
