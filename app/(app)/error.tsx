"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";

/**
 * Catches a render error inside the app shell.
 *
 * Without this a thrown component takes the whole route down to Next's default
 * screen: a white page and a digest, which tells the person nothing and looks
 * exactly like losing their data. Nothing here is lost — the tasks are in
 * Postgres and the store is rebuilt from them on the next render — so the copy
 * says so, and reset() re-renders the segment without a full reload.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // the digest is the only handle on the server-side trace
    console.error("[kua] view crashed", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[380px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
          {copy.error.crashed}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
          {copy.error.crashedBody}
        </p>

        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            className="h-10 rounded-sm text-[14px] font-medium"
          >
            {copy.error.retry}
          </Button>
        </div>

        {error.digest && (
          <p className="mt-4 font-mono text-[12px] text-fg-faint">{error.digest}</p>
        )}
      </div>
    </main>
  );
}
