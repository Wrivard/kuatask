-- Dragging is not an event.
--
-- Every task write fires the log trigger, and `position` is a column like any
-- other, so rearranging the board wrote history. One drag is one entry reading
-- « modifié · ordre »; a drag that exhausts the gap between two cards calls
-- `restack()`, which rewrites every position in the column in a single
-- statement — so one gesture can write ten entries, none of which say anything.
--
-- The owner asked for this page to see when a task was created or deleted. An
-- afternoon of tidying the board would bury both under its own bookkeeping,
-- which is the same failure the 0013 coalesce fixed for typing, arriving by a
-- different route.
--
-- So `position` is dropped from the changed set before anything is decided. If
-- nothing else changed there is no entry at all; if something did — a
-- cross-column drag moves a task *and* reassigns it — the entry is about the
-- reassignment and does not mention the ordering it also touched.
--
-- `position` joins `updated_at` as a column the log does not consider. Both are
-- bookkeeping: one is owned by a trigger, the other records where something sits
-- rather than what it is.

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

    /*
      Only the columns that actually differ, and never the ones the log does not
      consider: `updated_at` is owned by a trigger, and `position` is where a
      task sits rather than what it is.
    */
    select array_agg(key order by key) into touched
    from jsonb_each(to_jsonb(new))
    where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key
      and key not in ('updated_at', 'position');

    -- a write that changed nothing the log cares about is not an event
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

-- Entries already written that say nothing but « ordre ».
delete from public.activity
where action = 'updated' and changed = array['position'];

-- And the mention of it on entries that also say something real.
update public.activity
   set changed = array_remove(changed, 'position')
 where action = 'updated' and 'position' = any(changed);
