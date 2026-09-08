"use client";

import * as React from "react";

/**
 * Polite live region for completion announcements: "{titre} terminé".
 *
 * A module-level setter rather than context, so lib/completion.ts can announce
 * from the same place it plays the tone without threading a provider through
 * every route.
 */
let publish: ((message: string) => void) | null = null;

export function announce(message: string) {
  publish?.(message);
}

export function LiveRegion() {
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    publish = (next) => {
      // re-set through empty so an identical message announces twice
      setMessage("");
      requestAnimationFrame(() => setMessage(next));
    };
    return () => {
      publish = null;
    };
  }, []);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
