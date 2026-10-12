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

## What this does not cover

Auth users. `auth.users` is Supabase's, not ours, and a snapshot does not hold
it. Losing a login is not losing data — the magic link makes a new session, and
`profiles` keeps the name and the colour.
