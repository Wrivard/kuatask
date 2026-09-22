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
    /*
      The clock only runs while something reads it, so the value it last held
      can be hours old by the time the list mounts again — long enough to keep
      « Nouveau » on a task that stopped being new before you came back.
      React re-reads the snapshot after subscribing, so the fresh value lands.
    */
    current = now();
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
export function useMinute(): number | null {
  return React.useSyncExternalStore(
    subscribe,
    () => current,
    /*
      Null on the server. A module-level time there is whenever the process
      first imported this file, which on a long-lived server is hours ago — and
      a server render that disagrees with the client's about what is new is a
      hydration mismatch. Null means "not yet known", which isFresh reads as no.
    */
    () => null,
  );
}
