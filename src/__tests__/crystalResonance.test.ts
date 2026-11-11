import { describe, expect, it } from 'vitest';
import { RESONANCE_CHAIN_RANGE } from '../../config/buildings';
import { resolveResonanceNetwork } from '../resonanceSystem';

describe('resonance wave network', () => {
  it('uses the configured edge-circle range for the source link', () => {
    const reachedAtThree = resolveResonanceNetwork(
      [{ id: 'source', position: { x: 0, y: 0 } }],
      [
        { id: 'range-three', position: { x: 3, y: 0 } },
      ],
    );
    const reachedAtFour = resolveResonanceNetwork(
      [{ id: 'source', position: { x: 0, y: 0 } }],
      [{ id: 'range-four', position: { x: 4, y: 0 } }],
    );

    expect(RESONANCE_CHAIN_RANGE).toBe(3);
    expect(reachedAtThree.map((node) => node.id)).toEqual(['range-three']);
    expect(reachedAtFour).toEqual([]);
  });

  it('propagates through Chambers and Caves over consecutive links', () => {
    const reached = resolveResonanceNetwork(
      [{ id: 'lava-source', position: { x: 0, y: 0 } }],
      [
        { id: 'first-chamber', position: { x: 3, y: 0 } },
        { id: 'second-cave', position: { x: 6, y: 0 } },
        { id: 'far-chamber', position: { x: 9, y: 0 } },
      ],
    );

    expect(reached.map(({ id, hopDepth, parentId }) => ({ id, hopDepth, parentId }))).toEqual([
      { id: 'first-chamber', hopDepth: 1, parentId: null },
      { id: 'second-cave', hopDepth: 2, parentId: 'first-chamber' },
      { id: 'far-chamber', hopDepth: 3, parentId: 'second-cave' },
    ]);
  });

  it('lets a Cave relay to another Cave or Chamber', () => {
    const reached = resolveResonanceNetwork(
      [{ id: 'source', position: { x: 0, y: 0 } }],
      [
        { id: 'relay-cave', position: { x: 3, y: 0 } },
        { id: 'reached-cave', position: { x: 6, y: 0 } },
        { id: 'reached-chamber', position: { x: 6, y: 2 } },
      ],
    );

    expect(reached.map((node) => [node.id, node.hopDepth, node.parentId])).toEqual([
      ['relay-cave', 1, null],
      ['reached-cave', 2, 'relay-cave'],
      ['reached-chamber', 2, 'relay-cave'],
    ]);
  });

  it('deduplicates overlapping waves and chooses deterministic parents and order', () => {
    const input = {
      sources: [
        { id: 'right-source', position: { x: 2, y: 0 } },
        { id: 'left-source', position: { x: 0, y: 0 } },
      ],
      relays: [
        { id: 'shared-cave', position: { x: 1, y: 1 } },
        { id: 'left-chamber', position: { x: 0, y: 2 } },
        { id: 'shared-cave', position: { x: 1, y: 1 } },
      ],
    };

    const first = resolveResonanceNetwork(input.sources, input.relays);
    const second = resolveResonanceNetwork([...input.sources].reverse(), [...input.relays].reverse());

    expect(first).toEqual(second);
    expect(first.map((node) => node.id)).toEqual(['left-chamber', 'shared-cave']);
    expect(first.find((node) => node.id === 'shared-cave')).toMatchObject({
      sourceId: 'left-source',
      parentId: null,
      hopDepth: 1,
    });
  });
});
