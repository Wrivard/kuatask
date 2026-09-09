import { copy } from "@/lib/copy";

/**
 * Marks a task as En cours in the list and on the calendar.
 *
 * It borrows the label chip's shape rather than inventing a new one, and it
 * takes the accent outline — this is the one in-flight state in the app, and
 * the reserved green is exactly what "this is live right now" should read as.
 * A task in progress is still unchecked; only done changes the checkbox.
 */
export function StatusChip() {
  return (
    <span className="shrink-0 rounded-sm border border-accent px-1.5 py-px text-[12px] text-accent">
      {copy.board.doing}
    </span>
  );
}
