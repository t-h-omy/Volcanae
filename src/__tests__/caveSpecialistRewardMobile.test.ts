import { describe, expect, it } from 'vitest';
import HUD from '../components/HUD.tsx?raw';
import CSS from '../components/HUD.css?raw';

const modal = HUD.slice(HUD.indexOf('function CaveMonsterKillModal()'), HUD.indexOf('// TURN ANNOUNCEMENT POPUP'));

describe('cave reward modal layout and choices', () => {
  it('keeps reward decisions outside the scrollable body in hire and swap modes', () => {
    expect(modal).not.toContain('Send Away');
    expect(modal).toContain('resolveReward({ type: \'hire\' })');
    expect(modal).toContain('resolveReward({ type: \'swap\', outgoingId: specId })');
    expect(modal.match(/resolveReward\(\{ type: 'rob' \}\)/g)).toHaveLength(2);
    expect(modal.match(/t\('hud\.caveKill\.rob', \{ crystals: CAVE_SPECIALIST_ROB_REWARD_CRYSTALS \}\)/g)).toHaveLength(2);
    expect(modal).toContain('onClick={closeExhausted}');
    expect(modal.indexOf('cave-kill-swap-current-row')).toBeLessThan(modal.lastIndexOf('cave-kill-actions'));
  });

  it('bounds the shell to the dynamic viewport and scrolls the body, not the footer', () => {
    const card = CSS.match(/\.cave-kill-card \{([^}]*)\}/)?.[1];
    const body = CSS.match(/\.cave-kill-body \{([^}]*)\}/)?.[1];
    const actions = CSS.match(/\.cave-kill-actions \{([^}]*)\}/)?.[1];
    expect(card).toContain('max-height: calc(100dvh - 24px)');
    expect(card).toContain('overflow: hidden');
    expect(body).toContain('min-height: 0');
    expect(body).toContain('overflow-y: auto');
    expect(actions).toContain('flex: 0 0 auto');
    expect(CSS).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.cave-kill-actions \{\s*flex-direction: column/);
  });
});
