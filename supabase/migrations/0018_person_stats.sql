-- Per-person completion figures, computed where the rows are.
--
-- The browser holds open tasks plus the last week of completions, so it cannot
-- answer "how many has each of us finished" beyond seven days. Same shape as
-- `completion_days` in 0016: aggregate in Postgres, return something small.
--
-- `days` comes back as an array so the client can compute streaks with
-- `streakFromDays`, which is already written and already tested. Counting
-- consecutive days twice — once here in SQL and once there in TypeScript — is
-- two implementations of one rule, and the one nobody looks at is the one that
-- drifts.
--
-- `security invoker`, so RLS on `tasks` decides which rows are visible and this
-- function holds no privileges of its own.
--
-- What it counts, precisely: tasks that are done *and still exist*. A completed
-- task that was later deleted is gone from `tasks` and so is not counted. That
-- is the honest reading of this table rather than a reconstruction from the
-- activity log, which only began in 0012 and coalesces its own entries.

create or replace function public.person_stats(days_back integer default 400)
returns table (
  user_id uuid,
  done_today integer,
  done_week integer,
  done_month integer,
  done_total integer,
  days date[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with done as (
    select
      t.completed_by as user_id,
      (t.completed_at at time zone 'America/Montreal')::date as day
    from public.tasks t
    where t.status = 'done'
      and t.completed_at is not null
      and t.completed_by is not null
      and t.completed_at >= now() - make_interval(days => greatest(days_back, 1))
  ),
  today as (
    select (now() at time zone 'America/Montreal')::date as d
  )
  select
    d.user_id,
    count(*) filter (where d.day = (select d from today))::integer,
    count(*) filter (where d.day > (select d from today) - 7)::integer,
    count(*) filter (where d.day > (select d from today) - 30)::integer,
    count(*)::integer,
    array_agg(distinct d.day order by d.day desc)
  from done d
  group by d.user_id
$$;

comment on function public.person_stats(integer) is
  'Per-person completion counts and the distinct Montreal days they completed on. RLS-scoped.';

revoke all on function public.person_stats(integer) from public;
grant execute on function public.person_stats(integer) to authenticated;
