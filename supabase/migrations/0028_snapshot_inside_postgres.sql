-- The snapshot, taken by the database rather than asked for over HTTP.
--
-- /api/backup worked, but it depended on three things being true at once: the
-- app deployed, a CRON_SECRET set on the host, and the host's scheduler firing.
-- The secret was never set, so every morning the route answered 503 and nothing
-- was kept — a backup that silently does nothing is worse than none, because
-- you stop worrying about it.
--
-- Postgres can do the whole job: it already holds the data, and pg_cron runs
-- beside it. No secret, no deploy, nothing to keep awake.
create extension if not exists pg_cron with schema cron;

create or replace function public.take_snapshot()
returns public.snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  snap public.snapshots;
  body jsonb := '{}'::jsonb;
  total integer := 0;
  t text;
  rows_of jsonb;
begin
  -- Named rather than discovered: a snapshot should hold what we decided to
  -- keep, and not quietly start copying whatever table appears next.
  foreach t in array array[
    'workspaces', 'profiles', 'workspace_members', 'tasks', 'subtasks',
    'notes', 'clients', 'billing_products', 'billing_entries', 'activity'
  ]
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t)
      into rows_of;
    body := body || jsonb_build_object(t, rows_of);
    total := total + jsonb_array_length(rows_of);
  end loop;

  insert into public.snapshots (payload, rows) values (body, total) returning * into snap;

  -- two weeks is long enough to notice a loss and short enough to stay small
  delete from public.snapshots where taken_at < now() - interval '14 days';

  return snap;
end;
$fn$;

comment on function public.take_snapshot is
  'Writes one row into snapshots holding every table as JSON, and prunes past 14 days. Run by pg_cron daily; see migration 0028.';

-- definer or not, nothing client-side has any business calling this
revoke all on function public.take_snapshot() from public, anon, authenticated;

-- 09:00 UTC — 05:00 Montreal, before either of them opens the app
select cron.schedule('daily-snapshot', '0 9 * * *', $job$select public.take_snapshot()$job$);

-- 0027 said « written by /api/backup ». The route is gone.
comment on table public.snapshots is
  'Daily JSON backup written by take_snapshot() under pg_cron. Service role only — no RLS policies on purpose.';
