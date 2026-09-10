"use client";

import * as React from "react";
import { addMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatDueLabel,
  formatMonthYear,
  isSameMonth,
  isToday,
  monthGrid,
  toDate,
  toDayString,
  nowDate,
  stepInGrid,
  type GridStep,
  type DayString,
} from "@/lib/time";
import { useToday } from "@/lib/day";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * A month grid for picking an exact day.
 *
 * The quick options cover most of what gets set here — today, tomorrow, next
 * week — but "le 23" is a real thing to want and there was no way to say it
 * without opening the calendar view and dragging. Built from the same
 * `monthGrid` the calendar uses rather than pulling in a picker library: the
 * stack is locked, and a grid of seven columns is not what a dependency is for.
 *
 * Rendered inline rather than in a popover. It lives inside a dialog that
 * already scrolls, and a second layer of portal and focus trap on top of that
 * is a lot of machinery to place a box.
 *
 * **One tab stop, not forty-four.** The first version made every day a tabbable
 * button, so opening the picker put 42 stops between the chip above it and the
 * time field below — the keyboard path through the modal went from short to
 * unusable. A grid is one control: Tab reaches it, arrows move within it, Tab
 * leaves. Which day is tabbable moves with the focus, so returning to the grid
 * lands where you left it rather than at the 1st.
 */
export function DatePicker({
  value,
  onSelect,
}: {
  value: DayString | null;
  onSelect: (day: DayString) => void;
}) {
  const today = useToday();
  const [anchor, setAnchor] = React.useState(() => (value ? toDate(value) : nowDate()));

  const days = React.useMemo(() => monthGrid(anchor), [anchor]);

  /*
    The day that Tab reaches. The chosen one if it is on screen, otherwise
    today, otherwise the first of the month — never nothing, or the grid becomes
    unreachable by keyboard entirely.
  */
  const [focusedDay, setFocusedDay] = React.useState<DayString>(
    () => value ?? today,
  );

  React.useEffect(() => {
    if (!days.includes(focusedDay)) {
      setFocusedDay(days.find((d) => isSameMonth(d, anchor)) ?? days[0]);
    }
  }, [days, anchor, focusedDay]);

  const gridRef = React.useRef<HTMLDivElement>(null);
  /** Set when a key moved the focus, so the effect knows to follow it. */
  const moving = React.useRef(false);

  React.useEffect(() => {
    if (!moving.current) return;
    moving.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${focusedDay}"]`)
      ?.focus();
  }, [focusedDay]);

  function moveTo(day: DayString) {
    moving.current = true;
    setFocusedDay(day);
    // stepping off the edge of the month brings the next one with it
    if (!isSameMonth(day, anchor)) setAnchor(toDate(day));
  }

  const BY_KEY: Record<string, GridStep> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    Home: "weekStart",
    End: "weekEnd",
  };

  function onKeyDown(e: React.KeyboardEvent) {
    const step = BY_KEY[e.key];
    if (step) {
      e.preventDefault();
      // the arithmetic lives in lib/time.ts, where every day calculation does
      return moveTo(stepInGrid(focusedDay, step));
    }

    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const by = e.key === "PageUp" ? -1 : 1;
      return moveTo(toDayString(addMonths(toDate(focusedDay), by)));
    }
  }

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
        <span aria-live="polite" className="text-[12px] text-fg">
          {formatMonthYear(anchor)}
        </span>
        <button
          type="button"
          onClick={() => setAnchor((a) => addMonths(a, 1))}
          aria-label={copy.nav.nextMonth}
          className="rounded-sm p-1 text-fg-muted hover:text-fg"
        >
          <ChevronRight className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={copy.task.pickDate}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-px"
      >
        {WEEKDAYS.map((d, i) => (
          <span
            key={i}
            role="columnheader"
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
              role="gridcell"
              data-day={day}
              // the grid is one tab stop; arrows move within it
              tabIndex={day === focusedDay ? 0 : -1}
              onClick={() => onSelect(day)}
              onFocus={() => setFocusedDay(day)}
              aria-selected={selected}
              aria-current={isToday(day, today) ? "date" : undefined}
              aria-label={formatDueLabel(day)}
              className={cn(
                "aspect-square rounded-sm font-mono text-[12px] tabular-nums",
                outside ? "text-fg-faint" : "text-fg-muted",
                "hover:bg-surface-hover hover:text-fg",
                "focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent",
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
