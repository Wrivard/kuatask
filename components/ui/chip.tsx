"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One of a set of choices: a grouping, a view mode, a status, a person.
 *
 * There were three of these, in two different shapes. The modal's version was
 * `rounded-md px-2.5 py-1.5` with an accent border and a tint when selected; the
 * board's « Grouper par » and the calendar's month/week were
 * `rounded-sm px-2 py-1` and marked the selection by moving the label from
 * `fg-muted` to `fg` and nothing else. Same job, two looks, and the second one
 * barely says which option is on — one step on the text ramp, on a control
 * whose entire purpose is to show you the current state.
 *
 * The radius is `rounded-sm`, 6px, which `docs/04` gives to inputs and buttons.
 * The modal's 8px was the task-row radius applied to a button, which is exactly
 * the "one radius for everything" the same rule exists to prevent.
 *
 * Selection is a border and a wash, not a fill. A solid accent chip would be
 * the loudest thing on a screen whose only other accent is the progress ring
 * and a completed checkbox — both of which mean something, and neither of which
 * should have to compete with a toolbar.
 */
export function Chip({
  active,
  className,
  children,
  ...props
}: {
  active: boolean;
  children: React.ReactNode;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[12px] transition-colors",
        active
          ? "border-accent bg-accent/10 text-fg"
          : "border-border text-fg-muted hover:border-control hover:text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
