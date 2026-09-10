"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { TaskComposer } from "@/components/task/task-composer";
import { TaskModal } from "@/components/task/task-modal";
import { TaskRow } from "@/components/task/task-row";
import { ListSection } from "./list-section";
import { ClearOut } from "./clear-out";
import { exit } from "@/lib/motion";
import {
  bucketOf,
  instantToDay,
  streakFromDays,
  dayOfMonth,
  daysFromToday,
  isOverdue,
  isOnDay,
  nowTz,
  toDayString,
  today,
  tomorrow,
  type Bucket,
} from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import {
  useToggleWithFeedback,
  useDeleteWithFeedback,
  useSetStatusWithFeedback,
} from "@/lib/completion";
import { useHotkeys } from "@/lib/hotkeys";
import { useCompletionHold } from "@/lib/hold";
import { useScrollMemory } from "@/lib/scroll-memory";
import { useClearedToday } from "@/lib/clear-out";
import { useToday } from "@/lib/day";
import { useOpenTask, useStartSearch, focusComposer } from "@/lib/events";
import { nextDay } from "date-fns";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const SECTIONS: { bucket: Bucket; title: string }[] = [
  { bucket: "today", title: copy.nav.today },
  { bucket: "tomorrow", title: copy.nav.tomorrow },
  { bucket: "week", title: copy.nav.week },
  { bucket: "month", title: copy.nav.month },
  { bucket: "later", title: copy.nav.later },
  { bucket: "undated", title: copy.nav.undated },
];

/**
 * The default route. Every section is a useMemo over the one task array in the
 * store — switching views costs zero requests and shows zero loading states.
 */
export function ListView() {
  const ready = useStore((s) => s.ready);
  const allTasks = useStore((s) => s.tasks);
  const members = useStore((s) => s.members);
  const me = useStore((s) => s.me);
  const filter = useStore((s) => s.assigneeFilter);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [doneOpen, setDoneOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [query, setQuery] = React.useState("");

  useStartSearch(() => {
    setSearching(true);
    focusComposer();
  });

  // searching rewrites the list, so restoring an old offset would be wrong
  useScrollMemory("list", !searching);

  // re-buckets by itself when Montreal rolls over midnight
  const day = useToday();

  const holding = useCompletionHold(allTasks);

  const tasks = React.useMemo(() => {
    const byAssignee =
      filter === null ? allTasks : allTasks.filter((t) => t.assignee_id === filter);

    const q = searching ? normalize(query.trim()) : "";
    if (!q) return byAssignee;

    // accent-insensitive: nobody types "étiquette" with the accent while searching
    return byAssignee.filter((t) =>
      normalize([t.title, t.label ?? "", t.notes ?? ""].join(" ")).includes(q),
    );
  }, [allTasks, filter, searching, query]);

  /*
    § 8.7 — when the other person completes a task on your screen, their dot
    pulses once beside the row. No tone: sound is reserved for your own actions.
  */
  const pulseIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (holding.has(task.id) && task.completed_by && task.completed_by !== me?.id) {
        ids.add(task.id);
      }
    }
    return ids;
  }, [tasks, holding, me?.id]);

  const { sections, completedToday } = React.useMemo(() => {
    const byBucket = new Map<Bucket, Task[]>();
    const done: Task[] = [];

    for (const task of tasks) {
      // a just-completed row keeps its place for the hold — see § 8.1
      const stillInPlace = task.status !== "done" || holding.has(task.id);

      if (stillInPlace) {
        const bucket = bucketOf(task.due_on, day);
        const list = byBucket.get(bucket) ?? [];
        list.push(task);
        byBucket.set(bucket, list);
        continue;
      }

      // only today's completions are in the UI; yesterday's are still in the DB
      if (isOnDay(task.completed_at, day)) done.push(task);
    }

    // overdue rises to the top of Aujourd'hui, then time, then creation order
    const todayList = byBucket.get("today");
    if (todayList) {
      todayList.sort((a, b) => {
        const ao = isOverdue(a.due_on, a.status) ? 0 : 1;
        const bo = isOverdue(b.due_on, b.status) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        if (ao === 0) return daysFromToday(a.due_on!) - daysFromToday(b.due_on!);
        return (a.due_time ?? "99").localeCompare(b.due_time ?? "99");
      });
    }

    return {
      sections: SECTIONS.map((s) => ({ ...s, tasks: byBucket.get(s.bucket) ?? [] })),
      completedToday: done,
    };
  }, [tasks, holding, day]);

  const visibleCount = sections.reduce((n, s) => n + s.tasks.length, 0);

  /*
    Row focus is one flat sequence across all six sections — J and K cross
    section boundaries because the list reads as one list, not six.
  */
  const order = React.useMemo(
    () => sections.flatMap((s) => s.tasks.map((t) => t.id)),
    [sections],
  );

  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const toggle = useToggleWithFeedback();
  const remove = useDeleteWithFeedback();
  const setStatus = useSetStatusWithFeedback();
  const updateTask = useStore((s) => s.updateTask);

  // a focused row that leaves the list takes the focus with it
  React.useEffect(() => {
    if (focusedId && !order.includes(focusedId)) setFocusedId(null);
  }, [order, focusedId]);

  React.useEffect(() => {
    if (!focusedId) return;
    document
      .querySelector(`[data-focused]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  const step = React.useCallback(
    (delta: number) => {
      setFocusedId((current) => {
        if (order.length === 0) return null;
        if (!current) return delta > 0 ? order[0] : order[order.length - 1];
        const index = order.indexOf(current);
        const next = Math.min(Math.max(index + delta, 0), order.length - 1);
        return order[next];
      });
    },
    [order],
  );

  const onFocused = React.useCallback(
    (fn: (id: string) => void) => () => {
      if (focusedId) fn(focusedId);
    },
    [focusedId],
  );

  useHotkeys({
    j: () => step(1),
    arrowdown: () => step(1),
    k: () => step(-1),
    arrowup: () => step(-1),
    x: onFocused(toggle),
    enter: onFocused(toggle),
    e: onFocused(setOpenId),
    backspace: onFocused(remove),
    "!": onFocused((id) => {
      const task = allTasks.find((t) => t.id === id);
      if (task) updateTask(id, { important: !task.important });
    }),
    /*
      A and D cycle rather than opening a picker. The spec names them
      "reassign" and "set due date" without saying how; for two people, cycling
      is the fast keyboard path and it reuses the modal's own quick options.
    */
    a: onFocused((id) => {
      const task = allTasks.find((t) => t.id === id);
      if (!task) return;
      const ring = [null, ...members.map((m) => m.id)];
      const next = ring[(ring.indexOf(task.assignee_id) + 1) % ring.length];
      updateTask(id, { assignee_id: next });
    }),
    // S walks the workflow, the same shape as A over people and D over dates
    s: onFocused((id) => {
      const task = allTasks.find((t) => t.id === id);
      if (!task) return;
      const ring = ["todo", "doing", "done"] as const;
      setStatus(id, ring[(ring.indexOf(task.status) + 1) % ring.length]);
    }),
    d: onFocused((id) => {
      const task = allTasks.find((t) => t.id === id);
      if (!task) return;
      const ring = [today(), tomorrow(), toDayString(nextDay(nowTz(), 1)), null];
      const next = ring[(ring.indexOf(task.due_on) + 1) % ring.length];
      updateTask(id, next === null ? { due_on: null, due_time: null } : { due_on: next });
    }),
    escape: () => setFocusedId(null),
  });

  useOpenTask(setOpenId);

  const completionDays = useStore((s) => s.completionDays);
  const streak = React.useMemo(() => {
    // server history plus this session, so ticking the last task moves it now
    const local = allTasks
      .map((t) => t.completed_at)
      .filter((v): v is string => v !== null)
      .map(instantToDay);
    return streakFromDays([...completionDays, ...local], day);
  }, [completionDays, allTasks, day]);

  const { cleared, done: clearedCount } = useClearedToday(day, holding.size);


  const emptyMessage = (() => {
    if (searching && query.trim() !== "") return copy.empty.search;
    if (filter !== null) {
      const who =
        filter === me?.id
          ? copy.filter.mine
          : (members.find((m) => m.id === filter)?.display_name ?? copy.filter.mine);
      return copy.empty.filtered(who);
    }
    return allTasks.length > 0 ? copy.empty.today : copy.empty.firstRun;
  })();

  // the one loading state in the whole app
  if (!ready) return <Skeleton />;

  return (
    <div className="max-w-[760px] px-6 py-6">
      <TaskComposer
        // § 6 — capturing while the lens is on a person assigns it to them
        defaultAssigneeId={filter}
        search={{
          active: searching,
          query,
          onQuery: setQuery,
          onExit: () => {
            setSearching(false);
            setQuery("");
          },
        }}
      />

      {sections.map((s) => (
        <ListSection
          key={s.bucket}
          id={`section-${s.bucket}`}
          title={s.title}
          tasks={s.tasks}
          onOpen={setOpenId}
          pulseIds={pulseIds}
          focusedId={focusedId}
          onFocus={setFocusedId}
        />
      ))}

      {cleared ? (
        <ClearOut
          completedToday={clearedCount}
          streak={streak}
          seed={dayOfMonth()}
        />
      ) : (
        visibleCount === 0 && (
          <p className="text-[13px] text-fg-muted">{emptyMessage}</p>
        )
      )}

      {completedToday.length > 0 && (
        <section className="mt-2">
          <button
            type="button"
            onClick={() => setDoneOpen((v) => !v)}
            className="flex w-full items-baseline gap-1.5 py-1 text-left"
          >
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 self-center text-fg-faint transition-transform",
                doneOpen && "rotate-90",
              )}
              strokeWidth={1.5}
            />
            <span className="text-[13px] font-medium text-fg-muted">
              {copy.nav.doneToday}
            </span>
            <span className="ml-auto font-mono text-[12px] tabular-nums text-fg-faint">
              {completedToday.length}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {doneOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={exit}
                style={{ overflow: "hidden" }}
              >
                {completedToday.map((task) => (
                  <TaskRow key={task.id} task={task} onOpen={setOpenId} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <TaskModal taskId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-[760px] px-6 py-6">
      <div className="h-10 w-full rounded-sm border border-border bg-surface" />
      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-5 w-full max-w-[420px] rounded-sm bg-surface" />
        ))}
      </div>
    </div>
  );
}

/** Lowercase and strip accents, so "etiquette" finds "étiquette". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
