"use client";

import { accentColor } from "@/components/task/assignee-dot";
import { formatTime } from "@/lib/time";
import type { Profile, Task } from "@/lib/store";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * A task inside a calendar cell.
 *
 * It used to be a bare line of text, which meant a cell with three tasks read
 * as a paragraph: nothing said where one task stopped and the next began, and
 * the only way to tell whose it was, or whether it was done, was to squint at a
 * 1.5px dot at the end of the line.
 *
 * A card gives it edges. The left rule carries the assignee's identity colour —
 * the same colour as their dot everywhere else, so the cell is scannable by
 * person at a glance — and En cours keeps its accent rule instead, because
 * "somebody is on this right now" outranks "it is theirs".
 */
export function CalendarCard({
  task,
  member,
  onGrab,
  onOpen,
  compact = false,
}: {
  task: Task;
  member: Profile | undefined;
  onGrab: (id: string, e: React.PointerEvent) => void;
  /**
   * Opens the task.
   *
   * The card used to have no click handler at all: the press became a drag or
   * it bubbled to the cell, which opened the day. So reaching a task you could
   * see took two clicks and an intermediate screen, and the one thing the cards
   * were added for — being able to tell tasks apart at a glance — stopped short
   * of letting you act on the one you found.
   *
   * It opens rather than completes, unlike the list and the board. The calendar
   * is where you look at a month and decide; a stray click in a grid of 4mm
   * bars should not mark something done. Completing from here is what the day
   * sheet is for, one click away, at full row size.
   */
  onOpen: (id: string) => void;
  /** The month grid has a third of the height the week view does. */
  compact?: boolean;
}) {
  const done = task.status === "done";
  const doing = task.status === "doing";
  const time = formatTime(task.due_time);
  /*
    Two colours, two jobs, two elements.

    The left rule is who it belongs to — or the accent when somebody is on it
    right now, since "in progress" outranks "whose" on a 4mm bar. The fill is
    the task's own colour, set in the modal and shown only here.

    Keeping them on separate elements is what lets both use the same six hexes
    without the ambiguity DECISIONS warns about for the board's column strips: a
    2px rule always means a person, a fill always means the task's own colour.
    If they ever share an element, one of them has to change.
  */
  const rule = doing
    ? "var(--color-accent)"
    : member
      ? accentColor(member.accent)
      : "var(--color-border)";

  const fill = task.color ? accentColor(task.color) : rule;

  return (
    <div
      onPointerDown={(e) => onGrab(task.id, e)}
      onClick={(e) => {
        // the cell behind this opens the whole day; the card is more specific
        e.stopPropagation();
        onOpen(task.id);
      }}
      title={task.title}
      // the month grid measures two of these to work out how many fit
      data-cal-card=""
      className={cn(
        /*
          One step above the cell it sits in, so the card has edges of its own.
          It used to be `bg-surface` inside a transparent cell; now that an
          in-month cell *is* `bg-surface`, a card painted the same colour would
          be a border floating on nothing.
        */
        "flex cursor-pointer touch-none select-none items-center gap-1 rounded-sm border border-border border-l-2",
        "hover:border-control hover:brightness-125",
        compact ? "px-1 py-px" : "px-1.5 py-1",
        done && "opacity-45",
      )}
      /*
        The left rule carries the colour, and a wash of the same colour carries
        it across the card. 10% of an accent over the card's own background is
        enough to tell two people's tasks apart across a whole month without any
        card becoming a block of colour — the cell has forty-one neighbours and
        every one of them is competing for the same glance.
      */
      style={{
        borderLeftColor: rule,
        /*
          `color-mix` rather than an alpha suffix on the hex, because `colour` is
          only sometimes a hex: En cours and the unowned case are CSS variables,
          and `var(--color-accent)1a` is not a colour. Mixing works for all three
          and follows the theme, which a baked hex would not.
        */
        /*
          A coloured task is mixed harder than an uncoloured one: 22% against
          10%. The identity wash exists to make a month scannable by person
          without any card becoming a block of colour; a colour somebody set by
          hand is meant to be found, and answering both at the same strength
          would make the deliberate one invisible among the automatic ones.
        */
        backgroundColor: `color-mix(in srgb, ${fill} ${task.color ? 22 : 10}%, var(--color-surface-hover))`,
      }}
    >
      {/*
        12px in the month, 13px in the week.

        These were 11px and 10px, below the 12px `docs/04` sets as the smallest
        size in the app — the floor exists because that is where text stops
        being comfortable to read, and a month grid is the surface you scan
        longest. The owner's complaint about the calendar being hard on the eyes
        was partly this.

        Raising it costs cell density, but `useRowsThatFit` measures the real
        rendered height rather than trusting a constant, so the grid adjusts on
        its own and the « +N » overflow absorbs the difference.
      */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate leading-[1.35] text-fg",
          compact ? "text-[12px]" : "text-[13px]",
          done && "line-through",
        )}
      >
        {task.title}
      </span>

      {task.important && (
        <span
          className="size-1 shrink-0 rounded-full bg-danger"
          aria-label={copy.task.important}
        />
      )}

      {time && (
        <span
          className={cn(
            "shrink-0 font-mono tabular-nums text-fg-faint",
            compact ? "text-[11px]" : "text-[12px]",
          )}
        >
          {time}
        </span>
      )}
    </div>
  );
}
