"use client";

import * as React from "react";

/**
 * Remembers where a view was scrolled to, per route, for the session.
 *
 * docs/12-definition-of-done.md asks that scroll position survive a view switch.
 * The three views are real routes so the back button works, and Next sends you
 * to the top on a push navigation — which means glancing at the calendar and
 * coming back dumps you at the top of a list you were halfway down. For a list
 * you check several times a day that is a small, repeated tax.
 *
 * Kept in memory rather than sessionStorage: it should survive a view switch,
 * not a reload, and after a reload the top is the right place to be anyway.
 */
const positions = new Map<string, number>();
const offsets = new Map<string, number>();

export function useScrollMemory(key: string, enabled = true) {
  React.useLayoutEffect(() => {
    if (!enabled) return;

    const saved = positions.get(key);
    if (saved) {
      // layout effect, so the restore lands before the browser paints
      window.scrollTo(0, saved);
    }

    const remember = () => positions.set(key, window.scrollY);
    window.addEventListener("scroll", remember, { passive: true });

    return () => {
      window.removeEventListener("scroll", remember);
      remember();
    };
  }, [key, enabled]);
}

/**
 * The same memory for an element that scrolls sideways.
 *
 * The board scrolls horizontally rather than in the window, so the hook above
 * cannot see it — and the board is the view where losing your place costs the
 * most, because column five is a deliberate journey rather than a flick.
 */
export function useElementScrollMemory(
  key: string,
  ref: React.RefObject<HTMLElement | null>,
) {
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const saved = offsets.get(key);
    if (saved) node.scrollLeft = saved;

    const remember = () => offsets.set(key, node.scrollLeft);
    node.addEventListener("scroll", remember, { passive: true });

    return () => {
      node.removeEventListener("scroll", remember);
      remember();
    };
  }, [key, ref]);
}
