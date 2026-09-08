"use client";

import { motion, useReducedMotion } from "motion/react";
import { TaskCheckbox } from "./task-checkbox";
import { LabelChip } from "./label-chip";
import { AssigneeDot } from "./assignee-dot";
import { COMPLETION } from "@/lib/motion";
import { daysFromToday, formatDueLabel, formatTime, isOverdue } from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * checkbox · title · label · importance · time · assignee
 *
 * There are no hover-revealed action buttons. Hover raises the background and
 * reveals nothing. The whole interaction surface is two targets: the checkbox
 * completes, anywhere else opens the modal. That constraint is what keeps the
 * list scannable.
 */
export function TaskRow({
  task,
  onOpen,
  pulseAssignee = false,
}: {
  task: Task;
  onOpen: (id: string) => void;
  pulseAssignee?: boolean;
}) {
  const reduced = useReducedMotion();
  const toggleTask = useStore((s) => s.toggleTask);
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
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task.id);
      }}
      className={cn(
        "flex h-11 items-center gap-3 rounded-md border-b border-border px-3 text-left transition-colors md:h-11",
        "hover:bg-surface-hover",
        "max-md:h-13",
        done && "opacity-45",
      )}
    >
      <TaskCheckbox
        checked={done}
        onToggle={() => toggleTask(task.id)}
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

      {task.label && <LabelChip label={task.label} />}

      {task.important && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-danger"
          title="Important"
          aria-label="Important"
        />
      )}

      {dateText && (
        <span
          className={cn(
            "shrink-0 text-[12px] tabular-nums",
            overdue ? "text-danger" : "text-fg-faint",
          )}
        >
          {dateText}
        </span>
      )}

      <AssigneeDot member={assignee} pulse={pulseAssignee} />
    </div>
  );
}
