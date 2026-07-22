import { describe, it, expect } from 'vitest';
import { buildRecruitBlockMessages } from '../recruitMessages';
import type { PopCapacity, PopUsage, RecruitCost, ResourceSnapshot } from '../recruitMessages';

const defaultResources: ResourceSnapshot = { iron: 10, wood: 10 };
const defaultPopUsage: PopUsage = { farmersUsed: 0, noblesUsed: 0 };
const defaultPopCapacity: PopCapacity = { farmerCapacity: 10, nobleCapacity: 10 };

const NO_POP_COST = undefined;

// ── Resource warnings ─────────────────────────────────────────────────────────

describe('buildRecruitBlockMessages – resource warnings', () => {
  it('returns null resourceWarningMsg when unit is affordable', () => {
    const cost: RecruitCost = { iron: 5, wood: 3 };
    const msgs = buildRecruitBlockMessages(
      false, cost, 0, defaultResources, 0,
      true, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.resourceWarningMsg).toBeNull();
  });

  it('reports missing iron specifically', () => {
    const cost: RecruitCost = { iron: 12, wood: 3 };
    const resources: ResourceSnapshot = { iron: 7, wood: 10 };
    const msgs = buildRecruitBlockMessages(
      false, cost, 0, resources, 0,
      false, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.resourceWarningMsg).toBe('Not enough iron (need 12, have 7)');
  });

  it('reports missing wood specifically', () => {
    const cost: RecruitCost = { iron: 3, wood: 8 };
    const resources: ResourceSnapshot = { iron: 10, wood: 2 };
    const msgs = buildRecruitBlockMessages(
      false, cost, 0, resources, 0,
      false, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.resourceWarningMsg).toBe('Not enough wood (need 8, have 2)');
  });

  it('joins both iron and wood when both are short', () => {
    const cost: RecruitCost = { iron: 15, wood: 20 };
    const resources: ResourceSnapshot = { iron: 5, wood: 5 };
    const msgs = buildRecruitBlockMessages(
      false, cost, 0, resources, 0,
      false, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.resourceWarningMsg).toBe(
      'Not enough iron (need 15, have 5) and wood (need 20, have 5)',
    );
  });

  it('reports crystal shortage for crystal-cost units', () => {
    const msgs = buildRecruitBlockMessages(
      true, undefined, 5, defaultResources, 2,
      false, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      false, true, 0, 1, 'Crystal Cave',
    );
    expect(msgs.resourceWarningMsg).toBe(
      'Not enough crystals (need 5, have 2, missing 3)',
    );
  });
});

// ── Population warnings ───────────────────────────────────────────────────────

describe('buildRecruitBlockMessages – population warnings', () => {
  it('returns null popWarningMsg when population is sufficient', () => {
    const msgs = buildRecruitBlockMessages(
      false, { iron: 1, wood: 1 }, 0, defaultResources, 0,
      true, true, { farmers: 2, nobles: 0 },
      { farmersUsed: 0, noblesUsed: 0 }, { farmerCapacity: 10, nobleCapacity: 10 },
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.popWarningMsg).toBeNull();
  });

  it('reports farmer shortage', () => {
    const msgs = buildRecruitBlockMessages(
      false, { iron: 1, wood: 1 }, 0, defaultResources, 0,
      true, false, { farmers: 3, nobles: 0 },
      { farmersUsed: 9, noblesUsed: 0 }, { farmerCapacity: 10, nobleCapacity: 10 },
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.popWarningMsg).toBe('Not enough farmers — build more Farms');
  });

  it('reports noble shortage', () => {
    const msgs = buildRecruitBlockMessages(
      false, { iron: 1, wood: 1 }, 0, defaultResources, 0,
      true, false, { farmers: 0, nobles: 2 },
      { farmersUsed: 0, noblesUsed: 9 }, { farmerCapacity: 10, nobleCapacity: 10 },
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.popWarningMsg).toBe('Not enough nobles — build more Patrician Houses');
  });

  it('reports both farmer and noble shortage', () => {
    const msgs = buildRecruitBlockMessages(
      false, { iron: 1, wood: 1 }, 0, defaultResources, 0,
      true, false, { farmers: 2, nobles: 2 },
      { farmersUsed: 9, noblesUsed: 9 }, { farmerCapacity: 10, nobleCapacity: 10 },
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.popWarningMsg).toBe(
      'Not enough farmers — build more Farms and nobles — build more Patrician Houses',
    );
  });

  it('suppresses popWarningMsg when resources are the blocker', () => {
    // canAffordUnit = false means resource is the primary block; pop check is skipped
    const msgs = buildRecruitBlockMessages(
      false, { iron: 99, wood: 99 }, 0, defaultResources, 0,
      false, false, { farmers: 3, nobles: 0 },
      { farmersUsed: 9, noblesUsed: 0 }, { farmerCapacity: 10, nobleCapacity: 10 },
      false, false, 0, Infinity, 'Barracks',
    );
    expect(msgs.popWarningMsg).toBeNull();
  });
});

// ── Cap warnings ──────────────────────────────────────────────────────────────

describe('buildRecruitBlockMessages – cap warnings', () => {
  it('returns null capWarningMsg when not at limit', () => {
    const msgs = buildRecruitBlockMessages(
      false, { iron: 1, wood: 1 }, 0, defaultResources, 0,
      true, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      false, false, 2, 4, 'Barracks',
    );
    expect(msgs.capWarningMsg).toBeNull();
  });

  it('shows cap message with count for normal buildings', () => {
    const msgs = buildRecruitBlockMessages(
      false, { iron: 1, wood: 1 }, 0, defaultResources, 0,
      true, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      true, false, 4, 4, 'Barracks',
    );
    expect(msgs.capWarningMsg).toBe(
      'Unit limit reached (4/4), build another Barracks',
    );
  });

  it('shows crystal-cave-specific message', () => {
    const msgs = buildRecruitBlockMessages(
      true, undefined, 5, defaultResources, 10,
      true, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      true, true, 1, 1, 'Crystal Cave',
    );
    expect(msgs.capWarningMsg).toBe('This cave already hosts a Crystal Drake');
  });

  it('suppresses capWarningMsg when resources are the primary block', () => {
    const msgs = buildRecruitBlockMessages(
      false, { iron: 99, wood: 99 }, 0, defaultResources, 0,
      false, true, NO_POP_COST,
      defaultPopUsage, defaultPopCapacity,
      true, false, 4, 4, 'Barracks',
    );
    expect(msgs.capWarningMsg).toBeNull();
  });

  it('suppresses capWarningMsg when population is the primary block', () => {
    const msgs = buildRecruitBlockMessages(
      false, { iron: 1, wood: 1 }, 0, defaultResources, 0,
      true, false, { farmers: 2, nobles: 0 },
      { farmersUsed: 9, noblesUsed: 0 }, { farmerCapacity: 10, nobleCapacity: 10 },
      true, false, 4, 4, 'Barracks',
    );
    expect(msgs.capWarningMsg).toBeNull();
  });
});
