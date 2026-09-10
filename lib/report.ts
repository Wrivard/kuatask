"use client";

/**
 * Sends a crash somewhere a person will see it.
 *
 * Fire and forget, and silent about its own failures: a reporter that can throw
 * turns one broken render into two, and the second one has no boundary left to
 * catch it.
 *
 * `sendBeacon` where it exists, because the interesting crashes are the ones
 * where the page is about to be replaced or reloaded and a normal fetch would
 * be cancelled on the way out.
 */
const ENDPOINT = "/api/report";

/**
 * One report per message per session — a render loop must not become a flood.
 *
 * Bounded, because the key includes the message and a message can carry a
 * timestamp or an id: every crash would then be "new", the set would grow
 * without limit, and the deduplication it exists for would never fire. Past the
 * cap it is cleared rather than trimmed — a session that has produced fifty
 * distinct crashes is not one where remembering the first forty-nine matters.
 */
const seen = new Set<string>();
const SEEN_LIMIT = 50;

export function report(error: unknown, extra: { digest?: string } = {}) {
  if (typeof window === "undefined") return;

  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const key = `${err.message}|${extra.digest ?? ""}`;
    if (seen.has(key)) return;
    if (seen.size >= SEEN_LIMIT) seen.clear();
    seen.add(key);

    const body = JSON.stringify({
      message: err.message,
      digest: extra.digest,
      // the path, not the query — a search term is the user's, not ours
      path: window.location.pathname,
      stack: err.stack,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting is never worth an error of its own */
  }
}

/**
 * Catches what never reaches a React boundary: a rejected promise nobody
 * awaited, and a throw from outside the tree. The store's writes are all
 * `void (async () => …)()`, so a bug in one of them lands here and nowhere else.
 */
export function installGlobalReporting() {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (e) => report(e.reason));
  window.addEventListener("error", (e) => report(e.error ?? e.message));
}
