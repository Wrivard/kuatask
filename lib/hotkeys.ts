"use client";

import * as React from "react";

/**
 * Shortcuts do not fire while an input, textarea or contenteditable has focus,
 * with two exceptions: Esc and ⌘K always work. Single-key shortcuts also ignore
 * meta, ctrl and alt so browser shortcuts pass through untouched.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

export type Handlers = Record<string, (e: KeyboardEvent) => void>;

/**
 * Binds single-key handlers, keyed by lowercase key name. `mod+k` and `mod+z`
 * are recognised with either meta or ctrl.
 */
export function useHotkeys(handlers: Handlers, enabled = true) {
  const ref = React.useRef(handlers);
  ref.current = handlers;

  React.useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      const map = ref.current;

      // always-on, even from inside a field
      if (mod && key === "k" && map["mod+k"]) {
        e.preventDefault();
        map["mod+k"](e);
        return;
      }
      if (key === "escape" && map["escape"]) {
        map["escape"](e);
        return;
      }
      if (mod && key === "z" && map["mod+z"] && !isTypingTarget(e.target)) {
        e.preventDefault();
        map["mod+z"](e);
        return;
      }

      if (mod || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const handler = map[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/**
 * Two-key sequences: G then C, G then L. The prefix expires so a stray G does
 * not swallow the next real keystroke.
 */
export function useSequence(
  prefix: string,
  handlers: Record<string, () => void>,
  timeoutMs = 1200,
) {
  const armed = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = React.useRef(handlers);
  ref.current = handlers;

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (armed.current) {
        armed.current = false;
        if (timer.current) clearTimeout(timer.current);
        const handler = ref.current[key];
        if (handler) {
          e.preventDefault();
          handler();
        }
        return;
      }

      if (key === prefix) {
        armed.current = true;
        timer.current = setTimeout(() => {
          armed.current = false;
        }, timeoutMs);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [prefix, timeoutMs]);
}
