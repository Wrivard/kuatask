-- `created_at` is not an ordering.
--
-- It is `now()`, which in Postgres is transaction start time and identical for
-- every row written by one transaction. Two consequences, both real:
--
-- 1. The coalesce added in 0013 looks up "the newest entry for this task" by
--    `order by created_at desc limit 1`. When rows tie, that picks one
--    arbitrarily. Caught in testing: an edit merged into an 'updated' entry that
--    preceded a 'completed' one, moving a change to before the completion it
--    actually followed — the precise reordering the guard exists to prevent.
--
-- 2. The page renders `order by created_at desc`. `restack()` rewrites every
--    position in one statement, so those rows share a timestamp and currently
--    display in whatever order the planner returns.
--
-- `id` cannot break the tie: it is a random v4 uuid, so ordering by it is
-- ordering by noise. What the log needs is the one thing it did not have, a
-- number that goes up. `bigserial` draws from a sequence, so it is monotonic per
-- insert regardless of transaction boundaries or clock behaviour.
--
-- This also makes the log correct across a clock adjustment, which `created_at`
-- ordering never was.

alter table public.activity add column seq bigserial;

-- Existing rows get a seq from the sequence as the column is added. Their
-- relative order comes out as heap order, which for eight rows written in
-- chronological order is the right answer anyway.

create unique index activity_seq_idx on public.activity (seq);

-- What the page reads: a workspace's log, newest first.
create index activity_workspace_seq_idx on public.activity (workspace_id, seq desc);

-- What the coalesce reads: the newest entry for one task.
create index activity_task_seq_idx on public.activity (task_id, seq desc);

-- Superseded by the two above.
drop index if exists public.activity_workspace_time_idx;
drop index if exists public.activity_task_time_idx;

create or replace function private.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  what text;
  touched text[];
  actor uuid;
  prev record;
begin
  actor := (select auth.uid());

  if (tg_op = 'INSERT') then
    what := 'created';

  elsif (tg_op = 'DELETE') then
    what := 'deleted';

  else
    if (old.status is distinct from new.status and new.status = 'done') then
      what := 'completed';
    elsif (old.status is distinct from new.status and old.status = 'done') then
      what := 'reopened';
    else
      what := 'updated';
    end if;

    -- only the columns that actually differ, and never the ones a trigger owns
    select array_agg(key order by key) into touched
    from jsonb_each(to_jsonb(new))
    where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key
      and key not in ('updated_at');

    -- a write that changed nothing is not an event
    if (touched is null or array_length(touched, 1) is null) then
      return new;
    end if;

    if (what = 'updated') then
      -- by seq, so "the newest" is unambiguous even inside one transaction
      select a.id, a.action, a.actor_id, a.created_at, a.changed
        into prev
        from public.activity a
       where a.task_id = new.id
       order by a.seq desc
       limit 1;

      if (prev.id is not null
          and prev.action = 'updated'
          and prev.actor_id is not distinct from actor
          and prev.created_at > now() - private.activity_coalesce_window())
      then
        update public.activity
           set changed = (
                 select array_agg(distinct k order by k)
                 from unnest(coalesce(prev.changed, '{}') || touched) as k
               ),
               title = new.title,
               created_at = now(),
               /*
                 A fresh seq as well, so the merged entry rises to the top of the
                 log with its new timestamp. Without this it keeps the position of
                 the first keystroke while claiming the time of the last, and the
                 page would show a just-edited task below things that happened
                 before it.
               */
               seq = nextval(pg_get_serial_sequence('public.activity', 'seq'))
         where id = prev.id;

        return new;
      end if;
    end if;
  end if;

  insert into public.activity (workspace_id, task_id, actor_id, action, title, snapshot, changed)
  values (
    coalesce(new.workspace_id, old.workspace_id),
    coalesce(new.id, old.id),
    actor,
    what,
    coalesce(new.title, old.title),
    -- only a deletion has anything to restore
    case when tg_op = 'DELETE' then to_jsonb(old) else null end,
    touched
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.log_task_activity() from public;
