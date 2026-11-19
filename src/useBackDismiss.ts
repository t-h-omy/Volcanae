import { useEffect, useRef } from 'react';
import { registerBackEntry, unregisterBackEntry, type BackHandler } from './backNavigation';

export function useBackDismiss(handler: BackHandler, priority: number, active = true): void {
  const handlerRef = useRef<BackHandler>(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    const id = registerBackEntry(handlerRef, priority);
    return () => unregisterBackEntry(id);
  }, [active, priority]);
}
