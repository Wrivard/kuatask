"use client";

import { accentColor } from "@/components/task/assignee-dot";
import { formatTime } from "@/lib/time";
import type { Profile, Task } from "@/lib/store";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * A task inside a calendar cell.
 *
 * It used to be a bare line of text, which meant a cell with three tasks read
 * as a paragraph: nothing said where one task stopped and the next began, and
 * the only way to tell whose it was, or whether it was done, was to squint at a
 * 1.5px dot at the end of the line.
 *
 * A card gives it edges. The left rule carries the assignee's identity colour —
 * the same colour as their dot everywhere else, so the cell is scannable by
 * person at a glance — and En cours keeps its accent rule instead, because
 * "somebody is on this right now" outranks "it is theirs".
 */
export function CalendarCard({
  task,
  member,
  onGrab,
  onOpen,
  compact = false,
}: {
  task: Task;
  member: Profile | undefined;
  onGrab: (id: string, e: React.PointerEvent) => void;
  /**
   * Opens the task.
   *
   * The card used to have no click handler at all: the press became a drag or
   * it bubbled to the cell, which opened the day. So reaching a task you could
   * see took two clicks and an intermediate screen, and the one thing the cards
   * were added for — being able to tell tasks apart at a glance — stopped short
   * of letting you act on the one you found.
   *
   * It opens rather than completes, unlike the list and the board. The calendar
   * is where you look at a month and decide; a stray click in a grid of 4mm
   * bars should not mark something done. Completing from here is what the day
   * sheet is for, one click away, at full row size.
   */
  onOpen: (id: string) => void;
  /** The month grid has a third of the height the week view does. */
  compact?: boolean;
}) {
  const done = task.status === "done";
  const doing = task.status === "doing";
  const time = formatTime(task.due_time);

  return (
    <div
      onPointerDown={(e) => onGrab(task.id, e)}
      onClick={(e) => {
        // the cell behind this opens the whole day; the card is more specific
        e.stopPropagation();
        onOpen(task.id);
      }}
      title={task.title}
      // the month grid measures two of these to work out how many fit
      data-cal-card=""
      className={cn(
        "flex cursor-pointer touch-none select-none items-center gap-1 rounded-sm border border-border border-l-2 bg-surface",
        "hover:border-control hover:bg-surface-hover",
        compact ? "px-1 py-px" : "px-1.5 py-1",
        done && "opacity-45",
      )}
      style={{
        borderLeftColor: doing
          ? "var(--color-accent)"
          : member
            ? accentColor(member.accent)
            : "var(--color-border)",
      }}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[11px] leading-[1.35] text-fg",
          done && "line-through",
        )}
      >
        {task.title}
      </span>

      {task.important && (
        <span
          className="size-1 shrink-0 rounded-full bg-danger"
          aria-label={copy.task.important}
        />
      )}

      {time && (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">
          {time}
        </span>
      )}
    </div>
  );
}
