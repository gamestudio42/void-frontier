import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { visualRng } from './noise.ts';

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, repeatX = 1, repeatY = 1, srgb = true): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/** Hull plating: panel seams and grime. Used as a colour map on station modules. */
export function platingTexture(seed: number, tint = '#8b9096'): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rand = visualRng(seed);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * 8) * 32;
    const y = Math.floor(rand() * 8) * 32;
    const w = 32 * (1 + Math.floor(rand() * 3));
    const h = 32 * (1 + Math.floor(rand() * 2));
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + rand() * 0.06})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(20,16,12,${rand() * 0.12})`;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 6, 1 + rand() * 18);
  }
  return texture(c);
}

/** Rows of lit and dark windows; used as an emissive map so stations glow at night side. */
export function windowsTexture(seed: number, columns = 48, rows = 6): CanvasTexture {
  const [c, ctx] = canvas(512, 64);
  const rand = visualRng(seed);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 64);
  const cw = 512 / columns;
  const rh = 64 / rows;
  for (let x = 0; x < columns; x++) {
    for (let y = 1; y < rows - 1; y++) {
      if (rand() < 0.55) continue;
      const warm = rand() < 0.75;
      ctx.fillStyle = warm ? `rgba(255,${190 + rand() * 40},${120 + rand() * 40},${0.6 + rand() * 0.4})` : 'rgba(150,220,255,0.9)';
      ctx.fillRect(x * cw + cw * 0.25, y * rh + rh * 0.2, cw * 0.5, rh * 0.55);
    }
  }
  return texture(c);
}

/** Photovoltaic cells: deep blue with a fine grid. */
export function solarTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const gradient = ctx.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, '#0d1d3d');
  gradient.addColorStop(1, '#13284f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(140,170,220,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200,210,230,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  return texture(c);
}

/** Yellow-black hazard stripes for the docking bay frame. */
export function hazardTexture(): CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = '#1b1a17';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#d9a12b';
  for (let i = -64; i < 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i + 80, 64);
    ctx.lineTo(i + 64, 64);
    ctx.fill();
  }
  return texture(c);
}
