"use client";

import { CalendarCard } from "./calendar-card";
import { isSameMonth, isToday } from "@/lib/time";
import { copy } from "@/lib/copy";
import type { Profile, Task } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * How tall one compact card is, including the gap under it.
 *
 * Measured from the rendered card rather than derived: 11px text at 1.35
 * leading in a `py-px` box, plus the grid's `gap-0.5`. If the card's padding
 * changes, this has to change with it — which is why it sits next to the thing
 * that renders it rather than in the hook that divides by it.
 */
export const CARD_HEIGHT = 20;

/** The date numeral above the cards, the cell padding, and room for a « +N ». */
export const CELL_CHROME = 40;

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
  today,
  maxVisible,
  onOpenDay,
  onGrabTask,
}: {
  day: string;
  anchor: Date;
  tasks: Task[];
  members: Profile[];
  isDropTarget: boolean;
  /** Passed in rather than read here, so midnight re-renders the whole grid. */
  today: string;
  /** How many cards this cell has room for, measured from the grid's height. */
  maxVisible: number;
  onOpenDay: (day: string) => void;
  onGrabTask: (taskId: string, e: React.PointerEvent) => void;
}) {
  const outside = !isSameMonth(day, anchor);
  const overflow = tasks.length - maxVisible;

  return (
    <div
      data-drop-target={day}
      onClick={() => onOpenDay(day)}
      className={cn(
        "group/cell flex min-h-0 cursor-pointer flex-col gap-0.5 border-b border-r border-border p-1.5",
        "hover:bg-surface-hover",
        // the drop target reads as a 1px accent border, nothing heavier
        isDropTarget && "border-accent bg-surface-hover ring-1 ring-accent ring-inset",
      )}
    >
      <span
        className={cn(
          "font-mono text-[12px] tabular-nums",
          outside ? "text-fg-faint" : "text-fg-muted",
          isToday(day, today) && "text-accent",
        )}
      >
        {day.slice(-2)}
      </span>

      {tasks.slice(0, maxVisible).map((task) => (
        <CalendarCard
          key={task.id}
          task={task}
          member={members.find((m) => m.id === task.assignee_id)}
          onGrab={onGrabTask}
          compact
        />
      ))}

      {/*
        The cell has always opened the day; the overflow just did not look like
        it was the way in. It now says what it does and underlines on hover —
        the same treatment as a link, because that is what it behaves like.
      */}
      {overflow > 0 && (
        <span className="px-1 text-[12px] text-fg-muted underline decoration-border underline-offset-2 group-hover/cell:decoration-fg-faint">
          {copy.calendar.more(overflow)}
        </span>
      )}
    </div>
  );
}
