"use client";

import * as React from "react";
import { msUntilNextDay, today } from "@/lib/time";

/**
 * The current Montreal day, kept live.
 *
 * Every bucket, the overdue colour, the progress ring and the streak are all
 * derived from today() during render. A tab left open across midnight therefore
 * keeps showing yesterday's arrangement until something else happens to
 * re-render it — and this is an app meant to stay open all day.
 *
 * Returning a string rather than a tick counter means views can put it straight
 * into a useMemo dependency list, where it reads as what it is.
 */
export function useToday(): string {
  const [day, setDay] = React.useState(today);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(() => {
        setDay(today());
        schedule(); // one day at a time, so DST changes are picked up
      }, msUntilNextDay());
    };

    // a laptop that slept through midnight wakes with a stale day
    const check = () => setDay(today());
    document.addEventListener("visibilitychange", check);

    schedule();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return day;
}
