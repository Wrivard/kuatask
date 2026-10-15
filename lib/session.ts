'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { count, flushOutbox, watchOutbox } from '@/lib/outbox';

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
 * Three jobs, and they are sides of the same fact:
 *
 *   - say so, immediately and unmistakably, so nobody works into a void;
 *   - send the waiting writes the moment a session exists again;
 *   - write down why it died, because that is still a hypothesis.
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

/* ---------------------------------------------------------------- why ---- */

/**
 * The refresh token rotates: each renewal mints a new one and the old one is
 * accepted for about ten seconds afterwards. So a 400 on renewal means the
 * token presented had already been spent — longer ago than that window — and
 * the question that settles it is *who spent it*.
 *
 * The leading suspect is a second tab. Each tab holds its own copy of the
 * session in memory and runs its own renewal timer; both read the same cookie,
 * so one renewing leaves the other holding a token that is already dead. The
 * middleware, which renews on navigation when the access token has expired, is
 * the other candidate.
 *
 * Guessing between them from one occurrence in four days of logs is not
 * engineering. So every successful renewal leaves its mark — when, and which
 * tab — and a session death reads it back. If the mark is seconds old and from
 * another tab, it was the tabs; if it is an hour old and this tab's own, the
 * token was invalidated server-side and no amount of client care prevents it.
 *
 * This diagnoses. It does not fix: what keeps the work safe is lib/outbox.ts,
 * which does not care why the session went.
 */
const TAB = Math.random().toString(36).slice(2, 8);
const REFRESH_KEY = 'kua-last-refresh';
const LOG_KEY = 'kua-session-log';

/** Ten is more history than a bug this rare will ever need at once. */
const LOG_LIMIT = 10;

type Mark = { at: number; tab: string };

export type SessionNote = {
  at: string;
  tab: string;
  /** Seconds since *this* tab last renewed the token; null if it never did. */
  sinceMine: number | null;
  /** Seconds since *another* tab renewed it; null if none did. */
  otherTabAgo: number | null;
  /** Hidden at any point since this tab's last renewal — a laptop that slept. */
  slept: boolean;
  visibility: string;
  online: boolean;
  /** How much work was waiting at the moment it died. */
  waiting: number;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // blocked storage or a half-written value: no history is not an error
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // a diagnostic must never be the thing that breaks the app
  }
}

let mine: number | null = null;
let slept = false;

/** Called on every successful renewal, by this tab. */
function markRefresh() {
  mine = Date.now();
  slept = false;
  writeJson(REFRESH_KEY, { at: mine, tab: TAB } satisfies Mark);
}

const since = (at: number | null) =>
  at === null ? null : Math.round((Date.now() - at) / 1000);

function record() {
  const last = readJson<Mark | null>(REFRESH_KEY, null);
  const note: SessionNote = {
    at: new Date().toISOString(),
    tab: TAB,
    sinceMine: since(mine),
    otherTabAgo: last && last.tab !== TAB ? since(last.at) : null,
    slept,
    visibility: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
    // asked of the property, not the object: node has a `navigator` without it
    online: typeof navigator?.onLine === 'boolean' ? navigator.onLine : true,
    waiting: count(),
  };
  writeJson(LOG_KEY, [...readJson<SessionNote[]>(LOG_KEY, []), note].slice(-LOG_LIMIT));
  // in the console as well, so it is there without anyone knowing the key
  console.warn('[kua] session lost', note);
}

/** The history, newest last. `docs/restoring.md` says how to read it. */
export function sessionLog(): SessionNote[] {
  return readJson<SessionNote[]>(LOG_KEY, []);
}

/**
 * A sign-out on purpose is not a session dying.
 *
 * It arrives as the same SIGNED_OUT event, and logging it would bury the one
 * occurrence that matters under a dozen ordinary ones.
 */
let deliberate = false;

export function signingOutOnPurpose() {
  deliberate = true;
}

/* --------------------------------------------------------------- state ---- */

/** Called by lib/write.ts when a write is refused twice for want of a session. */
export function sessionLost() {
  if (lost) return;
  lost = true;
  if (!deliberate) record();
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
      // only a renewal rotates the token; a sign-in starts a new one, and
      // INITIAL_SESSION is just this tab reading the cookie it was handed
      if (event === 'TOKEN_REFRESHED') markRefresh();
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
    if (document.visibilityState !== 'visible') {
      // remembered, because a renewal refused right after a sleep is a
      // different story from one refused on a tab that was never away
      slept = true;
      return;
    }
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
