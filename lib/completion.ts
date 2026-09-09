"use client";

import * as React from "react";
import { toast } from "sonner";
import { useStore, type Task } from "@/lib/store";
import { completionTone, uncompleteTone, tick } from "@/lib/sound";
import { announce } from "@/components/shell/live-region";
import { copy } from "@/lib/copy";

/**
 * Everything that fires the instant a task is completed, in one place, so the
 * checkbox and the keyboard shortcut behave identically.
 *
 * The tone fires here — in the click handler, before any state settles — rather
 * than from an effect watching the store. § 8.1 puts it at 0ms, and an effect
 * would land it a frame late and would also sound for the other person's
 * completions, which § 8.7 explicitly rules out.
 */

type TaskStatus = Task["status"];

const TOAST_ID = "kua-completion";
const TOAST_MS = 5000;

let batch = 0;
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Rapid completions collapse into one toast. A stack of toasts during a fast
 * clear-out is noise that fights the thing it is celebrating.
 */
function notify(undo: () => void) {
  batch += 1;
  const count = batch;

  toast(count === 1 ? copy.toast.completed : copy.toast.completedMany(count), {
    id: TOAST_ID,
    duration: TOAST_MS,
    action: {
      label: copy.toast.undo,
      onClick: () => {
        // undo restores the whole collapsed batch, not just the last one
        for (let i = 0; i < count; i += 1) undo();
        batch = 0;
      },
    },
  });

  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    batch = 0;
  }, TOAST_MS);
}

/**
 * Move a task to an explicit status, with the sound that transition deserves.
 *
 * Only crossing the done boundary makes noise. Sliding between À faire and
 * En cours is bookkeeping, not an achievement, and a tone there would cheapen
 * the one that matters.
 */
export function useSetStatusWithFeedback() {
  return React.useCallback((id: string, next: TaskStatus) => {
    const state = useStore.getState();
    const task = state.tasks.find((t) => t.id === id);
    if (!task || task.status === next) return;

    if (next === "done") {
      completionTone();
      tick();
      state.updateTask(id, {
        status: next,
        completed_at: new Date().toISOString(),
        completed_by: state.me?.id ?? null,
      });
      notify(state.undo);
      announce(`${task.title} ${copy.nav.done.toLowerCase()}`);
      return;
    }

    if (task.status === "done") {
      // reopening should feel neutral, not punitive
      uncompleteTone();
    }

    state.updateTask(id, { status: next, completed_at: null, completed_by: null });
  }, []);
}

export function useToggleWithFeedback() {
  const setStatus = useSetStatusWithFeedback();
  return React.useCallback(
    (id: string) => {
      const task = useStore.getState().tasks.find((t) => t.id === id);
      if (!task) return;
      // a task that is "doing" completes rather than falling back to "todo"
      setStatus(id, task.status === "done" ? "todo" : "done");
    },
    [setStatus],
  );
}

/**
 * Reassigning and rescheduling by drag, each with an undo.
 *
 * A drag is the easiest gesture in the app to perform by accident — one slip
 * and a task is on the other person's plate or a week away. Completion and
 * deletion both already offer a way back; these are the two mutations that
 * could still surprise you silently.
 */
export function useAssignWithFeedback() {
  return React.useCallback((id: string, assigneeId: string | null) => {
    const state = useStore.getState();
    const task = state.tasks.find((t) => t.id === id);
    if (!task || task.assignee_id === assigneeId) return;

    state.updateTask(id, { assignee_id: assigneeId });

    const name =
      state.members.find((m) => m.id === assigneeId)?.display_name ??
      copy.task.nobody;

    toast(copy.toast.assigned(name), {
      duration: TOAST_MS,
      action: { label: copy.toast.undo, onClick: () => state.undo() },
    });
  }, []);
}

export function useRescheduleWithFeedback() {
  return React.useCallback((id: string, dueOn: string | null) => {
    const state = useStore.getState();
    const task = state.tasks.find((t) => t.id === id);
    if (!task || task.due_on === dueOn) return;

    state.reschedule(id, dueOn);

    toast(copy.toast.rescheduled, {
      duration: TOAST_MS,
      action: { label: copy.toast.undo, onClick: () => state.undo() },
    });
  }, []);
}

export function useDeleteWithFeedback() {
  return React.useCallback((id: string) => {
    const state = useStore.getState();
    state.deleteTask(id);
    toast(copy.toast.deleted, {
      duration: TOAST_MS,
      action: { label: copy.toast.undo, onClick: () => state.undo() },
    });
  }, []);
}
