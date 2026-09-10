"use client";

import * as React from "react";

/**
 * How many rows of a given height fit in an element, measured rather than
 * assumed.
 *
 * The month grid capped every cell at three tasks, on a laptop and on a 27"
 * display alike. Six rows of cells share whatever height the window has, so on
 * a tall screen there was visible empty space under a « +4 de plus » — the
 * information was there, the room was there, and the constant in the middle
 * refused to put them together.
 *
 * A ResizeObserver rather than a media query: the number depends on the height
 * the grid actually got, which depends on the window, the browser chrome, and
 * whether the preview banner is showing. Only the window can answer that.
 */
export function useRowsThatFit(
  ref: React.RefObject<HTMLElement | null>,
  rowHeight: number,
  /** Space the row area does not get — a date numeral, padding, the +N line. */
  reserved: number,
  fallback = 3,
): number {
  const [rows, setRows] = React.useState(fallback);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      // six rows of cells share the grid's height
      const cell = node.getBoundingClientRect().height / 6;
      const usable = cell - reserved;
      // at least one, or a short window shows a cell with nothing but a "+3"
      setRows(Math.max(1, Math.floor(usable / rowHeight)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rowHeight, reserved]);

  return rows;
}
