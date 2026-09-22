"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlignLeft, Pencil } from "lucide-react";
import { TaskCheckbox } from "./task-checkbox";
import { LabelChip } from "./label-chip";
import { StatusChip } from "./status-chip";
import { AssigneeFace } from "./assignee-dot";
import { Avatar } from "./avatar";
import { COMPLETION } from "@/lib/motion";
import { daysFromToday, formatDueLabel, formatTime, isOverdue } from "@/lib/time";
import { useStore, type Task } from "@/lib/store";
import { useToggleWithFeedback } from "@/lib/completion";
import { isFresh } from "@/lib/fresh";
import { useMinute } from "@/lib/minute";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * checkbox · title · label · importance · time · assignee · edit
 *
 * Clicking the row completes the task. Editing is a button that appears on
 * hover, at the end of the row.
 *
 * This is the reverse of how it started, and of what `docs/06` described: the
 * whole row used to open the modal and only the checkbox completed. The owner
 * asked for the swap, and the reasoning holds — completing is the thing that
 * happens dozens of times a day and the thing the app exists to make feel good,
 * while editing is occasional. Making the common action the whole-row target
 * and the rare one a deliberate button matches how the list is actually used.
 *
 * What it costs: a click meant as "let me look at this" now completes something.
 * That is real, and it is why completion is the most thoroughly undoable action
 * in the app — an undo toast on every completion, ⌘Z, and the tone that tells
 * you it happened before you have looked away.
 *
 * The edit button is hover-revealed with a mouse and permanent under a finger.
 * There is no hover on a touch screen, so a hover-only control there is not a
 * subtle affordance, it is a missing one.
 */
function TaskRowImpl({
  task,
  onOpen,
  pulseAssignee = false,
  focused = false,
  onFocus,
  onGrab,
  onSelectLabel,
  onSelectAssignee,
  impliedDay,
}: {
  task: Task;
  onOpen: (id: string) => void;
  /**
   * A day the surrounding surface has already named.
   *
   * The day sheet is a list of one day's tasks under a heading giving that day,
   * and every row printed it again — « 8 septembre » forty times inside a panel
   * titled « 8 septembre ». The list already avoids this for Aujourd'hui; the
   * rule was just hardcoded to today rather than to "wherever the day is
   * already known".
   *
   * The time survives, because that is the part the heading does not say.
   */
  impliedDay?: string;
  pulseAssignee?: boolean;
  /** Row focus is separate from DOM focus and from selection. */
  focused?: boolean;
  onFocus?: (id: string) => void;
  /**
   * Makes the row draggable. Left off in the list, where the order is the
   * date's to decide and `touch-none` would cost the page its scroll.
   */
  onGrab?: (id: string, e: React.PointerEvent) => void;
  /** Clicking the chip or the dot narrows the list, where the view supports it. */
  onSelectLabel?: (label: string) => void;
  onSelectAssignee?: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const toggle = useToggleWithFeedback();
  const members = useStore((s) => s.members);

  const done = task.status === "done";
  const assignee = members.find((m) => m.id === task.assignee_id);
  const overdue = isOverdue(task.due_on, task.status);

  /*
    « Nouveau » for three hours after creation, so a task the other person added
    while you were away is the first thing your eye lands on rather than one
    more row in the same grey. Not on a finished task: once it is done, whether
    you noticed it arriving no longer matters.
  */
  const minute = useMinute();
  const fresh = !done && isFresh(task.created_at, minute);
  const creator = fresh ? members.find((m) => m.id === task.created_by) : undefined;

  /*
    Inside "Aujourd'hui" the words "aujourd'hui" are noise, so a task due today
    shows only its time, or nothing. Everywhere else the day earns its place —
    and an overdue task keeps its date, in danger, at the top of today.
  */
  const dateText = (() => {
    if (!task.due_on) return "";
    const time = formatTime(task.due_time);

    /*
      An overdue task keeps its date everywhere except the day that *is* that
      date: in the sheet for 8 September, « 8 septembre » in red says nothing the
      heading has not, while the red itself still carries the warning.
    */
    if (impliedDay && task.due_on === impliedDay) return time;
    if (!overdue && daysFromToday(task.due_on) === 0) return time;
    return [formatDueLabel(task.due_on), time].filter(Boolean).join(" ");
  })();

  return (
    /*
      The row is not a button. It looked like one — role="button" and a tabIndex
      — but it contains a checkbox and, now, a label chip and an assignee dot
      that are themselves controls, and a button cannot hold controls. Assistive
      technology was told to expect one thing and handed another.

      What it is instead: a container whose *title* is the button. That is the
      real "open this task" target, it is what lands under Tab, and the chip and
      the dot are its siblings rather than illegal descendants. Clicking
      anywhere else on the row still opens the modal, because docs/06 says the
      whole surface is the target — that is a convenience layered on top of a
      correct structure rather than a substitute for one.
    */
    <div
      onClick={(e) => {
        // a click that landed on a control has already been handled by it
        if ((e.target as HTMLElement).closest("button,input,a")) return;
        toggle(task.id);
      }}
      onMouseEnter={() => onFocus?.(task.id)}
      onPointerDown={onGrab && ((e) => onGrab(task.id, e))}
      data-focused={focused || undefined}
      data-task-id={task.id}
      className={cn(
        "group flex h-11 items-center gap-3 rounded-md border-b border-border px-3 text-left transition-colors",
        "hover:bg-surface-hover",
        // 44px with a mouse, 52px under a finger. Keyed on the pointer, not the
        // window: a narrow desktop window is still a mouse, and a large tablet
        // is still a thumb.
        "[@media(pointer:coarse)]:h-13",
        // focus is a 1px accent ring, and never lands flush against the header
        focused && "scroll-mt-20 ring-1 ring-accent ring-inset",
        onGrab && "touch-none select-none",
        done && "opacity-45",
      )}
    >
      <TaskCheckbox
        checked={done}
        onToggle={() => toggle(task.id)}
        label={task.title}
      />

      {/*
        The title is the row's real control — it is what Tab lands on, and the
        chip and the dot are its siblings rather than descendants of a button
        that cannot legally hold them. It does what the row does.
      */}
      <button
        type="button"
        onClick={() => toggle(task.id)}
        aria-pressed={done}
        className="relative min-w-0 flex-1 truncate text-left text-[15px] leading-[1.4] tracking-[-0.011em] outline-none focus-visible:underline focus-visible:decoration-accent focus-visible:underline-offset-4"
      >
        {task.title}
        {/* strikethrough draws left to right rather than switching on */}
        <motion.span
          aria-hidden
          className="absolute left-0 top-1/2 h-px w-full bg-current"
          style={{ transformOrigin: "left" }}
          initial={false}
          animate={
            reduced
              ? { opacity: done ? 1 : 0, scaleX: 1 }
              : { scaleX: done ? 1 : 0 }
          }
          transition={{ duration: COMPLETION.strikethrough / 1000, ease: "easeOut" }}
        />
      </button>

      {/*
        The metadata, as one group rather than seven things in a row.

        Everything here used to sit in the row's own `gap-3`, so a label, a
        date, an identity dot and a notes glyph were spaced exactly as far apart
        as the checkbox is from the title — eight items of equal weight, and
        nothing saying which of them belong together. At 6px they read as one
        cluster hanging off the end of the title, which is what they are. The
        board card already grouped its metadata this way; the list is the busier
        of the two and had the looser spacing.
      */}
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        {/*
          Filled rather than outlined, so it cannot be mistaken for En cours,
          which is the accent in outline. First in the group, nearest the title
          it describes.
        */}
        {/*
          Carries who added it. A just-captured task is usually unassigned, so
          the assignee slot is empty — which read as the tag having pushed the
          picture out. The face that answers "who put this here" belongs to the
          tag, not to the assignee slot, which keeps meaning "whose it is".
        */}
        {fresh && (
          <span
            title={creator ? copy.task.freshBy(creator.display_name) : copy.task.freshHint}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full bg-accent py-0.5 pr-2 text-[11px] font-medium leading-none text-bg",
              creator ? "pl-0.5" : "pl-2",
            )}
          >
            {creator && <Avatar member={creator} size="xs" />}
            {copy.task.fresh}
          </span>
        )}

        {/*
          Whether a task has notes was only discoverable by opening it, which is
          the one thing the row exists to avoid. A glyph, not a count: the number
          of lines in someone's notes is not information.
        */}
        {task.notes && task.notes.trim() !== "" && (
          <AlignLeft
            className="size-3 shrink-0 text-fg-faint"
            strokeWidth={1.5}
            aria-label={copy.task.hasNotes}
          />
        )}

        {task.status === "doing" && <StatusChip />}

        {task.label && <LabelChip label={task.label} onSelect={onSelectLabel} />}

        {task.important && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-danger"
            title={copy.task.important}
            aria-label={copy.task.important}
          />
        )}

        {dateText && (
          <span
            title={overdue ? copy.task.overdue : undefined}
            className={cn(
              "shrink-0 text-[12px] tabular-nums",
              overdue ? "text-danger" : "text-fg-faint",
            )}
          >
            {overdue && <span className="sr-only">{copy.task.overdue} — </span>}
            {dateText}
          </span>
        )}

        <AssigneeFace member={assignee} pulse={pulseAssignee} onSelect={onSelectAssignee} />
      </div>

      {/* an action, not metadata, so it keeps the row's own spacing */}
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        title={copy.task.edit}
        aria-label={copy.task.edit}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-sm text-fg-faint transition-opacity",
          "hover:bg-surface-hover hover:text-fg",
          // hidden until the row is hovered, and whenever it has keyboard focus
          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          /*
            A finger has no hover, so there it simply lives there — and it grows
            to 36px, because 24 is the floor WCAG 2.5.8 sets rather than a size
            to aim at, and this is the only way to open a task by touch.
          */
          "[@media(pointer:coarse)]:size-9 [@media(pointer:coarse)]:opacity-100",
        )}
      >
        {/* docs/04: 16px in rows and buttons */}
        <Pencil className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}

/*
  A store write replaces the tasks array, so without this every row in the list
  re-renders on every keystroke in the modal and on every realtime event. The
  task object's identity only changes when that task changes, and the callbacks
  are stable setters, so memoizing here keeps a long list cheap.
*/
export const TaskRow = React.memo(TaskRowImpl);
