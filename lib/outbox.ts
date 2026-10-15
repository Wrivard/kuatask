'use client';

import { createClient } from '@/lib/supabase/client';
import { isStaleSession } from '@/lib/errors';

/**
 * Writes that could not be sent, kept until they can be.
 *
 * The app is optimistic: the screen changes first and the network catches up.
 * That is right, and it has one failure it cannot absorb — the session dying
 * mid-session. The access token is refreshed roughly hourly; when that refresh
 * is itself refused (production, 12 October 14:37:51, `POST /auth/v1/token`
 * → 400, followed five seconds later by a request for a new magic link) every
 * write afterwards is rejected. Rolling them back is honest but useless: the
 * work is gone, and the only account of it was a toast that said « non
 * enregistré » while the screen quietly put the old value back.
 *
 * So a write refused for want of a session is not rolled back and not lost. It
 * is described, written to localStorage, and sent again once there is a session
 * to send it with — surviving the reload that signing in with a magic link
 * necessarily causes, because the link opens in the mail client and comes back
 * as a fresh page load.
 *
 * Only auth failures come here. A refusal from the database is a real no — a
 * title too long, a row that is gone — and replaying it for ever would be a
 * queue that never drains and a lie on the screen that never resolves.
 */

/** Every write in the app is one of these three against one table. */
export type Write =
  | { op: 'insert'; table: string; rows: Record<string, unknown>[] }
  | { op: 'update'; table: string; patch: Record<string, unknown>; ids: string[] }
  | { op: 'delete'; table: string; ids: string[] };

type Entry = { key: string; at: string; write: Write };

const KEY = 'kua-outbox';

/**
 * A ceiling, so a tab left open against a dead session for a week cannot fill
 * the origin's storage quota. Two hundred is far more than a person produces
 * between two sign-ins, and dropping the oldest is the right end to lose: the
 * newest edits are the ones still true.
 */
const LIMIT = 200;

function read(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as Entry[]) : [];
  } catch {
    // private windows, blocked storage, a half-written value: an empty queue is
    // the safe reading, never a thrown error inside a write path
    return [];
  }
}

function save(list: Entry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-LIMIT)));
  } catch {
    // out of quota is not a reason to break the click that is happening
  }
}

/** Listeners for the count, so the banner can say how much is waiting. */
const watchers = new Set<(n: number) => void>();

export function watchOutbox(fn: (n: number) => void): () => void {
  watchers.add(fn);
  fn(count());
  return () => {
    watchers.delete(fn);
  };
}

function announce() {
  const n = count();
  for (const fn of watchers) fn(n);
}

export function count(): number {
  return read().length;
}

/** Keeps a write for later. Returns false when it could not be kept. */
export function remember(write: Write): boolean {
  const before = read();
  const entry: Entry = {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    write,
  };
  save([...before, entry]);
  const kept = count() > before.length || before.length >= LIMIT;
  announce();
  return kept;
}

export function clearOutbox() {
  save([]);
  announce();
}

/** Whether a flush is already running, so two triggers do not double-send. */
let flushing: Promise<FlushResult> | null = null;

export type FlushResult = { sent: number; dropped: number; blocked: boolean };

/**
 * Send everything, oldest first.
 *
 * Stops at the first write that is still refused for want of a session: the
 * session has not actually come back, and emptying the rest against it would
 * turn a queue into a shredder. A write the *database* refuses is dropped —
 * it will never succeed, and the count has to be able to reach zero.
 */
export async function flushOutbox(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = run();
  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}

async function run(): Promise<FlushResult> {
  const supabase = createClient();
  let sent = 0;
  let dropped = 0;

  for (;;) {
    const list = read();
    if (list.length === 0) return done(sent, dropped, false);

    const [next, ...rest] = list;
    const { error } = await send(supabase, next.write);

    if (error && isStaleSession(error)) return done(sent, dropped, true);

    // either it landed, or the database refused it and never will not
    if (error) dropped += 1;
    else sent += 1;

    // re-read rather than reuse `rest`: a write made while this was in flight
    // appended to the stored list, and writing `rest` back would drop it
    save([...read().filter((e) => e.key !== next.key)]);
    void rest;
    announce();
  }
}

function done(sent: number, dropped: number, blocked: boolean): FlushResult {
  announce();
  return { sent, dropped, blocked };
}

type Sent = { error: { message: string; code?: string | null } | null };

function send(supabase: ReturnType<typeof createClient>, write: Write): PromiseLike<Sent> {
  // the table name is ours, from the call sites below — never user input
  const table = supabase.from(write.table as 'tasks');

  if (write.op === 'insert') {
    return table.insert(write.rows as never) as unknown as PromiseLike<Sent>;
  }
  if (write.op === 'update') {
    return table
      .update(write.patch as never)
      .in('id', write.ids) as unknown as PromiseLike<Sent>;
  }
  return table.delete().in('id', write.ids) as unknown as PromiseLike<Sent>;
}
