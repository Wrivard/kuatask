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
  compact = false,
}: {
  task: Task;
  member: Profile | undefined;
  onGrab: (id: string, e: React.PointerEvent) => void;
  /** The month grid has a third of the height the week view does. */
  compact?: boolean;
}) {
  const done = task.status === "done";
  const doing = task.status === "doing";
  const time = formatTime(task.due_time);

  return (
    <div
      onPointerDown={(e) => onGrab(task.id, e)}
      title={task.title}
      className={cn(
        "flex touch-none select-none items-center gap-1 rounded-sm border border-border border-l-2 bg-surface",
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
