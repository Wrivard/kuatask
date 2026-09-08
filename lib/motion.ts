/**
 * Animation tokens. See docs/04-design-system.md.
 *
 * Non-user-triggered animation is banned, with one exception: the clear-out
 * sweep in docs/08-satisfaction.md. Nothing user-triggered exceeds 260ms.
 */

import type { Transition } from 'motion/react';

export const spring: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 34,
  mass: 0.7,
};

export const snap: Transition = {
  duration: 0.16,
  ease: [0.32, 0.72, 0, 1],
};

export const exit: Transition = {
  duration: 0.22,
  ease: [0.4, 0, 1, 1],
};

/** Timings from the completion sequence, 8.1. Tune in Phase 6. */
export const COMPLETION = {
  checkDrawDelay: 60,     // ms before the checkmark starts drawing
  checkDrawDuration: 180,
  fillWipe: 140,
  strikethrough: 200,
  /** The beat where the satisfaction lives. Do not remove the row instantly. */
  holdBeforeCollapse: 900,
  collapse: 220,
} as const;

export const SWEEP_DURATION = 600; // clear-out light band, 8.5

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Drop transforms under reduced motion; keep a legible opacity change. */
export function motionSafe<T extends Record<string, unknown>>(
  full: T,
  // the default is a plain opacity hold; T is unconstrained, so widen through unknown
  reduced: Partial<T> = { opacity: 1 } as unknown as Partial<T>,
): T | Partial<T> {
  return prefersReducedMotion() ? reduced : full;
}
