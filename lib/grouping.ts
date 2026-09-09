"use client";

import { bucketOf, type Bucket } from "@/lib/time";
import type { Profile, Task } from "@/lib/store";
import { copy } from "@/lib/copy";

/**
 * The board is one component with three groupings rather than three boards.
 *
 * Each grouping answers a different question with the same gesture — "who is
 * this on", "is it done", "when is it due" — and dragging a card between
 * columns writes exactly the field the grouping is keyed on. That keeps three
 * requested drag behaviours inside one screen and one mental model.
 */
export type GroupBy = "person" | "status" | "due";

export const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "person", label: copy.board.byPerson },
  { value: "status", label: copy.board.byStatus },
  { value: "due", label: copy.board.byDue },
];

export type Column = {
  /** Stable key, also the drop-target id. */
  key: string;
  title: string;
  tasks: Task[];
  /** Identity colour for a person column. */
  accent?: string;
};

/** The unassigned column, kept distinct from a real user id. */
export const NO_ASSIGNEE = "__none__";

const DUE_ORDER: Bucket[] = ["today", "tomorrow", "week", "month", "later", "undated"];

const DUE_TITLES: Record<Bucket, string> = {
  today: copy.nav.today,
  tomorrow: copy.nav.tomorrow,
  week: copy.nav.week,
  month: copy.nav.month,
  later: copy.nav.later,
  undated: copy.nav.undated,
};

export function buildColumns(
  groupBy: GroupBy,
  tasks: Task[],
  members: Profile[],
  me: Profile | null,
  accentOf: (accent: string | undefined) => string,
  /**
   * Tasks completed within the last beat, mapped to the status they held
   * before. § 8.1 says a completed row stays put before it leaves, so on the
   * status board a card must linger in the column it came from rather than
   * jumping to Terminé the instant the checkbox is hit.
   */
  holding: Map<string, Task["status"]> = new Map(),
): Column[] {
  // you first — a board you read every day should open on your own work
  const ordered = me
    ? [me, ...members.filter((m) => m.id !== me.id)]
    : members;

  if (groupBy === "person") {
    const columns: Column[] = ordered.map((m) => ({
      key: m.id,
      title: m.id === me?.id ? copy.filter.mine : m.display_name,
      accent: accentOf(m.accent),
      tasks: [],
    }));
    columns.push({ key: NO_ASSIGNEE, title: copy.board.unassigned, tasks: [] });

    const index = new Map(columns.map((c) => [c.key, c]));
    for (const task of tasks) {
      (index.get(task.assignee_id ?? NO_ASSIGNEE) ?? index.get(NO_ASSIGNEE))!.tasks.push(task);
    }
    return columns.map(sortByPosition);
  }

  if (groupBy === "status") {
    // workflow order, which is not the enum's declaration order
    const columns: Column[] = [
      { key: "todo", title: copy.board.todo, tasks: [] },
      { key: "doing", title: copy.board.doing, tasks: [] },
      { key: "done", title: copy.board.done, tasks: [] },
    ];
    const index = new Map(columns.map((c) => [c.key, c]));
    for (const task of tasks) {
      index.get(holding.get(task.id) ?? task.status)!.tasks.push(task);
    }
    return columns.map(sortByPosition);
  }

  const columns: Column[] = DUE_ORDER.map((b) => ({
    key: b,
    title: DUE_TITLES[b],
    tasks: [],
  }));
  const index = new Map(columns.map((c) => [c.key, c]));
  for (const task of tasks) {
    index.get(bucketOf(task.due_on))!.tasks.push(task);
  }
  return columns.map(sortByPosition);
}

/** Manual order is the point of a board, so every column respects position. */
function sortByPosition(column: Column): Column {
  return { ...column, tasks: [...column.tasks].sort((a, b) => a.position - b.position) };
}

/**
 * Fractional index for a card dropped at `index` within `column`.
 *
 * Halving the gap between neighbours means a move writes one row rather than
 * renumbering the column, so a reorder stays a single optimistic update like
 * every other mutation. `position` is double precision precisely for this.
 */
export function positionForDrop(
  column: Column,
  index: number,
  movingId: string,
): number {
  // the card being moved should not count as its own neighbour
  const others = column.tasks.filter((t) => t.id !== movingId);
  const before = others[index - 1];
  const after = others[index];

  if (!before && !after) return Date.now() / 1000;
  if (!before) return after.position - 1;
  if (!after) return before.position + 1;
  return (before.position + after.position) / 2;
}

/** Which column a task currently sits in, so a no-op drop can be skipped. */
export function columnOf(groupBy: GroupBy, task: Task): string {
  if (groupBy === "person") return task.assignee_id ?? NO_ASSIGNEE;
  if (groupBy === "status") return task.status;
  return bucketOf(task.due_on);
}
