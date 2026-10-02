import { describe, expect, it } from 'vitest';
import HUD_TSX from '../components/HUD.tsx?raw';
import HUD_CSS from '../components/HUD.css?raw';

// The existing Vitest setup has no DOM engine; assert the UI wiring and layout contract.
const construction = HUD_TSX.slice(HUD_TSX.indexOf('function ConstructionPanel('), HUD_TSX.indexOf('function ConversionPanel('));
const overlay = HUD_TSX.slice(HUD_TSX.indexOf('function TechTreeOverlay('), HUD_TSX.indexOf('function TechTreeOverlay(') + 14000);

describe('construction research navigation UI contract', () => {
  it('navigates locked rows before resource hints or building confirmation', () => {
    const handler = construction.slice(construction.indexOf('const handleSelectConstruction'), construction.indexOf('return (', construction.indexOf('const handleSelectConstruction')));
    expect(handler.indexOf('if (techLocked)')).toBeLessThan(handler.indexOf('if (!canAffordThis)'));
    expect(handler).toMatch(/if \(techLocked\) \{[\s\S]*onOpenTechTreeAt\(unlockTechId\);[\s\S]*return;/);
    expect(handler).toContain("tryTriggerHint('H20_BUILD_NO_RESOURCES')");
    expect(handler).toContain('setConfirmBuilding(opt)');
    expect(construction).toContain('<BuildingInfoPopup');
    expect(construction).toContain('constructBuilding(unit.id, tilePos, confirmBuilding.buildingType)');
  });

  it('keeps locked rows clickable, labels their navigation, and hides the info affordance', () => {
    expect(construction).not.toMatch(/\sdisabled=/);
    expect(construction).toContain('Locked. Open unlock technology in Tech Tree.');
    expect(construction).toContain("'Unlock in Tech Tree'");
    expect(construction).toContain('!techLocked && <span className="info-badge');
    expect(construction).toContain('hud-construction-tech-lock-badge');
  });

  it('shows resource shortages on researched rows even with hints disabled', () => {
    expect(construction).toContain('`${opt.cost.iron - resources.iron} more iron`');
    expect(construction).toContain('`${opt.cost.wood - resources.wood} more wood`');
    expect(construction).toMatch(/!techLocked && !canAffordThis && \(\s*<div className="hud-pop-warning">Need \{missingResources\}/);
    expect(construction).not.toContain('hintsEnabled');
  });

  it('dims only content, leaving the research badge at full opacity', () => {
    expect(HUD_CSS).toMatch(/\.info-row-btn--tech-locked \{[^}]*\}/);
    const parent = HUD_CSS.match(/\.info-row-btn--tech-locked \{([^}]*)\}/)![1];
    expect(parent).not.toContain('opacity');
    expect(HUD_CSS).toMatch(/\.info-row-btn--tech-locked \.info-row-emoji,[\s\S]*?\.info-row-btn--tech-locked \.info-row-body \{\s*opacity: 0\.45;/);
    expect(HUD_CSS).toMatch(/\.hud-construction-tech-lock-badge \{[^}]*opacity: 1;/);
  });

  it('selects the requested tech on initial render and positions it before paint', () => {
    expect(overlay).toContain('const [selectedId, setSelectedId] = useState<TechId | null>(focusId)');
    expect(overlay).toContain('useLayoutEffect(() =>');
    expect(overlay).toContain('const centre = nodeCentre(focusId)');
    expect(overlay).toContain('el.scrollWidth - el.clientWidth');
    expect(overlay).toContain('el.scrollHeight - el.clientHeight');
    expect(overlay).toContain('observer.disconnect()');
  });

  it('removes only the transient highlight after 3000 ms and cleans up on close', () => {
    expect(overlay).toContain('window.setTimeout(() => setHighlightId(null), 3000)');
    expect(overlay).toContain('window.clearTimeout(timeout)');
    expect(overlay).toContain("highlightId === def.id ? 'tech-node--focus-highlight'");
    expect(HUD_CSS).toMatch(/\.tech-node--focus-highlight \{[^}]*opacity: 1;[^}]*z-index: 1;[^}]*animation: tech-focus-pulse 1s ease-in-out 3;/);
    expect(HUD_CSS).toMatch(/@keyframes tech-focus-pulse \{[\s\S]*?box-shadow:/);
  });

  it('reserves usable mobile canvas space for the detail sheet without an opening transition', () => {
    expect(HUD_CSS).toMatch(/\.tech-canvas-scroll \{[^}]*min-height: 0;/);
    expect(HUD_CSS).toMatch(/\.tech-overlay--focused \.tech-canvas \{[^}]*margin: 50dvh 50dvw;/);
    expect(HUD_CSS).toMatch(/\.tech-overlay--focused \.tech-detail-sheet \{[^}]*position: relative;[^}]*flex-shrink: 0;[^}]*transition: none;/);
    expect(HUD_CSS).toMatch(/\.tech-overlay--focused \.tech-detail-sheet--open \{[^}]*45dvh/);
  });

  it('clears stale focus for normal opens and retains default root positioning', () => {
    expect(HUD_TSX).toMatch(/onOpenTechTree=\{\(\) => \{\s*setTechTreeFocusId\(null\);\s*setShowTechTree\(true\);/);
    expect(HUD_TSX).toMatch(/const handleCloseTechTree = useCallback\(\(\) => \{\s*setShowTechTree\(false\);\s*setTechTreeFocusId\(null\);/);
    expect(overlay).toContain('el.scrollLeft = rootCenter.x - NODE_W');
    expect(overlay).toContain('el.scrollTop = rootCenter.y - el.clientHeight / 2');
  });
});
