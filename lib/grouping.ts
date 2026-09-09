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
    return columns;
  }

  if (groupBy === "status") {
    const todo: Column = { key: "todo", title: copy.board.todo, tasks: [] };
    const done: Column = { key: "done", title: copy.board.done, tasks: [] };
    for (const task of tasks) {
      (task.status === "done" ? done : todo).tasks.push(task);
    }
    return [todo, done];
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
  return columns;
}

/** Which column a task currently sits in, so a no-op drop can be skipped. */
export function columnOf(groupBy: GroupBy, task: Task): string {
  if (groupBy === "person") return task.assignee_id ?? NO_ASSIGNEE;
  if (groupBy === "status") return task.status;
  return bucketOf(task.due_on);
}
