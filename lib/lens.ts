'use client';

import * as React from 'react';

/**
 * A view preference that survives a reload but never leaves this browser.
 *
 * Lenses are not locations. The board's grouping and the calendar's month/week
 * mode do not belong in the URL — sending someone a link to the board should
 * not also send them your grouping. They are not profile settings either: they
 * are per-device, and the two people here use a laptop and a phone very
 * differently. localStorage is exactly the right size for that.
 *
 * The read happens in an effect rather than in the state initializer. These
 * components render on the server too, where there is no storage, and reading
 * it during the first client render would make the browser's markup disagree
 * with the server's.
 */
export function useLocalLens<T extends string>(
  key: string,
  fallback: T,
  /**
   * The values worth restoring. Omit it where the value is free-form — a set of
   * collapsed column keys, say — and anything stored is taken as written.
   */
  allowed?: readonly T[],
): [T, (next: T) => void] {
  const [value, setValue] = React.useState<T>(fallback);

  const allowedRef = React.useRef(allowed);
  allowedRef.current = allowed;

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      if (saved !== null && (!allowedRef.current || allowedRef.current.includes(saved))) {
        setValue(saved);
      }
    } catch {
      /* blocked storage — the default stands, and that is a fine outcome */
    }
  }, [key]);

  const choose = React.useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* blocked storage */
      }
    },
    [key],
  );

  return [value, choose];
}
