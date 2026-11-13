import { UI } from '../config/ui';
import type { TechId, TechNodeDefinition } from './types';

export interface TechTreeLayout {
  positions: Record<TechId, { x: number; y: number }>;
  canvasW: number;
  canvasH: number;
}

/** Compute node positions for one single-root tech tree. */
export function computeTechTreeLayout(
  tree: readonly Pick<TechNodeDefinition, 'id' | 'requires'>[],
): TechTreeLayout {
  const nodeW = UI.TECH_TREE_NODE_WIDTH_PX;
  const nodeH = UI.TECH_TREE_NODE_HEIGHT_PX;
  const hGap = UI.TECH_TREE_H_GAP_PX;
  const vGap = UI.TECH_TREE_V_GAP_PX;
  const childrenOf = new Map<TechId, TechId[]>();
  let rootId: TechId | undefined;

  for (const node of tree) {
    if (node.requires.length === 0) {
      rootId = node.id;
      continue;
    }
    const parent = node.requires[0];
    const children = childrenOf.get(parent);
    if (children) children.push(node.id);
    else childrenOf.set(parent, [node.id]);
  }
  if (!rootId) return { positions: {}, canvasW: 0, canvasH: 0 };

  const depthOf = new Map<TechId, number>([[rootId, 0]]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    const depth = depthOf.get(id)!;
    for (const child of childrenOf.get(id) ?? []) {
      depthOf.set(child, depth + 1);
      queue.push(child);
    }
  }

  const subtreeHeight = new Map<TechId, number>();
  function calcHeight(id: TechId): number {
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) {
      subtreeHeight.set(id, nodeH);
      return nodeH;
    }
    const total = children.reduce((sum, child) => sum + calcHeight(child), 0)
      + hGap * (children.length - 1);
    const height = Math.max(nodeH, total);
    subtreeHeight.set(id, height);
    return height;
  }
  calcHeight(rootId);

  const rawPositions: Record<TechId, { x: number; y: number }> = {};
  function assignPosition(id: TechId, centerY: number): void {
    const depth = depthOf.get(id)!;
    rawPositions[id] = { x: depth * (nodeW + vGap), y: centerY };
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) return;
    const totalHeight = children.reduce((sum, child) => sum + subtreeHeight.get(child)!, 0)
      + hGap * (children.length - 1);
    let cursor = centerY - totalHeight / 2;
    for (const child of children) {
      const childHeight = subtreeHeight.get(child)!;
      assignPosition(child, cursor + childHeight / 2);
      cursor += childHeight + hGap;
    }
  }
  assignPosition(rootId, subtreeHeight.get(rootId)! / 2);

  const padding = UI.TECH_TREE_LAYOUT_PADDING_PX;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const position of Object.values(rawPositions)) {
    minX = Math.min(minX, position.x - nodeW / 2);
    minY = Math.min(minY, position.y - nodeH / 2);
    maxX = Math.max(maxX, position.x + nodeW / 2);
    maxY = Math.max(maxY, position.y + nodeH / 2);
  }

  const offsetX = -minX + padding;
  const offsetY = -minY + padding;
  const positions: Record<TechId, { x: number; y: number }> = {};
  for (const [id, position] of Object.entries(rawPositions)) {
    positions[id] = {
      x: Math.round(position.x + offsetX - nodeW / 2),
      y: Math.round(position.y + offsetY - nodeH / 2),
    };
  }
  return {
    positions,
    canvasW: Math.ceil(maxX - minX + 2 * padding),
    canvasH: Math.ceil(maxY - minY + padding + UI.TECH_TREE_LAYOUT_BOTTOM_PAD_PX),
  };
}
