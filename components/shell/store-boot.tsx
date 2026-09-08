"use client";

import * as React from "react";
import { toast } from "sonner";
import { setErrorHandler, useStore } from "@/lib/store";
import { useRealtimeTasks } from "@/lib/realtime";
import { copy } from "@/lib/copy";

/**
 * Hydrates the store once on shell mount, connects the store's error channel to
 * sonner, and opens the realtime subscription. The store stays free of UI
 * imports so it remains testable.
 */
export function StoreBoot() {
  React.useEffect(() => {
    setErrorHandler((reason) =>
      toast.error(copy.error.saveFailed, { description: reason }),
    );
    void useStore.getState().hydrate();
  }, []);

  // no-ops until hydrate lands a workspaceId, then subscribes
  useRealtimeTasks();

  return null;
}
