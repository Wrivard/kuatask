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

/**
 * `/` turns the composer into a search box rather than opening a second UI.
 *
 * Optionally with a query already in it, which is what clicking a label chip
 * does — « chercher #facture » should arrive at results, not at an empty box
 * somebody then has to retype the tag into.
 */
export function startSearch(query?: string) {
  window.dispatchEvent(new CustomEvent(START_SEARCH, { detail: query ?? null }));
}

export function useStartSearch(handler: (query: string | null) => void) {
  const ref = React.useRef(handler);
  ref.current = handler;

  React.useEffect(() => {
    const listener = (e: Event) =>
      ref.current((e as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(START_SEARCH, listener);
    return () => window.removeEventListener(START_SEARCH, listener);
  }, []);
}

/**
 * The query parameter the list reads on arrival.
 *
 * Search lives in the list's composer, so it can only be *started* where that
 * composer is mounted. Everywhere else — the board, the calendar, the activity
 * log — the event fell on nothing: pressing `/` on the board did nothing at all,
 * and the owner reasonably concluded search was broken. It was reachable from
 * exactly one of five screens.
 *
 * A URL carries it instead, so any surface can ask for a search by navigating,
 * and the result is also a link somebody can keep.
 */
export const SEARCH_PARAM = "q";

/** Where to go to search for something, from anywhere. */
export function searchHref(query: string): string {
  return `/?${SEARCH_PARAM}=${encodeURIComponent(query)}`;
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
