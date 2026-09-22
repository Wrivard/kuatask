'use client';

import * as React from 'react';
import { instantToDay, streakFromDays } from '@/lib/time';
import { useStore } from '@/lib/store';

/**
 * Your streak: consecutive Montreal days you finished something on.
 *
 * The server history plus anything completed in this session, because ticking
 * the last task should move the number on the same frame rather than after a
 * reload. `streakFromDays` allows one grace day, so it does not break until you
 * have actually missed one.
 *
 * Yours, not the workspace's. The local half used to count every completion in
 * the store, which in a shared workspace is both people's — so the rail could
 * show a streak your partner earned, under your name, while the leaderboard
 * (which has always grouped by who completed it) showed the real one. 0021
 * narrowed the server half the same way.
 *
 * One hook rather than the three copies that were in the rail, the list and the
 * board. They were identical, which is the condition just before they are not.
 */
export function useStreak(day: string): number {
  const completionDays = useStore((s) => s.completionDays);
  const tasks = useStore((s) => s.tasks);
  const meId = useStore((s) => s.me?.id ?? null);

  return React.useMemo(() => {
    const mine = tasks
      .filter((t) => t.completed_by === meId && t.completed_at !== null)
      .map((t) => instantToDay(t.completed_at!));
    return streakFromDays([...completionDays, ...mine], day);
  }, [completionDays, tasks, meId, day]);
}
