/**
 * UI regression coverage for the Market "Replace a Specialist" popup on a
 * portrait mobile browser viewport (v0.113.6).
 *
 * The test suite has no DOM/layout engine available, so the layout contract is
 * asserted against the component markup and its stylesheet:
 *   1. The swap card is a bounded flex column sized with dynamic viewport units,
 *      so the panel height stays inside a portrait mobile viewport.
 *   2. The specialist list is the only scroll container.
 *   3. Cancel lives in a non-scrolling footer outside that scroll container and
 *      is always rendered, even with three owned specialists.
 */

import { describe, it, expect } from 'vitest';
import HUD_TSX from '../components/HUD.tsx?raw';
import HUD_CSS from '../components/HUD.css?raw';

/** Returns the declaration block of the last rule whose selector matches exactly. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...HUD_CSS.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'gm'))];
  expect(matches.length, `missing CSS rule for ${selector}`).toBeGreaterThan(0);
  return matches[matches.length - 1][1];
}

/** All values declared for a property inside a rule, in source order. */
function declarations(body: string, property: string): string[] {
  return [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]+)`, 'g'))].map((m) =>
    m[1].trim(),
  );
}

/** The swap sub-view markup: from the swap card element to its closing overlay. */
function swapMarkup(): string {
  const start = HUD_TSX.indexOf('market-panel-card market-panel-card--swap');
  expect(start, 'swap card markup not found').toBeGreaterThan(-1);
  const end = HUD_TSX.indexOf('market-panel-title">🪙 Market', start);
  expect(end).toBeGreaterThan(start);
  return HUD_TSX.slice(start, end);
}

// Portrait viewport approximating a mobile browser (iPhone-class, with chrome).
const PORTRAIT_VIEWPORT = { width: 390, height: 664 };

describe('Market specialist swap popup on a portrait mobile viewport', () => {
  it('bounds the panel height by the dynamic viewport', () => {
    const body = ruleBody('.market-panel-card--swap');
    const maxHeights = declarations(body, 'max-height');

    expect(maxHeights.length).toBeGreaterThanOrEqual(1);
    // Dynamic viewport unit wins (last declaration), with a vh fallback first.
    const effective = maxHeights[maxHeights.length - 1];
    expect(effective).toContain('dvh');
    if (maxHeights.length > 1) {
      expect(maxHeights[0]).toContain('vh');
      expect(maxHeights[0]).not.toContain('dvh');
    }

    const dvhMatch = effective.match(/(\d+(?:\.\d+)?)dvh(?:\s*-\s*(\d+(?:\.\d+)?)px)?/);
    expect(dvhMatch, `unparsable max-height: ${effective}`).not.toBeNull();
    const percent = Number(dvhMatch![1]);
    const inset = dvhMatch![2] ? Number(dvhMatch![2]) : 0;
    const resolved = (PORTRAIT_VIEWPORT.height * percent) / 100 - inset;

    expect(resolved).toBeLessThanOrEqual(PORTRAIT_VIEWPORT.height);
    expect(resolved).toBeGreaterThan(0);

    // The card itself is a bounded flex column that does not scroll as one document.
    expect(declarations(body, 'display')).toContain('flex');
    expect(declarations(body, 'flex-direction')).toContain('column');
    expect(declarations(body, 'overflow')).toContain('hidden');
    // Safe-area aware bottom padding.
    expect(declarations(body, 'padding-bottom').join(' ')).toContain('env(safe-area-inset-bottom');
  });

  it('makes the specialist list the scroll container', () => {
    const list = ruleBody('.market-panel-swap-list');
    expect(declarations(list, 'overflow-y')).toContain('auto');
    expect(declarations(list, 'min-height')).toContain('0');
    expect(declarations(list, 'flex').join(' ')).toContain('1');

    // Header and footer never absorb the overflow.
    const footer = ruleBody('.market-panel-swap-footer');
    expect(declarations(footer, 'overflow-y')).toHaveLength(0);
    expect(declarations(footer, 'flex').join(' ')).toContain('0 0 auto');
    expect(declarations(footer, 'position')).toContain('sticky');
  });

  it('keeps Cancel outside the scroll container and always rendered', () => {
    const markup = swapMarkup();

    const listStart = markup.indexOf('market-panel-swap-list');
    const footerStart = markup.indexOf('market-panel-swap-footer');
    const cancelStart = markup.indexOf('market-panel-btn--close');

    expect(listStart).toBeGreaterThan(-1);
    expect(footerStart).toBeGreaterThan(listStart);
    expect(cancelStart).toBeGreaterThan(footerStart);

    // The list only contains the per-specialist rows, which are rendered by the
    // map over globalSpecialistStorage (three owned specialists included).
    const listRegion = markup.slice(listStart, footerStart);
    expect(listRegion).toContain('globalSpecialistStorage.map');
    expect(listRegion).not.toContain('market-panel-btn--close');

    // Cancel is unconditional (no surrounding conditional render) and labelled.
    const footerRegion = markup.slice(footerStart);
    expect(footerRegion).toContain('Cancel');
    expect(footerRegion).toContain('onClick={cancelSpecialistSwap}');
    expect(footerRegion).not.toContain('&&');
  });

  it('offers a header close control that also cancels the swap', () => {
    const markup = swapMarkup();
    const header = markup.slice(0, markup.indexOf('market-panel-swap-list'));
    expect(header).toContain('market-panel-close');
    expect(header).toContain('onClick={cancelSpecialistSwap}');
    expect(header).toMatch(/aria-label="[^"]*[Cc]ancel[^"]*"/);
    // Title and incoming specialist summary remain in the non-scrolling head.
    expect(header).toContain('🔄 Replace a Specialist');
    expect(header).toContain('market-panel-specialist-incoming');
  });

  it('leaves replacement pricing untouched', () => {
    const markup = swapMarkup();
    expect(markup).toContain('MARKET.SPECIALIST_PRICE_CRYSTAL');
    expect(markup).toContain('buyMarketSpecialist(marketId, pendingSpecialistSlot, specId)');
  });
});
