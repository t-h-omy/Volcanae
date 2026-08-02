import { MAP } from './gameConfig';
import type { GameEvent } from './gameEvents';
import type { Position } from './types';
import { useFlyToHudStore } from './flyToHudStore';

const EMBER_HUD_SELECTOR = '[data-hud-target="ember"]';

function centerOfElement(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function tileToScreenCenter(position: Position): { x: number; y: number } | null {
  const gridEl = document.querySelector('.grid-container');
  if (!gridEl) return null;
  const rect = gridEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const tileW = rect.width / MAP.GRID_WIDTH;
  const tileH = rect.height / MAP.GRID_HEIGHT;
  return {
    x: rect.left + (position.x + 0.5) * tileW,
    y: rect.top + (position.y + 0.5) * tileH,
  };
}

function startFlight(from: { x: number; y: number }): void {
  useFlyToHudStore.getState().addFlight({
    emoji: '🔥',
    fromScreenX: from.x,
    fromScreenY: from.y,
    targetSelector: EMBER_HUD_SELECTOR,
  });
}

function triggerTurnIntervalFlight(attempt = 0): void {
  const popup = document.querySelector('.hud-turn-popup');
  if (popup) {
    startFlight(centerOfElement(popup));
    return;
  }
  if (attempt < 24) {
    requestAnimationFrame(() => triggerTurnIntervalFlight(attempt + 1));
    return;
  }
  const emberTarget = document.querySelector(EMBER_HUD_SELECTOR);
  if (emberTarget) {
    startFlight(centerOfElement(emberTarget));
  }
}

export function triggerEmberLevelUpVfx(event: Extract<GameEvent, { type: 'EMBER_LEVEL_UP' }>): void {
  if (event.source === 'TURN_INTERVAL') {
    triggerTurnIntervalFlight();
    return;
  }
  if (!event.position) return;
  const sourceCenter = tileToScreenCenter(event.position);
  if (!sourceCenter) return;
  startFlight(sourceCenter);
}
