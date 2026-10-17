import { describe, expect, it } from 'vitest';
import GRID_RENDERER_TSX from '../components/GridRenderer.tsx?raw';
import HUD_TSX from '../components/HUD.tsx?raw';
import HUD_CSS from '../components/HUD.css?raw';
import { isCorruptionBoundDrainActive } from '../corruptedQorkSystem';
import { TAG_INFO, UNIT_DEFINITIONS } from '../gameConfig';
import { Faction, TileStatus, TileType, UnitTag, UnitType, type GameState, type Tile, type Unit } from '../types';

function makeUnit(tags: UnitTag[], currentHp: number, faction: Faction, type: UnitType): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: 'bound-display',
    type,
    faction,
    position: { x: 0, y: 0 },
    stats: {
      maxHp: definition.maxHp,
      currentHp,
      attack: definition.attack,
      defense: definition.defense,
      moveRange: definition.moveRange,
      attackRange: definition.attackRange,
      discoverRadius: definition.discoverRadius,
      triggerRange: definition.triggerRange,
      movementActions: definition.movementActions,
    },
    tags,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
  };
}

const badge = GRID_RENDERER_TSX.slice(GRID_RENDERER_TSX.indexOf('function UnitBadge('));
const debuffCheck = HUD_TSX.slice(HUD_TSX.indexOf('function unitHasDebuff('), HUD_TSX.indexOf('function SelectedUnitPanel('));
const selectedPanel = HUD_TSX.slice(HUD_TSX.indexOf('function SelectedUnitPanel('));
const livePopup = HUD_TSX.slice(HUD_TSX.indexOf('function UnitCombinedInfoPopup('), HUD_TSX.indexOf('function unitHasDebuff('));

describe('Corruption-Bound display predicate', () => {
  it.each([
    { name: 'tagged off corruption', tagged: true, hp: 10, status: null, active: true },
    { name: 'tagged on corruption', tagged: true, hp: 10, status: TileStatus.CORRUPTED, active: false },
    { name: 'untagged off corruption', tagged: false, hp: 10, status: null, active: false },
    { name: 'untagged on corruption', tagged: false, hp: 10, status: TileStatus.CORRUPTED, active: false },
    { name: 'dead off corruption', tagged: true, hp: 0, status: null, active: false },
    { name: 'dead on corruption', tagged: true, hp: 0, status: TileStatus.CORRUPTED, active: false },
    { name: 'tagged on another status', tagged: true, hp: 10, status: TileStatus.BURNING, active: true },
  ])('$name uses the shared terrain and life checks', ({ tagged, hp, status, active }) => {
    for (const faction of [Faction.PLAYER, Faction.ENEMY]) {
      for (const type of [UnitType.CORRUPTED_QORK, UnitType.SWORDSMAN]) {
        const unit = makeUnit(tagged ? [UnitTag.CORRUPTION_BOUND] : [], hp, faction, type);
        const tile = { position: unit.position, terrainType: TileType.PLAINS, status } as Tile;
        const state = { grid: [[tile]], units: { [unit.id]: unit } } as GameState;
        expect(isCorruptionBoundDrainActive(state, unit)).toBe(active);
      }
    }
  });

  it('uses the configured rose icon only for active player badge tags', () => {
    expect(TAG_INFO[UnitTag.CORRUPTION_BOUND]?.icon).toBe('🥀');
    expect(badge).toContain('unit.faction === Faction.PLAYER && isCorruptionBoundDrainActive(s, unit)');
    expect(badge).toContain('(corruptionAffectsUnit ||\n      hasCorruptionBoundDebuff ||');
    expect(badge).toContain('.filter((tag) => tag !== UnitTag.CORRUPTION_BOUND || hasCorruptionBoundDebuff)');
    expect(badge).toContain('.map((tag) => TAG_INFO[tag]?.icon)');
    expect(badge).not.toContain('.filter((tag) => tag !== UnitTag.TAUNT)');
  });

  it('adds the shared predicate without removing existing HUD debuffs or the player gate', () => {
    expect(debuffCheck).toContain('if (isCorruptionBoundDrainActive(state, unit)) return true;');
    expect(debuffCheck).toContain('UnitTag.RELOAD');
    expect(debuffCheck).toContain('UPGRADE_TRADEOFF_TAGS.has(tag)');
    expect(debuffCheck).toContain('TAG_STAT_EFFECTS[tag]');
    expect(debuffCheck).toContain('unit.pinnedUntilTurn > 0');
    expect(debuffCheck).toContain('CORRUPTED_SUPPRESSED_TAGS.has(tag)');
    expect(selectedPanel).toContain('isPlayer && unitHasDebuff(unit, isOnCorruptedTile, gameState)');
  });
});

describe('Corruption-Bound pill presentation', () => {
  it('forwards an optional debuff flag into a distinct config-derived red tint', () => {
    expect(HUD_TSX).toContain('debuff?: boolean');
    expect(HUD_TSX).toContain('debuff={debuff}');
    expect(HUD_TSX).toContain("${debuff ? ' info-popup-tag-pill--debuff' : ''}");
    expect(HUD_TSX).toContain("'--info-popup-debuff-color': RENDER.COLORS.DEBUFF_BORDER");
    expect(HUD_CSS).toContain('.info-popup-tag-pill--debuff {');
    expect(HUD_CSS).toContain('color-mix(in srgb, var(--info-popup-debuff-color) 25%, #ff4444)');
    expect(HUD_CSS).toContain('--info-popup-tag-pill-border: var(--info-popup-debuff-tint);');
  });

  it('flags only active player Corruption-Bound pills in the panel and live popup', () => {
    expect(selectedPanel).toContain('hasCorruptionBoundDebuff = isPlayer && isCorruptionBoundDrainActive(gameState, unit)');
    expect(livePopup).toContain('hasCorruptionBoundDebuff = unit.faction === Faction.PLAYER && isCorruptionBoundDrainActive(gameState, unit)');
    for (const source of [selectedPanel, livePopup]) {
      expect(source).toContain('debuff={tag === UnitTag.CORRUPTION_BOUND && hasCorruptionBoundDebuff}');
      expect(source).toContain('isConditionalTagActive(tag)');
    }
    expect(HUD_TSX.match(/debuff=\{tag === UnitTag\.CORRUPTION_BOUND && hasCorruptionBoundDebuff\}/g)).toHaveLength(2);
  });
});
