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
import { CalendarCard } from "./calendar-card";
import { CARD_PITCH_GUESS, CARD_ROW, CELL_CHROME } from "./calendar-day-cell";
import { useRowsThatFit } from "@/lib/fit";
import {
  formatMonthYear,
  formatDueLabel,
  monthGrid,
  nowDate,
  toDayString,
  toDate,
  isToday,
  isSameMonth,
  stepInGrid,
  type GridStep,
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
 * The week's tasks in bands, so 9h and 17h stop looking equally placed.
 *
 * Not an hour grid. This is a task list, not a meeting calendar — most tasks
 * here have no time at all, and a 24-row axis would be almost entirely empty
 * lines drawn around three cards. Three bands and an untimed one give the
 * column temporal shape at the resolution the data actually has.
 *
 * A band is only drawn when it holds something, so a day with two afternoon
 * tasks shows one heading rather than four.
 */
type Band = "morning" | "afternoon" | "evening" | "untimed";

const BAND_ORDER: Band[] = ["morning", "afternoon", "evening", "untimed"];

function bandOf(dueTime: string | null): Band {
  if (!dueTime) return "untimed";
  const hour = Number(dueTime.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function bandsFor(tasks: Task[]): { band: Band; tasks: Task[] }[] {
  const groups = new Map<Band, Task[]>();
  for (const task of tasks) {
    const band = bandOf(task.due_time);
    const list = groups.get(band) ?? [];
    list.push(task);
    groups.set(band, list);
  }
  return BAND_ORDER.filter((b) => groups.has(b)).map((band) => ({
    band,
    tasks: groups.get(band)!,
  }));
}

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

  /*
    Six rows of cells share whatever height the window gives the grid, so on a
    tall screen a hard cap of three left visible empty space under a « +4 de
    plus » — the information was there, the room was there, and a constant in
    the middle refused to put them together.
  */
  const gridRef = React.useRef<HTMLDivElement>(null);
  const maxVisible = useRowsThatFit({
    ref: gridRef,
    rows: 6,
    rowSelector: `[${CARD_ROW}]`,
    reserved: CELL_CHROME,
    fallbackRowHeight: CARD_PITCH_GUESS,
  });
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

  /*
    The month grid is one tab stop, the same as the date picker's.

    Before this the calendar had no keyboard path at all: no way to reach a day,
    no way to open one, nothing under Tab — a whole view of the app reachable
    only with a pointer. Making all 42 cells tabbable would trade that for a
    grid nobody can tab past, which is the mistake the picker shipped with.
  */
  const [focusedDay, setFocusedDay] = React.useState<string | null>(null);
  const movingFocus = React.useRef(false);

  React.useEffect(() => {
    if (!movingFocus.current || !focusedDay) return;
    movingFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-day="${focusedDay}"]`)
      ?.focus();
  }, [focusedDay]);

  /** The cell Tab lands on: wherever you were, else today, else the 1st shown. */
  const tabStop = focusedDay ?? (days.includes(today) ? today : days[0]);

  const moveFocus = React.useCallback(
    (to: string) => {
      movingFocus.current = true;
      setFocusedDay(to);
      // stepping off the edge of the month brings the next one with it
      if (!isSameMonth(to, anchor)) setAnchor(toDate(to));
    },
    [anchor],
  );

  const GRID_KEYS: Record<string, GridStep> = React.useMemo(
    () => ({
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      Home: "weekStart",
      End: "weekEnd",
    }),
    [],
  );

  function onGridKeyDown(e: React.KeyboardEvent) {
    const from = tabStop;
    const step = GRID_KEYS[e.key];

    if (step) {
      e.preventDefault();

      /*
        Up and down are a week apart, which the week view does not have — it
        shows seven days in a row. There they mean nothing, so they are ignored
        rather than silently paging the view somewhere the user did not ask to
        go. Home and End still reach Monday and Sunday, which in that mode are
        the two ends of what is on screen.
      */
      if (modeRef.current === "week" && (step === "up" || step === "down")) return;

      // the same helper the date picker uses; one definition of "up is a week"
      moveFocus(stepInGrid(from, step));
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpenDay(from);
    }
  }


  // arrows move by month, T returns to today
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      /*
        The grid claims the arrows when focus is inside it. Both handlers are
        real listeners, so the grid calling preventDefault does not stop this
        one — without the guard, one press moved the focus by a day *and* the
        month by one, which is the sort of thing that reads as the app being
        haunted.
      */
      const inGrid = el?.closest('[role="grid"]');
      const claimed = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
      if (inGrid && claimed.includes(e.key)) return;

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
          role="grid"
          aria-label={formatMonthYear(anchor)}
          onKeyDown={onGridKeyDown}
          initial={{ opacity: 0, y: reduced ? 0 : 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snap}
          ref={gridRef}
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
              focused={day === tabStop}
              maxVisible={maxVisible}
              onOpenDay={setOpenDay}
              onGrabTask={grab}
            />
          ))}
        </motion.div>
      ) : (
        /*
          The same grid contract as the month, so switching mode does not
          switch whether the keyboard works. One tab stop, arrows between days,
          Enter opens. Sharing `onGridKeyDown` means the two cannot drift —
          which was the actual risk here, not the missing keys: a view where
          half the modes are operable is worse than one where none are, because
          nobody can tell which they are in.
        */
        <div
          ref={gridRef}
          role="grid"
          aria-label={formatMonthYear(anchor)}
          onKeyDown={onGridKeyDown}
          className="grid min-h-0 flex-1 grid-cols-7"
        >
          {days.map((day) => (
            <div
              key={day}
              data-drop-target={day}
              data-day={day}
              role="gridcell"
              tabIndex={day === tabStop ? 0 : -1}
              aria-label={copy.calendar.cell(formatDueLabel(day), (byDay.get(day) ?? []).length)}
              aria-current={isToday(day, today) ? "date" : undefined}
              onClick={() => setOpenDay(day)}
              className={cn(
                "flex min-h-0 cursor-pointer flex-col gap-1 overflow-y-auto border-b border-r border-border p-1.5",
                "focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-accent",
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
              {bandsFor(byDay.get(day) ?? []).map(({ band, tasks: banded }) => (
                <React.Fragment key={band}>
                  <span className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-fg-faint">
                    {copy.calendar.bands[band]}
                  </span>
                  {banded.map((task) => (
                    <CalendarCard
                      key={task.id}
                      task={task}
                      member={members.find((m) => m.id === task.assignee_id)}
                      onGrab={grab}
                    />
                  ))}
                </React.Fragment>
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
