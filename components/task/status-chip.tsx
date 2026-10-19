import { copy } from "@/lib/copy";

/**
 * Marks a task as En cours or En attente in the list, on the board and on the
 * calendar.
 *
 * It borrows the label chip's shape rather than inventing a new one. En cours
 * takes the accent outline — this is the one in-flight state in the app, and
 * the reserved green is exactly what "this is live right now" should read as.
 *
 * En attente takes the muted one, and the contrast between them is the whole
 * job of this component. A parked task is the opposite of live, so it must not
 * borrow the colour that means live; it reads like the row's own metadata,
 * because that is what it is. A task in either state is still unchecked — only
 * done changes the checkbox.
 */
export function StatusChip({ status = "doing" }: { status?: "doing" | "on_hold" }) {
  const onHold = status === "on_hold";
  return (
    <span
      className={
        onHold
          ? "shrink-0 rounded-sm border border-border px-1.5 py-px text-[12px] text-fg-faint"
          : "shrink-0 rounded-sm border border-accent px-1.5 py-px text-[12px] text-accent"
      }
    >
      {onHold ? copy.board.onHold : copy.board.doing}
    </span>
  );
}
