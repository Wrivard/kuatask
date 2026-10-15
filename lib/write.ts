import { createClient } from '@/lib/supabase/client';
import { isStaleSession, isTransportFailure, type Refusal } from '@/lib/errors';
import { remember, type Write } from '@/lib/outbox';
import { sessionLost } from '@/lib/session';

/*
  What to do when a write comes back with an error, in one place.

  This lived inside the store, which was fine while the store was the only
  thing that wrote. It is not: the billing sheet, the price list and the
  braindump all write straight through supabase-js, and they were left with the
  behaviour the store had before 493633a — a token that expired in flight read
  as the database refusing the row. On a ledger that means a line you marked
  paid going back to « à facturer » while you watch, with nothing wrong in the
  database to explain it.

  Two copies of a rule are two chances to update one of them, so there is one.
*/

/**
 * One retry, on what looks like a transport failure rather than a refusal.
 *
 * A PostgREST error carries a `code` — that is the database saying no, and
 * saying no twice as fast helps nobody. An error with no code is the fetch
 * itself failing, which on a phone changing cell towers is routine. Without
 * this, a single blip turns into a rollback and a red toast for a write that
 * would have succeeded on the second attempt.
 */
const RETRY_DELAY = 400;

export async function withRetry<T extends { error: Refusal }>(
  run: () => PromiseLike<T>,
  /**
   * What this write *is*, so it can be sent again after a sign-in.
   *
   * Optional only because a caller without one still behaves as it did: it
   * rolls back. With one, a write the session was too dead to send is kept
   * rather than thrown away. Every call site in the app passes it.
   */
  write?: Write,
): Promise<T> {
  const first = await run();
  // a token that expired in flight is not the database saying no — see
  // isStaleSession. Get a fresh one and send the same write again.
  if (isStaleSession(first.error)) return afterRefresh(run, write);
  // the same predicate the toast uses, so the two can never disagree about
  // what a blip is — one retried and the other explained it differently
  if (!isTransportFailure(first.error)) return first;
  await new Promise((r) => setTimeout(r, RETRY_DELAY));
  return run();
}

/**
 * Refresh the session, then send the write once more.
 *
 * `getSession` is the refresh: supabase-js renews an expired token on the way
 * out and hands back the live one, and because the browser client is a
 * singleton every other request in flight picks up the same new token. One
 * retry, because a second failure is a session that is genuinely gone rather
 * than one that was a moment stale, and that deserves the rollback and the
 * message.
 */
async function afterRefresh<T extends { error: Refusal }>(
  run: () => PromiseLike<T>,
  write?: Write,
): Promise<T> {
  try {
    await createClient().auth.getSession();
  } catch {
    // a refresh that throws is still worth one more attempt with what we have
  }
  const second = await run();
  if (!isStaleSession(second.error)) return second;

  /*
    Refused twice: the session is not stale, it is gone. The refresh token
    itself was rejected, which is what happened in production on 12 October,
    and no amount of asking again will help until somebody signs in.

    This is the point the app used to throw the work away. Instead the write is
    described and kept, the screen keeps what it is showing, and the banner says
    there is something waiting. Reporting no error is not a lie: the change has
    not been lost, it has not arrived yet.
  */
  if (write && remember(write)) {
    sessionLost();
    return { ...second, error: null };
  }
  return second;
}

/** Postgres unique_violation. On a retried insert it means "already written". */
const UNIQUE_VIOLATION = '23505';

/**
 * An insert that is safe to retry, because the row carries its own id.
 *
 * Ids are generated on the client, so the retry sends the identical row. That
 * makes the interesting case the one `withRetry` exists for: the first attempt
 * reached the database and only its *response* was lost. The row is committed;
 * the retry hits the primary key and comes back 23505.
 *
 * That is not a refusal, it is the write having already worked — but it was
 * reported as one. The row was rolled back on screen and « déjà là » shown,
 * while the task sat in the database where the other person could see it
 * perfectly well. Nor did realtime repair it: the INSERT echo arrived while the
 * id was still claimed in `pending`, so `applyRemote` had already dropped it as
 * a local echo. The task stayed missing until the next resync.
 *
 * Only ever after a retry. A first attempt returning 23505 would be a genuine
 * id collision, which for a v4 uuid is not a thing that happens, and passing it
 * through keeps this from hiding a real one.
 */
export async function insertWithRetry<T extends { error: Refusal }>(
  run: () => PromiseLike<T>,
  write?: Write,
): Promise<T> {
  const first = await run();
  // the same stale token, on the write that would otherwise lose a new task
  if (isStaleSession(first.error)) return afterRefresh(run, write);
  if (!isTransportFailure(first.error)) return first;

  await new Promise((r) => setTimeout(r, RETRY_DELAY));
  const second = await run();

  if (second.error?.code === UNIQUE_VIOLATION) {
    return { ...second, error: null };
  }
  return second;
}
