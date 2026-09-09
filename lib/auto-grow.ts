"use client";

import * as React from "react";

/**
 * A textarea that is exactly as tall as its content.
 *
 * docs/06-views.md asks for this on both the title and the notes. A fixed two
 * rows means a long note scrolls inside a box the size of a stamp, in a modal
 * with room to spare — and the modal is the place the full text is supposed to
 * live, so hiding it there defeats the point of opening it.
 *
 * Measured in a layout effect: the height is set before the browser paints, so
 * the field never appears at the wrong size and snap to the right one.
 */
export function useAutoGrow<T extends HTMLTextAreaElement>(value: string) {
  const ref = React.useRef<T>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // collapse first, or scrollHeight only ever reports the current height
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return ref;
}
