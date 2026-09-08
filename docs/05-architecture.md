# 05 — Architecture

## File tree

```
app/
  layout.tsx                    fonts, theme, sonner
  globals.css                   tokens
  (auth)/login/page.tsx
  auth/callback/route.ts
  no-access/page.tsx
  (app)/layout.tsx              shell: sidebar, store hydration, hotkeys, palette
  (app)/page.tsx                list view — default route
  (app)/calendar/page.tsx
  (app)/settings/people/page.tsx
  (app)/settings/people/actions.ts   'use server' — invite, revoke, remove
components/
  task/
    task-row.tsx
    task-checkbox.tsx           the completion sequence lives here
    task-modal.tsx
    task-composer.tsx
    assignee-dot.tsx
    label-chip.tsx
  views/
    list-view.tsx
    list-section.tsx
    calendar-view.tsx
    calendar-day-cell.tsx
    day-sheet.tsx
    clear-out.tsx               the empty-day state
  shell/
    sidebar.tsx
    header.tsx
    progress-ring.tsx
    command-palette.tsx
    shortcut-sheet.tsx
lib/
  supabase/{client,server,middleware}.ts
  store.ts                      zustand store, optimistic mutations, undo
  realtime.ts                   subscription + reconciliation
  time.ts                       ALL Montreal date logic
  sound.ts                      Web Audio completion tones
  parse-fr.ts                   French NL date parsing for the composer
  motion.ts                     animation tokens
  copy.ts                       every user-facing string
  hotkeys.ts
  database.types.ts             generated
middleware.ts
```

## The data layer

This section is why the app feels instant. Follow it literally.

### Fetch once

On shell mount, one query pulls every task for the workspace plus the member profiles. This dataset is two people and hundreds of rows — a few dozen kilobytes. It lives in one zustand store for the session.

```ts
const { data } = await supabase
  .from('tasks')
  .select('*')
  .eq('workspace_id', wsId)
  .order('position');
```

There is no pagination, no `.range()`, no per-view query. If this app ever holds 50,000 tasks the strategy changes, but designing for that scale now costs the responsiveness that is the entire point.

### Filter in memory

Today, Tomorrow, This week, This month, Later, No date, and every calendar cell are `useMemo` derivations of that one array. Switching views triggers **zero network calls and zero loading states**. Ever. The router change is instant because there is nothing to wait for.

### Every mutation is optimistic

```
1. Apply to the store synchronously.
2. Push the inverse operation onto the undo stack.
3. Fire the Supabase call in the background.
4. On success: reconcile the server row into the store.
5. On failure: roll back, toast with the reason, drop the undo entry.
```

No `await` sits between a click and a visual change. The app has exactly one loading state — the initial skeleton. If you are writing a spinner, stop and reread this.

### Realtime with local precedence

Subscribe to `postgres_changes` on `tasks`, filtered by `workspace_id`. Incoming events merge into the store — **except** for a row with an in-flight local mutation, which ignores remote versions until its own response lands.

Without that rule, your own write echoes back through the subscription and fights your optimistic state. The row visibly flickers: struck through, un-struck, struck through. Users read that as the app being broken.

Implementation: the store keeps a `Set<string>` of task ids with pending mutations. The realtime handler skips any id in the set.

### The undo stack

The last 20 mutations, as inverse operations. `⌘Z` and the toast's `Annuler` both replay the inverse optimistically, exactly like a forward mutation.

This matters more than it sounds. Undo removes the hesitation before checking something off — "wait, was that the right one" — and hesitation is what kills the habit. It is a satisfaction feature disguised as a safety feature.

Undo does not survive a reload. That is fine.

### Cross-user presence

When the other person completes a task you can see, its row plays the same completion animation yours does, with their identity dot pulsing once beside it. No tone — sound is only for your own actions.

Seeing your partner clear something in real time is the strongest social pull available in a two-person tool. It is not a nice-to-have. Build it in Phase 3.

## Store shape

See `reference/store.ts` for the working implementation. The public surface:

```ts
type Store = {
  tasks: Task[];
  members: Profile[];
  me: Profile | null;
  ready: boolean;

  hydrate(wsId: string): Promise<void>;

  createTask(input: NewTask): void;
  updateTask(id: string, patch: Partial<Task>): void;
  toggleTask(id: string): void;
  deleteTask(id: string): void;
  reschedule(id: string, dueOn: string | null): void;

  undo(): void;

  applyRemote(event: RealtimeEvent): void;
};
```

Mutations return `void`, not a promise. Nothing in the UI awaits them. That signature is the contract that keeps optimism honest — a component physically cannot decide to show a spinner.

## Routing and state

Views are real routes so back-button and deep links work. The active list bucket is a route-level concern; the assignee filter (`Tout` / `Moi` / partner) is a store value persisted to localStorage, because it is a lens rather than a location.

Scroll position survives view switches. Use Next's default scroll restoration and do not fight it.

## Performance budget

- Cold load to interactive: **under 1.2s on 4G**
- View switch: no network, no layout shift
- Completion click to first visual change: **0ms** — the same frame
- Bundle: keep the app route under 200KB gzipped; the calendar is custom-built specifically to avoid a date-library payload
