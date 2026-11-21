import { useEffect, useRef, useState } from 'react';
import { ANIMATION } from '../config/animation';
import { UNIT_BACKGROUND_EFFECT_PRIORITY } from '../config/render';

export type LayerFx = 'absorb' | 'break' | 'recharge';

export function resolveLayerFx(previous: number | undefined, next: number | undefined): LayerFx | null {
  if (previous === next) return null;
  if (previous === undefined) return next !== undefined && next > 0 ? 'recharge' : null;
  if (next === undefined) return previous > 0 ? 'break' : null;
  if (next > previous) return 'recharge';
  if (next === 0) return 'break';
  if (next > 0 && next < previous) return 'absorb';
  return null;
}

export function resolveUnitBackgroundEffect(activeIds: readonly string[]): string | null {
  for (const priorityId of UNIT_BACKGROUND_EFFECT_PRIORITY) {
    if (activeIds.includes(priorityId)) return priorityId;
  }
  return null;
}

export function useProtectiveLayerFx(
  value: number,
  rechargeDelayMs = 0,
  onRecharge?: (gained: number) => void,
): [LayerFx | null, number] {
  const previousRef = useRef(value);
  const callbackRef = useRef(onRecharge);
  const [fx, setFx] = useState<LayerFx | null>(null);
  const [delay, setDelay] = useState(0);

  useEffect(() => {
    callbackRef.current = onRecharge;
  }, [onRecharge]);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = value;
    const resolved = resolveLayerFx(previous, value);
    if (!resolved) return;

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    if (resolved === 'recharge' && callbackRef.current) {
      timers.push(setTimeout(() => callbackRef.current?.(value - previous), rechargeDelayMs));
    }
    timers.push(setTimeout(() => {
      setDelay(rechargeDelayMs);
      setFx(resolved);
    }, 0));
    timers.push(setTimeout(() => setFx(null), rechargeDelayMs + ANIMATION.PROTECTIVE_LAYER_FX_DURATION_MS));
    return () => timers.forEach(clearTimeout);
  }, [value, rechargeDelayMs]);

  return [fx, delay];
}
