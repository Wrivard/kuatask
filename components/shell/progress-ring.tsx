"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { spring } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { today } from "@/lib/time";

const SIZE = 22;
const STROKE = 2;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Today's completion for tasks assigned to you, with the remaining count beside
 * it in Geist Mono.
 *
 * The only piece of persistent state feedback in the interface — small, always
 * visible, quietly demanding. There is deliberately no percentage label, no
 * weekly version, and no second ring anywhere.
 */
export function ProgressRing() {
  const tasks = useStore((s) => s.tasks);
  const me = useStore((s) => s.me);

  const { done, total } = React.useMemo(() => {
    if (!me) return { done: 0, total: 0 };
    const day = today();

    let d = 0;
    let t = 0;
    for (const task of tasks) {
      if (task.assignee_id !== me.id) continue;

      const isDoneToday =
        task.status === "done" && task.completed_at?.slice(0, 10) === day;
      const isOpenForToday = task.status === "todo" && task.due_on !== null && task.due_on <= day;

      if (isDoneToday || isOpenForToday) {
        t += 1;
        if (isDoneToday) d += 1;
      }
    }
    return { done: d, total: t };
  }, [tasks, me]);

  if (total === 0) return null;

  const complete = done === total;
  const offset = C * (1 - done / total);

  return (
    <div className="flex items-center gap-2">
      <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={spring}
        />
        {complete && (
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="var(--color-accent)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={spring}
          />
        )}
      </svg>

      {complete ? (
        <Check className="size-4 text-accent" strokeWidth={2} aria-label="Terminé" />
      ) : (
        <span className="font-mono text-[12px] tabular-nums text-fg-muted">
          {total - done}
        </span>
      )}
    </div>
  );
}
