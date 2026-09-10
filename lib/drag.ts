"use client";

import * as React from "react";

/**
 * Pointer-based drag onto a labelled drop target.
 *
 * Pointer events rather than HTML5 drag-and-drop: one code path covers mouse
 * and touch, and touch never gets native dragging at all. Targets mark
 * themselves with `data-drop-target="<key>"`; the target is whatever sits under
 * the pointer, so nesting and scrolling both behave.
 *
 * Two thresholds keep dragging from stealing ordinary interaction:
 *
 *  - mouse drags only begin after MOVE_THRESHOLD pixels, so a click stays a
 *    click and a card can still be opened by clicking it
 *  - touch drags only begin after LONG_PRESS_MS, so the list still scrolls
 */
const MOVE_THRESHOLD = 4;
const LONG_PRESS_MS = 350;

/**
 * Edge auto-scroll while dragging.
 *
 * A board wider than the window has columns you cannot reach: you pick a card
 * up, run out of screen, and there is nowhere to put it — the pointer is
 * captured, so the container will not scroll on its own. Within EDGE_ZONE of a
 * scrollable edge the container scrolls itself, at a speed that ramps with how
 * far into the zone the pointer is, so a nudge creeps and a push moves.
 */
const EDGE_ZONE = 72;
const EDGE_MAX_SPEED = 18;   // px per frame at the very edge

export type DragState = {
  /** The item currently being dragged, or null. */
  dragId: string | null;
  /** The drop target under the pointer, or null. */
  target: string | null;
  /**
   * Where the card would land inside the target, counted in items.
   *
   * Reordering within a column is the drag people expect on a board, and
   * without it dropping a card back where it came from silently does nothing,
   * which reads as the board being broken.
   */
  index: number | null;
  grab: (itemId: string, e: React.PointerEvent) => void;
};

export function useDragToTarget(
  onDrop: (itemId: string, target: string, index: number | null) => void,
): DragState {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<string | null>(null);
  const [index, setIndex] = React.useState<number | null>(null);

  const onDropRef = React.useRef(onDrop);
  onDropRef.current = onDrop;

  const grab = React.useCallback((itemId: string, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const isTouch = e.pointerType !== "mouse";
    const startX = e.clientX;
    const startY = e.clientY;

    let dragging = false;
    let longPress: ReturnType<typeof setTimeout> | null = null;
    let currentTarget: string | null = null;
    let currentIndex: number | null = null;

    const begin = () => {
      if (dragging) return;
      dragging = true;
      setDragId(itemId);
    };

    const targetUnder = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest("[data-drop-target]") ?? null;

    /** The nearest ancestor that can actually scroll on the given axis. */
    const scrollableAncestor = (el: Element | null, axis: "x" | "y") => {
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const overflow = axis === "x" ? style.overflowX : style.overflowY;
        if (!/auto|scroll/.test(overflow)) continue;
        const room =
          axis === "x"
            ? node.scrollWidth - node.clientWidth
            : node.scrollHeight - node.clientHeight;
        if (room > 1) return node;
      }
      return null;
    };

    let edgeFrame: number | null = null;
    let edge: { node: Element; axis: "x" | "y"; speed: number } | null = null;

    const runEdgeScroll = () => {
      if (!edge) {
        edgeFrame = null;
        return;
      }
      if (edge.axis === "x") edge.node.scrollLeft += edge.speed;
      else edge.node.scrollTop += edge.speed;
      edgeFrame = requestAnimationFrame(runEdgeScroll);
    };

    /** Ramps from 0 at the inner boundary of the zone to full at the edge. */
    const speedFor = (distance: number) =>
      Math.ceil(((EDGE_ZONE - distance) / EDGE_ZONE) * EDGE_MAX_SPEED);

    const updateEdgeScroll = (x: number, y: number, container: Element | null) => {
      edge = null;

      const horizontal = scrollableAncestor(container, "x");
      if (horizontal) {
        const box = horizontal.getBoundingClientRect();
        if (x - box.left < EDGE_ZONE) {
          edge = { node: horizontal, axis: "x", speed: -speedFor(x - box.left) };
        } else if (box.right - x < EDGE_ZONE) {
          edge = { node: horizontal, axis: "x", speed: speedFor(box.right - x) };
        }
      }

      // a tall column matters less than an off-screen one, so x wins the tie
      if (!edge) {
        const vertical = scrollableAncestor(container, "y");
        if (vertical) {
          const box = vertical.getBoundingClientRect();
          if (y - box.top < EDGE_ZONE) {
            edge = { node: vertical, axis: "y", speed: -speedFor(y - box.top) };
          } else if (box.bottom - y < EDGE_ZONE) {
            edge = { node: vertical, axis: "y", speed: speedFor(box.bottom - y) };
          }
        }
      }

      if (edge && edgeFrame === null) edgeFrame = requestAnimationFrame(runEdgeScroll);
    };

    /*
      Insertion point is how many card midpoints sit above the pointer. Using
      midpoints rather than edges means the card you are hovering yields as soon
      as you pass its centre, which is what makes the gap feel like it opens
      under the cursor.
    */
    const indexWithin = (container: Element, y: number) => {
      const cards = [...container.querySelectorAll("[data-drop-index]")];
      let n = 0;
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (y > rect.top + rect.height / 2) n += 1;
      }
      return n;
    };

    if (isTouch) longPress = setTimeout(begin, LONG_PRESS_MS);

    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (isTouch) {
          // moved before the long press landed — treat it as a scroll
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_THRESHOLD) {
            cleanup();
          }
          return;
        }
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= MOVE_THRESHOLD) {
          return;
        }
        begin();
      }

      ev.preventDefault();
      const container = targetUnder(ev.clientX, ev.clientY);
      currentTarget = container?.getAttribute("data-drop-target") ?? null;
      currentIndex = container ? indexWithin(container, ev.clientY) : null;
      setTarget(currentTarget);
      setIndex(currentIndex);
      updateEdgeScroll(ev.clientX, ev.clientY, container);
    };

    const cancel = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      currentTarget = null;
      cleanup();
    };

    function cleanup() {
      if (longPress) clearTimeout(longPress);
      if (edgeFrame !== null) cancelAnimationFrame(edgeFrame);
      edgeFrame = null;
      edge = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", abort);
      window.removeEventListener("keydown", cancel);
      dragging = false;
      setDragId(null);
      setTarget(null);
      setIndex(null);
    }

    function abort() {
      currentTarget = null;
      cleanup();
    }

    function finish() {
      const dropped = dragging ? currentTarget : null;
      const at = currentIndex;
      cleanup();
      if (dropped) onDropRef.current(itemId, dropped, at);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", abort);
    window.addEventListener("keydown", cancel);
  }, []);

  return { dragId, target, index, grab };
}
