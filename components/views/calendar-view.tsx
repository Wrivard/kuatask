"use client";

import * as React from "react";
import { addMonths, addDays, startOfWeek } from "date-fns";
import { CalendarDayCell } from "./calendar-day-cell";
import { DaySheet } from "./day-sheet";
import { TaskModal } from "@/components/task/task-modal";
import { AssigneeDot } from "@/components/task/assignee-dot";
import {
  formatMonthYear,
  formatTime,
  monthGrid,
  nowDate,
  toDayString,
  isToday,
} from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import { useDragToTarget } from "@/lib/drag";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

/**
 * Hand-built with date-fns. No calendar library — a library brings a payload and
 * an opinion about styling, and this grid is not big enough to justify either.
 *
 * Month navigation touches no network: the data is already local, so every
 * projection is a useMemo over the same array.
 */
export function CalendarView() {
  const ready = useStore((s) => s.ready);
  const tasks = useStore((s) => s.tasks);
  const members = useStore((s) => s.members);
  const filter = useStore((s) => s.assigneeFilter);
  const reschedule = useStore((s) => s.reschedule);

  const [anchor, setAnchor] = React.useState(nowDate);
  const [mode, setMode] = React.useState<"month" | "week">("month");
  const [openDay, setOpenDay] = React.useState<string | null>(null);
  const [openTask, setOpenTask] = React.useState<string | null>(null);

  const visible = React.useMemo(
    () => (filter === null ? tasks : tasks.filter((t) => t.assignee_id === filter)),
    [tasks, filter],
  );

  const byDay = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of visible) {
      if (!task.due_on) continue;
      const list = map.get(task.due_on) ?? [];
      list.push(task);
      map.set(task.due_on, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.due_time ?? "99").localeCompare(b.due_time ?? "99"));
    }
    return map;
  }, [visible]);

  const days = React.useMemo(
    () =>
      mode === "month"
        ? monthGrid(anchor)
        : Array.from({ length: 7 }, (_, i) =>
            toDayString(addDays(startOfWeek(anchor, { weekStartsOn: 1 }), i)),
          ),
    [anchor, mode],
  );

  // arrows move by month, T returns to today
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowLeft") setAnchor((a) => addMonths(a, -1));
      else if (e.key === "ArrowRight") setAnchor((a) => addMonths(a, 1));
      else if (e.key.toLowerCase() === "t") setAnchor(nowDate());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { dragId, target: dropDay, grab } = useDragToTarget((taskId, day) =>
    reschedule(taskId, day),
  );

  if (!ready) return <div className="px-6 py-6" />;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 px-6 py-3">
        <button
          type="button"
          onClick={() => setAnchor((a) => addMonths(a, -1))}
          className="rounded-sm px-2 py-1 text-[13px] text-fg-muted hover:text-fg"
          aria-label="Mois précédent"
        >
          ←
        </button>
        <span className="min-w-[140px] text-[13px] text-fg">
          {formatMonthYear(anchor)}
        </span>
        <button
          type="button"
          onClick={() => setAnchor((a) => addMonths(a, 1))}
          className="rounded-sm px-2 py-1 text-[13px] text-fg-muted hover:text-fg"
          aria-label="Mois suivant"
        >
          →
        </button>

        <div className="ml-auto flex gap-1">
          {(["month", "week"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-sm border border-border px-2 py-1 text-[12px]",
                mode === m ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {m === "month" ? copy.nav.month : copy.nav.week}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-border px-0">
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            className="border-b border-r border-border px-1.5 py-1 text-[12px] text-fg-faint"
          >
            {d}
          </span>
        ))}
      </div>

      {mode === "month" ? (
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
          {days.map((day) => (
            <CalendarDayCell
              key={day}
              day={day}
              anchor={anchor}
              tasks={byDay.get(day) ?? []}
              members={members}
              isDropTarget={dropDay === day && dragId !== null}
              onOpenDay={setOpenDay}
              onGrabTask={grab}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-7">
          {days.map((day) => (
            <div
              key={day}
              data-drop-target={day}
              onClick={() => setOpenDay(day)}
              className={cn(
                "flex min-h-0 cursor-pointer flex-col gap-1 overflow-y-auto border-b border-r border-border p-1.5",
                dropDay === day && dragId !== null && "ring-1 ring-accent ring-inset",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[12px] tabular-nums",
                  isToday(day) ? "text-accent" : "text-fg-muted",
                )}
              >
                {day.slice(-2)}
              </span>
              {(byDay.get(day) ?? []).map((task) => (
                <div
                  key={task.id}
                  onPointerDown={(e) => grab(task.id, e)}
                  className={cn(
                    "flex touch-none select-none flex-col rounded-sm px-1 py-px text-[12px] hover:bg-surface",
                    task.status === "done" && "line-through opacity-45",
                  )}
                >
                  <span className="truncate">{task.title}</span>
                  <span className="flex items-center gap-1 text-fg-faint">
                    {formatTime(task.due_time)}
                    <AssigneeDot
                      member={members.find((m) => m.id === task.assignee_id)}
                    />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <DaySheet
        day={openDay}
        onClose={() => setOpenDay(null)}
        onOpenTask={(id) => {
          setOpenDay(null);
          setOpenTask(id);
        }}
      />
      <TaskModal taskId={openTask} onClose={() => setOpenTask(null)} />
    </div>
  );
}
