-- The streak is one person's, not the workspace's.
--
-- `completion_days` (0016) counted every completion RLS let it see, which in a
-- shared workspace is both people's. The number it feeds sits beside your own
-- name and avatar in the rail, and `person_stats` (0018) — which the
-- leaderboard reads — has always grouped by `completed_by`. So the same label
-- carried two different numbers: a streak of 5 next to your name and 4 on the
-- board, whenever your partner cleared something on a day you did not.
--
-- Per-person is the reading that makes them agree and the only one the
-- leaderboard can be built on at all: a workspace-wide streak is the same value
-- for both people, which gamifies nothing.
--
-- Also adds `status = 'done'`, matching `person_stats`. In practice the two
-- agree already — untoggling clears `completed_at` — but a row where they did
-- not would have counted here and not there, which is the drift this migration
-- exists to end.
--
-- Still `security invoker`: RLS decides which rows exist, and `auth.uid()`
-- narrows those to the caller's own. A person who cannot see a row cannot
-- count it either way.

create or replace function public.completion_days(days_back integer default 400)
returns setof date
language sql
stable
security invoker
set search_path = public
as $$
  select distinct (t.completed_at at time zone 'America/Montreal')::date as day
  from public.tasks t
  where t.status = 'done'
    and t.completed_at is not null
    and t.completed_by = auth.uid()
    and t.completed_at >= now() - make_interval(days => greatest(days_back, 1))
  order by day desc
$$;

comment on function public.completion_days(integer) is
  'Distinct Montreal days the caller completed something on, newest first, within the window. RLS-scoped and narrowed to auth.uid().';
