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

/**
 * Timings from the completion sequence, § 8.1, tuned per § 8.9.
 *
 * The reasoning for each is in DECISIONS.md, which § 8.9 asks for by name so
 * they are not silently reverted by somebody who thinks they are placeholders.
 * They are not: 900 and 180 were the starting values and both moved.
 */
export const COMPLETION = {
  checkDrawDelay: 60,     // ms before the checkmark starts drawing
  /** 180 read as a pop against the 140ms wipe it lands on. */
  checkDrawDuration: 220,
  fillWipe: 140,
  strikethrough: 200,
  /**
   * The beat where the satisfaction lives. Do not remove the row instantly.
   *
   * 900 was the starting value and it cut the tone off: the note is 180ms and
   * lands at 0, the check finishes drawing at 280, and the row left while the
   * sound was still deciding what it had been. 1100 lets the whole sequence
   * finish before the row moves, and is inside the 700–1100 § 8.1 predicts.
   */
  holdBeforeCollapse: 1100,
  collapse: 220,
  /**
   * The ring that leaves the checkbox when it is ticked.
   *
   * Not in the spec, which is why it is small and why it is here rather than in
   * the checkbox: one expanding circle at 2px, fading as it goes. It reads as
   * the tick having *happened* rather than the box having changed, which is the
   * difference § 8.1 is chasing with the draw-not-fade rule.
   */
  ripple: 420,
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
