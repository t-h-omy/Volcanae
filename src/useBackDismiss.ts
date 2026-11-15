import { useEffect, useRef } from 'react';
import { registerBackEntry, unregisterBackEntry, type BackHandler } from './backNavigation';

export function useBackDismiss(handler: BackHandler, active = true): void {
  const handlerRef = useRef<BackHandler>(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    const id = registerBackEntry(handlerRef);
    return () => unregisterBackEntry(id);
  }, [active]);
}
