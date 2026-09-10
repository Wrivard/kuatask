# Architecture

How Küa Tasks is put together, and which parts you cannot change without
breaking something that is not obviously connected.

`DECISIONS.md` records *why* individual calls were made. This file is the shape.
`docs/` is the specification the app was built against; where this file and
`docs/` disagree, `docs/` is the intent and this is what exists.

---

## One array, three views

There is no per-view fetching. The shell fetches once, on the server, and every
view is a `useMemo` over the same array in the store:

```
app/(app)/layout.tsx        one query, on the server, for tasks + members + streak days
  └── StoreBoot             installs it into the store, opens the realtime channel
        └── ListView        useMemo → six buckets
            BoardView       useMemo → columns, by person / status / due date
            CalendarView    useMemo → a map of day → tasks
```

Switching views costs zero requests and shows zero loading states. The app has
exactly one loading state — the initial skeleton in `ListView` — and if you find
yourself writing a second one, something upstream is wrong.

The three views are real routes, so the back button and deep links work. That is
also why anything the user is in the middle of (a draft, a scroll position, a
board's grouping) has to be held outside the component: a route change unmounts
it. See `lib/draft.ts`, `lib/scroll-memory.ts`, `lib/lens.ts`.

## The optimistic store

`lib/store.ts` is the most load-bearing file in the app. Its contract:

**Mutations return `void`.** Nothing awaits a write. A caller that could await
would eventually be given a spinner, and `docs/08` is explicit that there isn't
one. The store changes state synchronously, fires the request, and rolls back if
it fails.

**`pending` is a ref count, not a set.** The modal saves on every change, so a
row routinely has two or three overlapping writes. With a set, the first
response clears the flag while the others are still open, and a realtime echo
then overwrites newer local state. Every write takes a `claim()` that returns an
idempotent release, with a 30s timer behind it — an id that never clears is a
row frozen out of realtime for the rest of the session.

**Local writes beat remote echoes, except deletes.** `applyRemote` skips a row
with a write in flight, because the server copy it just read is older than what
the user is looking at. A `DELETE` is applied regardless: holding the row only
means your next write fails against something that no longer exists.

**Undo entries carry a precondition.** The stack holds snapshots taken when the
action happened, and in a two-person app the row moves on underneath them.
An entry fires only while the field it would reverse still holds the value your
action put there; otherwise it is dropped and the press falls through to the
next live one. Replaying a stale inverse is not an undo, it is a fresh write
wearing an undo's clothes.

**A refusal and a blip are different.** A PostgREST error carries a `code` —
that is the database saying no, and there is no point saying no twice as fast.
An error with no code is the fetch failing, which gets one retry. See
`lib/errors.ts` for how the codes reach the user in French.

## Time

**Every calendar day in this app goes through `lib/time.ts`.** Not `new Date()`,
not `.slice(0, 10)`, not the browser's timezone. This is the single most common
way the app breaks, and it breaks silently.

Two different things are called dates here:

- `due_on` is a **bare `date`** — a Montreal calendar day, handled as a
  `'yyyy-MM-dd'` string everywhere in the client. Strings sort lexically exactly
  as they sort chronologically, which is the whole reason for the choice, and
  `bucketOf` relies on it.
- `completed_at` is a **`timestamptz`** — an absolute instant, serialized as
  UTC. Its first ten characters are the *UTC* date, which is already tomorrow
  from 20:00 Montreal in summer. Converting one to a day means `instantToDay`,
  never a slice.

Day-dependent helpers take the day as a parameter (`bucketOf(dueOn, todayDay)`)
so they are deterministic, so a `useMemo` can depend on them honestly, and so
`useToday()` can re-render everything when Montreal rolls past midnight.

The clock itself comes from the server. `StoreBoot` sets an offset during render
from the instant the shell rendered at, because a device with a wrong clock does
not degrade gracefully in an app that is entirely about days.

## Data and access

Supabase in `ca-central-1`, for Law 25. Five tables, all behind RLS:

```
workspaces ──< workspace_members >── profiles
     │                                  │
     └──────────< tasks >───────────────┘
                pending_invites
```

**RLS is the security boundary.** The middleware's membership check is a
convenience so a stranger lands somewhere sensible; an uninvited caller's
queries return empty sets whether or not it runs. `npm run verify:db` asserts
exactly that, against a live database.

Three things the server owns and the client may not set:

- `completed_at` / `completed_by` — stamped by a trigger from `auth.uid()`. The
  client sets them optimistically anyway, because the streak and the day footer
  cannot wait for a round trip, and the real values reconcile in milliseconds.
- membership from an invite — a signup trigger consumes `pending_invites`.
- the last admin — a trigger refuses to remove or demote them.

Realtime needs `replica identity full` on `tasks` (migration 0003). Without it a
`DELETE` carries only the primary key, the `workspace_id` filter drops the
event, and deletions from the other person never arrive.

## What is deliberately not here

From `docs/00-brief.md`: no subtasks, no dependencies, no recurring tasks, no
attachments, no notifications, no analytics, no archive, no AI. `AUDIT.md`
refuses several plausible-sounding improvements on these grounds, and that is
the list working rather than a gap in it.

## Verification

```bash
npm run typecheck
npm run lint          # eslint --max-warnings=0
npm run verify:logic  # dates, parsing, grouping, ordering — no network
npm run verify:store  # the real store against a stubbed Supabase client
npm run verify:db     # RLS, triggers, realtime — needs a live database
npm run verify:invites# membership rules — needs a live database
npm run bench         # what one store write costs in derived work
```

CI runs typecheck, lint, the two offline suites, and a build **with no
environment variables** — deliberately, because the app must explain a missing
configuration rather than fail to build.

The two live suites create throwaway rows and delete them afterwards, then
verify the cleanup. They never delete a row they did not create: during the
build a leftover row was assumed to be test residue and removed, and it turned
out to be a real task somebody had just typed.
