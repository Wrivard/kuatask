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
  GROUP_OPTIONS,
  NO_ASSIGNEE,
  type GroupBy,
} from "@/lib/grouping";
import { accentColor } from "@/components/task/assignee-dot";
import { useStore } from "@/lib/store";
import { useToggleWithFeedback } from "@/lib/completion";
import { useOpenTask } from "@/lib/events";
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
  const reschedule = useStore((s) => s.reschedule);
  const toggle = useToggleWithFeedback();

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

  const columns = React.useMemo(
    () => buildColumns(groupBy, tasks, members, me, accentColor),
    [groupBy, tasks, members, me],
  );

  const drop = React.useCallback(
    (taskId: string, columnKey: string) => {
      const task = useStore.getState().tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (columnOf(groupBy, task) === columnKey) return; // dropped where it already was

      if (groupBy === "person") {
        updateTask(taskId, {
          assignee_id: columnKey === NO_ASSIGNEE ? null : columnKey,
        });
        return;
      }

      if (groupBy === "status") {
        // routed through the feedback path so a dragged completion sounds and
        // animates exactly like a clicked one
        toggle(taskId);
        return;
      }

      reschedule(taskId, firstDayOfBucket(columnKey as Bucket));
    },
    [groupBy, updateTask, reschedule, toggle],
  );

  const { dragId, target, grab } = useDragToTarget(drop);

  if (!ready) return <div className="px-6 py-6" />;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex items-center gap-2 px-6 py-3">
        <span className="text-[12px] text-fg-faint">{copy.board.groupBy}</span>
        {GROUP_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => chooseGroup(option.value)}
            className={cn(
              "rounded-sm border border-border px-2 py-1 text-[12px]",
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

                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                  <AnimatePresence initial={false}>
                    {column.tasks.map((task) => (
                      <motion.div
                        key={task.id}
                        layout
                        exit={{ opacity: 0 }}
                        transition={exit}
                      >
                        <BoardCard
                          task={task}
                          dragging={dragId === task.id}
                          onOpen={setOpenId}
                          onGrab={grab}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>

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
        <TaskComposer />
      </div>

      <TaskModal taskId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
