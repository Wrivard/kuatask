"use client";

import * as React from "react";
import { addMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatMonthYear,
  isSameMonth,
  isToday,
  monthGrid,
  toDate,
  nowDate,
  type DayString,
} from "@/lib/time";
import { useToday } from "@/lib/day";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * A month grid for picking an exact day.
 *
 * The quick options cover most of what gets typed here — today, tomorrow, next
 * week — but "le 23" is a real thing to want and there was no way to say it
 * without opening the calendar view and dragging. Built from the same
 * `monthGrid` the calendar uses rather than pulling in a picker library: the
 * stack is locked, and a grid of seven columns is not what a dependency is for.
 *
 * Rendered inline rather than in a popover. It lives inside a dialog that
 * already scrolls, and a second layer of portal and focus trap on top of that
 * is a lot of machinery to place a box.
 */
export function DatePicker({
  value,
  onSelect,
}: {
  value: DayString | null;
  onSelect: (day: DayString) => void;
}) {
  const today = useToday();
  const [anchor, setAnchor] = React.useState(() =>
    value ? toDate(value) : nowDate(),
  );

  const days = React.useMemo(() => monthGrid(anchor), [anchor]);

  return (
    <div className="mt-2 w-full max-w-[280px] rounded-md border border-border bg-bg p-2">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAnchor((a) => addMonths(a, -1))}
          aria-label={copy.nav.prevMonth}
          className="rounded-sm p-1 text-fg-muted hover:text-fg"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.5} />
        </button>
        <span className="text-[12px] text-fg">{formatMonthYear(anchor)}</span>
        <button
          type="button"
          onClick={() => setAnchor((a) => addMonths(a, 1))}
          aria-label={copy.nav.nextMonth}
          className="rounded-sm p-1 text-fg-muted hover:text-fg"
        >
          <ChevronRight className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map((d, i) => (
          <span
            key={i}
            aria-hidden
            className="py-1 text-center text-[11px] text-fg-faint"
          >
            {d}
          </span>
        ))}

        {days.map((day) => {
          const outside = !isSameMonth(day, anchor);
          const selected = day === value;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={selected}
              aria-label={day}
              className={cn(
                "aspect-square rounded-sm font-mono text-[12px] tabular-nums",
                outside ? "text-fg-faint" : "text-fg-muted",
                "hover:bg-surface-hover hover:text-fg",
                // today is outlined, the chosen day is filled: two different
                // facts, so two different treatments rather than two colours
                isToday(day, today) && !selected && "text-accent",
                selected && "bg-accent font-medium text-bg hover:bg-accent hover:text-bg",
              )}
            >
              {day.slice(-2)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
