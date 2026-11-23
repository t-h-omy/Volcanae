import { useEffect, useState } from 'react';
import { getTerrainLook } from './terrain/terrainLook';
import { TERRAIN_STATUS_INDEX } from './terrain/terrainMapEncoding';
import { useTerrainTuningStore } from './terrain/terrainTuningStore';
import { TileStatus, type TileStatus as TileStatusType } from './types';

const finishedVariants = new Map<string, string>();
const pendingVariants = new Map<string, Promise<string>>();

function hash(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * tx;
  const bottom = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * tx;
  return top + (bottom - top) * ty;
}

export function applyStatusToPixels(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  statusIndex: number,
  k: number,
): Uint8ClampedArray {
  const d = new Uint8ClampedArray(src);
  if (k <= 0) return d;
  const sc = w / 100;
  const A = (x: number, y: number) => (
    x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]
  );
  const mix = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  const e1 = Math.max(1, Math.round(sc));
  const snowT = Math.max(1, Math.round((1.5 + 5 * k) * sc));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] < 8) continue;
    let r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    const edge = A(x - e1, y) < 40 || A(x + e1, y) < 40 || A(x, y - e1) < 40 || A(x, y + e1) < 40;
    let tr = r, tg = g, tb = b, t = 0;
    if (statusIndex === 1) {
      r = mix(r, l * 0.85 + 0.12, 0.9 * k);
      g = mix(g, l * 0.95 + 0.15, 0.9 * k);
      b = mix(b, l * 1.05 + 0.2, 0.9 * k);
      let top = false;
      for (let j = 1; j <= snowT; j++) if (A(x, y - j) < 60) { top = true; break; }
      const snow = top ? 0.95 : Math.min(0.8, Math.max(0, (l - 0.4) / 0.35) * 0.8);
      tr = 0.94; tg = 0.97; tb = 1.0; t = snow * Math.min(1, k * 2);
    } else if (statusIndex === 2) {
      const foot = Math.pow(y / h, 1.5);
      r = mix(r, 0.15, 0.9 * k * foot);
      g = mix(g, 0.1, 1.0 * k * foot);
      b = mix(b, 0.08, 1.0 * k * foot);
      tr = 1.0; tg = edge ? 0.5 : 0.72; tb = edge ? 0.15 : 0.3;
      t = edge ? Math.min(1, 1.6 * k) : (hash(x, y) > 0.985 ? Math.min(1, 2 * k) : 0);
    } else if (statusIndex === 3) {
      r = mix(r, l * 0.9 + 0.05, 1.3 * k);
      g = mix(g, l * 0.82 + 0.04, 1.3 * k);
      b = mix(b, l * 0.8 + 0.06, 1.3 * k);
      const v = 1 - Math.abs(valueNoise(x / (7 * sc), y / (7 * sc)) * 2 - 1);
      tr = 0.48; tg = 0.24; tb = 0.66;
      t = Math.min(1, Math.max(v > 0.92 ? 1.6 * k : 0, edge ? 1.3 * k : 0));
    } else if (statusIndex === 4) {
      r = mix(r, l * 0.8 + 0.1, 0.9 * k);
      g = mix(g, l * 0.95 + 0.14, 0.9 * k);
      b = mix(b, l * 1.1 + 0.2, 0.9 * k);
      const sparkle = hash(x, y) > 0.97 && l > 0.4;
      tr = sparkle ? 1 : 0.62; tg = sparkle ? 1 : 0.9; tb = 1.0;
      t = Math.min(1, sparkle ? 2 * k : (edge ? 1.5 * k : 0));
    }
    d[i] = mix(r, tr, t) * 255;
    d[i + 1] = mix(g, tg, t) * 255;
    d[i + 2] = mix(b, tb, t) * 255;
  }
  return d;
}

export function getStatusVariantKey(path: string, statusIndex: number, k: number): string {
  return `${path}|${statusIndex}|${k}`;
}

export function pickStatusSprite(
  path: string | undefined,
  variantKey: string | null,
  cached: string | undefined,
  pending: { key: string; path: string } | null,
): string | undefined {
  if (cached) return cached;
  return variantKey && pending?.key === variantKey ? pending.path : path;
}

export function generateStatusVariant(path: string, statusIndex: number, k: number): Promise<string> {
  const key = getStatusVariantKey(path, statusIndex, k);
  const cached = finishedVariants.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = pendingVariants.get(key);
  if (pending) return pending;

  const promise = new Promise<string>((resolve) => {
    try {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context || canvas.width === 0 || canvas.height === 0) {
            resolve(path);
            return;
          }
          context.drawImage(image, 0, 0);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          imageData.data.set(applyStatusToPixels(imageData.data, canvas.width, canvas.height, statusIndex, k));
          context.putImageData(imageData, 0, 0);
          const result = canvas.toDataURL('image/png');
          finishedVariants.set(key, result);
          resolve(result);
        } catch {
          resolve(path);
        }
      };
      image.onerror = () => resolve(path);
      image.src = path;
    } catch {
      resolve(path);
    }
  }).finally(() => pendingVariants.delete(key));
  pendingVariants.set(key, promise);
  return promise;
}

const STATUS_KEY: Record<TileStatusType, keyof ReturnType<typeof getTerrainLook>['objects']> = {
  [TileStatus.FROZEN]: 'frozen',
  [TileStatus.BURNING]: 'burning',
  [TileStatus.CORRUPTED]: 'corrupted',
  [TileStatus.CRYSTALLINE]: 'crystalline',
};

export function useStatusSprite(
  path: string | undefined,
  status: TileStatusType | null | undefined,
): string | undefined {
  const revision = useTerrainTuningStore((state) => state.revision);
  const keyName = status ? STATUS_KEY[status] : undefined;
  const strength = keyName ? getTerrainLook().objects[keyName] : 0;
  const statusIndex = status ? TERRAIN_STATUS_INDEX[status] : 0;
  const variantKey = path && statusIndex && strength > 0
    ? getStatusVariantKey(path, statusIndex, strength)
    : null;
  const [variant, setVariant] = useState<{ key: string; path: string } | null>(null);
  const cached = variantKey ? finishedVariants.get(variantKey) : undefined;

  useEffect(() => {
    if (!path || !statusIndex || strength <= 0 || !variantKey || cached) return;
    let active = true;
    void generateStatusVariant(path, statusIndex, strength).then((result) => {
      if (active) setVariant({ key: variantKey, path: result });
    });
    return () => { active = false; };
  }, [path, statusIndex, strength, variantKey, revision, cached]);

  return pickStatusSprite(path, variantKey, cached, variant);
}
