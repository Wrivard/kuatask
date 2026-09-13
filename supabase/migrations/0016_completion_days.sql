-- The streak, without reading every completion that ever happened.
--
-- `app/(app)/layout.tsx` fetched `completed_at` for every completed task in the
-- workspace, on every page load, and reduced it to a set of distinct Montreal
-- days in JavaScript. Two problems, neither visible yet at three completions:
--
-- 1. It is unbounded. The streak needs distinct *days*; the query returned
--    every *row*. Two people at a handful of tasks a day reach four figures
--    inside two years, and the answer is still at most a few hundred dates.
--
-- 2. PostgREST caps result rows, and the query had no `order by`. Past that cap
--    it would return an arbitrary subset — which for a streak means an
--    arbitrary answer, silently, with nothing to say the number is now wrong.
--
-- So Postgres does the DISTINCT and the timezone conversion, and returns dates.
--
-- `security invoker`, deliberately: RLS on `tasks` already scopes this to the
-- caller's workspace, so the function needs no privileges of its own and cannot
-- become a way to read someone else's history.
--
-- On doing a day-bucket calculation outside `lib/time.ts`, which CLAUDE.md
-- forbids: this is the same conversion against the same tz database, and
-- Postgres is the more authoritative of the two. `verify:db` asserts the two
-- agree across both DST boundaries, which is more than the rule asked for and
-- is the only thing that makes the deviation safe.

create or replace function public.completion_days(days_back integer default 400)
returns setof date
language sql
stable
security invoker
set search_path = public
as $$
  select distinct (t.completed_at at time zone 'America/Montreal')::date as day
  from public.tasks t
  where t.completed_at is not null
    and t.completed_at >= now() - make_interval(days => greatest(days_back, 1))
  order by day desc
$$;

comment on function public.completion_days(integer) is
  'Distinct Montreal days with at least one completion, newest first, within the window. RLS-scoped.';

revoke all on function public.completion_days(integer) from public;
grant execute on function public.completion_days(integer) to authenticated;

-- A pure conversion, exposed so `verify:db` can hold Postgres and lib/time.ts
-- against each other. It reads nothing and writes nothing: give it instants,
-- get back the Montreal day each one falls on. It exists because the function
-- above is a day-bucket calculation outside lib/time.ts, and the only thing
-- that makes that acceptable is being able to prove the two never disagree.
create or replace function public.montreal_day_of(instants timestamptz[])
returns table (instant timestamptz, day date)
language sql
immutable
parallel safe
set search_path = public
as $$
  select i, (i at time zone 'America/Montreal')::date
  from unnest(instants) as i
$$;

revoke all on function public.montreal_day_of(timestamptz[]) from public;
grant execute on function public.montreal_day_of(timestamptz[]) to authenticated, service_role;
