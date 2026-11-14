import { describe, expect, it } from 'vitest';
import HUD_TSX from '../components/HUD.tsx?raw';
import HUD_CSS from '../components/HUD.css?raw';
import { getTechMagicPath, getTechTreeId, TECH_TREE } from '../gameConfig';
import { computeTechPathAuras, computeTechTreeLayout } from '../techTreeLayout';
import { MagicPath, TechTreeId } from '../types';
import { UI } from '../../config/ui';

const overlayStart = HUD_TSX.indexOf('function TechTreeOverlay(');
const overlayEnd = HUD_TSX.indexOf('// MAIN HUD COMPONENT', overlayStart);
const overlay = HUD_TSX.slice(overlayStart, overlayEnd);

describe('tech tree redesign UI contract', () => {
  it('renders the dock, curved edges, auras, and node status markers', () => {
    expect(overlay).toContain('tech-dock');
    expect(overlay).toContain('tech-dock-close');
    expect(overlay).toContain("aria-label={t('common.close')}");
    expect(overlay).toContain('onClick={requestClose}');
    expect(overlay).toContain('tech-tree-tab-indicator');
    expect(overlay).toContain('techEdgePath(');
    expect(overlay).toContain('tech-edge-flow');
    expect(overlay).toContain('tech-node-check');
    expect(overlay).toContain('tech-path-aura');
    expect(overlay).not.toContain('tech-overlay-close');
  });

  it('routes Escape through the animated close request', () => {
    const escapeHandler = overlay.slice(overlay.indexOf('// Close on Escape'), overlay.indexOf('}, [requestClose])'));
    expect(escapeHandler).toContain("if (e.key === 'Escape') requestClose()");
  });

  it('uses the opaque basalt background and large, safe-area-aware dock controls', () => {
    const overlayRule = HUD_CSS.match(/\.tech-overlay\s*\{([^}]*)\}/)?.[1] ?? '';
    const ambientRule = HUD_CSS.match(/\.tech-ambient::after\s*\{([^}]*)\}/)?.[1] ?? '';
    const tabRule = HUD_CSS.match(/\.tech-tree-tab\s*\{([^}]*)\}/)?.[1] ?? '';
    const dockRule = HUD_CSS.match(/\.tech-dock\s*\{([^}]*)\}/)?.[1] ?? '';
    const tabHeight = Number(HUD_CSS.match(/--tt-tab-min-h:\s*(\d+)px/)?.[1]);
    const closeSize = Number(HUD_CSS.match(/--tt-close-size:\s*(\d+)px/)?.[1]);

    expect(overlayRule).toContain('background-color: var(--tt-basalt-top)');
    expect(overlayRule).not.toContain('rgba(10, 10, 15');
    expect(ambientRule).toContain('--tt-lava-glow');
    expect(HUD_CSS).not.toContain('--tt-bg: var(--mm-base-bg)');
    expect(tabRule).toContain('min-height: var(--tt-tab-min-h)');
    expect(tabHeight).toBeGreaterThanOrEqual(48);
    expect(closeSize).toBeGreaterThanOrEqual(48);
    expect(dockRule).toContain('env(safe-area-inset-bottom');
  });
});

describe('magic-path tech tree auras', () => {
  const arcaneNodes = TECH_TREE.filter((node) => getTechTreeId(node.id) === TechTreeId.ARCANE);
  const auras = computeTechPathAuras(
    computeTechTreeLayout(arcaneNodes),
    arcaneNodes,
    getTechMagicPath,
  );

  it('creates exactly one aura for each magic path and bounds every matching node', () => {
    expect(auras).toHaveLength(4);
    expect(new Set(auras.map((aura) => aura.path))).toEqual(new Set(Object.values(MagicPath)));

    const layout = computeTechTreeLayout(arcaneNodes);
    for (const aura of auras) {
      const pathNodes = arcaneNodes.filter((node) => getTechMagicPath(node.id) === aura.path);
      expect(pathNodes.length).toBeGreaterThan(0);
      for (const node of pathNodes) {
        const position = layout.positions[node.id];
        expect(aura.x).toBeLessThanOrEqual(position.x);
        expect(aura.y).toBeLessThanOrEqual(position.y);
        expect(aura.x + aura.w).toBeGreaterThanOrEqual(position.x + UI.TECH_TREE_NODE_WIDTH_PX);
        expect(aura.y + aura.h).toBeGreaterThanOrEqual(position.y + UI.TECH_TREE_NODE_HEIGHT_PX);
      }
    }
  });

  it('does not create auras for the secular tree', () => {
    const secularNodes = TECH_TREE.filter((node) => getTechTreeId(node.id) === TechTreeId.SECULAR);
    expect(computeTechPathAuras(
      computeTechTreeLayout(secularNodes),
      secularNodes,
      getTechMagicPath,
    )).toEqual([]);
  });
});
