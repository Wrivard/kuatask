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

/**
 * Distinct labels already in use, most useful first.
 *
 * Raw frequency ranks a client you billed forty hours to last spring above the
 * one you are working on this week, which is exactly backwards for a field you
 * are typing into right now. Each use is worth a point that decays by half
 * every fortnight, so a long-finished client falls away on its own without
 * anything ever needing to be archived.
 */
const HALF_LIFE_DAYS = 14;

export function labelsInUse(tasks: Task[], nowMs: number = Date.now()): string[] {
  const weights = new Map<string, number>();

  for (const task of tasks) {
    if (!task.label) continue;
    const stamp = Date.parse(task.updated_at ?? task.created_at ?? '');
    const ageDays = Number.isNaN(stamp)
      ? 0
      : Math.max(0, (nowMs - stamp) / 86_400_000);
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    weights.set(task.label, (weights.get(task.label) ?? 0) + weight);
  }

  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

/**
 * A suggestion plus the strings it can be found by.
 *
 * A person is matched on their display name and on the local part of their
 * address, because that is what gets typed: `@gberther` is how one of these two
 * is addressed all day, and it used to match nothing at all.
 */
type Candidate = Suggestion & { keys: string[] };

export function suggestionsFor(
  token: ActiveToken,
  tasks: Task[],
  members: Profile[],
  limit = 5,
): Suggestion[] {
  const pool: Candidate[] =
    token.kind === "label"
      ? labelsInUse(tasks).map((l) => ({ value: l, label: `#${l}`, keys: [l.toLowerCase()] }))
      : members.map((m) => ({
          value: m.display_name,
          label: `@${m.display_name}`,
          keys: [m.display_name.toLowerCase(), (m.email ?? '').split('@')[0].toLowerCase()]
            .filter(Boolean),
        }));

  const strip = ({ value, label }: Candidate): Suggestion => ({ value, label });

  if (token.query === "") return pool.slice(0, limit).map(strip);

  // prefix matches first, then anything containing the query
  const q = token.query;
  const starts = pool.filter((s) => s.keys.some((k) => k.startsWith(q)));
  const contains = pool.filter(
    (s) => !s.keys.some((k) => k.startsWith(q)) && s.keys.some((k) => k.includes(q)),
  );
  return [...starts, ...contains].slice(0, limit).map(strip);
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
