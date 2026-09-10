"use client";

import * as React from "react";

/**
 * How many rows fit in an element, measured rather than assumed.
 *
 * The month grid capped every cell at three tasks, on a laptop and on a 27"
 * display alike. Six rows of cells share whatever height the window has, so on
 * a tall screen there was visible empty space under a « +4 de plus » — the
 * information was there, the room was there, and the constant in the middle
 * refused to put them together.
 *
 * Both numbers come from the DOM. The first version of this took the row height
 * as a constant with a comment claiming it had been measured from the rendered
 * card; it had not, it was an estimate, and it would have drifted the moment
 * anybody changed the card's padding — silently, because a slightly wrong row
 * height just means one card too many or too few and nothing looks broken.
 * Reading it from a card that is actually on screen cannot drift.
 *
 * A ResizeObserver rather than a media query: the answer depends on the height
 * the grid actually got, which depends on the window, the browser chrome, and
 * whether the preview banner is showing. Only the window can answer that.
 */
export function useRowsThatFit({
  ref,
  rows,
  rowSelector,
  reserved,
  fallbackRowHeight,
  fallback = 3,
}: {
  ref: React.RefObject<HTMLElement | null>;
  /** How many bands the element's height is divided into — the grid's rows. */
  rows: number;
  /** A row already rendered inside it, to take the height from. */
  rowSelector: string;
  /** Space a band does not get: a date numeral, padding, room for a « +N ». */
  reserved: number;
  /** Used only before the first row exists, on the very first paint. */
  fallbackRowHeight: number;
  fallback?: number;
}): number {
  const [fits, setFits] = React.useState(fallback);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const band = node.getBoundingClientRect().height / rows;

      /*
        `offsetHeight` misses the margin the gap between cards contributes, so
        two consecutive rows are measured and the distance between their tops is
        taken instead. That distance is the pitch, which is the thing being
        divided by — with one row or none, fall back.
      */
      const found = node.querySelectorAll<HTMLElement>(rowSelector);
      let pitch = fallbackRowHeight;
      if (found.length >= 2) {
        const a = found[0].getBoundingClientRect();
        const b = found[1].getBoundingClientRect();
        const measured = b.top - a.top;
        // two rows in different cells sit side by side, not stacked
        if (measured > 0) pitch = measured;
      } else if (found.length === 1) {
        pitch = found[0].getBoundingClientRect().height + 2;
      }

      // at least one, or a short window shows a cell containing only a "+3"
      setFits(Math.max(1, Math.floor((band - reserved) / pitch)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rows, rowSelector, reserved, fallbackRowHeight]);

  return fits;
}
