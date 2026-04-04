/**
 * Asset Preloader — collects all non-empty sprite paths from the asset
 * registry and preloads them via `new Image()`. Resolves when every image
 * has either loaded or errored. Never rejects.
 *
 * Call once on app mount (e.g. in `App.tsx`). When all registry paths are
 * empty strings the returned promise resolves instantly.
 */

import { UNIT_SPRITE, BUILDING_SPRITE, TILE_SPRITE, RESOURCE_SPRITE } from './assetRegistry';

export function preloadAssets(): Promise<void> {
  const paths = [
    ...Object.values(UNIT_SPRITE),
    ...Object.values(BUILDING_SPRITE),
    ...Object.values(TILE_SPRITE),
    ...Object.values(RESOURCE_SPRITE),
  ].filter((p): p is string => typeof p === 'string' && p !== '');

  if (paths.length === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let remaining = paths.length;
    const onSettled = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
    };
    for (const src of paths) {
      const img = new Image();
      img.onload = onSettled;
      img.onerror = onSettled;
      img.src = src;
    }
  });
}
