"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BoardCard } from "./board-card";
import { TaskComposer } from "@/components/task/task-composer";
import dynamic from "next/dynamic";

// opened, not shown: kept off the first load
const TaskModal = dynamic(() => import("@/components/task/task-modal").then((m) => m.TaskModal), { ssr: false });
import { useDragToTarget } from "@/lib/drag";
import {
  buildColumns,
  columnOf,
  positionForDrop,
  GROUP_OPTIONS,
  NO_ASSIGNEE,
  type GroupBy,
} from "@/lib/grouping";
import { accentColor } from "@/components/task/assignee-dot";
import { useStore, type Task } from "@/lib/store";
import {
  useSetStatusWithFeedback,
  useAssignWithFeedback,
  useRescheduleWithFeedback,
} from "@/lib/completion";
import { useOpenTask } from "@/lib/events";
import { useCompletionHold } from "@/lib/hold";
import { useClearedToday } from "@/lib/clear-out";
import { ClearOut } from "./clear-out";
import { streakFromDays, instantToDay, dayNumber } from "@/lib/time";
import { useToday } from "@/lib/day";
import { useLocalLens } from "@/lib/lens";
import { firstDayOfBucket, isOnDay, isOverdue, type Bucket } from "@/lib/time";
import { useElementScrollMemory } from "@/lib/scroll-memory";
import { exit } from "@/lib/motion";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const GROUP_KEY = "kua-board-group";
const COLLAPSED_KEY = "kua-board-collapsed";
const GROUP_VALUES = GROUP_OPTIONS.map((o) => o.value);

/**
 * One board, three groupings. Dragging a card between columns writes exactly
 * the field the board is keyed on — assignee, status, or due date — so the same
 * gesture means three useful things without three separate screens.
 *
 * Grouped by person this is the "one list each" view; grouped by status it is
 * the kanban; grouped by date it is the list's buckets laid sideways.
 */
export function BoardView() {
  const ready = useStore((s) => s.ready);
  const allTasks = useStore((s) => s.tasks);
  const members = useStore((s) => s.members);
  const me = useStore((s) => s.me);
  const filter = useStore((s) => s.assigneeFilter);
  const updateTask = useStore((s) => s.updateTask);
  const setStatus = useSetStatusWithFeedback();
  const assign = useAssignWithFeedback();
  const rescheduleWithToast = useRescheduleWithFeedback();

  const day = useToday();
  const reduced = useReducedMotion();
  const [openId, setOpenId] = React.useState<string | null>(null);

  // the grouping is a lens, like the assignee filter, so it persists locally
  const [groupBy, chooseGroup] = useLocalLens<GroupBy>(
    GROUP_KEY,
    "person",
    GROUP_VALUES,
  );

  /*
    Grouping by date makes six columns, which on a laptop is more horizontal
    scrolling than a two-person board is worth. A collapsed column keeps its
    count and stays a drop target — folding something away must not make it
    unreachable, or the fold becomes a way to lose work.

    Stored as a joined string keyed by grouping, so collapsing "Plus tard" by
    date does not also collapse a person.
  */
  const [collapsedRaw, setCollapsed] = useLocalLens<string>(COLLAPSED_KEY, "");
  const collapsed = React.useMemo(
    () => new Set(collapsedRaw.split("|").filter(Boolean)),
    [collapsedRaw],
  );
  const toggleCollapsed = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(`${groupBy}:${key}`)) next.delete(`${groupBy}:${key}`);
    else next.add(`${groupBy}:${key}`);
    setCollapsed([...next].join("|"));
  };
  const isCollapsed = (key: string) => collapsed.has(`${groupBy}:${key}`);

  // the board is where losing your place costs most: column five is a journey,
  // not a flick, and it scrolls sideways so the window-level memory cannot see it
  const scrollRef = React.useRef<HTMLDivElement>(null);
  useElementScrollMemory(`board:${groupBy}`, scrollRef);

  useOpenTask(setOpenId);

  /*
    Grouping by person already separates the two of you, so the assignee lens
    would only ever blank out columns. Every other grouping honours it.
  */
  const tasks = React.useMemo(() => {
    /*
      Only today's completions appear, the same rule the list footer follows.
      Without it the Terminé column — and every person's column — accumulates
      every task ever finished, so the board gets heavier the longer the app is
      used and the one place you look to see what is left fills with what is not.
      The rows are still in the database; they are just no longer today's work.
    */
    const current = allTasks.filter(
      (t) => t.status !== "done" || isOnDay(t.completed_at, day),
    );

    if (groupBy === "person" || filter === null) return current;
    return current.filter((t) => t.assignee_id === filter);
  }, [allTasks, filter, groupBy, day]);

  // § 8.1 — a completed card holds its column for the beat before it moves
  const holding = useCompletionHold(allTasks);

  const columns = React.useMemo(
    () => buildColumns(groupBy, tasks, members, me, accentColor, holding, day),
    [groupBy, tasks, members, me, holding, day],
  );

  const columnsRef = React.useRef(columns);
  columnsRef.current = columns;

  const drop = React.useCallback(
    (taskId: string, columnKey: string, index: number | null) => {
      const task = useStore.getState().tasks.find((t) => t.id === taskId);
      if (!task) return;

      const sameColumn = columnOf(groupBy, task) === columnKey;
      const column = columnsRef.current.find((c) => c.key === columnKey);

      /*
        Reordering inside a column is its own move: nothing about the task
        changes except where it sits. Writing only `position` keeps it a single
        optimistic update, and skipping the no-op case means picking a card up
        and putting it back does not push an undo entry.
      */
      if (sameColumn) {
        if (index === null || !column) return;
        const next = positionForDrop(column, index, taskId);
        if (next !== task.position) updateTask(taskId, { position: next });
        return;
      }

      // a cross-column drop also lands where it was dropped, not at the end
      const position =
        index !== null && column ? positionForDrop(column, index, taskId) : task.position;

      if (groupBy === "person") {
        updateTask(taskId, { position });
        assign(taskId, columnKey === NO_ASSIGNEE ? null : columnKey);
        return;
      }

      if (groupBy === "status") {
        // routed through the feedback path so a dragged completion sounds and
        // animates exactly like a clicked one, in every direction
        updateTask(taskId, { position });
        setStatus(taskId, columnKey as Task["status"]);
        return;
      }

      const landing = firstDayOfBucket(columnKey as Bucket, day);
      // a bucket with no day left today cannot take a card; better to decline
      // than to put it somewhere else and say it worked
      if (landing === undefined) return;

      updateTask(taskId, { position });
      rescheduleWithToast(taskId, landing);
    },
    [groupBy, day, updateTask, setStatus, assign, rescheduleWithToast],
  );

  const { dragId, target, index: dropIndex, grab } = useDragToTarget(drop);

  /*
    Arrow keys on a focused card run the same drop the pointer would, so the
    board is operable without a mouse and there is one definition of what
    landing in a column means. The card keeps focus across the move because it
    is keyed on the task id, not its position.
  */
  const move = React.useCallback(
    (taskId: string, direction: -1 | 1) => {
      const cols = columnsRef.current;
      const task = useStore.getState().tasks.find((t) => t.id === taskId);
      if (!task) return;

      const from = cols.findIndex((c) => c.key === columnOf(groupBy, task));
      const to = from + direction;
      if (from < 0 || to < 0 || to >= cols.length) return;

      drop(taskId, cols[to].key, cols[to].tasks.length);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-card-id="${taskId}"]`)?.focus();
      });
    },
    [drop, groupBy],
  );

  // § 8.5 — the moment belongs to the day being cleared, not to one screen
  const { cleared, done: clearedCount } = useClearedToday(day, holding.size);
  const completionDays = useStore((s) => s.completionDays);
  const streak = React.useMemo(() => {
    const local = allTasks
      .map((t) => t.completed_at)
      .filter((v): v is string => v !== null)
      .map(instantToDay);
    return streakFromDays([...completionDays, ...local], day);
  }, [completionDays, allTasks, day]);

  const isEmpty = columns.every((c) => c.tasks.length === 0);

  if (!ready) return <div className="px-6 py-6" />;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex items-center gap-2 overflow-x-auto px-6 py-3">
        <span className="shrink-0 text-[12px] text-fg-faint">{copy.board.groupBy}</span>
        {GROUP_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => chooseGroup(option.value)}
            className={cn(
              "shrink-0 rounded-sm border border-border px-2 py-1 text-[12px]",
              groupBy === option.value ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {cleared && (
        <div className="px-6">
          <ClearOut completedToday={clearedCount} streak={streak} seed={dayNumber()} />
        </div>
      )}

      {isEmpty && !cleared && (
        <p className="px-6 py-6 text-[13px] text-fg-muted">
          {allTasks.length === 0 ? copy.empty.firstRun : copy.empty.today}
        </p>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex h-full min-w-max gap-3">
          {columns.map((column) => {
            const isTarget = target === column.key && dragId !== null;
            const folded = isCollapsed(column.key);
            const late = column.tasks.filter((t) => isOverdue(t.due_on, t.status)).length;
            return (
              <section
                key={column.key}
                data-drop-target={column.key}
                aria-label={copy.a11y.column(column.title, column.tasks.length)}
                className={cn(
                  "flex h-full shrink-0 flex-col overflow-hidden rounded-md border border-border",
                  // never wider than the viewport leaves room for, so a phone
                  // shows one column and its neighbour's edge rather than a
                  // column running off the screen
                  folded ? "w-11" : "w-[min(280px,calc(100vw-4.5rem))]",
                  isTarget && "border-accent bg-surface-hover",
                )}
              >
                {/*
                  A 2px strip in the column's colour, so the board is read by
                  shape before it is read by word. It sits on the column rather
                  than on the cards: it says which column, never whose task.
                */}
                {column.accent && (
                  <span
                    aria-hidden
                    className="h-0.5 w-full shrink-0"
                    style={{ backgroundColor: column.accent }}
                  />
                )}

                <header
                  className={cn(
                    "flex gap-2 px-3 py-2",
                    folded ? "flex-1 flex-col items-center px-0" : "items-center",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(column.key)}
                    aria-expanded={!folded}
                    title={folded ? copy.board.expand : copy.board.collapse}
                    className={cn(
                      "min-w-0 truncate text-[13px] font-medium text-fg-muted hover:text-fg",
                      // vertical text, so a folded column still says what it is
                      folded && "[writing-mode:vertical-rl] py-1",
                    )}
                  >
                    {column.title}
                  </button>
                  {late > 0 && (
                    <span className="shrink-0 text-[12px] text-danger" title={copy.task.overdue}>
                      {late}
                    </span>
                  )}
                  <span
                    className={cn(
                      "font-mono text-[12px] tabular-nums text-fg-faint",
                      folded ? "mt-auto pb-2" : "ml-auto",
                    )}
                  >
                    {column.tasks.length}
                  </span>
                </header>

                <div
                  hidden={folded}
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2"
                >
                  <AnimatePresence initial={false}>
                    {column.tasks.map((task, i) => (
                      <motion.div
                        key={task.id}
                        layout={!reduced}
                        exit={{ opacity: 0 }}
                        transition={exit}
                        data-drop-index={i}
                        className="pb-1.5"
                      >
                        {/* where the card would land, drawn only while dragging */}
                        {isTarget && dropIndex === i && (
                          <div className="mb-1.5 h-px bg-accent" aria-hidden />
                        )}
                        <BoardCard
                          task={task}
                          dragging={dragId === task.id}
                          onOpen={setOpenId}
                          onGrab={grab}
                          onMove={move}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {isTarget && dropIndex === column.tasks.length && (
                    <div className="mb-1.5 h-px bg-accent" aria-hidden />
                  )}

                  {/*
                    An empty column said "Rien ici.", six times over, which is
                    noise rather than information — a column with nothing in it
                    is already obviously empty. What was actually missing is a
                    target while dragging, so the words appear only then.
                  */}
                  {column.tasks.length === 0 && dragId !== null && (
                    <p
                      className={cn(
                        "rounded-sm border border-dashed px-2 py-3 text-center text-[12px]",
                        isTarget
                          ? "border-accent text-fg"
                          : "border-border text-fg-faint",
                      )}
                    >
                      {copy.board.dropHere}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border px-6 py-3">
        {/* grouping by person shows everyone, so the lens is the only hint */}
        <TaskComposer defaultAssigneeId={groupBy === "person" ? null : filter} />
      </div>

      {openId && <TaskModal taskId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
