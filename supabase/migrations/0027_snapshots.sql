-- A copy of everything, kept by the database itself.
--
-- The free plan has no automated backups and no point-in-time recovery: a bad
-- delete is permanent, and `npm run backup` only runs when somebody remembers
-- to run it — the last one was a month old when this was written. So the daily
-- cron that keeps the project awake now also leaves a snapshot here.
--
-- One row per day, holding every table as JSON. At this size — a few thousand
-- short rows — a snapshot is well under a megabyte, and only the last two weeks
-- are kept, so this cannot grow into the plan's limit.
--
-- **No policies, deliberately.** RLS is on and nothing grants access, so no
-- client session can read or write this table: a snapshot is every task and
-- every invoice line both of you have ever written, and it should be reachable
-- only by the service role, from the server.
create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  -- { tasks: [...], subtasks: [...], clients: [...], ... }
  payload jsonb not null,
  rows integer not null default 0
);

create index snapshots_taken_idx on public.snapshots (taken_at desc);

alter table public.snapshots enable row level security;

comment on table public.snapshots is
  'Daily JSON backup written by /api/backup. Service role only — no RLS policies on purpose.';
