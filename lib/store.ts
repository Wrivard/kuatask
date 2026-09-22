/**
 * The optimistic store. See docs/05-architecture.md.
 *
 * Three properties make the app feel instant, and all three live here:
 *
 *  1. Fetch once. Two people and hundreds of rows is kilobytes. Every view is
 *     a useMemo over this one array, so switching views costs zero requests.
 *  2. Mutations return void, never a promise. That signature is the contract —
 *     a component physically cannot decide to await one and show a spinner.
 *  3. Local precedence on realtime. A row with an in-flight local mutation
 *     ignores remote versions until its own response lands, otherwise your own
 *     write echoes back and fights your optimistic state. Users read that
 *     flicker as the app being broken.
 */

import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { now, recentCompletionCutoff, type DayString } from '@/lib/time';
import { isTransportFailure, type Refusal } from '@/lib/errors';
import { parseQuery } from '@/lib/search';
import { setSoundEnabled as applySoundEnabled } from '@/lib/sound';

export type Task = Database['public']['Tables']['tasks']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * One reversible action.
 *
 * `apply` is the inverse. `applies` is the precondition: what must still be
 * true for replaying the inverse to actually *be* an undo. The stack holds
 * snapshots taken when the action happened, and in a two-person app the row
 * can move on underneath one — your partner reopens the task you completed,
 * or reschedules the one you just moved, or deletes it outright. Replaying a
 * stale inverse then is not an undo, it is a fresh write wearing an undo's
 * clothes, and it silently overwrites what the other person did.
 *
 * So an entry only fires while the field it would reverse still holds the
 * value your action put there.
 */
type Inverse = {
  applies: () => boolean;
  apply: () => void;
};

/**
 * Columns a trigger owns. `completed_at` is set optimistically so the streak
 * and the day footer can render without a round trip, then rewritten with the
 * server's instant — so it can never be used to decide whether a local change
 * is still the current state. `status` can, which is the one that matters.
 */
const SERVER_OWNED: readonly (keyof Task)[] = ['completed_at', 'completed_by', 'updated_at'];

type Store = {
  tasks: Task[];
  members: Profile[];
  me: Profile | null;
  workspaceId: string | null;
  ready: boolean;

  /**
   * Ids with a mutation in flight — realtime skips these.
   *
   * Ref-counted rather than a plain Set. The task modal saves on every change,
   * so a row routinely has two or three overlapping writes; with a Set the
   * first response to land clears the flag while the others are still open, and
   * a remote echo then overwrites newer local state. That is the exact flicker
   * local precedence exists to prevent.
   */
  pending: Map<string, number>;

  /**
   * Ids pulled in from outside the loaded window, by search.
   *
   * `resync` refetches that window, so without this a task found by searching
   * for something finished two months ago disappears the moment the tab wakes
   * up — the row is correctly absent from the answer, and correctly discarded.
   */
  fetched: Set<string>;
  undoStack: Inverse[];

  /**
   * Assignee lens: null is Tout, otherwise a user id. A lens rather than a
   * location, so it lives here and in localStorage instead of the URL.
   */
  assigneeFilter: string | null;
  setAssigneeFilter: (id: string | null) => void;

  /** Mirrors profiles.sound_enabled so the preference follows the user. */
  setSoundEnabled: (value: boolean) => void;

  /**
   * Per-user settings live in profiles, not localStorage, so they follow the
   * user across devices. Optimistic like everything else.
   */
  updateProfile: (patch: Partial<Profile>) => void;

  /**
   * Install data the server already fetched.
   *
   * Replaces the old client-side hydrate(). The shell is a server component that
   * must reach Supabase anyway to check membership, so it brings the tasks back
   * in the same trip. That removes three client round trips on a cold load —
   * session, membership, tasks — which is the whole cost on a phone.
   */
  seed: (payload: {
    tasks: Task[];
    members: Profile[];
    me: Profile | null;
    workspaceId: string;
    completionDays: DayString[];
  }) => void;

  /**
   * Montreal days that already had a completion, from the server.
   *
   * The streak is the only thing that needs history, and it needs one bit per
   * day rather than whole rows. Keeping it separate is what lets the task fetch
   * be bounded instead of growing for ever.
   */
  completionDays: DayString[];


  /**
   * Re-read the workspace after the connection was interrupted.
   *
   * postgres_changes has no replay: anything that happened while the socket was
   * down is simply gone. A tab left open all day — which is how this app is
   * meant to be used — would otherwise go quietly stale, and stale is worse
   * than obviously broken because you keep trusting it.
   */
  resync: () => Promise<void>;

  /**
   * Pulls tasks matching a search back from outside the loaded window.
   *
   * The browser holds a week of completions, which is right for every view
   * except search: "what was that thing we did for them last month" is a real
   * question in a two-person agency and it was the one question search could
   * not answer. Fire and forget — results merge in when they arrive, with no
   * loading state, because the local matches are already on screen.
   */
  searchArchive: (query: string) => void;

  /**
   * Adds a task and returns its id.
   *
   * Every other mutation returns void on purpose — a caller that can read a
   * result is a caller that will eventually await one, and nothing here is
   * allowed to make somebody wait. This one is different only because the id is
   * generated here, on this frame, before anything is sent: returning it costs
   * no round trip and tells nobody anything about whether the write landed.
   *
   * It exists so the composer can hand you the task you just captured —
   * Shift+Enter creates it and opens it, for the ones that need a note.
   */
  createTask: (input: Partial<Task> & { title: string }) => string | null;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reschedule: (id: string, dueOn: string | null) => void;

  /**
   * Spreads a column's positions back out.
   *
   * `position` is a double and dropping a card between the same two neighbours
   * halves the gap toward zero. After about fifty such moves the midpoint stops
   * being distinguishable and the card refuses to move, with nothing on screen
   * to say why. This is the way out, and it is a normalisation rather than an
   * action: it pushes no undo entry, because there is nothing a person did here
   * that they could want back.
   */
  restack: (positions: { id: string; position: number }[]) => void;

  undo: () => void;
  applyRemote: (type: 'INSERT' | 'UPDATE' | 'DELETE', row: Task) => void;

  /**
   * A profile changed somewhere else.
   *
   * Identity is the one piece of shared state that is not a task: the accent
   * colour is how you tell whose card is whose on every surface, and the
   * display name is what the board's columns are called. Changing either used
   * to reach the other person only on a resync, so for as long as their tab
   * stayed open the board was labelled with a name that no longer existed.
   */
  applyRemoteProfile: (row: Profile) => void;

  /**
   * Empties the store on the way out.
   *
   * It is a module singleton, so signing out leaves every task, every name and
   * every address sitting in memory until the document is replaced. Signing out
   * is usually followed by a client navigation to /login rather than a reload,
   * so "until the document is replaced" can mean "while somebody else is
   * standing there".
   */
  clear: () => void;
};

const UNDO_LIMIT = 20;

/**
 * How long a write may stay unaccounted for before its id is let go.
 *
 * `pending` is what gives a local edit precedence over a realtime echo, so an
 * id that never clears is a row frozen out of realtime for the rest of the
 * session — your partner's changes to it would stop arriving, silently. A
 * request can hang forever: a backgrounded tab, a dropped connection, a fetch
 * that neither resolves nor rejects. Thirty seconds is far longer than any
 * healthy round trip and far shorter than "never".
 */
const PENDING_TIMEOUT = 30_000;

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

async function withRetry<T extends { error: Refusal }>(run: () => PromiseLike<T>): Promise<T> {
  const first = await run();
  // the same predicate the toast uses, so the two can never disagree about
  // what a blip is — one retried and the other explained it differently
  if (!isTransportFailure(first.error)) return first;
  await new Promise((r) => setTimeout(r, RETRY_DELAY));
  return run();
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
async function insertWithRetry<T extends { error: Refusal }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  const first = await run();
  if (!isTransportFailure(first.error)) return first;

  await new Promise((r) => setTimeout(r, RETRY_DELAY));
  const second = await run();

  if (second.error?.code === UNIQUE_VIOLATION) {
    return { ...second, error: null };
  }
  return second;
}
const FILTER_KEY = 'kua-assignee-filter';

/** Rows a search may pull back from outside the window in one go. */
const ARCHIVE_LIMIT = 50;

export const useStore = create<Store>((set, get) => {
  const supabase = createClient();

  /*
    An inverse is applied through the ordinary mutations, so that a rollback is
    optimistic and reconciles exactly like a forward write. The catch is that
    those mutations push undo entries of their own, which turns the stack into a
    two-state toggle: ⌘Z would reopen the last task, ⌘Z again would re-complete
    it, and history before that became unreachable. It also broke the collapsed
    toast — undoing "3 tâches terminées" reopened one task, re-completed it, and
    reopened it again, leaving the other two done.

    So pushes are suppressed while an inverse is running. The cost is no redo,
    which the spec never asks for.
  */
  let replaying = false;

  const pushUndo = (entry: Inverse) => {
    if (replaying) return;
    set((s) => ({ undoStack: [...s.undoStack, entry].slice(-UNDO_LIMIT) }));
  };

  /** True while every client-owned field of `patch` is still the row's value. */
  const stillHolds = (id: string, patch: Partial<Task>) => {
    const row = get().tasks.find((t) => t.id === id);
    if (!row) return false;
    return (Object.keys(patch) as (keyof Task)[])
      .filter((k) => !SERVER_OWNED.includes(k))
      .every((k) => row[k] === patch[k]);
  };

  const markPending = (id: string, on: boolean) =>
    set((s) => {
      const next = new Map(s.pending);
      const count = (next.get(id) ?? 0) + (on ? 1 : -1);
      if (count > 0) next.set(id, count);
      else next.delete(id);
      return { pending: next };
    });

  /*
    Claims an id as in flight and hands back the release.

    The release is idempotent on purpose. A write that never settles is let go
    by a timer, and if its response does eventually turn up it must not
    decrement the count a second time — that would clear the flag out from
    under a *different* write on the same row, which is exactly the flicker the
    ref counting exists to prevent.
  */
  const claim = (id: string) => {
    markPending(id, true);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      markPending(id, false);
    };
    const timer = setTimeout(release, PENDING_TIMEOUT);
    return release;
  };

  /*
    Writes to one task, in the order they were made.

    Every mutation used to be its own request, fired and forgotten, and nothing
    made the second one wait for the first. Tick a task and untick it, or tick
    it and press ⌘Z, and two updates were in the air at once; `withRetry` made
    it likelier still, since a first attempt that blipped was retried after the
    second had landed. The server kept whichever arrived last, the local row
    kept the last one made, and the pending claim stopped the realtime echo
    from telling anyone — your screen said « à faire », the database and your
    partner's screen said « terminé », until the next resync.

    Same for a task written the instant it exists: the modal opened by
    Shift+Enter or by the Braindump could send an update before the insert had
    landed, and an update of a row that is not there yet updates nothing and
    reports success.

    So each write joins the chain of every task it touches and starts when the
    previous write to any of them has settled. A failed write does not stop the
    ones behind it — each carries its own rollback.
  */
  const chains = new Map<string, Promise<unknown>>();
  const serial = <T,>(ids: string[], write: () => Promise<T>): Promise<T> => {
    const prior = Promise.all(ids.map((id) => chains.get(id)?.catch(() => {})));
    const next = prior.then(write);
    for (const id of ids) chains.set(id, next);
    void next
      .catch(() => {})
      .finally(() => {
        for (const id of ids) if (chains.get(id) === next) chains.delete(id);
      });
    return next;
  };

  const patchLocal = (id: string, patch: Partial<Task>) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));

  return {
    tasks: [],
    members: [],
    me: null,
    workspaceId: null,
    ready: false,
    pending: new Map<string, number>(),
    fetched: new Set<string>(),
    undoStack: [],
    assigneeFilter: null,
    completionDays: [],

    setSoundEnabled(value) {
      const me = get().me;
      if (!me) return;

      applySoundEnabled(value);
      set({ me: { ...me, sound_enabled: value } });

      void (async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ sound_enabled: value })
          .eq('id', me.id);
        if (error) toastError(error);
      })();
    },

    updateProfile(patch) {
      const me = get().me;
      if (!me) return;

      const before = me;
      set({
        me: { ...me, ...patch },
        members: get().members.map((m) => (m.id === me.id ? { ...m, ...patch } : m)),
      });

      void (async () => {
        const { error } = await supabase.from('profiles').update(patch).eq('id', me.id);
        if (error) {
          set({
            me: before,
            members: get().members.map((m) => (m.id === before.id ? before : m)),
          });
          toastError(error);
        }
      })();
    },

    setAssigneeFilter(id) {
      set({ assigneeFilter: id });
      try {
        if (id === null) localStorage.removeItem(FILTER_KEY);
        else localStorage.setItem(FILTER_KEY, id);
      } catch {
        // private mode or blocked storage — the filter just will not persist
      }
    },

    seed({ tasks, members, me, workspaceId, completionDays }) {
      if (get().ready) return; // a second view mounting must not reset state

      if (me) applySoundEnabled(me.sound_enabled);

      let savedFilter: string | null = null;
      try {
        savedFilter = localStorage.getItem(FILTER_KEY);
      } catch {
        // blocked storage — fall back to Tout
      }
      const filterIsValid =
        savedFilter !== null && members.some((m) => m.id === savedFilter);

      set({
        tasks,
        members,
        me,
        workspaceId,
        completionDays,
        assigneeFilter: filterIsValid ? savedFilter : null,
        ready: true,
      });
    },

    async resync() {
      const wsId = get().workspaceId;
      if (!wsId) return;

      const [{ data: rows }, { data: members }, { data: completions }] = await Promise.all([
        // the same window as the shell's first query — an unbounded refetch here
        // silently gave back everything the bounded first load had saved
        supabase
          .from('tasks')
          .select('*')
          .eq('workspace_id', wsId)
          .or(`status.neq.done,completed_at.gte.${recentCompletionCutoff()}`)
          .order('position'),
        supabase.from('profiles').select('*'),
        // distinct days, bounded, computed in Postgres — see migration 0016.
        // This was the same unbounded read the shell used to do, and it matters
        // more here: resync runs on every reconnect, every wake from sleep, and
        // once a minute while the socket is down.
        supabase.rpc('completion_days'),
      ]);
      if (!rows) return;

      // the streak's history can move while a tab sleeps, so refresh it too
      const days = completions ?? get().completionDays;

      set((s) => {
        /*
          Same local precedence as applyRemote: a row with a write in flight
          keeps its optimistic value, because the server copy we just read is
          older than what the user is looking at.
        */
        const local = new Map(s.tasks.map((t) => [t.id, t]));
        const merged = rows.map((row) =>
          s.pending.has(row.id) ? (local.get(row.id) ?? row) : row,
        );

        /*
          Rows the refetch does not return, but that must survive it.

          Two kinds. Optimistic rows the server has not accepted yet — obvious,
          and the reason this existed. And rows that search pulled back from
          outside the loaded window: `resync` asks for the same bounded window
          the first load did, so a task finished two months ago is correctly
          absent from the answer and was being dropped. A tab waking from sleep
          mid-search made the results silently vanish.
        */
        const serverIds = new Set(rows.map((r) => r.id));
        const keep = s.tasks.filter(
          (t) => !serverIds.has(t.id) && (s.pending.has(t.id) || s.fetched.has(t.id)),
        );

        const me = members?.find((m) => m.id === s.me?.id) ?? s.me;
        return {
          tasks: [...merged, ...keep],
          members: members ?? s.members,
          completionDays: days,
          me,
        };
      });
    },

    createTask(input) {
      const { workspaceId, me } = get();
      if (!workspaceId || !me) return null;

      const optimistic = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        title: input.title,
        notes: input.notes ?? null,
        label: input.label ?? null,
        status: 'todo',
        important: input.important ?? false,
        due_on: input.due_on ?? null,
        due_time: input.due_time ?? null,
        assignee_id: input.assignee_id ?? null,
        created_by: me.id,
        completed_at: null,
        completed_by: null,
        position: now() / 1000,
        // instants, not day buckets — timestamptz columns are absolute, so UTC
        // is correct here. Every *calendar day* value goes through lib/time.ts.
        created_at: new Date(now()).toISOString(),
        updated_at: new Date(now()).toISOString(),
      } as Task;

      set((s) => ({ tasks: [...s.tasks, optimistic] }));
      const releaseNew = claim(optimistic.id);
      pushUndo({
        // nothing to take back if it is already gone
        applies: () => get().tasks.some((t) => t.id === optimistic.id),
        apply: () => get().deleteTask(optimistic.id),
      });

      void (async () => {
        const { data, error } = await serial([optimistic.id], () =>
          insertWithRetry(() => supabase.from('tasks').insert(optimistic).select().single()),
        );

        releaseNew();

        if (error) {
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== optimistic.id) }));
          toastError(error);
          return;
        }

        /*
          No row comes back when the retry found the insert already committed —
          the error was swallowed, and 23505 returns no data. The optimistic row
          is exactly what was written, so leaving it alone is correct; the next
          resync reconciles anything the server decided for itself.
        */
        /*
          Only what the server decided. The whole returned row used to be laid
          over the local one, and the local one is the one the modal has been
          editing since this frame — a description typed while the insert was
          in the air was replaced by the empty one that was inserted.
        */
        if (data) patchLocal(optimistic.id, pick(data as Task, ['created_at', 'updated_at']));
      })();

      return optimistic.id;
    },

    updateTask(id, patch) {
      const before = get().tasks.find((t) => t.id === id);
      if (!before) return;

      /*
        The modal saves on every change, so most patches that arrive here are
        partly or wholly a no-op: the title field re-sends the label, changing
        the date re-sends the title. Sending a field back at its current value
        costs a round trip, a realtime echo to every other session, and an undo
        entry that reverses nothing — and an all-no-op patch used to consume a
        ⌘Z press outright.
      */
      const changed = pick(
        patch,
        (Object.keys(patch) as (keyof Task)[]).filter((k) => before[k] !== patch[k]),
      ) as Partial<Task>;

      /*
        A time with no date has nowhere to be rendered — every surface reads
        due_on first — so it becomes a value that exists, survives, and shows up
        again when the task is next given a date. The modal's own quick option
        cleared both; every other path that cleared a date did not. It belongs
        here rather than at each call site, because a rule enforced in one place
        is a rule and a rule enforced in four is a coincidence.
      */
      if (changed.due_on === null && before.due_time !== null) changed.due_time = null;

      if (Object.keys(changed).length === 0) return;

      patchLocal(id, changed);
      const release = claim(id);
      pushUndo({
        applies: () => stillHolds(id, changed),
        apply: () =>
          get().updateTask(id, pick(before, Object.keys(changed) as (keyof Task)[])),
      });

      void (async () => {
        const { error } = await serial([id], () =>
          withRetry(() => supabase.from('tasks').update(changed).eq('id', id)),
        );
        release();
        if (error) {
          // only what this write changed goes back; edits made since survive
          patchLocal(id, pick(before, Object.keys(changed) as (keyof Task)[]));
          toastError(error);
        }
      })();
    },

    toggleTask(id) {
      const t = get().tasks.find((x) => x.id === id);
      if (!t) return;
      // keyed off done rather than todo, so a task that is 'doing' completes
      // instead of silently becoming 'todo'
      const next = t.status === 'done' ? 'todo' : 'done';
      const done = next === 'done';

      /*
        completed_at and completed_by are server-owned — the trigger stamps them
        from auth.uid() and the real values reconcile back in milliseconds.
        They are set here anyway because "Terminé aujourd'hui", the streak and
        the partner dot all read them, and none of those may wait for a round
        trip to render.
      */
      get().updateTask(id, {
        status: next,
        completed_at: done ? new Date(now()).toISOString() : null,
        completed_by: done ? (get().me?.id ?? null) : null,
      } as Partial<Task>);
    },

    /*
      Calendar drag-to-reschedule. A thin wrapper over updateTask rather than a
      second mutation path, so undo, rollback and local precedence all behave
      identically to every other write.
    */
    reschedule(id, dueOn) {
      // dropping a task onto a day it already sits on is not a mutation
      if (get().tasks.find((t) => t.id === id)?.due_on === dueOn) return;
      get().updateTask(id, { due_on: dueOn });
    },

    restack(positions) {
      if (positions.length === 0) return;

      // what each row was, so a failure can put the whole column back
      const before = new Map(
        get()
          .tasks.filter((t) => positions.some((p) => p.id === t.id))
          .map((t) => [t.id, t.position]),
      );

      for (const { id, position } of positions) patchLocal(id, { position });

      void (async () => {
        /*
          One statement, so one transaction. This used to be an UPDATE per row
          and it called itself all-or-nothing, which was true of the client and
          not of the server: five writes landing and fifteen failing left the
          column half renumbered, and the local rollback hid it until the next
          resync.

          That is worse than it sounds because of *why* a restack runs. The gap
          between two neighbours can no longer be halved, so the positions going
          in are nearly equal — A=1.0, B=1.0000001, C=1.0000002. Move only B to
          2048 and the server's order becomes A, C, B while the browser still
          shows A, B, C. Partly renumbered is the one state worse than not
          renumbered, and the old code created it on the far side of the wire
          while carefully avoiding it on this one.
        */
        const releases = positions.map(({ id }) => claim(id));
        const { error } = await serial(
          positions.map((p) => p.id),
          () =>
            withRetry(() =>
              supabase.rpc('restack_tasks', {
                ids: positions.map((p) => p.id),
                positions: positions.map((p) => p.position),
              }),
            ),
        );
        for (const release of releases) release();

        if (!error) return;

        // one action, one rollback, one toast
        for (const [id, position] of before) patchLocal(id, { position });
        toastError(error);
      })();
    },

    deleteTask(id) {
      const before = get().tasks.find((t) => t.id === id);
      if (!before) return;

      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      const release = claim(id);
      pushUndo({
        // if it is back, somebody already restored it
        applies: () => !get().tasks.some((t) => t.id === id),
        apply: () => {
        set((s) => ({ tasks: [...s.tasks, before] }));
        const releaseUndo = claim(before.id);
        void (async () => {
          const { error } = await serial([before.id], () =>
            insertWithRetry(() => supabase.from('tasks').insert(before)),
          );
          releaseUndo();
          if (error) {
            // the insert policy requires created_by = auth.uid(), so undoing a
            // delete of the other person's task fails. Put the row back rather
            // than leaving a ghost the server does not have.
            set((s) => ({ tasks: s.tasks.filter((t) => t.id !== before.id) }));
            toastError(error);
          }
        })();
        },
      });

      void (async () => {
        const { error } = await serial([id], () =>
          withRetry(() => supabase.from('tasks').delete().eq('id', id)),
        );
        release();
        if (error) {
          set((s) => ({ tasks: [...s.tasks, before] }));
          toastError(error);
        }
      })();
    },

    /*
      Walks back to the most recent entry that can still honestly reverse
      itself, dropping the ones that cannot on the way. Dropping rather than
      stopping is deliberate: an entry whose row your partner has since changed
      is dead, and if ⌘Z stopped there it would be a key that does nothing for
      the rest of the session.
    */
    undo() {
      let stack = get().undoStack;

      while (stack.length) {
        const entry = stack[stack.length - 1];
        stack = stack.slice(0, -1);
        if (!entry.applies()) continue;

        set({ undoStack: stack });
        replaying = true;
        try {
          entry.apply();
        } finally {
          // the flag must clear even if the inverse throws, or undo dies silently
          replaying = false;
        }
        return;
      }

      set({ undoStack: [] });
    },

    searchArchive(query) {
      const wsId = get().workspaceId;

      /*
        The same question `lib/search.ts` answers locally, asked of the rows
        outside the loaded window. It used to strip a leading `#` and run one
        substring over three columns, so a tagged task from last month came back
        only when the word also appeared in its title or notes — the local list
        and the archive disagreed about what a tag is.
      */
      const parsed = parseQuery(query);

      // `or` is a comma-separated grammar and % / _ are wildcards, so anything
      // that would change the shape of the filter is dropped rather than escaped
      const clean = (v: string) => v.replace(/[,()%_*\\]/g, ' ').trim();
      const tag = parsed.tag ? clean(parsed.tag) : null;
      const text = clean(parsed.text);

      // one letter matches most of the workspace; it is not yet a search
      if (!wsId || (!tag && text.length < 2)) return;

      void (async () => {
        let request = supabase
          .from('tasks')
          .select('*')
          .eq('workspace_id', wsId);

        // prefix on the label, matching the local rule rather than approximating it
        if (tag) request = request.ilike('label', `${tag}%`);
        if (text.length >= 2) {
          request = request.or(
            `title.ilike.%${text}%,label.ilike.%${text}%,notes.ilike.%${text}%`,
          );
        }

        const { data } = await request
          .order('completed_at', { ascending: false, nullsFirst: false })
          .limit(ARCHIVE_LIMIT);
        if (!data?.length) return;

        set((s) => {
          const known = new Set(s.tasks.map((t) => t.id));
          const extra = data.filter((row) => !known.has(row.id));
          if (!extra.length) return {};
          return {
            tasks: [...s.tasks, ...extra],
            // so a resync does not throw them away again
            fetched: new Set([...s.fetched, ...extra.map((r) => r.id)]),
          };
        });
      })();
    },

    clear() {
      set({
        tasks: [],
        members: [],
        me: null,
        workspaceId: null,
        ready: false,
        pending: new Map(),
        fetched: new Set(),
        undoStack: [],
        completionDays: [],
      });
    },

    applyRemoteProfile(row) {
      /*
        Updates somebody already here; never adds anybody.

        The subscription carries no filter, because `profiles` has no workspace
        column — RLS decides what arrives, and its rule is "people you share a
        workspace with". For one workspace that is the same set. For somebody in
        two, it is not: their session would receive profile changes from both,
        and appending an unknown id here would put a phantom person in the
        assignee lens and a phantom column on the board.

        A genuinely new member arrives through `resync`, which asks for the
        workspace's own list and therefore knows which workspace it is asking
        about. This only ever refreshes a name or a colour.

        `me` is left alone as well: your own profile is edited optimistically in
        settings, and a late echo of your own write would overwrite the field
        you are still typing in — the same reason `applyRemote` defers to a
        local write in flight.
      */
      set((s) =>
        s.members.some((m) => m.id === row.id)
          ? { members: s.members.map((m) => (m.id === row.id ? row : m)) }
          : {},
      );
    },

    applyRemote(type, row) {
      /*
        A deletion is authoritative and always applies. Local precedence exists
        so an echo cannot overwrite a value you are still typing — but the row
        is gone server-side, so holding it on screen only means your next write
        fails against a row that no longer exists. Your partner deleting a task
        while you edit it used to leave it sitting there until a resync.
      */
      if (type !== 'DELETE' && get().pending.has(row.id)) return;

      set((s) => {
        if (type === 'DELETE') return { tasks: s.tasks.filter((t) => t.id !== row.id) };
        const exists = s.tasks.some((t) => t.id === row.id);
        return {
          tasks: exists
            ? s.tasks.map((t) => (t.id === row.id ? row : t))
            : [...s.tasks, row],
        };
      });
    },
  };
});

function pick<T extends object>(obj: T, keys: (keyof T)[]): Partial<T> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Partial<T>;
}

/*
  Wired to sonner in the app; kept out of the store so it stays testable.

  The whole refusal is passed, not its message. The message is English jargon
  naming a constraint nobody using this app has heard of — what the UI needs is
  the code, so it can say something in French or say nothing at all.
*/
let toastError: (error: Refusal) => void = () => {};
export function setErrorHandler(fn: (error: Refusal) => void) {
  toastError = fn;
}
