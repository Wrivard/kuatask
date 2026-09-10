"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlignLeft } from "lucide-react";
import { TaskCheckbox } from "@/components/task/task-checkbox";
import { LabelChip } from "@/components/task/label-chip";
import { StatusChip } from "@/components/task/status-chip";
import { AssigneeDot } from "@/components/task/assignee-dot";
import { COMPLETION, spring } from "@/lib/motion";
import { daysFromToday, formatDueLabel, formatTime, isOverdue } from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import { useToggleWithFeedback } from "@/lib/completion";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * A board card is the task row's information, stacked instead of inline.
 *
 * It keeps the same two interaction targets as the row — the checkbox
 * completes, anywhere else opens the modal — and the same completion sequence,
 * so a task behaves identically wherever you meet it. The third gesture, drag,
 * only begins after the pointer moves, so clicking still opens.
 */
function BoardCardImpl({
  task,
  dragging,
  onOpen,
  onGrab,
  onMove,
}: {
  task: Task;
  dragging: boolean;
  onOpen: (id: string) => void;
  onGrab: (id: string, e: React.PointerEvent) => void;
  /** Move one column left or right — the keyboard equivalent of a drag. */
  onMove?: (id: string, direction: -1 | 1) => void;
}) {
  const reduced = useReducedMotion();
  const members = useStore((s) => s.members);
  const toggle = useToggleWithFeedback();

  const done = task.status === "done";
  const overdue = isOverdue(task.due_on, task.status);
  const hasNotes = task.notes !== null && task.notes.trim() !== "";
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
      // a card is an interactive target, so it has to be reachable and operable
      // without a pointer; dragging has keyboard equivalents in the list (A/D/S)
      role="button"
      tabIndex={0}
      data-card-id={task.id}
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(task.id);
          return;
        }
        // dragging is a mouse gesture; these are the same move without one
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onMove?.(task.id, -1);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onMove?.(task.id, 1);
          return;
        }
        if (e.key.toLowerCase() === "x") {
          e.preventDefault();
          toggle(task.id);
        }
      }}
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

      {(task.label || dateText || task.important || assignee || hasNotes || task.status === "doing") && (
        <div className="flex items-center gap-1.5 pl-[26px]">
          {task.status === "doing" && <StatusChip />}
          {task.label && <LabelChip label={task.label} />}
          {/* same glyph as the row: whether there is more to read, nothing else */}
          {hasNotes && (
            <AlignLeft
              className="size-3 shrink-0 text-fg-faint"
              strokeWidth={1.5}
              aria-label={copy.task.hasNotes}
            />
          )}
          {task.important && (
            <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-label={copy.task.important} />
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

/** Same reasoning as TaskRow: keep untouched cards out of the render pass. */
export const BoardCard = React.memo(BoardCardImpl);
