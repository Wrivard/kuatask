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
 * Did the request fail to arrive, or did the database refuse it?
 *
 * The distinction decides two separate things — whether to retry, and what to
 * say — and each of them used to work it out for itself. Both wrote
 * `!error.code`, which agreed by coincidence rather than by construction: two
 * copies of a rule are two chances to update one of them.
 *
 * `code` absent or empty means nothing on the far side formed an opinion, which
 * is the fetch failing. A PostgREST refusal always names a SQLSTATE. The empty
 * string matters because `!''` is true — a refusal that arrived with a blank
 * code would have been retried *and then* described as a lost connection.
 */
export function isTransportFailure(error: Refusal): boolean {
  return Boolean(error) && !error!.code;
}

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

  if (isTransportFailure(error)) return copy.error.offline;

  // a refusal this app cannot explain gets no second line at all
  return undefined;
}

/** The detail a developer needs, kept off the screen and in the console. */
export function logRefusal(error: Refusal) {
  if (!error) return;
  console.error('[kua] write refused', error.code ?? '(no code)', error.message);
}
