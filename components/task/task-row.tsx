"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { TaskCheckbox } from "./task-checkbox";
import { LabelChip } from "./label-chip";
import { StatusChip } from "./status-chip";
import { AssigneeDot } from "./assignee-dot";
import { COMPLETION } from "@/lib/motion";
import { daysFromToday, formatDueLabel, formatTime, isOverdue } from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import { useToggleWithFeedback } from "@/lib/completion";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * checkbox · title · label · importance · time · assignee
 *
 * There are no hover-revealed action buttons. Hover raises the background and
 * reveals nothing. The whole interaction surface is two targets: the checkbox
 * completes, anywhere else opens the modal. That constraint is what keeps the
 * list scannable.
 */
function TaskRowImpl({
  task,
  onOpen,
  pulseAssignee = false,
  focused = false,
  onFocus,
  onGrab,
}: {
  task: Task;
  onOpen: (id: string) => void;
  pulseAssignee?: boolean;
  /** Row focus is separate from DOM focus and from selection. */
  focused?: boolean;
  onFocus?: (id: string) => void;
  /**
   * Makes the row draggable. Left off in the list, where the order is the
   * date's to decide and `touch-none` would cost the page its scroll.
   */
  onGrab?: (id: string, e: React.PointerEvent) => void;
}) {
  const reduced = useReducedMotion();
  const toggle = useToggleWithFeedback();
  const members = useStore((s) => s.members);

  const done = task.status === "done";
  const assignee = members.find((m) => m.id === task.assignee_id);
  const overdue = isOverdue(task.due_on, task.status);

  /*
    Inside "Aujourd'hui" the words "aujourd'hui" are noise, so a task due today
    shows only its time, or nothing. Everywhere else the day earns its place —
    and an overdue task keeps its date, in danger, at the top of today.
  */
  const dateText = (() => {
    if (!task.due_on) return "";
    const time = formatTime(task.due_time);
    if (!overdue && daysFromToday(task.due_on) === 0) return time;
    return [formatDueLabel(task.due_on), time].filter(Boolean).join(" ");
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onMouseEnter={() => onFocus?.(task.id)}
      onPointerDown={onGrab && ((e) => onGrab(task.id, e))}
      data-focused={focused || undefined}
      data-task-id={task.id}
      className={cn(
        "flex h-11 items-center gap-3 rounded-md border-b border-border px-3 text-left transition-colors",
        "hover:bg-surface-hover",
        // 44px with a mouse, 52px under a finger. Keyed on the pointer, not the
        // window: a narrow desktop window is still a mouse, and a large tablet
        // is still a thumb.
        "[@media(pointer:coarse)]:h-13",
        // focus is a 1px accent ring, and never lands flush against the header
        focused && "scroll-mt-20 ring-1 ring-accent ring-inset",
        onGrab && "touch-none select-none",
        done && "opacity-45",
      )}
    >
      <TaskCheckbox
        checked={done}
        onToggle={() => toggle(task.id)}
        label={task.title}
      />

      <span className="relative min-w-0 flex-1 truncate text-[15px] leading-[1.4] tracking-[-0.011em]">
        {task.title}
        {/* strikethrough draws left to right rather than switching on */}
        <motion.span
          aria-hidden
          className="absolute left-0 top-1/2 h-px w-full bg-current"
          style={{ transformOrigin: "left" }}
          initial={false}
          animate={
            reduced
              ? { opacity: done ? 1 : 0, scaleX: 1 }
              : { scaleX: done ? 1 : 0 }
          }
          transition={{ duration: COMPLETION.strikethrough / 1000, ease: "easeOut" }}
        />
      </span>

      {task.status === "doing" && <StatusChip />}

      {task.label && <LabelChip label={task.label} />}

      {task.important && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-danger"
          title={copy.task.important}
          aria-label={copy.task.important}
        />
      )}

      {dateText && (
        <span
          title={overdue ? copy.task.overdue : undefined}
          className={cn(
            "shrink-0 text-[12px] tabular-nums",
            overdue ? "text-danger" : "text-fg-faint",
          )}
        >
          {overdue && <span className="sr-only">{copy.task.overdue} — </span>}
          {dateText}
        </span>
      )}

      <AssigneeDot member={assignee} pulse={pulseAssignee} />
    </div>
  );
}

/*
  A store write replaces the tasks array, so without this every row in the list
  re-renders on every keystroke in the modal and on every realtime event. The
  task object's identity only changes when that task changes, and the callbacks
  are stable setters, so memoizing here keeps a long list cheap.
*/
export const TaskRow = React.memo(TaskRowImpl);
