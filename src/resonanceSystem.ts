import { RESONANCE_CHAIN_RANGE } from '../config/buildings';
import { edgeCircleDistance } from './rangeUtils';
import type { Position } from './types';

export interface ResonanceSource {
  id: string;
  position: Position;
}

export interface ResonanceRelay {
  id: string;
  position: Position;
}

export interface ReachedResonanceRelay extends ResonanceRelay {
  sourceId: string;
  parentId: string | null;
  parentPosition: Position;
  hopDepth: number;
}

interface FrontierEntry {
  id: string | null;
  position: Position;
  sourceId: string;
  hopDepth: number;
}

function comparePosition(a: Position, b: Position): number {
  return a.y - b.y || a.x - b.x;
}

/**
 * Resolves the deterministic multi-source resonance network.
 * A relay can only be reached from a source or a relay reached on the prior hop.
 */
export function resolveResonanceNetwork(
  sources: ResonanceSource[],
  relays: ResonanceRelay[],
): ReachedResonanceRelay[] {
  const sortedSources = [...sources].sort((a, b) =>
    comparePosition(a.position, b.position) || a.id.localeCompare(b.id),
  );
  const uniqueSources = sortedSources.filter((source, index) =>
    index === 0 || source.id !== sortedSources[index - 1].id,
  );
  const sortedRelays = [...relays].sort((a, b) =>
    a.id.localeCompare(b.id) || comparePosition(a.position, b.position),
  );
  const uniqueRelays = sortedRelays.filter((relay, index) =>
    index === 0 || relay.id !== sortedRelays[index - 1].id,
  );
  const reached = new Set<string>();
  const result: ReachedResonanceRelay[] = [];
  let frontier: FrontierEntry[] = uniqueSources.map((source) => ({
    id: null,
    position: source.position,
    sourceId: source.id,
    hopDepth: 0,
  }));

  while (frontier.length > 0) {
    const nextFrontier: FrontierEntry[] = [];
    for (const parent of frontier) {
      for (const relay of uniqueRelays) {
        if (reached.has(relay.id)) continue;
        if (edgeCircleDistance(
          parent.position.x,
          parent.position.y,
          relay.position.x,
          relay.position.y,
        ) > RESONANCE_CHAIN_RANGE) continue;

        reached.add(relay.id);
        result.push({
          ...relay,
          sourceId: parent.sourceId,
          parentId: parent.id,
          parentPosition: parent.position,
          hopDepth: parent.hopDepth + 1,
        });
        nextFrontier.push({
          id: relay.id,
          position: relay.position,
          sourceId: parent.sourceId,
          hopDepth: parent.hopDepth + 1,
        });
      }
    }
    frontier = nextFrontier;
  }

  return result;
}
