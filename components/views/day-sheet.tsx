"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TaskRow } from "@/components/task/task-row";
import { TaskComposer } from "@/components/task/task-composer";
import { formatDueLabel } from "@/lib/time";
import { useStore } from "@/lib/store";
import { copy } from "@/lib/copy";

/**
 * Same row component, same interactions, same completion animation as the list.
 * The composer is pre-dated to the day, which is the whole reason to open it.
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

  const dayTasks = tasks.filter(
    (t) => t.due_on === day && (filter === null || t.assignee_id === filter),
  );

  return (
    <Sheet open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full border-border bg-bg sm:max-w-[420px]">
        <SheetHeader className="px-5 pb-0 pt-5">
          <SheetTitle className="text-[22px] font-semibold tracking-[-0.02em]">
            {day ? formatDueLabel(day) : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 pb-5">
          <TaskComposer defaultDueOn={day} />

          {dayTasks.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{copy.empty.day}</p>
          ) : (
            dayTasks.map((task) => (
              <TaskRow key={task.id} task={task} onOpen={onOpenTask} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
