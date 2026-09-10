"use client";

import * as React from "react";
import { addDays, startOfWeek } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TaskRow } from "@/components/task/task-row";
import { TaskComposer } from "@/components/task/task-composer";
import { formatDueLabel, toDate, toDayString, isToday } from "@/lib/time";
import { useToday } from "@/lib/day";
import { useDragToTarget } from "@/lib/drag";
import { useRescheduleWithFeedback } from "@/lib/completion";
import { useStore } from "@/lib/store";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Same row component, same interactions, same completion animation as the list.
 * The composer is pre-dated to the day, which is the whole reason to open it.
 *
 * The week strip does two jobs with one control. It is how you look at the
 * neighbouring day without closing the sheet, and it is where you drop a task
 * to move it — the calendar's drag gesture used to stop at the cell, so a task
 * you could only reach through the sheet could not be rescheduled by hand at
 * all. Drop targets inside the sheet rather than on the grid behind it: the
 * overlay owns the pointer while the sheet is open, and fighting that would be
 * a worse bargain than putting the seven days where the tasks already are.
 */
export function DaySheet({
  day,
  onClose,
  onOpenTask,
}: {
  day: string | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const filter = useStore((s) => s.assigneeFilter);
  const reschedule = useRescheduleWithFeedback();
  const today = useToday();

  // the sheet browses on its own once open; the calendar keeps its own anchor
  const [shown, setShown] = React.useState(day);
  React.useEffect(() => setShown(day), [day]);

  const current = shown ?? day;

  const week = React.useMemo(() => {
    if (!current) return [];
    const monday = startOfWeek(toDate(current), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => toDayString(addDays(monday, i)));
  }, [current]);

  const visible = React.useMemo(
    () => (filter === null ? tasks : tasks.filter((t) => t.assignee_id === filter)),
    [tasks, filter],
  );

  const dayTasks = visible
    .filter((t) => t.due_on === current)
    .sort((a, b) => (a.due_time ?? "99").localeCompare(b.due_time ?? "99"));
  const countFor = (d: string) => visible.filter((t) => t.due_on === d && t.status !== "done").length;

  const { dragId, target, grab } = useDragToTarget((taskId, to) => reschedule(taskId, to));

  return (
    <Sheet open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border bg-bg data-[side=right]:sm:max-w-[440px]">
        <SheetHeader className="px-5 pb-0 pt-5">
          <SheetTitle className="text-[22px] font-semibold tracking-[-0.02em]">
            {current ? formatDueLabel(current) : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-1 px-5 pt-3">
          {week.map((d, i) => {
            const n = countFor(d);
            const here = d === current;
            const over = target === d && dragId !== null;
            return (
              <button
                key={d}
                type="button"
                data-drop-target={d}
                onClick={() => setShown(d)}
                aria-current={here ? "date" : undefined}
                aria-label={formatDueLabel(d)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-md border py-1.5 text-[12px] transition-colors",
                  here ? "border-control text-fg" : "border-transparent text-fg-muted hover:text-fg",
                  over && "border-accent bg-surface",
                )}
              >
                <span aria-hidden className="text-fg-faint">{WEEKDAYS[i]}</span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    isToday(d, today) && "text-accent",
                  )}
                >
                  {d.slice(-2)}
                </span>
                {/* a dot rather than a number: the strip is a glance, not a report */}
                <span
                  aria-hidden
                  className={cn("size-1 rounded-full", n > 0 ? "bg-fg-faint" : "bg-transparent")}
                />
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-5">
          {/*
            Focused on open. The sheet is opened to add something to a
            particular day — the alternative was tabbing past the close button
            and seven day buttons to reach the field, in a panel whose whole
            purpose is that field.
          */}
          <TaskComposer defaultDueOn={current} takeFocus />

          {dayTasks.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{copy.empty.day}</p>
          ) : (
            dayTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onOpen={onOpenTask}
                onGrab={grab}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
