"use client";

import * as React from "react";
import { COMPLETION } from "@/lib/motion";
import type { Task } from "@/lib/store";

/**
 * The 900ms beat from docs/08-satisfaction.md § 8.1.
 *
 * A completed task stays where it was before it leaves. That pause is where the
 * satisfaction lives — removing the row on the same frame reads as the task
 * being deleted rather than completed, and it takes the payoff with it.
 *
 * Returns the status each held task had *before* it was completed, so a view can
 * keep showing it in the column it came from rather than only knowing that it is
 * held. The list needs the former; the board needs the latter.
 *
 * This watches store transitions rather than taking a callback from the
 * checkbox, which is what gives a task the other person completes the same beat
 * on your screen — § 8.7.
 */
export function useCompletionHold(tasks: Task[]): Map<string, Task["status"]> {
  const [holding, setHolding] = React.useState<Map<string, Task["status"]>>(new Map());
  const previous = React.useRef<Map<string, Task["status"]>>(new Map());

  React.useEffect(() => {
    const before = previous.current;
    const next = new Map<string, Task["status"]>();
    const justCompleted: [string, Task["status"]][] = [];

    for (const task of tasks) {
      next.set(task.id, task.status);
      const was = before.get(task.id);
      if (task.status === "done" && was !== undefined && was !== "done") {
        justCompleted.push([task.id, was]);
      }
    }

    previous.current = next;
    if (justCompleted.length === 0) return;

    setHolding((prev) => new Map([...prev, ...justCompleted]));

    const timer = setTimeout(() => {
      setHolding((prev) => {
        const updated = new Map(prev);
        justCompleted.forEach(([id]) => updated.delete(id));
        return updated;
      });
    }, COMPLETION.holdBeforeCollapse);

    return () => clearTimeout(timer);
  }, [tasks]);

  return holding;
}
