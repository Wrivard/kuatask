-- Two corrections to 0012, both found by reading it back rather than by it
-- failing. The log works; it is wasteful in a way that gets worse with use, and
-- one of the two makes the page harder to read, which matters more.
--
-- 1. The snapshot was written on every action and is only ever read for a
--    deletion. `app/(app)/activity/actions.ts` refuses anything whose action is
--    not 'deleted', and the page's select does not fetch the column at all. So
--    four fifths of the snapshots we store cannot be reached by any code path.
--
--    Measured on the real table: ~500 bytes per snapshot. Small now, at eight
--    rows. It is a per-write cost that never stops growing, and it buys nothing.
--
--    If per-edit version history is ever wanted, note that this would still not
--    be the column for it: 0012 stored `row_after`, the state *after* the
--    change. Undoing an edit needs `row_before`. The snapshot that was kept was
--    never the one that would have been useful.
--
-- 2. Consecutive edits by one person became one row each.
--
--    The modal debounces text at 400ms (`TEXT_DEBOUNCE`), so writing a few
--    sentences of notes flushes a write per typing pause — five to fifteen for
--    one note. Each was its own 'updated' entry. The owner asked for this page
--    to see when a task was deleted or created; fourteen consecutive "modified
--    the notes" entries bury exactly that.
--
--    So an 'updated' merges into the previous one when it is the newest entry
--    for that task, by the same person, inside the window below. The entry keeps
--    the union of the columns touched and moves to the time of the last change,
--    which is what a newest-first log should show.
--
--    Only when it is the *newest* entry for the task. Editing, completing, then
--    editing again must stay three rows in that order — merging the second edit
--    into the first would put a change before the completion it came after.

-- Long enough to cover typing with thinking pauses, short enough that picking a
-- task back up after lunch is its own entry.
create or replace function private.activity_coalesce_window()
returns interval language sql immutable as $$ select interval '2 minutes' $$;

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
      select a.id, a.action, a.actor_id, a.created_at, a.changed
        into prev
        from public.activity a
       where a.task_id = new.id
       order by a.created_at desc
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
               created_at = now()
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
revoke all on function private.activity_coalesce_window() from public;

-- The coalesce reads the newest entry per task. Without this it is a scan of the
-- whole log on every update, which is the one way this change could cost more
-- than it saves.
create index if not exists activity_task_time_idx
  on public.activity (task_id, created_at desc);

-- Reclaim what 0012 stored and nothing can read.
update public.activity set snapshot = null where action <> 'deleted' and snapshot is not null;
