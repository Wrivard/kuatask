"use client";

import { AssigneeDot } from "@/components/task/assignee-dot";
import { isSameMonth, isToday } from "@/lib/time";
import type { Profile, Task } from "@/lib/store";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 3;

/**
 * One month cell. Numerals are Geist Mono with tabular figures — mono is a data
 * treatment here, not a style choice. Today's numeral gets the accent; days
 * outside the month drop to fg-faint. Weekends get no special treatment: these
 * people work weekends.
 */
export function CalendarDayCell({
  day,
  anchor,
  tasks,
  members,
  isDropTarget,
  onOpenDay,
  onGrabTask,
}: {
  day: string;
  anchor: Date;
  tasks: Task[];
  members: Profile[];
  isDropTarget: boolean;
  onOpenDay: (day: string) => void;
  onGrabTask: (taskId: string, e: React.PointerEvent) => void;
}) {
  const outside = !isSameMonth(day, anchor);
  const overflow = tasks.length - MAX_VISIBLE;

  return (
    <div
      data-drop-target={day}
      onClick={() => onOpenDay(day)}
      className={cn(
        "flex min-h-0 cursor-pointer flex-col gap-0.5 border-b border-r border-border p-1.5",
        "hover:bg-surface-hover",
        // the drop target reads as a 1px accent border, nothing heavier
        isDropTarget && "border-accent bg-surface-hover ring-1 ring-accent ring-inset",
      )}
    >
      <span
        className={cn(
          "font-mono text-[12px] tabular-nums",
          outside ? "text-fg-faint" : "text-fg-muted",
          isToday(day) && "text-accent",
        )}
      >
        {day.slice(-2)}
      </span>

      {tasks.slice(0, MAX_VISIBLE).map((task) => (
        <div
          key={task.id}
          onPointerDown={(e) => onGrabTask(task.id, e)}
          className={cn(
            "flex items-center gap-1 rounded-sm px-1 py-px text-[12px]",
            "touch-none select-none hover:bg-surface",
            // a cell has room for three lines, so En cours is a rule rather
            // than the chip the list and board can afford
            task.status === "doing" && "border-l-2 border-accent pl-1",
            task.status === "done" && "line-through opacity-45",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{task.title}</span>
          <AssigneeDot member={members.find((m) => m.id === task.assignee_id)} />
        </div>
      ))}

      {overflow > 0 && (
        <span className="px-1 font-mono text-[12px] tabular-nums text-fg-faint">
          +{overflow}
        </span>
      )}
    </div>
  );
}
