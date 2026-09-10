/**
 * Turns a database refusal into something a person can act on.
 *
 * The store used to pass `error.message` straight into the toast's description,
 * which meant a failed save read « La modification n'a pas été enregistrée »
 * followed by `new row for relation "tasks" violates check constraint
 * "tasks_title_check"`. That is English, it is jargon, and it names an object
 * nobody using this app has ever heard of. It also puts the schema on screen,
 * which is not information a task manager should be volunteering.
 *
 * So: the handful of refusals this app can actually provoke get a sentence in
 * French. Everything else gets none. A second line that cannot be understood is
 * worse than no second line — it reads as though something is broken beyond
 * what happened, and there is nothing to do with it either way.
 *
 * The raw message still goes to the console, because the person who needs it is
 * whoever is debugging, not whoever is trying to rename a task.
 */
import { copy } from '@/lib/copy';

export type Refusal = { message: string; code?: string | null } | null | undefined;

/**
 * Postgres SQLSTATEs, plus PostgREST's own. Only the ones reachable from this
 * app's writes are listed; anything else is deliberately unexplained.
 */
const BY_CODE: Record<string, string> = {
  // check constraint — in practice always the 1..500 title length
  '23514': copy.error.titleLength,
  // unique violation — a second invite for the same address
  '23505': copy.error.alreadyThere,
  // foreign key — an assignee or workspace that no longer exists
  '23503': copy.error.gone,
  // not null
  '23502': copy.error.missingField,
  // RLS refused the row
  '42501': copy.error.notAllowed,
  // raise exception from a trigger: the last-admin guard is the only one
  P0001: copy.error.lastAdmin,
  // PostgREST could not match a row to update
  PGRST116: copy.error.gone,
};

export function explain(error: Refusal): string | undefined {
  if (!error) return undefined;

  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];

  // no code at all is the fetch failing rather than the database refusing
  if (!error.code) return copy.error.offline;

  return undefined;
}

/** The detail a developer needs, kept off the screen and in the console. */
export function logRefusal(error: Refusal) {
  if (!error) return;
  console.error('[kua] write refused', error.code ?? '(no code)', error.message);
}
