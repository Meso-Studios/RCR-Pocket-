import type { NoteProduct, NoteType, SkinShape } from './types';

const NOTE_IMAGE_CACHE: Record<string, HTMLImageElement> = {};
const SPRITE_CACHE = new Map<string, { canvas: HTMLCanvasElement; pad: number; size: number }>();

const traceArrowPath = (ctx: CanvasRenderingContext2D, r: number) => {
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.98);
  ctx.lineTo(r * 0.96, -r * 0.04);
  ctx.lineTo(r * 0.44, -r * 0.04);
  ctx.lineTo(r * 0.44, r * 0.94);
  ctx.lineTo(-r * 0.44, r * 0.94);
  ctx.lineTo(-r * 0.44, -r * 0.04);
  ctx.lineTo(-r * 0.96, -r * 0.04);
  ctx.closePath();
};

const getOrCreateNoteSprite = (
  size: number,
  direction: number,
  color: string | null,
  isPressed: boolean,
  shape: SkinShape,
  type: NoteType,
  product: NoteProduct | null
) => {
  const roundedSize = Math.round(size);
  const productKey = product
    ? `${product.id || ''}_${product.fill || ''}_${product.outline || ''}_${product.text || ''}_${product.sticker || ''}_${product.stickerScaleX || 1}_${product.stickerScaleY || 1}`
    : 'none';
  const stickerImg = product?.sticker ? NOTE_IMAGE_CACHE[product.sticker] : null;
  const stickerReady = stickerImg ? (stickerImg.complete && stickerImg.naturalWidth > 0 ? '1' : '0') : 'n';
  const key = `${roundedSize}_${direction}_${color || ''}_${isPressed ? 1 : 0}_${shape}_${type}_${productKey}_${stickerReady}`;

  const cached = SPRITE_CACHE.get(key);
  if (cached) return cached;

  if (SPRITE_CACHE.size > 400) {
    const firstKey = SPRITE_CACHE.keys().next().value;
    if (firstKey) SPRITE_CACHE.delete(firstKey);
  }

  const dpr = 2;
  const pad = 22;
  const total = roundedSize + pad * 2;
  const off = document.createElement('canvas');
  off.width = total * dpr;
  off.height = total * dpr;
  const ctx = off.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);

  ctx.save();
  ctx.translate(total / 2, total / 2);
  if (direction === 0) ctx.rotate(-Math.PI / 2);
  if (direction === 1) ctx.rotate(Math.PI);
  if (direction === 2) ctx.rotate(0);
  if (direction === 3) ctx.rotate(Math.PI / 2);
  const scale = isPressed ? 0.88 : 1;
  ctx.scale(scale, scale);

  const isDemon = type === 'demon';
  const mainColor = isDemon ? '#090206' : product?.fill || color || '#384152';
  const strokeColor = isDemon ? '#ef4444' : product?.outline || '#05070f';
  const effectiveColor = product?.fill || color;
  ctx.shadowColor = isDemon ? '#ff1e42' : effectiveColor || (isPressed ? '#66f7ff' : '#000000');
  ctx.shadowBlur = isDemon ? 20 : effectiveColor ? 18 : isPressed ? 14 : 6;
  const innerStroke = isDemon ? '#f87171' : '#ffffff';
  const lineWidth = isDemon ? 5.5 : 4.2;
  const half = roundedSize / 2;

  if (shape === 'circle') {
    const rad = roundedSize / 2.15;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    if (color || isDemon) {
      if (!effectiveColor || isDemon) {
        ctx.fillStyle = mainColor;
      } else {
        const g = ctx.createRadialGradient(-rad * 0.28, -rad * 0.32, rad * 0.08, 0, 0, rad);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.28, effectiveColor);
        g.addColorStop(0.82, effectiveColor);
        g.addColorStop(1, '#090d1c');
        ctx.fillStyle = g;
      }
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();

      // Inner neon ring
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.62, 0, Math.PI * 2);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = innerStroke;
      ctx.stroke();

      // Center core dot
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = isDemon ? '#ef4444' : '#ffffff';
      ctx.fill();

      if (isDemon) {
        ctx.beginPath();
        ctx.moveTo(-rad * 0.42, -rad * 0.42);
        ctx.lineTo(rad * 0.42, rad * 0.42);
        ctx.moveTo(rad * 0.42, -rad * 0.42);
        ctx.lineTo(-rad * 0.42, rad * 0.42);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#ff2e4c';
        ctx.stroke();
      }
    } else {
      // Receptor circle target
      const recGrad = ctx.createRadialGradient(0, -rad * 0.25, rad * 0.1, 0, 0, rad);
      recGrad.addColorStop(0, isPressed ? '#ffffff' : '#64748b');
      recGrad.addColorStop(0.65, isPressed ? '#cbd5e1' : '#334155');
      recGrad.addColorStop(1, isPressed ? '#64748b' : '#1e293b');
      ctx.fillStyle = recGrad;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#05070e';
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.56, 0, Math.PI * 2);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = isPressed ? '#0f172a' : 'rgba(255,255,255,0.45)';
      ctx.stroke();
    }
  } else {
    traceArrowPath(ctx, half);
    if (color || isDemon) {
      if (!effectiveColor || isDemon) {
        ctx.fillStyle = mainColor;
      } else {
        const g = ctx.createLinearGradient(0, -half, 0, half);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.2, effectiveColor);
        g.addColorStop(0.78, effectiveColor);
        g.addColorStop(1, '#0c1024');
        ctx.fillStyle = g;
      }
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Crisp inner highlight rim
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.scale(0.76, 0.76);
      traceArrowPath(ctx, half);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = innerStroke;
      ctx.stroke();
      ctx.restore();

      // Inner directional energy chevron so notes scream arcade rhythm game
      ctx.beginPath();
      ctx.moveTo(-half * 0.24, half * 0.08);
      ctx.lineTo(0, -half * 0.26);
      ctx.lineTo(half * 0.24, half * 0.08);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = isDemon ? '#ff2e4c' : '#ffffff';
      ctx.stroke();

      if (isDemon) {
        ctx.beginPath();
        ctx.moveTo(-half * 0.26, half * 0.2);
        ctx.lineTo(half * 0.26, half * 0.62);
        ctx.moveTo(half * 0.26, half * 0.2);
        ctx.lineTo(-half * 0.26, half * 0.62);
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = '#ff1e42';
        ctx.stroke();
      }
    } else {
      // Gray Receptor Arrow Target (tappable directly!)
      const recGrad = ctx.createLinearGradient(0, -half, 0, half);
      recGrad.addColorStop(0, isPressed ? '#ffffff' : '#64748b');
      recGrad.addColorStop(0.55, isPressed ? '#e2e8f0' : '#3b4459');
      recGrad.addColorStop(1, isPressed ? '#94a3b8' : '#1e2433');
      ctx.fillStyle = recGrad;
      ctx.lineWidth = 5.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#05070f';
      ctx.stroke();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.save();
      ctx.scale(0.74, 0.74);
      traceArrowPath(ctx, half);
      ctx.lineWidth = 2;
      ctx.strokeStyle = isPressed ? '#090d16' : 'rgba(255,255,255,0.42)';
      ctx.stroke();
      ctx.restore();
    }
  }

  if (product && !isDemon) {
    if (product.sticker) {
      let img = NOTE_IMAGE_CACHE[product.sticker];
      if (!img) {
        img = new Image();
        img.src = product.sticker;
        NOTE_IMAGE_CACHE[product.sticker] = img;
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        if (shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, roundedSize / 2.2, 0, Math.PI * 2);
        } else {
          traceArrowPath(ctx, half);
        }
        ctx.clip();
        const sx = product.stickerScaleX || 1;
        const sy = product.stickerScaleY || 1;
        ctx.drawImage(img, -roundedSize * 0.5 * sx, -roundedSize * 0.5 * sy, roundedSize * sx, roundedSize * sy);
        ctx.restore();
      }
    }
    if (product.text) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.font = `900 ${Math.max(10, roundedSize * 0.22)}px Saira`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(product.text, 0, 0);
      ctx.fillText(product.text, 0, 0);
    }
  }
  ctx.restore();

  const entry = { canvas: off, pad, size: total };
  SPRITE_CACHE.set(key, entry);
  return entry;
};

export const drawNote = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  direction: number,
  color: string | null,
  isPressed = false,
  shape: SkinShape = 'arrow',
  type: NoteType = 'normal',
  product: NoteProduct | null = null,
  scaleAnim = 1
) => {
  const sprite = getOrCreateNoteSprite(size, direction, color, isPressed, shape, type, product);
  if (!sprite) return;
  if (Math.abs(scaleAnim - 1) < 0.005) {
    ctx.drawImage(sprite.canvas, x - sprite.pad, y - sprite.pad, sprite.size, sprite.size);
  } else {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const scaledTotal = sprite.size * scaleAnim;
    ctx.drawImage(sprite.canvas, cx - scaledTotal / 2, cy - scaledTotal / 2, scaledTotal, scaledTotal);
  }
};

export const drawHoldTail = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  noteSize: number,
  tailLength: number,
  color: string,
  isHolding: boolean,
  audioTimeMs: number
) => {
  if (Math.abs(tailLength) < 2) return;
  const tailW = Math.round(noteSize * (isHolding ? 0.42 : 0.36));
  const tailX = x + (noteSize - tailW) / 2;
  const startY = y + noteSize / 2;
  const endY = startY + tailLength;
  const topY = Math.min(startY, endY);
  const height = Math.abs(tailLength);

  ctx.save();
  // Outer plasma ribbon
  ctx.fillStyle = color;
  ctx.globalAlpha = isHolding ? 0.9 : 0.72;
  ctx.beginPath();
  ctx.roundRect(tailX, topY, tailW, height, tailW * 0.45);
  ctx.fill();

  // Inner bright energy core
  const corePad = Math.max(3, Math.round(tailW * 0.24));
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = isHolding ? 0.85 : 0.5;
  ctx.beginPath();
  ctx.roundRect(tailX + corePad, topY + 2, Math.max(4, tailW - corePad * 2), Math.max(2, height - 4), 4);
  ctx.fill();

  // Animated scrolling chevrons inside the hold ribbon
  ctx.strokeStyle = isHolding ? '#ffffff' : color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = isHolding ? 0.95 : 0.65;
  const step = 18;
  const scrollOffset = ((audioTimeMs * 0.12) % step + step) % step;
  for (let py = topY + scrollOffset; py < topY + height - 6; py += step) {
    ctx.beginPath();
    ctx.moveTo(tailX + 4, py + 4);
    ctx.lineTo(tailX + tailW / 2, py);
    ctx.lineTo(tailX + tailW - 4, py + 4);
    ctx.stroke();
  }

  // Crisp outer arcade border
  ctx.globalAlpha = 1;
  ctx.strokeStyle = isHolding ? '#ffffff' : '#060812';
  ctx.lineWidth = isHolding ? 3.2 : 2.5;
  ctx.beginPath();
  ctx.roundRect(tailX, topY, tailW, height, tailW * 0.45);
  ctx.stroke();

  // Sizzling receptor flare while actively holding
  if (isHolding) {
    const cx = x + noteSize / 2;
    const cy = startY;
    const pulseR = noteSize * (0.48 + 0.12 * Math.sin(audioTimeMs * 0.035));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

export const prewarmNoteSprites = (
  size: number,
  colors: string[],
  shape: SkinShape = 'arrow',
  product: NoteProduct | null = null
) => {
  for (let i = 0; i < 4; i++) {
    getOrCreateNoteSprite(size, i, null, false, shape, 'normal', product);
    getOrCreateNoteSprite(size, i, null, true, shape, 'normal', product);
    getOrCreateNoteSprite(size, i, colors[i] || '#fff', false, shape, 'normal', product);
    getOrCreateNoteSprite(size, i, colors[i] || '#fff', false, shape, 'demon', product);
  }
};

const HERO_HIGHWAY_CACHE = new Map<string, HTMLCanvasElement>();
export const getHeroHighway = (width: number, height: number): HTMLCanvasElement => {
  const key = `${width}x${height}`;
  if (HERO_HIGHWAY_CACHE.has(key)) return HERO_HIGHWAY_CACHE.get(key)!;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const cx = width / 2;
  const top = 55;
  const bottom = height - 35;
  const nearHalf = width * 0.47;
  const farHalf = width * 0.14;
  const road = ctx.createLinearGradient(0, top, 0, bottom);
  road.addColorStop(0, '#11152c');
  road.addColorStop(0.55, '#080b18');
  road.addColorStop(1, '#03050b');
  ctx.fillStyle = road;
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - farHalf, top);
  ctx.lineTo(cx + farHalf, top);
  ctx.lineTo(cx + nearHalf, bottom);
  ctx.lineTo(cx - nearHalf, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (let i = 1; i < 4; i++) {
    const laneGrad = ctx.createLinearGradient(0, top, 0, bottom);
    laneGrad.addColorStop(0, '#ffffff25');
    laneGrad.addColorStop(1, '#ffffff88');
    ctx.strokeStyle = laneGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - farHalf + farHalf * 2 * (i / 4), top);
    ctx.lineTo(cx - nearHalf + nearHalf * 2 * (i / 4), bottom);
    ctx.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const q = i / 14;
    const y = top + (bottom - top) * q * q;
    const half = farHalf + (nearHalf - farHalf) * q;
    ctx.strokeStyle = `rgba(255,255,255,${0.07 + q * 0.2})`;
    ctx.lineWidth = 1 + q;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx + half, y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(cx, bottom, 0, cx, bottom, width * 0.5);
  glow.addColorStop(0, '#facc1520');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  HERO_HIGHWAY_CACHE.set(key, canvas);
  return canvas;
};
