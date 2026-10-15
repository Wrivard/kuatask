# Getting something back

A backup nobody has restored from is a guess. These are the queries, and they
have been run against production — the read-only ones as written, the insert
checked for shape without writing.

Run them in the Supabase SQL editor. Nothing here is reachable from the app:
`snapshots` has RLS on and no policies, so only the SQL editor and the service
role can see it.

## What is in there

```sql
select taken_at, rows, pg_size_pretty(length(payload::text)::bigint) as size
from snapshots
order by taken_at desc;
```

One row a day, written by `take_snapshot()` under `pg_cron` at 09:00 UTC —
05:00 Montreal, before either of you opens the app. Two weeks are kept. If this
list is empty or stale, check the scheduler first:

```sql
select jobid, schedule, active from cron.job where jobname = 'daily-snapshot';
select status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 5;
```

## What is gone

The usual question is not "restore everything", it is "a row disappeared and I
want it back". Ask what the snapshot held that the table no longer has — swap
`tasks` for any of the ten tables:

```sql
with was as (
  select jsonb_array_elements(payload -> 'tasks') as row
  from snapshots
  order by taken_at desc
  limit 1
)
select was.row ->> 'id' as id, was.row ->> 'title' as title
from was
where not exists (
  select 1 from tasks t where t.id = (was.row ->> 'id')::uuid
);
```

Nothing came back when this was written: 107 tasks in the snapshot, 107 still
in the table. That is the answer you want to see.

## Putting rows back

`jsonb_populate_recordset` rebuilds the rows against the table's own shape, so
columns added since the snapshot come back as their defaults rather than
breaking the insert.

```sql
insert into tasks
select *
from jsonb_populate_recordset(
  null::tasks,
  (select payload -> 'tasks' from snapshots order by taken_at desc limit 1)
)
where id in ('paste-the-ids-from-the-query-above'::uuid)
on conflict (id) do nothing;
```

`on conflict do nothing` is what keeps this safe to run twice: rows still
present are left exactly as they are. **Never drop the `where`** — without it
you are re-inserting the whole table, which does no damage with the conflict
clause but tells you nothing.

Order matters if several tables lost rows: `workspaces` → `profiles` →
`workspace_members` → `tasks` → `subtasks`, and `clients` → `billing_entries`.
A child inserted before its parent fails the foreign key, which is the database
stopping you from building something inconsistent.

## Did something roll back?

The app has twice looked like it was reverting to an older version of itself.
Both times it was the app, not the database — a window that dropped finished
tasks after seven days, and a page that replaced what you had just typed with
the server's older copy. Neither left a mark in Postgres, which is exactly why
they were hard to argue about.

A row that rolls back has a signature: its `updated_at` goes **backwards**
between two snapshots, or it is in one snapshot and not the next. Both are now
answerable, because the snapshots are daily.

```sql
with snapped as (
  select s.taken_at, t.key as tbl, jsonb_array_elements(s.payload -> t.key) as row
  from snapshots s
  cross join (values ('tasks'), ('billing_entries'), ('subtasks'), ('clients')) as t(key)
),
stamped as (
  select taken_at, tbl, row ->> 'id' as id, (row ->> 'updated_at')::timestamptz as updated_at
  from snapped
  where row ? 'updated_at'
),
stepped as (
  select tbl, id, taken_at, updated_at,
         lag(updated_at) over (partition by tbl, id order by taken_at) as prev
  from stamped
)
select tbl, id, prev as was, updated_at as became, taken_at
from stepped
where prev is not null and updated_at < prev
order by taken_at desc;
```

**Empty is the answer you want, and an empty result from a broken query looks
exactly the same.** So prove the query is reading something before you trust
its silence — swap the last `where` for the counts:

```sql
select
  count(*) filter (where prev is not null)                       as pairs_compared,
  count(*) filter (where prev is not null and updated_at > prev) as moved_forward,
  count(*) filter (where prev is not null and updated_at < prev) as moved_back
from stepped;
```

Run on 2026-10-15, over four days of snapshots: 746 pairs compared, 9 moved
forward, **0 moved back**. Nine is the real editing both of you did in those
four days; zero is the thing being asked about.

For rows that disappeared rather than reverted, the « What is gone » query
above answers it against the live tables.

## Why the session died

The 15 October look at the edge logs found two auth failures from the browser,
and they are different problems:

- `02:36:46.474 GET /rest/v1/tasks → 401` followed 0.5 s later by
  `POST /auth/v1/token → 200`. A request that left with a token expiring while
  the renewal was still in flight. Handled: `lib/write.ts` renews and sends the
  same write again.
- `14:37:51.735 POST /auth/v1/token?grant_type=refresh_token → 400`, then a
  magic link five seconds later. The refresh token itself was refused, so the
  session was gone and signing in again was the only way back. The work is now
  kept across that (`lib/outbox.ts`) — but **why it was refused is still a
  hypothesis**.

The refresh token rotates: each renewal mints a new one and the old one is
honoured for roughly ten seconds afterwards. A 400 therefore means the token
presented had been spent longer ago than that, and the question is who spent
it. Two tabs is the leading answer — each holds its own copy of the session and
runs its own renewal timer against one shared cookie. The middleware, which
renews on navigation when the access token has expired, is the other.

One occurrence in four days is not enough to choose, so the app now writes down
the circumstances. Every successful renewal leaves a mark (`kua-last-refresh`:
when, and which tab), and a session death reads it back into
`kua-session-log`. In the browser console, on the tab it happened in:

```js
JSON.parse(localStorage.getItem('kua-session-log'))
```

Each entry is also printed as it happens, prefixed `[kua] session lost`. Read
it like this:

| Field | What it means |
|---|---|
| `otherTabAgo` | seconds since **another** tab renewed the token. A small number is the multi-tab race, and the fix is to stop the second renewer. |
| `sinceMine` | seconds since **this** tab renewed it. Around 3600 with no other tab means the token was invalidated server-side — nothing on the client could have prevented it. |
| `slept` | the tab was hidden at some point since its last renewal: a laptop that closed. |
| `waiting` | writes queued at that moment, i.e. what the outbox saved. |
| `online`, `visibility` | the state of the browser when it happened. |

A deliberate sign-out is not recorded; it reaches the app as the same event, so
the button says it was on purpose first.

## What this does not cover

Auth users. `auth.users` is Supabase's, not ours, and a snapshot does not hold
it. Losing a login is not losing data — the magic link makes a new session, and
`profiles` keeps the name and the colour.
