"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlignLeft, Pencil } from "lucide-react";
import { TaskCheckbox } from "@/components/task/task-checkbox";
import { LabelChip } from "@/components/task/label-chip";
import { StatusChip } from "@/components/task/status-chip";
import { AssigneeFace, SharedFaces } from "@/components/task/assignee-dot";
import { COMPLETION, spring } from "@/lib/motion";
import { daysFromToday, formatDueLabel, formatTime, isOverdue } from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import { useToggleWithFeedback } from "@/lib/completion";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * A board card is the task row's information, stacked instead of inline.
 *
 * It keeps the same targets as the row — clicking completes, the edit button
 * that appears on hover opens the modal — and the same completion sequence, so
 * a task behaves identically wherever you meet it. The third gesture, drag,
 * only begins once the pointer has moved 4px, so a click stays a click.
 */
function BoardCardImpl({
  task,
  dragging,
  onOpen,
  onGrab,
  onMove,
  onSelectLabel,
}: {
  task: Task;
  dragging: boolean;
  onOpen: (id: string) => void;
  onGrab: (id: string, e: React.PointerEvent) => void;
  /** Narrows to that tag, which on the board means going to the list for it. */
  onSelectLabel?: (label: string) => void;
  /** Move one column left or right — the keyboard equivalent of a drag. */
  onMove?: (id: string, direction: -1 | 1) => void;
}) {
  const reduced = useReducedMotion();
  const members = useStore((s) => s.members);
  const toggle = useToggleWithFeedback();

  const done = task.status === "done";
  const overdue = isOverdue(task.due_on, task.status);
  const hasNotes = task.notes !== null && task.notes.trim() !== "";
  const assignee = members.find((m) => m.id === task.assignee_id);

  const dateText = (() => {
    if (!task.due_on) return "";
    const time = formatTime(task.due_time);
    if (!overdue && daysFromToday(task.due_on) === 0) return time;
    return [formatDueLabel(task.due_on), time].filter(Boolean).join(" ");
  })();

  /*
    Same correction as the task row: a card carries a checkbox, so it cannot
    itself be a button. The title is the button — it is what Tab reaches, what
    Enter opens, and where the keyboard equivalents of the drag live. The card
    around it keeps the click-anywhere convenience docs/06 asks for.
  */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // dragging is a mouse gesture; these are the same move without one
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onMove?.(task.id, -1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onMove?.(task.id, 1);
      return;
    }
    if (e.key.toLowerCase() === "x") {
      e.preventDefault();
      toggle(task.id);
    }
  };

  return (
    <motion.div
      layout={!reduced}
      transition={spring}
      onPointerDown={(e) => onGrab(task.id, e)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,input,a")) return;
        toggle(task.id);
      }}
      className={cn(
        "group flex touch-none select-none flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5",
        "cursor-pointer hover:bg-surface-hover",
        // the card lifts on grab, and nothing else in the app has a shadow
        dragging && "opacity-90 shadow-lg ring-1 ring-accent",
        done && "opacity-45",
      )}
      animate={dragging && !reduced ? { scale: 1.02 } : { scale: 1 }}
    >
      <div className="flex items-start gap-2">
        <TaskCheckbox
          checked={done}
          onToggle={() => toggle(task.id)}
          label={task.title}
        />
        <button
          type="button"
          data-card-id={task.id}
          onClick={() => toggle(task.id)}
          aria-pressed={done}
          onKeyDown={onKeyDown}
          // the full text on hover, since two lines is where this now stops
          title={task.title}
          className={cn(
            "min-w-0 flex-1 text-left text-[13px] leading-[1.35] outline-none",
            "line-clamp-2 [overflow-wrap:anywhere]",
            "focus-visible:underline focus-visible:decoration-accent focus-visible:underline-offset-4",
            /*
              A real strikethrough here, not the drawn one.

              A board card's title wraps — the column is 280px and the text is
              13px — and the drawn version is a single absolutely-positioned line
              across the middle of the block. On a one-line title that is the
              text; on a two-line title it is the gap between them. It has been
              striking through nothing this whole time on every card long enough
              to wrap.

              `text-decoration` is drawn by the browser through every line, at
              any number of them. It cannot sweep left to right, so it fades in
              over the same 200ms instead — § 8.1 asks for the draw, and the list
              row still does it, because `truncate` makes that title one line by
              construction. Here, correct beats faithful.
            */
            "decoration-current decoration-1 transition-[text-decoration-color] motion-reduce:transition-none",
            done ? "line-through" : "line-through decoration-transparent",
          )}
          style={{ transitionDuration: `${COMPLETION.strikethrough}ms` }}
        >
          {task.title}
        </button>

        {/*
          In the flow, not pinned over the corner.

          It was absolute, which floated it across the title — invisible until
          hover with a mouse, but permanently on top of the text under a finger,
          where it is always shown. As a flex sibling it reserves its 24px from
          the start, and because it hides with opacity rather than `display`,
          that space is reserved whether or not it is visible. Nothing reflows
          when it appears, which was the only reason to pin it in the first place.
        */}
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          title={copy.task.edit}
          aria-label={copy.task.edit}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-sm text-fg-faint transition-opacity",
            "hover:bg-surface-hover hover:text-fg",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            "[@media(pointer:coarse)]:size-9 [@media(pointer:coarse)]:opacity-100",
          )}
        >
          <Pencil className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      {(task.label || dateText || task.important || assignee || hasNotes || task.status === "doing") && (
        /*
          Indented past the checkbox so the metadata lines up under the
          title. Written as the arithmetic rather than its answer: 18px is
          the checkbox (§ 8.1) and 0.5rem is the `gap-2` above. As a bare
          26 it was a number that silently stopped being right the moment
          either of those moved.
        */
        <div className="flex items-center gap-1.5 pl-[calc(18px+0.5rem)]">
          {task.status === "doing" && <StatusChip />}
          {/*
            Clickable here too. The chip on a list row has narrowed the
            list to a tag since it was built; on a board card it was
            decoration, so the one obvious way to ask « show me
            everything tagged this » did nothing on the view where the
            tags are most visible.
          */}
          {task.label && (
            <LabelChip label={task.label} onSelect={onSelectLabel} />
          )}
          {/* same glyph as the row: whether there is more to read, nothing else */}
          {hasNotes && (
            <AlignLeft
              className="size-3 shrink-0 text-fg-faint"
              strokeWidth={1.5}
              aria-label={copy.task.hasNotes}
            />
          )}
          {task.important && (
            <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-label={copy.task.important} />
          )}
          {dateText && (
            <span
              className={cn(
                "shrink-0 text-[12px] tabular-nums",
                overdue ? "text-danger" : "text-fg-faint",
              )}
            >
              {dateText}
            </span>
          )}
          <span className="ml-auto">
            {task.shared ? (
              <SharedFaces members={members} />
            ) : (
              <AssigneeFace member={assignee} />
            )}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/** Same reasoning as TaskRow: keep untouched cards out of the render pass. */
export const BoardCard = React.memo(BoardCardImpl);
