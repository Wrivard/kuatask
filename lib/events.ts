"use client";

import * as React from "react";

/**
 * A two-event channel between the shell and whichever view is mounted.
 *
 * The palette needs to focus the composer and open a task, but the composer and
 * the modal belong to the view. Routing that through the store would put view
 * state in the data layer; a context would thread a provider through every
 * route for two messages. These are the two messages.
 */
const FOCUS_COMPOSER = "kua:focus-composer";
const OPEN_TASK = "kua:open-task";
const START_SEARCH = "kua:start-search";

export function focusComposer() {
  window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER));
}

/**
 * Where focus should land when a task opens.
 *
 * Normally nowhere in particular — the modal focuses the title, which is what
 * you want when you opened an existing task to look at it. `"notes"` is for the
 * composer's Shift+Enter: the title is what you just typed, so landing in it
 * means tabbing past it to reach the thing you opened the task for.
 */
export type OpenFocus = "notes";

export function openTask(id: string, focus?: OpenFocus) {
  window.dispatchEvent(new CustomEvent(OPEN_TASK, { detail: { id, focus } }));
}

export function useFocusComposer(handler: () => void) {
  const ref = React.useRef(handler);
  ref.current = handler;

  React.useEffect(() => {
    const listener = () => ref.current();
    window.addEventListener(FOCUS_COMPOSER, listener);
    return () => window.removeEventListener(FOCUS_COMPOSER, listener);
  }, []);
}

/** `/` turns the composer into a search box rather than opening a second UI. */
export function startSearch() {
  window.dispatchEvent(new CustomEvent(START_SEARCH));
}

export function useStartSearch(handler: () => void) {
  const ref = React.useRef(handler);
  ref.current = handler;

  React.useEffect(() => {
    const listener = () => ref.current();
    window.addEventListener(START_SEARCH, listener);
    return () => window.removeEventListener(START_SEARCH, listener);
  }, []);
}

export function useOpenTask(handler: (id: string, focus?: OpenFocus) => void) {
  const ref = React.useRef(handler);
  ref.current = handler;

  React.useEffect(() => {
    const listener = (e: Event) => {
      const { id, focus } = (e as CustomEvent<{ id: string; focus?: OpenFocus }>).detail;
      ref.current(id, focus);
    };
    window.addEventListener(OPEN_TASK, listener);
    return () => window.removeEventListener(OPEN_TASK, listener);
  }, []);
}

/**
 * The open-task modal state, which all three views had separately.
 *
 * They had it three times and not identically: the calendar never subscribed to
 * the event at all, so on `/calendar` the palette's "open this task" did
 * nothing — it set the state the other two views set, in a component that was
 * not mounted. One hook means a view cannot forget half of it.
 */
export function useTaskModal() {
  const [open, setOpen] = React.useState<{ id: string; focus?: OpenFocus } | null>(null);

  useOpenTask((id, focus) => setOpen({ id, focus }));

  return {
    openId: open?.id ?? null,
    /** Only meaningful for the modal this object currently describes. */
    focus: open?.focus,
    open: React.useCallback((id: string) => setOpen({ id }), []),
    close: React.useCallback(() => setOpen(null), []),
  };
}
