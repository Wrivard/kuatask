"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TaskRow } from "@/components/task/task-row";
import { COMPLETION, exit } from "@/lib/motion";
import type { Task } from "@/lib/store";

/**
 * A list section with its count. Empty sections collapse away entirely — there
 * is no per-section "nothing here" placeholder.
 *
 * The `layout` prop is what makes the surrounding rows close the gap on a
 * spring when a completed row leaves, instead of jumping.
 */
export function ListSection({
  id,
  title,
  tasks,
  onOpen,
  pulseIds,
  focusedId,
  onFocus,
  note,
  onSelectLabel,
  onSelectAssignee,
}: {
  id?: string;
  title: string;
  tasks: Task[];
  onOpen: (id: string) => void;
  pulseIds?: Set<string>;
  focusedId?: string | null;
  onFocus?: (id: string) => void;
  /** A second line of information beside the title, e.g. how many are late. */
  note?: React.ReactNode;
  onSelectLabel?: (label: string) => void;
  onSelectAssignee?: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const headingId = React.useId();

  if (tasks.length === 0) return null;

  return (
    <motion.section
      id={id}
      aria-labelledby={headingId}
      // 68 — layout animation is the thing the preference is actually about
      layout={!reduced}
      className="mb-6 scroll-mt-6"
    >
      <header className="mb-1 flex items-baseline gap-2">
        <h2 id={headingId} className="text-[13px] font-medium text-fg-muted">
          {title}
        </h2>
        {note}
        <span className="ml-auto font-mono text-[12px] tabular-nums text-fg-faint">
          {tasks.length}
        </span>
      </header>

      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <motion.div
            key={task.id}
            layout={!reduced}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ ...exit, duration: COMPLETION.collapse / 1000 }}
            style={{ overflow: "hidden" }}
          >
            <TaskRow
              task={task}
              onOpen={onOpen}
              pulseAssignee={pulseIds?.has(task.id) ?? false}
              focused={focusedId === task.id}
              onFocus={onFocus}
              onSelectLabel={onSelectLabel}
              onSelectAssignee={onSelectAssignee}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.section>
  );
}
