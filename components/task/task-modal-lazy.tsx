"use client";

import dynamic from "next/dynamic";

/**
 * The task modal, loaded when something opens it.
 *
 * One wrapper rather than the same `dynamic()` call written out in each of the
 * four views that open it. They agreed, but only because nobody had changed one
 * of them yet — and the options here are exactly the kind that get adjusted in
 * the file you happen to have open. `ssr: false` because the modal reads the
 * store, which does not exist on the server.
 */
export const TaskModal = dynamic(
  () => import("./task-modal").then((m) => m.TaskModal),
  { ssr: false },
);
