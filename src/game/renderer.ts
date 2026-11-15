import type { NoteProduct, NoteType, SkinShape } from './types';

const NOTE_IMAGE_CACHE: Record<string, HTMLImageElement> = {};
const SPRITE_CACHE = new Map<string, { canvas: HTMLCanvasElement; pad: number; size: number }>();

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
    // Prevent unbounded cache growth when playing Rhythm Hero scaled notes
    const firstKey = SPRITE_CACHE.keys().next().value;
    if (firstKey) SPRITE_CACHE.delete(firstKey);
  }

  const dpr = 2;
  const pad = 20;
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
  const scale = isPressed ? 0.85 : 1;
  ctx.scale(scale, scale);

  const isDemon = type === 'demon';
  const mainColor = isDemon ? '#000' : product?.fill || color || '#444';
  const strokeColor = isDemon ? '#dc2626' : product?.outline || '#070916';
  const effectiveColor = product?.fill || color;
  ctx.shadowColor = isDemon ? '#ef4444' : effectiveColor || '#66f7ff';
  ctx.shadowBlur = effectiveColor ? 16 : 5;
  const innerStroke = isDemon ? '#991b1b' : '#fff';
  const lineWidth = isDemon ? 6 : 4;

  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(0, 0, roundedSize / 2.2, 0, Math.PI * 2);
    if (color || isDemon) {
      if (!effectiveColor || isDemon) ctx.fillStyle = mainColor;
      else {
        const g = ctx.createLinearGradient(-roundedSize / 2, -roundedSize / 2, roundedSize / 2, roundedSize / 2);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.22, effectiveColor);
        g.addColorStop(1, '#101326');
        ctx.fillStyle = g;
      }
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, roundedSize / 4, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = innerStroke;
      ctx.stroke();

      if (isDemon) {
        ctx.beginPath();
        ctx.moveTo(-roundedSize / 6, -roundedSize / 6);
        ctx.lineTo(roundedSize / 6, roundedSize / 6);
        ctx.moveTo(roundedSize / 6, -roundedSize / 6);
        ctx.lineTo(-roundedSize / 6, roundedSize / 6);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#dc2626';
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = isPressed ? '#fff' : '#444';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, roundedSize / 4, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = isPressed ? '#000' : '#222';
      ctx.stroke();
    }
  } else {
    ctx.moveTo(0, -roundedSize / 2);
    ctx.lineTo(roundedSize / 2, 0);
    ctx.lineTo(roundedSize / 4, 0);
    ctx.lineTo(roundedSize / 4, roundedSize / 2);
    ctx.lineTo(-roundedSize / 4, roundedSize / 2);
    ctx.lineTo(-roundedSize / 4, 0);
    ctx.lineTo(-roundedSize / 2, 0);
    ctx.closePath();
    if (color || isDemon) {
      if (!effectiveColor || isDemon) ctx.fillStyle = mainColor;
      else {
        const g = ctx.createLinearGradient(-roundedSize / 2, -roundedSize / 2, roundedSize / 2, roundedSize / 2);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.22, effectiveColor);
        g.addColorStop(1, '#101326');
        ctx.fillStyle = g;
      }
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = innerStroke;
      ctx.stroke();

      if (isDemon) {
        ctx.beginPath();
        ctx.moveTo(-roundedSize / 8, roundedSize / 8);
        ctx.lineTo(roundedSize / 8, roundedSize / 4);
        ctx.moveTo(roundedSize / 8, roundedSize / 8);
        ctx.lineTo(-roundedSize / 8, roundedSize / 4);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#dc2626';
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = isPressed ? '#fff' : '#444';
      ctx.fill();
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
        ctx.beginPath();
        if (shape === 'circle') ctx.arc(0, 0, roundedSize / 2.2, 0, Math.PI * 2);
        else {
          ctx.moveTo(0, -roundedSize / 2);
          ctx.lineTo(roundedSize / 2, 0);
          ctx.lineTo(roundedSize / 4, 0);
          ctx.lineTo(roundedSize / 4, roundedSize / 2);
          ctx.lineTo(-roundedSize / 4, roundedSize / 2);
          ctx.lineTo(-roundedSize / 4, 0);
          ctx.lineTo(-roundedSize / 2, 0);
          ctx.closePath();
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
  product: NoteProduct | null = null
) => {
  const sprite = getOrCreateNoteSprite(size, direction, color, isPressed, shape, type, product);
  if (sprite) {
    ctx.drawImage(sprite.canvas, x - sprite.pad, y - sprite.pad, sprite.size, sprite.size);
  }
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
