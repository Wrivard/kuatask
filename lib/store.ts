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
import { instantToDay, type DayString } from '@/lib/time';
import { setSoundEnabled as applySoundEnabled } from '@/lib/sound';

export type Task = Database['public']['Tables']['tasks']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

type Inverse = () => void;

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

  createTask: (input: Partial<Task> & { title: string }) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reschedule: (id: string, dueOn: string | null) => void;

  undo: () => void;
  applyRemote: (type: 'INSERT' | 'UPDATE' | 'DELETE', row: Task) => void;
};

const UNDO_LIMIT = 20;
const FILTER_KEY = 'kua-assignee-filter';

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

  const pushUndo = (fn: Inverse) => {
    if (replaying) return;
    set((s) => ({ undoStack: [...s.undoStack, fn].slice(-UNDO_LIMIT) }));
  };

  const markPending = (id: string, on: boolean) =>
    set((s) => {
      const next = new Map(s.pending);
      const count = (next.get(id) ?? 0) + (on ? 1 : -1);
      if (count > 0) next.set(id, count);
      else next.delete(id);
      return { pending: next };
    });

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
        if (error) toastError(error.message);
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
          toastError(error.message);
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
        supabase.from('tasks').select('*').eq('workspace_id', wsId).order('position'),
        supabase.from('profiles').select('*'),
        supabase
          .from('tasks')
          .select('completed_at')
          .eq('workspace_id', wsId)
          .not('completed_at', 'is', null),
      ]);
      if (!rows) return;

      // the streak's history can move while a tab sleeps, so refresh it too
      const days = completions
        ? [...new Set(
            completions
              .map((r) => r.completed_at)
              .filter((v): v is string => v !== null)
              .map(instantToDay),
          )]
        : get().completionDays;

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

        // optimistic rows the server has not accepted yet must survive the swap
        const serverIds = new Set(rows.map((r) => r.id));
        const unsent = s.tasks.filter(
          (t) => !serverIds.has(t.id) && s.pending.has(t.id),
        );

        const me = members?.find((m) => m.id === s.me?.id) ?? s.me;
        return {
          tasks: [...merged, ...unsent],
          members: members ?? s.members,
          completionDays: days,
          me,
        };
      });
    },

    createTask(input) {
      const { workspaceId, me } = get();
      if (!workspaceId || !me) return;

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
        position: Date.now() / 1000,
        // instants, not day buckets — timestamptz columns are absolute, so UTC
        // is correct here. Every *calendar day* value goes through lib/time.ts.
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Task;

      set((s) => ({ tasks: [...s.tasks, optimistic] }));
      markPending(optimistic.id, true);
      pushUndo(() => get().deleteTask(optimistic.id));

      void (async () => {
        const { data, error } = await supabase
          .from('tasks')
          .insert(optimistic)
          .select()
          .single();

        markPending(optimistic.id, false);

        if (error) {
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== optimistic.id) }));
          toastError(error.message);
          return;
        }
        patchLocal(optimistic.id, data);
      })();
    },

    updateTask(id, patch) {
      const before = get().tasks.find((t) => t.id === id);
      if (!before) return;

      patchLocal(id, patch);
      markPending(id, true);
      pushUndo(() => get().updateTask(id, pick(before, Object.keys(patch) as (keyof Task)[])));

      void (async () => {
        const { error } = await supabase.from('tasks').update(patch).eq('id', id);
        markPending(id, false);
        if (error) {
          patchLocal(id, before);
          toastError(error.message);
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
        completed_at: done ? new Date().toISOString() : null,
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

    deleteTask(id) {
      const before = get().tasks.find((t) => t.id === id);
      if (!before) return;

      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      markPending(id, true);
      pushUndo(() => {
        set((s) => ({ tasks: [...s.tasks, before] }));
        markPending(before.id, true);
        void (async () => {
          const { error } = await supabase.from('tasks').insert(before);
          markPending(before.id, false);
          if (error) {
            // the insert policy requires created_by = auth.uid(), so undoing a
            // delete of the other person's task fails. Put the row back rather
            // than leaving a ghost the server does not have.
            set((s) => ({ tasks: s.tasks.filter((t) => t.id !== before.id) }));
            toastError(error.message);
          }
        })();
      });

      void (async () => {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        markPending(id, false);
        if (error) {
          set((s) => ({ tasks: [...s.tasks, before] }));
          toastError(error.message);
        }
      })();
    },

    undo() {
      const stack = get().undoStack;
      const fn = stack[stack.length - 1];
      if (!fn) return;

      set({ undoStack: stack.slice(0, -1) });

      replaying = true;
      try {
        fn();
      } finally {
        // the flag must clear even if the inverse throws, or undo dies silently
        replaying = false;
      }
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

// wire to sonner in the app; kept out of the store so it stays testable
let toastError: (msg: string) => void = () => {};
export function setErrorHandler(fn: (msg: string) => void) {
  toastError = fn;
}
