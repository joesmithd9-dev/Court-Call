import { useState, useCallback, useRef } from 'react';

const LOCK_MS = 500;

/**
 * 6.4: Tap protection — prevents double-tap on action buttons.
 * Returns [locked, guardedHandler] where locked indicates visual feedback state.
 */
export function useTapGuard(handler: () => Promise<void>): [boolean, () => void] {
  const [locked, setLocked] = useState(false);
  const lockRef = useRef(false);

  const guarded = useCallback(() => {
    if (lockRef.current) return;
    lockRef.current = true;
    setLocked(true);

    handler().finally(() => {
      setTimeout(() => {
        lockRef.current = false;
        setLocked(false);
      }, LOCK_MS);
    });
  }, [handler]);

  return [locked, guarded];
}
