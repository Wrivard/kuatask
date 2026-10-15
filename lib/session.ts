'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { flushOutbox, watchOutbox } from '@/lib/outbox';

/**
 * Whether there is still a session, and what to do the moment there is not.
 *
 * Nothing in the app used to ask. supabase-js refreshes the token on a timer
 * and the app simply assumed it worked; when the refresh was refused — 12
 * October, 14:37:51 — the session was gone and the screen said nothing. You
 * went on ticking tasks and typing invoice lines for as long as you liked,
 * each one rejected and quietly reverted, and the first honest signal was the
 * login screen after a reload, with the afternoon missing.
 *
 * Two jobs, and they are opposite sides of the same fact:
 *
 *   - say so, immediately and unmistakably, so nobody works into a void;
 *   - send the waiting writes the moment a session exists again.
 *
 * The second is why this is not just a banner. Signing in means a magic link,
 * which means leaving for a mail client and coming back as a fresh page load,
 * so what is waiting has to survive that — see lib/outbox.ts.
 */

let lost = false;
const watchers = new Set<(lost: boolean) => void>();

function tell() {
  for (const fn of watchers) fn(lost);
}

/** Called by lib/write.ts when a write is refused twice for want of a session. */
export function sessionLost() {
  if (lost) return;
  lost = true;
  tell();
}

function sessionBack() {
  if (lost) {
    lost = false;
    tell();
  }
  void flushOutbox();
}

/** Started once, by the app shell. */
let started = false;

export function startSessionWatch() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const supabase = createClient();

  supabase.auth.onAuthStateChange((event) => {
    /*
      TOKEN_REFRESHED and SIGNED_IN both mean there is a live token again — the
      first on the ordinary hourly renewal, the second after a magic link. Both
      are a reason to drain whatever is waiting.
    */
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      sessionBack();
      return;
    }
    if (event === 'SIGNED_OUT') {
      /*
        Deliberate sign-out clears the queue: the next person at this browser
        must not inherit somebody else's unsent writes. The button clears it
        itself before signing out, so anything still here is a session that
        died rather than one that was ended — hence the flag, not the clear.
      */
      sessionLost();
    }
  });

  /*
    Coming back to the tab is the other moment worth checking. A laptop that
    slept through the token's lifetime wakes with nothing scheduled: the timer
    that would have refreshed it never fired, and the next click is the first
    thing to discover it. Asking here turns that click into a non-event.
  */
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) sessionBack();
    });
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
}

/** `[the session is gone, how many writes are waiting]`. */
export function useSessionState(): [boolean, number] {
  const [isLost, setLost] = React.useState(lost);
  const [waiting, setWaiting] = React.useState(0);

  React.useEffect(() => {
    startSessionWatch();
    watchers.add(setLost);
    const unwatch = watchOutbox(setWaiting);
    return () => {
      watchers.delete(setLost);
      unwatch();
    };
  }, []);

  return [isLost, waiting];
}
