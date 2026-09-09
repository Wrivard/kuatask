"use client";

import { motion, useReducedMotion } from "motion/react";
import { TaskCheckbox } from "@/components/task/task-checkbox";
import { LabelChip } from "@/components/task/label-chip";
import { AssigneeDot } from "@/components/task/assignee-dot";
import { COMPLETION, spring } from "@/lib/motion";
import { daysFromToday, formatDueLabel, formatTime, isOverdue } from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import { useToggleWithFeedback } from "@/lib/completion";
import { cn } from "@/lib/utils";

/**
 * A board card is the task row's information, stacked instead of inline.
 *
 * It keeps the same two interaction targets as the row — the checkbox
 * completes, anywhere else opens the modal — and the same completion sequence,
 * so a task behaves identically wherever you meet it. The third gesture, drag,
 * only begins after the pointer moves, so clicking still opens.
 */
export function BoardCard({
  task,
  dragging,
  onOpen,
  onGrab,
}: {
  task: Task;
  dragging: boolean;
  onOpen: (id: string) => void;
  onGrab: (id: string, e: React.PointerEvent) => void;
}) {
  const reduced = useReducedMotion();
  const members = useStore((s) => s.members);
  const toggle = useToggleWithFeedback();

  const done = task.status === "done";
  const overdue = isOverdue(task.due_on, task.status);
  const assignee = members.find((m) => m.id === task.assignee_id);

  const dateText = (() => {
    if (!task.due_on) return "";
    const time = formatTime(task.due_time);
    if (!overdue && daysFromToday(task.due_on) === 0) return time;
    return [formatDueLabel(task.due_on), time].filter(Boolean).join(" ");
  })();

  return (
    <motion.div
      layout={!reduced}
      transition={spring}
      onPointerDown={(e) => onGrab(task.id, e)}
      onClick={() => onOpen(task.id)}
      className={cn(
        "flex touch-none select-none flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5",
        "cursor-pointer hover:bg-surface-hover",
        // the card lifts on grab, and nothing else in the app has a shadow
        dragging && "opacity-90 shadow-lg ring-1 ring-accent",
        done && "opacity-45",
      )}
      animate={dragging && !reduced ? { scale: 1.02 } : { scale: 1 }}
    >
      <div className="flex items-start gap-2">
        <TaskCheckbox
          checked={done}
          onToggle={() => toggle(task.id)}
          label={task.title}
        />
        <span className="relative min-w-0 flex-1 text-[13px] leading-[1.35]">
          {task.title}
          <motion.span
            aria-hidden
            className="absolute left-0 top-1/2 h-px w-full bg-current"
            style={{ transformOrigin: "left" }}
            initial={false}
            animate={
              reduced ? { opacity: done ? 1 : 0, scaleX: 1 } : { scaleX: done ? 1 : 0 }
            }
            transition={{ duration: COMPLETION.strikethrough / 1000, ease: "easeOut" }}
          />
        </span>
      </div>

      {(task.label || dateText || task.important || assignee) && (
        <div className="flex items-center gap-1.5 pl-[26px]">
          {task.label && <LabelChip label={task.label} />}
          {task.important && (
            <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-label="Important" />
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
          <span className="ml-auto">
            <AssigneeDot member={assignee} />
          </span>
        </div>
      )}
    </motion.div>
  );
}
