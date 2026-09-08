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

  hydrate: () => Promise<void>;

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

  const pushUndo = (fn: Inverse) =>
    set((s) => ({ undoStack: [...s.undoStack, fn].slice(-UNDO_LIMIT) }));

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

    setAssigneeFilter(id) {
      set({ assigneeFilter: id });
      try {
        if (id === null) localStorage.removeItem(FILTER_KEY);
        else localStorage.setItem(FILTER_KEY, id);
      } catch {
        // private mode or blocked storage — the filter just will not persist
      }
    },

    async hydrate() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', auth.user.id)
        .limit(1)
        .single();

      if (!membership) {
        set({ ready: true });   // no workspace — middleware routes to /no-access
        return;
      }

      const wsId = membership.workspace_id;

      // one query for the whole dataset. no pagination, no per-view fetching.
      const [{ data: tasks }, { data: members }] = await Promise.all([
        supabase.from('tasks').select('*').eq('workspace_id', wsId).order('position'),
        supabase.from('profiles').select('*'),
      ]);

      let savedFilter: string | null = null;
      try {
        savedFilter = localStorage.getItem(FILTER_KEY);
      } catch {
        // blocked storage — fall back to Tout
      }

      // a filter pointing at someone who is no longer a member is dropped
      const filterIsValid =
        savedFilter !== null && (members ?? []).some((m) => m.id === savedFilter);

      const me = members?.find((m) => m.id === auth.user!.id) ?? null;
      if (me) applySoundEnabled(me.sound_enabled);

      set({
        tasks: tasks ?? [],
        members: members ?? [],
        me,
        workspaceId: wsId,
        assigneeFilter: filterIsValid ? savedFilter : null,
        ready: true,
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
      const next = t.status === 'todo' ? 'done' : 'todo';
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
      fn();
    },

    applyRemote(type, row) {
      // local precedence: ignore the echo of our own in-flight write
      if (get().pending.has(row.id)) return;

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
