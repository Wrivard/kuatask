'use client';

import * as React from 'react';
import { now } from '@/lib/time';

/*
  One clock for the whole list rather than a timer per row. A hundred rows each
  holding a setInterval to find out whether their « Nouveau » has expired would
  be a hundred timers answering the same question.
*/
let current = now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      current = now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The time, to the minute, shared by every caller.
 *
 * For things that expire on a scale of hours; nothing that has to be exact to
 * the second should read this.
 */
export function useMinute(): number {
  return React.useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
