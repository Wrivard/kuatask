"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * The steps inside a task.
 *
 * A checklist, not tasks: no date, no assignee, no status of its own. It is
 * the same component in the modal and under a row in the list, because they
 * are the same list — opening one and editing the other and finding them out
 * of step would be worse than having only one of them.
 *
 * Ticking a step is not completing anything: the tone, the streak and the
 * day's progress belong to tasks. What a step gives back is the count on the
 * row, « 2/5 », moving.
 */
export function Subtasks({
  taskId,
  autoFocusInput = false,
}: {
  taskId: string;
  /** The list view opens the panel to write in it; the modal does not steal focus. */
  autoFocusInput?: boolean;
}) {
  const steps = useStore((s) => s.subtasks[taskId]);
  const addSubtask = useStore((s) => s.addSubtask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const renameSubtask = useStore((s) => s.renameSubtask);
  const deleteSubtask = useStore((s) => s.deleteSubtask);

  const [draft, setDraft] = React.useState("");
  const list = steps ?? [];

  const add = () => {
    const title = draft.trim();
    if (title === "") return;
    addSubtask(taskId, title);
    setDraft("");
  };

  return (
    <div className="flex flex-col">
      {list.map((step) => (
        <div key={step.id} className="group/step flex items-center gap-2.5 py-1">
          <input
            type="checkbox"
            checked={step.done}
            onChange={() => toggleSubtask(step.id)}
            aria-label={step.title}
            className="size-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
          />

          <StepTitle
            value={step.title}
            done={step.done}
            onCommit={(title) => renameSubtask(step.id, title)}
          />

          <button
            type="button"
            onClick={() => deleteSubtask(step.id)}
            title={copy.task.stepDelete}
            aria-label={copy.task.stepDelete}
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-sm text-fg-faint",
              "opacity-0 hover:text-danger focus-visible:opacity-100 group-hover/step:opacity-100",
              "[@media(pointer:coarse)]:size-9 [@media(pointer:coarse)]:opacity-100",
            )}
          >
            <X className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ))}

      {/* Enter keeps the field: a checklist is written in one go, not one visit per line */}
      <input
        value={draft}
        autoFocus={autoFocusInput}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft("");
            e.currentTarget.blur();
          }
        }}
        maxLength={200}
        placeholder={copy.task.stepAdd}
        aria-label={copy.task.stepAdd}
        className={cn(
          "mt-0.5 h-8 w-full rounded-sm bg-transparent px-0 text-[14px] text-fg",
          "placeholder:text-fg-faint focus-visible:outline-none",
        )}
      />
    </div>
  );
}

/** A step's title: text you can click into, saved when you leave it. */
function StepTitle({
  value,
  done,
  onCommit,
}: {
  value: string;
  done: boolean;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const editing = React.useRef(false);
  React.useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  return (
    <input
      value={draft}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        if (draft.trim() !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          editing.current = false;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      maxLength={200}
      className={cn(
        "min-w-0 flex-1 rounded-sm bg-transparent px-0 text-[14px] leading-[1.4] text-fg",
        "focus-visible:outline-none focus-visible:underline focus-visible:decoration-accent focus-visible:underline-offset-4",
        done && "text-fg-muted line-through",
      )}
    />
  );
}

/** « 2/5 » — what the row shows without opening anything. */
export function useStepCount(taskId: string): { done: number; total: number } {
  const steps = useStore((s) => s.subtasks[taskId]);
  return React.useMemo(
    () => ({ done: (steps ?? []).filter((x) => x.done).length, total: (steps ?? []).length }),
    [steps],
  );
}
