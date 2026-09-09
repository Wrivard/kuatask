"use client";

import type { Profile, Task } from "@/lib/store";

/**
 * Autocomplete for the composer's `#label` and `@person` tokens.
 *
 * docs/06-views.md asks for both: labels complete from the ones already in use,
 * which is what keeps thirty client tags from becoming thirty-five spellings of
 * the same five clients, and people complete from the workspace.
 *
 * Only the token under the cursor is considered, and only while it is still
 * being typed — a completed token with a space after it is left alone.
 */
export type Suggestion = { value: string; label: string };

export type ActiveToken = {
  kind: "label" | "assignee";
  /** What has been typed after the sigil, lowercased. */
  query: string;
  /** Index of the sigil in the raw input, for splicing the completion back. */
  start: number;
};

const TOKEN_AT_CURSOR = /(^|\s)([#@])([\p{L}\d-]*)$/u;

export function tokenAtCursor(value: string, cursor: number): ActiveToken | null {
  const before = value.slice(0, cursor);
  const match = before.match(TOKEN_AT_CURSOR);
  if (!match) return null;

  const [whole, lead, sigil, typed] = match;
  return {
    kind: sigil === "#" ? "label" : "assignee",
    query: typed.toLowerCase(),
    start: before.length - whole.length + lead.length,
  };
}

/** Distinct labels already in use, most frequent first. */
export function labelsInUse(tasks: Task[]): string[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!task.label) continue;
    counts.set(task.label, (counts.get(task.label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

export function suggestionsFor(
  token: ActiveToken,
  tasks: Task[],
  members: Profile[],
  limit = 5,
): Suggestion[] {
  const pool: Suggestion[] =
    token.kind === "label"
      ? labelsInUse(tasks).map((l) => ({ value: l, label: `#${l}` }))
      : members.map((m) => ({ value: m.display_name, label: `@${m.display_name}` }));

  if (token.query === "") return pool.slice(0, limit);

  // prefix matches first, then anything containing the query
  const q = token.query;
  const starts = pool.filter((s) => s.value.toLowerCase().startsWith(q));
  const contains = pool.filter(
    (s) => !s.value.toLowerCase().startsWith(q) && s.value.toLowerCase().includes(q),
  );
  return [...starts, ...contains].slice(0, limit);
}

/** Splices a chosen completion over the token being typed. */
export function applySuggestion(
  value: string,
  cursor: number,
  token: ActiveToken,
  choice: Suggestion,
): { value: string; cursor: number } {
  const sigil = token.kind === "label" ? "#" : "@";
  const tail = value.slice(cursor);

  // the trailing space is what lets you keep typing the next token, but adding
  // one before existing whitespace leaves a gap in the middle of the line
  const spacer = tail.startsWith(" ") ? "" : " ";
  const replacement = `${sigil}${choice.value}${spacer}`;

  return {
    value: value.slice(0, token.start) + replacement + tail,
    cursor: token.start + replacement.length,
  };
}
