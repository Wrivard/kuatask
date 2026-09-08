"use client";

import * as React from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
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

export function useToggleWithFeedback() {
  return React.useCallback((id: string) => {
    const state = useStore.getState();
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;

    if (task.status === "todo") {
      completionTone();
      tick();
      state.toggleTask(id);
      notify(state.undo);
      announce(`${task.title} ${copy.nav.done.toLowerCase()}`);
    } else {
      // reopening should feel neutral, not punitive
      uncompleteTone();
      state.toggleTask(id);
    }
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
