"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { TaskComposer } from "@/components/task/task-composer";
import { TaskModal } from "@/components/task/task-modal-lazy";

// opened, not shown: kept off the first load
import { TaskRow } from "@/components/task/task-row";
import { ListSection } from "./list-section";
import { ClearOut } from "./clear-out";
import { exit } from "@/lib/motion";
import {
  bucketOf,
  dayNumber,
  daysFromToday,
  isOverdue,
  isOnDay,
  recentCompletionCutoff,
  nowTz,
  toDayString,
  today,
  tomorrow,
  type Bucket,
} from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import { useStreak } from "@/lib/streak";
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
import { useLocalLens } from "@/lib/lens";
import { useTaskModal, SEARCH_PARAM, searchHref } from "@/lib/events";
import { useRouter, useSearchParams } from "next/navigation";
import { nextDay } from "date-fns";
import { matches, parseQuery } from "@/lib/search";
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
  const modal = useTaskModal();
  const reduced = useReducedMotion();
  // expanded is a preference, not a transient: closing it on every trip to
  // the calendar means re-opening it every time you want yesterday's context
  const [doneOpenRaw, setDoneOpen] = useLocalLens<"0" | "1" | "7">("kua-done-open", "0");
  const doneOpen = doneOpenRaw !== "0";
  /*
    What is being searched comes from the URL, not from state here.

    The header's search box writes `?q=` and this reads it, so one place decides
    what the question is. It used to be local state fed by an event the composer
    raised, which meant search only existed where that composer was mounted —
    the list — and did nothing on the board, the calendar or anywhere else.

    A consequence worth having: a result set is a link, and Back leaves a search.
  */
  const searchParams = useSearchParams();
  const query = searchParams.get(SEARCH_PARAM) ?? "";
  const searching = query.trim() !== "";

  // searching rewrites the list, so restoring an old offset would be wrong
  useScrollMemory("list", !searching);

  // re-buckets by itself when Montreal rolls over midnight
  const day = useToday();

  const holding = useCompletionHold(allTasks);

  const byAssignee = React.useMemo(
    () => (filter === null ? allTasks : allTasks.filter((t) => t.assignee_id === filter)),
    [allTasks, filter],
  );

  /*
    Search is a different mode, not a filter on the sections.

    Bucketing the results hid every completed task, because the buckets only
    ever show what is open plus what was finished today — so the one thing you
    most often search for, "what was that thing we did for them last week", was
    the one thing search could not find. Results are a flat list in date order,
    done included and shown as done.
  */
  const results = React.useMemo(() => {
    if (!searching || query.trim() === "") return null;

    /*
      `#facture` filters by tag; anything else is free text; together they mean
      both. This was one substring test over every field joined into a string,
      which made `#facture` and `facture` the same question and neither of them
      the one a label chip asks when you click it. See lib/search.ts.
    */
    const parsed = parseQuery(query);
    if (parsed.tag === null && parsed.text === "") return null;

    return byAssignee
      .filter((t) => matches(t, parsed))
      .sort((a, b) => (b.due_on ?? "").localeCompare(a.due_on ?? ""));
  }, [byAssignee, searching, query]);

  const tasks = results ?? byAssignee;

  /*
    The browser holds a week of completions, so a task finished last month is in
    the database and not in memory. While a search is open, ask the server for
    what the window left out and merge it in. No loading state: the local
    matches are already on screen, and the rest arrive as more of the same list.
  */
  const searchArchive = useStore((s) => s.searchArchive);
  React.useEffect(() => {
    if (!searching) return;
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => searchArchive(q), 260);
    return () => clearTimeout(id);
  }, [searching, query, searchArchive]);

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

  /*
    Recomputed with the day rather than per render: it only moves at midnight,
    and comparing an ISO instant to a fixed string is what keeps the filter
    above cheap.
  */
  const recentCutoff = React.useMemo(() => recentCompletionCutoff(), [day]); // eslint-disable-line react-hooks/exhaustive-deps

  const { sections, completedToday, completedRecently } = React.useMemo(() => {
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

      /*
        The footer's second step is labelled « cette semaine », so it has to
        actually mean that. The window cannot be inferred from "whatever is in
        the store": searching pulls matching tasks back from outside it (17), so
        a task finished in March can be sitting in memory, and it would have
        been listed under a heading claiming it was finished this week.
      */
      if (task.completed_at && task.completed_at >= recentCutoff) done.push(task);
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

    /*
      Newest first, which is the opposite of the open list. A finished task is
      history: you read it to remember what happened, and what happened last is
      what you are looking for.
    */
    done.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

    return {
      sections: SECTIONS.map((s) => ({ ...s, tasks: byBucket.get(s.bucket) ?? [] })),
      completedToday: done.filter((t) => isOnDay(t.completed_at, day)),
      completedRecently: done,
    };
  }, [tasks, holding, day, recentCutoff]);

  /*
    Three states rather than two. Shut, today, and the week the browser is
    already holding — the footer used to show a count of today's and stop, so
    « what did we finish yesterday » meant reaching for the search box.

    The week also stands in whenever today is empty, which is every morning:
    the day rolls over at midnight and this section went on claiming to be
    « Terminé aujourd'hui » with a 0 beside it, a heading for a thing that
    was not there. Yesterday's work is the honest answer to what it is
    holding, and the count then means something.
  */
  const showsWeek = doneOpenRaw === "7" || completedToday.length === 0;
  const doneShows = showsWeek ? completedRecently : completedToday;

  const visibleCount = sections.reduce((n, s) => n + s.tasks.length, 0);

  /*
    docs/06 refuses overdue its own section, so that a backlog cannot grow into
    a wall of failure people learn to scroll past. A count is not a section: it
    says how far behind you are in one glance and then stops talking.
  */
  const overdueCount = React.useMemo(
    () =>
      (sections.find((s) => s.bucket === "today")?.tasks ?? []).filter((t) =>
        isOverdue(t.due_on, t.status),
      ).length,
    [sections],
  );

  /*
    Row focus is one flat sequence across all six sections — J and K cross
    section boundaries because the list reads as one list, not six.
  */
  const order = React.useMemo(
    () => sections.flatMap((s) => s.tasks.map((t) => t.id)),
    [sections],
  );

  const setFilter = useStore((s) => s.setAssigneeFilter);

  // reuses the search box rather than adding a second kind of filter to the app
  const router = useRouter();

  /*
    The same navigation the board's chips do. It used to set local state, which
    is why the two behaved differently from surfaces that look identical.
  */
  const searchLabel = React.useCallback(
    (label: string) => router.push(searchHref(`#${label}`), { scroll: false }),
    [router],
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
    e: onFocused(modal.open),
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

  const streak = useStreak(day);

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
      {/* capture only: searching is the header's box now */}
      <TaskComposer
        // § 6 — capturing while the lens is on a person assigns it to them
        defaultAssigneeId={filter}
      />

      {results ? (
        <ListSection
          title={copy.search.title}
          tasks={results}
          onOpen={modal.open}
          focusedId={focusedId}
          onFocus={setFocusedId}
          onSelectLabel={searchLabel}
          onSelectAssignee={setFilter}
          note={
            <span className="text-[12px] text-fg-faint">
              {copy.search.count(results.length)}
            </span>
          }
        />
      ) : (
        sections.map((s) => (
          <ListSection
            key={s.bucket}
            id={`section-${s.bucket}`}
            title={s.title}
            tasks={s.tasks}
            onOpen={modal.open}
            pulseIds={pulseIds}
            focusedId={focusedId}
            onFocus={setFocusedId}
            onSelectLabel={searchLabel}
            onSelectAssignee={setFilter}
            note={
              s.bucket === "today" && overdueCount > 0 ? (
                <span className="text-[12px] text-danger">
                  {copy.task.overdueCount(overdueCount)}
                </span>
              ) : undefined
            }
          />
        ))
      )}

      {cleared && !results ? (
        <ClearOut
          completedToday={clearedCount}
          streak={streak}
          seed={dayNumber()}
        />
      ) : (
        (results ? results.length === 0 : visibleCount === 0) && (
          <div>
            <p className="text-[13px] text-fg-muted">{emptyMessage}</p>
            {/* only where it helps: a search that found nothing */}
            {searching && (
              <p className="mt-1 text-[12px] text-fg-faint">
                {copy.empty.searchTagHint}
              </p>
            )}
          </div>
        )
      )}

      {!results && completedRecently.length > 0 && (
        <section className="mt-2">
          <button
            type="button"
            onClick={() => setDoneOpen(doneOpen ? "0" : "1")}
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
              {showsWeek ? copy.nav.doneRecent : copy.nav.doneToday}
            </span>
            <span className="ml-auto font-mono text-[12px] tabular-nums text-fg-faint">
              {doneShows.length}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {doneOpen && (
              /*
                Opacity only under reduced motion, like `ListSection` next door.

                This was the one component in the app that imported `motion` and
                never asked the preference — and what it animates is height,
                which is exactly the kind of movement somebody turns that
                preference on to stop. `docs/04`: reduced motion replaces every
                transform with an opacity crossfade. The transition is kept, so
                the section still fades rather than snapping.
              */
              <motion.div
                initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={exit}
                style={{ overflow: "hidden" }}
                // the same trailing hairline the sections drop; `last-of-type`
                // rather than `last-child` because a « voir la semaine » button
                // can follow the rows
                className="[&>div:last-of-type]:border-b-0"
              >
                {doneShows.map((task) => (
                  <TaskRow key={task.id} task={task} onOpen={modal.open} />
                ))}

                {/*
                  Only offered when there is actually more to see, and only once
                  the section is open — a control for something you cannot see
                  is a control you have to think about.
                */}
                {!showsWeek && completedRecently.length > completedToday.length && (
                  <button
                    type="button"
                    onClick={() => setDoneOpen("7")}
                    className="py-2 text-left text-[12px] text-fg-faint hover:text-fg"
                  >
                    {copy.nav.doneWeek(completedRecently.length - completedToday.length)}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {modal.openId && (
        <TaskModal taskId={modal.openId} focus={modal.focus} onClose={modal.close} />
      )}
    </div>
  );
}

/**
 * The one loading state in the app, shaped like what replaces it.
 *
 * It was not: rows were 20px on a 32px pitch against real rows of 44px sitting
 * flush, the section header was missing entirely, and the composer's outline
 * used `border-border` where the real one uses `border-control`. So the single
 * screen in the app guaranteed to be followed by a layout shift was the one
 * § 8.8 names — "no layout shift when a row leaves" is the same requirement seen
 * from the other end, and a skeleton that lies about its proportions breaks it
 * before the app has even started.
 *
 * Every measurement here is taken from the thing it stands for: `mb-4` from the
 * composer's wrapper, `h-11` and the hairline from `TaskRow`, `mb-1` and the
 * 13px line from `ListSection`'s header.
 */
function Skeleton() {
  return (
    <div className="max-w-[760px] px-6 py-6">
      {/* the composer: same height, same radius, same control border */}
      <div className="mb-4 h-10 w-full rounded-sm border border-control bg-surface" />

      {/* including the missing last rule, which is part of matching it */}
      <div className="mb-6 [&>div:last-child]:border-b-0">
        {/* a section header is 13px on a 4px baseline, with mb-1 under it */}
        <div className="mb-1 flex h-[18px] items-center">
          <div className="h-3 w-24 rounded-sm bg-surface" />
        </div>

        {/*
          Rows, not bars. 44px each and flush, because that is what arrives —
          four of them, which is about what a first screen holds before anybody
          scrolls.
        */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-11 items-center gap-3 border-b border-border px-3">
            <div className="size-[18px] shrink-0 rounded-sm border border-control" />
            <div
              className="h-3 rounded-sm bg-surface"
              // uneven, so it reads as titles rather than as a progress bar
              style={{ width: ["58%", "37%", "71%", "45%"][i] }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

