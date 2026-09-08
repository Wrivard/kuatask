"use client";

import * as React from "react";
import { toast } from "sonner";
import { setErrorHandler, useStore } from "@/lib/store";
import { copy } from "@/lib/copy";

/**
 * Hydrates the store once on shell mount and connects the store's error channel
 * to sonner. The store stays free of UI imports so it remains testable.
 */
export function StoreBoot() {
  React.useEffect(() => {
    setErrorHandler((reason) =>
      toast.error(copy.error.saveFailed, { description: reason }),
    );
    void useStore.getState().hydrate();
  }, []);

  return null;
}
