"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { TaskRow } from "@/components/task/task-row";
import { COMPLETION, exit } from "@/lib/motion";
import type { Task } from "@/lib/store";
import { cn } from "@/lib/utils";

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
  open,
  onToggle,
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
  /**
   * Makes the section fold, with the heading as the control.
   *
   * Passing both of these is what turns the header into a button and puts a
   * chevron in front of the title. Omit them and nothing changes — the six day
   * sections are not foldable, because folding « Aujourd'hui » would hide the
   * one thing this screen exists to show.
   *
   * It lives here rather than in a second component so a folding section keeps
   * everything a day section has: the same 13px heading on the same baseline,
   * the same count in the same place, the spring that closes the gap when a row
   * leaves, and the dropped trailing hairline.
   */
  open?: boolean;
  onToggle?: () => void;
}) {
  const reduced = useReducedMotion();
  const headingId = React.useId();

  if (tasks.length === 0) return null;

  const folds = open !== undefined && onToggle !== undefined;
  const shown = !folds || open;

  const count = (
    <span className="ml-auto font-mono text-[12px] tabular-nums text-fg-faint">
      {tasks.length}
    </span>
  );

  return (
    <motion.section
      id={id}
      aria-labelledby={headingId}
      // 68 — layout animation is the thing the preference is actually about
      layout={!reduced}
      /*
        No divider under the last row.

        `docs/04` asks for a hairline *between* rows; every row carries its own
        `border-b`, so each section ended with a rule that divided nothing —
        six of them down the page, each one a line the eye stops at for no
        reason. The section strips the trailing one rather than the row knowing
        where it sits, because the row appears in three different stacks and
        none of them is its business.
      */
      className="mb-6 scroll-mt-6 [&>div:last-child_[data-task-id]]:border-b-0"
    >
      {folds ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="mb-1 flex w-full items-baseline gap-1.5 text-left"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 self-center text-fg-faint transition-transform",
              open && "rotate-90",
            )}
            strokeWidth={1.5}
          />
          <h2 id={headingId} className="text-[13px] font-medium text-fg-muted">
            {title}
          </h2>
          {note}
          {count}
        </button>
      ) : (
        <header className="mb-1 flex items-baseline gap-2">
          <h2 id={headingId} className="text-[13px] font-medium text-fg-muted">
            {title}
          </h2>
          {note}
          {count}
        </header>
      )}

      {shown && (
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
      )}
    </motion.section>
  );
}
