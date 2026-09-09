"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { BoardCard } from "./board-card";
import { TaskComposer } from "@/components/task/task-composer";
import { TaskModal } from "@/components/task/task-modal";
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
import { firstDayOfBucket, type Bucket } from "@/lib/time";
import { exit } from "@/lib/motion";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const GROUP_KEY = "kua-board-group";

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

  const [groupBy, setGroupBy] = React.useState<GroupBy>("person");
  const [openId, setOpenId] = React.useState<string | null>(null);

  // the grouping is a lens, like the assignee filter, so it persists locally
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(GROUP_KEY) as GroupBy | null;
      if (saved && GROUP_OPTIONS.some((o) => o.value === saved)) setGroupBy(saved);
    } catch {
      /* blocked storage — the default stands */
    }
  }, []);

  function chooseGroup(next: GroupBy) {
    setGroupBy(next);
    try {
      localStorage.setItem(GROUP_KEY, next);
    } catch {
      /* blocked storage */
    }
  }

  useOpenTask(setOpenId);

  /*
    Grouping by person already separates the two of you, so the assignee lens
    would only ever blank out columns. Every other grouping honours it.
  */
  const tasks = React.useMemo(() => {
    if (groupBy === "person" || filter === null) return allTasks;
    return allTasks.filter((t) => t.assignee_id === filter);
  }, [allTasks, filter, groupBy]);

  // § 8.1 — a completed card holds its column for the beat before it moves
  const holding = useCompletionHold(allTasks);

  const columns = React.useMemo(
    () => buildColumns(groupBy, tasks, members, me, accentColor, holding),
    [groupBy, tasks, members, me, holding],
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

      updateTask(taskId, { position });
      rescheduleWithToast(taskId, firstDayOfBucket(columnKey as Bucket));
    },
    [groupBy, updateTask, setStatus, assign, rescheduleWithToast],
  );

  const { dragId, target, index: dropIndex, grab } = useDragToTarget(drop);

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

      <div className="min-h-0 flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex h-full min-w-max gap-3">
          {columns.map((column) => {
            const isTarget = target === column.key && dragId !== null;
            return (
              <section
                key={column.key}
                data-drop-target={column.key}
                className={cn(
                  "flex h-full w-[280px] shrink-0 flex-col rounded-md border border-border",
                  isTarget && "border-accent bg-surface-hover",
                )}
              >
                <header className="flex items-center gap-2 px-3 py-2">
                  {column.accent && (
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: column.accent }}
                    />
                  )}
                  <h2 className="text-[13px] font-medium text-fg-muted">{column.title}</h2>
                  <span className="ml-auto font-mono text-[12px] tabular-nums text-fg-faint">
                    {column.tasks.length}
                  </span>
                </header>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
                  <AnimatePresence initial={false}>
                    {column.tasks.map((task, i) => (
                      <motion.div
                        key={task.id}
                        layout
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
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {isTarget && dropIndex === column.tasks.length && (
                    <div className="mb-1.5 h-px bg-accent" aria-hidden />
                  )}

                  {column.tasks.length === 0 && (
                    <p className="px-1 py-2 text-[12px] text-fg-faint">
                      {copy.board.empty}
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

      <TaskModal taskId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
