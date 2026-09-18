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

/**
 * The two timings that were living in components as bare numbers.
 *
 * § 8.9 is a tuning pass, and tuning means changing a value and seeing how it
 * feels. Everything else in the completion sequence is named here for exactly
 * that reason — these two were not, so they could only be found by grep, and a
 * number you cannot find is a number nobody tunes.
 */
export const SETTLE = {
  /**
   * The checkbox's scale spring, § 8.1: 1 → 0.88 → 1.04 → 1.
   *
   * 260ms is not incidental — it is the ceiling `docs/04` sets for anything a
   * user triggered, and this is the one animation that sits exactly on it. Worth
   * naming so that a later nudge upward is a visible decision rather than a
   * digit.
   */
  checkboxScale: 260,
  /**
   * Keyframe positions for that scale, as fractions of the duration.
   *
   * Typed as a mutable array rather than caught by the `as const` below:
   * motion takes `number[]`, and a readonly tuple is not assignable to it.
   */
  checkboxTimes: [0, 0.25, 0.6, 1] as number[],

  /** The clear-out's settled state fading in, § 8.5 step 3. */
  settleFade: 240,
  /**
   * How long it waits first.
   *
   * The band sweeps for 600ms; this starts at 200 so the words are arriving
   * while the light is still crossing rather than after it has gone. Under
   * reduced motion there is no sweep to wait for, so the delay is dropped.
   */
  settleDelay: 200,
} as const;

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

/*
  The checkmark, as points, so the path and its length cannot disagree.

  They did. The length was a hand-written 13.2 beside a path that is 10.879
  long, so `stroke-dasharray` was 21% longer than the stroke it dashed and the
  last 17.6% of every draw had nothing left to draw — the tick finished early
  and the animation ran on into dead time.

  That is a bug in the one thing § 8.1 calls "most of the effect", and it hid a
  second one: raising `checkDrawDuration` from 180 to 220 in the § 8.9 pass was
  meant to stop the tick reading as a pop, and mostly did not, because the
  visible part of the draw only went from ~148ms to ~181ms while the dead tail
  grew with it. With the length right, 220ms is 220ms of drawing.

  It lives here rather than in the component so `verify:logic` can assert the
  two agree. A hand-measured constant is correct until somebody nudges a
  coordinate, and nothing about the result says it has stopped being correct.
*/
export const CHECK_POINTS = [
  [3.5, 7.2],
  [6.2, 9.9],
  [10.5, 4.3],
] as const;

/** The `d` attribute, built from the points rather than written beside them. */
export const CHECK_PATH = "M" + CHECK_POINTS.map(([x, y]) => `${x} ${y}`).join(" L");

/** Its length, for `stroke-dasharray` and the `stroke-dashoffset` it animates. */
export const CHECK_LENGTH = CHECK_POINTS.reduce(
  (total, [x, y], i) =>
    i === 0
      ? 0
      : total + Math.hypot(x - CHECK_POINTS[i - 1][0], y - CHECK_POINTS[i - 1][1]),
  0,
);
