import { describe, expect, it } from 'vitest';
import HUD_TSX from '../components/HUD.tsx?raw';
import HUD_CSS from '../components/HUD.css?raw';

// The existing Vitest setup has no DOM engine; assert the UI wiring and layout contract.
const construction = HUD_TSX.slice(HUD_TSX.indexOf('function ConstructionPanel('), HUD_TSX.indexOf('function ConversionPanel('));
const conversion = HUD_TSX.slice(HUD_TSX.indexOf('function ConversionPanel('), HUD_TSX.indexOf('/** Mapping from TileStatus'));
const bottomBar = HUD_TSX.slice(HUD_TSX.indexOf('function BottomBar('), HUD_TSX.indexOf('// GAME OVER / VICTORY OVERLAYS'));
const mobileFocus = HUD_CSS.slice(HUD_CSS.indexOf('@media (max-width: 768px)'));
const mobileRows = HUD_CSS.slice(HUD_CSS.lastIndexOf('@media (max-width: 768px)', HUD_CSS.indexOf('.hud-construction-option {')));

describe('mobile construction focus UI contract', () => {
  it('owns expansion in BottomBar and toggles it in both directions from the header', () => {
    expect(bottomBar).toContain('const [isConstructionExpanded, setIsConstructionExpanded] = useState(false)');
    expect(bottomBar).toContain('isExpanded={isConstructionExpanded}');
    expect(bottomBar).toContain('onExpandedChange={setIsConstructionExpanded}');
    expect(construction).toContain('onExpandedChange: (expanded: boolean) => void');
    expect(construction).toContain('onClick={() => onExpandedChange(!isExpanded)}');
    expect(construction).toContain('{isExpanded && (');
    expect(construction).not.toContain('setCollapsed');
  });

  it('hides the selected unit and End Turn without layout space only at mobile widths', () => {
    expect(bottomBar).toContain("constructionFocusActive ? ' hud-bottom-bar--construction-focus' : ''");
    expect(bottomBar).toMatch(/<div className="hud-selected-unit-slot">\s*<SelectedUnitPanel/);
    expect(mobileFocus).toMatch(/\.hud-bottom-bar--construction-focus > \.hud-selected-unit-slot,\s*\.hud-bottom-bar--construction-focus > \.hud-end-turn-btn \{\s*display: none;/);
    expect(HUD_CSS.slice(0, HUD_CSS.indexOf('@media (max-width: 768px)'))).not.toContain('.hud-bottom-bar--construction-focus');
    expect(HUD_CSS).toMatch(/\.hud-selected-unit-slot \{\s*display: contents;/);
    // Normal panels and the button remain mounted, so collapsing restores them immediately.
    expect(bottomBar).toMatch(/\{selectedUnit && !cavePopupActive && \(/);
    expect(bottomBar).toMatch(/\{isPlayerTurn && !isAnimating && !isHintBlocking && \(\s*<button/);
  });

  it('resets expansion before paint on unmount and remounts for selection or tile changes', () => {
    expect(construction).toMatch(/useLayoutEffect\(\(\) => \{\s*return \(\) => onExpandedChange\(false\);\s*\}, \[onExpandedChange\]\)/);
    expect(bottomBar).toContain('key={`${selectedUnit.id}:${selectedUnit.position.x},${selectedUnit.position.y}`}');
    expect(bottomBar).toMatch(/isConstructionExpanded && !!selectedUnit && showConstruction && !cavePopupActive && !isHintBlocking/);
    expect(bottomBar).toMatch(/\{selectedUnit && showConstruction && !cavePopupActive && !isHintBlocking && \(\s*<ConstructionPanel/);
  });

  it('caps only construction lists at 3.5 non-shrinking rows, retaining native touch scroll', () => {
    expect(construction).toContain('className="hud-construct-options hud-construction-options"');
    expect(construction).toContain('info-row-btn hud-construction-option');
    const listRule = mobileRows.match(/\.hud-construction-options \{([^}]*)\}/)![1];
    const rowRule = mobileRows.match(/\.hud-construction-option \{([^}]*)\}/)![1];
    expect(listRule).toContain('max-height: 215px');
    expect(listRule).toContain('overflow-y: auto');
    expect(listRule).toContain('overscroll-behavior: contain');
    expect(listRule).not.toMatch(/(?:^|[;\n])\s*(?:height|min-height):/);
    expect(listRule).not.toContain('50vh');
    expect(rowRule).toContain('box-sizing: border-box');
    expect(rowRule).toContain('height: 58px');
    expect(rowRule).toContain('flex: 0 0 58px');
    expect(HUD_CSS).toMatch(/\.hud-construct-options \{[^}]*gap: 4px;/);
    expect(3 * 58 + 3 * 4 + 58 / 2).toBe(215);
    // One to three rows fit below the cap without a fixed or minimum list height.
    for (const count of [1, 2, 3]) {
      expect(count * 58 + (count - 1) * 4).toBeLessThan(215);
    }
    expect(4 * 58 + 3 * 4).toBeGreaterThan(215);
    expect(mobileRows).not.toMatch(/touch-action:\s*none/);
  });

  it('retains construction information without changing conversion rows or expansion', () => {
    expect(construction).toContain('info-row-emoji');
    expect(construction).toContain('{opt.label}');
    expect(construction).toContain('info-row-cost');
    expect(construction).toContain('Need {missingResources}');
    expect(construction).toContain('hud-construction-tech-lock-badge');
    expect(conversion).toContain('const [collapsed, setCollapsed] = useState(true)');
    expect(conversion).not.toContain('hud-construction-option');
    expect(conversion).not.toContain('onExpandedChange');
  });
});
