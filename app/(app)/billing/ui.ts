import { cn } from "@/lib/utils";

/*
  The few controls the billing pages share, written once.

  Creating a client and editing one are the same two fields; they were built
  twice, a pixel apart, and read as two different forms. Everything that asks
  for a client's name or rate uses these.
*/

/** A labelled text field: the height of a button, so a row of them lines up. */
export const FIELD = cn(
  "h-9 w-full rounded-sm border border-control bg-bg px-2.5 text-[14px] text-fg",
  "placeholder:text-fg-faint focus-visible:border-accent focus-visible:outline-none",
  "aria-invalid:border-danger",
);

/** The one filled button on a surface: the thing you came to do. */
export const PRIMARY = cn(
  "flex h-9 shrink-0 items-center gap-1.5 rounded-sm bg-accent px-3.5 text-[13px] font-medium text-bg",
  "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40",
);

/** Everything else: outlined, quieter, the same height. */
export const SECONDARY = cn(
  "flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-bg px-3 text-[13px] text-fg-muted",
  "hover:border-control hover:text-fg",
);

/** The panel a form sits in, so it reads as one thing rather than loose inputs. */
export const PANEL = "rounded-md border border-border bg-surface p-4";
