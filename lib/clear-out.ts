"use client";

import * as React from "react";
import { isOnDay } from "@/lib/time";
import { useStore } from "@/lib/store";
import { isAssignedTo } from "@/lib/assignee";

/**
 * § 8.5 — has the last task assigned to you and due today just gone done?
 *
 * The spec describes the trigger, not the screen. The moment used to exist only
 * in the list, so finishing your last task on the board was silent — the same
 * action, the same day cleared, no payoff. Shared so every view agrees on what
 * "cleared" means.
 *
 * `holding` is checked so the sweep waits for the 900ms beat rather than racing
 * it, and `done > 0` keeps it from firing for somebody who simply has nothing
 * assigned today.
 */
export function useClearedToday(day: string, holdingCount: number) {
  const tasks = useStore((s) => s.tasks);
  const me = useStore((s) => s.me);

  return React.useMemo(() => {
    if (!me) return { cleared: false, done: 0 };

    let open = 0;
    let done = 0;
    for (const task of tasks) {
      // a task that is both people's is on your day too
      if (!isAssignedTo(task, me.id)) continue;
      /*
        Parked work is not open work, and getting this wrong would have broken
        § 8.5 rather than bent it. A task on hold keeps its due date, so one
        parked with today's date — or any earlier one — counted here and the
        day could never clear again: you would finish everything you meant to
        do and the app would say nothing, every evening, because of a task you
        had explicitly decided was not for today.

        `done > 0` still guards the other direction, so parking your way to an
        empty day earns nothing. You have to have actually finished something.
      */
      if (task.status === "on_hold") continue;
      if (task.status !== "done" && task.due_on !== null && task.due_on <= day) open += 1;
      if (task.status === "done" && isOnDay(task.completed_at, day)) done += 1;
    }

    return { cleared: open === 0 && done > 0 && holdingCount === 0, done };
  }, [tasks, me, day, holdingCount]);
}
