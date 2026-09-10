"use client";

import { bucketOf, today as currentDay, type Bucket } from "@/lib/time";
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

/**
 * How many things can be "En cours" before that stops meaning anything.
 *
 * Not a limit: nothing is blocked, nothing is refused, and there is no warning.
 * Past this the count in the column header simply stops being quiet, which is
 * the whole intervention. Two people cannot actually be working on nine things,
 * and a status that everything sits in is a status that has stopped sorting
 * anything — the board is telling you something and the number was the only
 * place it could say it.
 */
export const WIP_COMFORTABLE = 5;

const DUE_ORDER: Bucket[] = ["today", "tomorrow", "week", "month", "later", "undated"];

/*
  A colour per column, so the board is read by shape before it is read by word.

  Grouping by person already had one — the identity dot — and the other two
  groupings had nothing, which made every column header identical and turned
  scanning the board into reading it. These are the same six hues as the
  identity palette, used here for a different job: they say *which column*, and
  they only ever appear on the header, never on a card, so they cannot be
  confused with whose task it is.
*/
const STATUS_ACCENTS: Record<string, string> = {
  todo: "#4a9eff",
  doing: "#e0a244",
  // the accent green, which everywhere else in the app means finished
  done: "#3ecf8e",
};

const DUE_ACCENTS: Record<Bucket, string | undefined> = {
  today: "#ee7ab0",
  tomorrow: "#e0a244",
  week: "#4a9eff",
  month: "#a978f0",
  later: "#3ec9d6",
  // no date is not a date, so it gets no colour either
  undated: undefined,
};

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
  /**
   * The Montreal day to bucket against. Passed in rather than read from the
   * clock so a caller inside a useMemo can depend on it honestly, and so the
   * board re-buckets when the day rolls over instead of showing yesterday.
   */
  day: string = currentDay(),
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
      { key: "todo", title: copy.board.todo, accent: STATUS_ACCENTS.todo, tasks: [] },
      { key: "doing", title: copy.board.doing, accent: STATUS_ACCENTS.doing, tasks: [] },
      { key: "done", title: copy.board.done, accent: STATUS_ACCENTS.done, tasks: [] },
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
    accent: DUE_ACCENTS[b],
    tasks: [],
  }));
  const index = new Map(columns.map((c) => [c.key, c]));
  for (const task of tasks) {
    index.get(bucketOf(task.due_on, day))!.tasks.push(task);
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
/**
 * The smallest gap still worth halving.
 *
 * `position` is a double, so repeatedly dropping a card between the same two
 * neighbours halves the gap toward zero: after roughly fifty reorders the
 * midpoint stops being distinguishable from its neighbours and the card simply
 * refuses to move, with nothing on screen to say why. Well above the point
 * where the arithmetic gives out, so the renumber happens while it still can.
 */
const MIN_GAP = 1e-6;

/**
 * Where a card dropped at `index` should sit.
 *
 * `null` means the two neighbours have been squeezed together and the column
 * has to be renumbered before anything can go between them.
 */
export function positionForDrop(
  column: Column,
  index: number,
  movingId: string,
): number | null {
  // the card being moved should not count as its own neighbour
  const others = column.tasks.filter((t) => t.id !== movingId);
  const before = others[index - 1];
  const after = others[index];

  if (!before && !after) return Date.now() / 1000;
  if (!before) return after.position - 1;
  if (!after) return before.position + 1;
  if (after.position - before.position < MIN_GAP) return null;
  return (before.position + after.position) / 2;
}

/** Evenly spaced positions for a column, wide enough to subdivide for years. */
export function restackedPositions(column: Column): { id: string; position: number }[] {
  return column.tasks.map((task, i) => ({ id: task.id, position: (i + 1) * 1024 }));
}

/**
 * Where a card lands, and what has to be renumbered first for it to fit.
 *
 * The two steps have to be decided together. Renumbering the column and then
 * asking `positionForDrop` again looks obvious and does not work: the caller is
 * holding a `Column` built during an earlier render, so the object still has
 * the old positions in it and the second question gets the same answer as the
 * first. That is exactly the bug this replaced — the card refused to move, and
 * the fix for it silently refused in the same way.
 *
 * So the answer is computed against the spread positions directly, and the
 * caller applies both: write the restack, then place the card.
 */
export function placeInColumn(
  column: Column,
  index: number,
  movingId: string,
): { position: number; restack: { id: string; position: number }[] | null } {
  const direct = positionForDrop(column, index, movingId);
  if (direct !== null) return { position: direct, restack: null };

  const spread = restackedPositions(column);
  const byId = new Map(spread.map((s) => [s.id, s.position]));
  const rebuilt: Column = {
    ...column,
    tasks: column.tasks.map((t) => ({ ...t, position: byId.get(t.id) ?? t.position })),
  };

  const after = positionForDrop(rebuilt, index, movingId);
  // 1024-wide gaps cannot be exhausted, so this is unreachable — but a
  // fallback that moves nothing beats a NaN in a position column
  return {
    position: after ?? column.tasks.find((t) => t.id === movingId)?.position ?? 0,
    restack: spread,
  };
}

/** Which column a task currently sits in, so a no-op drop can be skipped. */
export function columnOf(
  groupBy: GroupBy,
  task: Task,
  /**
   * The people who still have a column. Without this, a task assigned to
   * somebody who has left names a column that is not on the board — so
   * `buildColumns` drops it into « Personne » while `columnOf` insists it lives
   * elsewhere, and the arrow keys on that card silently do nothing.
   */
  members?: { id: string }[],
): string {
  if (groupBy === "person") {
    const id = task.assignee_id;
    if (!id) return NO_ASSIGNEE;
    if (members && !members.some((m) => m.id === id)) return NO_ASSIGNEE;
    return id;
  }
  if (groupBy === "status") return task.status;
  return bucketOf(task.due_on);
}
