"use client";

/**
 * What has to be forgotten when somebody signs out.
 *
 * The sign-out button used to call the store and the draft map directly, which
 * meant importing them — and that button also renders on `/no-access`, a page
 * for somebody who has no workspace and no tasks. It went from 215 kB to
 * 232 kB: seventeen kilobytes of task-management machinery, downloaded by a
 * stranger to render one line of copy and a way out.
 *
 * So the dependency runs the other way. Whatever holds session state registers
 * how to drop it, and the button asks without knowing who answered. `StoreBoot`
 * mounts only inside the app, so on `/no-access` nothing is registered, nothing
 * is imported, and there is nothing to clear anyway.
 */
type Reset = () => void;

const resets = new Set<Reset>();

/** Registers a way to drop session state. Returns the way to unregister it. */
export function onSignOut(reset: Reset): () => void {
  resets.add(reset);
  return () => {
    resets.delete(reset);
  };
}

/**
 * Runs them all. Each is wrapped: one throwing must not leave the rest holding
 * the previous person's data, and none of them is worth failing a sign-out for.
 */
export function resetSession() {
  for (const reset of resets) {
    try {
      reset();
    } catch {
      /* the next one still has to run */
    }
  }
}
