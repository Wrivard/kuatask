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

export function focusComposer() {
  window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER));
}

export function openTask(id: string) {
  window.dispatchEvent(new CustomEvent(OPEN_TASK, { detail: id }));
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

export function useOpenTask(handler: (id: string) => void) {
  const ref = React.useRef(handler);
  ref.current = handler;

  React.useEffect(() => {
    const listener = (e: Event) => ref.current((e as CustomEvent<string>).detail);
    window.addEventListener(OPEN_TASK, listener);
    return () => window.removeEventListener(OPEN_TASK, listener);
  }, []);
}
