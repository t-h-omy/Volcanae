import { ANIMATION } from '../config/animation';
import type { GameEvent } from './gameEvents';
import type { GameState, Position } from './types';
import { getBuildingSpritePath, TERRAIN_RESOURCE_SPRITE, TILE_SPRITE } from './assetRegistry';

type ChamberHealingEvent = Extract<GameEvent, { type: 'CHAMBER_HEALING' }>;

export function getChamberHealingFocus(
  event: ChamberHealingEvent,
  isTileRevealed: (position: Position) => boolean,
  fallback: Position,
): Position {
  const revealedHeals = event.heals.filter((heal) => isTileRevealed(heal.position));
  if (revealedHeals.length > 0) {
    return {
      x: Math.round(revealedHeals.reduce((sum, heal) => sum + heal.position.x, 0) / revealedHeals.length),
      y: Math.round(revealedHeals.reduce((sum, heal) => sum + heal.position.y, 0) / revealedHeals.length),
    };
  }
  return event.chambers.find(({ position }) => isTileRevealed(position))?.position ?? fallback;
}

export function shouldHoldOverviewAfterLava(
  queue: readonly GameEvent[],
  isVisible: (event: GameEvent) => boolean,
): boolean {
  const portalEvents = new Set<GameEvent['type']>([
    'PORTAL_CREATED',
    'PORTAL_USED',
    'PORTAL_CLOSED',
    'PORTAL_BLOCKED',
  ]);
  const nextEvent = queue.find((event) => !portalEvents.has(event.type));
  return nextEvent?.type === 'RESONANCE_TRIGGERED' && isVisible(nextEvent);
}

export interface LavaVictims {
  unitIds: string[];
  objects: { x: number; y: number; maskSrc: string }[];
  tiles: { x: number; y: number }[];
}

export function collectLavaVictims(
  state: GameState,
  event: Extract<GameEvent, { type: 'LAVA_ADVANCE' }>,
): LavaVictims {
  const unitIds: string[] = [];
  const objects: LavaVictims['objects'] = [];
  const tiles: LavaVictims['tiles'] = [];
  const tileKeys = new Set<string>();
  const addTile = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!tileKeys.has(key)) {
      tileKeys.add(key);
      tiles.push({ x, y });
    }
  };
  const row = state.grid[event.newLavaRow];
  if (!row) return { unitIds, objects, tiles };

  for (const unitId of event.destroyedUnitIds) {
    const unit = state.units[unitId];
    if (
      !unit ||
      unit.position.y !== event.newLavaRow ||
      unit.tunnelState === 'UNDERGROUND' ||
      unit.tunnelState === 'EMERGING'
    ) continue;
    const tile = row[unit.position.x];
    if (!tile?.isRevealed) continue;
    unitIds.push(unitId);
    addTile(unit.position.x, unit.position.y);
  }

  for (let x = 0; x < row.length; x++) {
    const tile = row[x];
    if (!tile.isRevealed) continue;
    const building = tile.buildingId ? state.buildings[tile.buildingId] : undefined;
    const resourcePath = !building ? TERRAIN_RESOURCE_SPRITE[tile.terrainType] : undefined;
    if (building || resourcePath !== undefined) {
      objects.push({ x, y: event.newLavaRow, maskSrc: building ? getBuildingSpritePath(building) ?? '' : resourcePath ?? '' });
      addTile(x, event.newLavaRow);
    }
    if (tile.isRuin || tile.isStrongholdRuin) {
      objects.push({
        x,
        y: event.newLavaRow,
        maskSrc: tile.isStrongholdRuin ? TILE_SPRITE.strongholdRuin ?? '' : TILE_SPRITE.ruin ?? '',
      });
      addTile(x, event.newLavaRow);
    }
  }

  return { unitIds, objects, tiles };
}

export function getLavaAdvanceHoldMs(options: { reducedMotion: boolean; hasVictims: boolean }): number {
  const flow = options.reducedMotion ? 0 : ANIMATION.LAVA_FLOW_MS;
  const engulf = options.hasVictims
    ? Math.max(ANIMATION.LAVA_ENGULF_MS, ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS)
    : 0;
  return flow + engulf;
}
