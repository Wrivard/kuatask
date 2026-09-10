"use client";

import * as React from "react";
import { addMonths, addDays, startOfWeek } from "date-fns";
import { motion, useReducedMotion } from "motion/react";
import { CalendarDayCell } from "./calendar-day-cell";
import dynamic from "next/dynamic";

// both are opened rather than shown, so neither belongs in the first load
const DaySheet = dynamic(() => import("./day-sheet").then((m) => m.DaySheet), { ssr: false });
const TaskModal = dynamic(
  () => import("@/components/task/task-modal").then((m) => m.TaskModal),
  { ssr: false },
);
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
import { useRescheduleWithFeedback } from "@/lib/completion";
import { useToday } from "@/lib/day";
import { useLocalLens } from "@/lib/lens";
import { snap } from "@/lib/motion";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const MODES = ["month", "week"] as const;

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
  const reschedule = useRescheduleWithFeedback();

  const today = useToday();
  const reduced = useReducedMotion();
  const [anchor, setAnchor] = React.useState(nowDate);
  const [mode, setMode] = useLocalLens<"month" | "week">(
    "kua-calendar-mode",
    "month",
    MODES,
  );
  const [openDay, setOpenDay] = React.useState<string | null>(null);
  const [openTask, setOpenTask] = React.useState<string | null>(null);

  // read inside the key handler, which is bound once
  const modeRef = React.useRef(mode);
  modeRef.current = mode;

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
      else if (e.key.toLowerCase() === "m")
        setMode(modeRef.current === "month" ? "week" : "month");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMode]);

  const { dragId, target: dropDay, grab } = useDragToTarget((taskId, day) =>
    reschedule(taskId, day),
  );

  if (!ready) return <div className="px-6 py-6" />;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex items-center gap-3 overflow-x-auto px-6 py-3">
        <button
          type="button"
          onClick={() => setAnchor((a) => addMonths(a, -1))}
          className="rounded-sm px-2 py-1 text-[13px] text-fg-muted hover:text-fg"
          aria-label={copy.nav.prevMonth}
        >
          ←
        </button>
        <span className="min-w-[140px] shrink-0 text-[13px] text-fg">
          {formatMonthYear(anchor)}
        </span>
        <button
          type="button"
          onClick={() => setAnchor((a) => addMonths(a, 1))}
          className="rounded-sm px-2 py-1 text-[13px] text-fg-muted hover:text-fg"
          aria-label={copy.nav.nextMonth}
        >
          →
        </button>

        <div className="ml-auto flex shrink-0 gap-1" aria-label={copy.calendar.mode}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
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
        <motion.div
          /*
            Keyed on the month so React remounts and the enter animation runs.
            No exit animation and no AnimatePresence: two grids alive at once
            would mean two sets of drop targets under the pointer, and paging
            has to stay readable within a keypress.
          */
          key={days[0]}
          initial={{ opacity: 0, y: reduced ? 0 : 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snap}
          className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6"
        >
          {days.map((day) => (
            <CalendarDayCell
              key={day}
              day={day}
              anchor={anchor}
              tasks={byDay.get(day) ?? []}
              members={members}
              isDropTarget={dropDay === day && dragId !== null}
              today={today}
              onOpenDay={setOpenDay}
              onGrabTask={grab}
            />
          ))}
        </motion.div>
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
                  isToday(day, today) ? "text-accent" : "text-fg-muted",
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
                    task.status === "doing" && "border-l-2 border-accent pl-1",
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

      {openDay && (
        <DaySheet
          day={openDay}
          onClose={() => setOpenDay(null)}
          onOpenTask={(id) => {
            setOpenDay(null);
            setOpenTask(id);
          }}
        />
      )}
      {openTask && <TaskModal taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
