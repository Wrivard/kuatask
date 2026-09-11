-- What happened, and a way back from a mistake.
--
-- `docs/00-brief.md` says "no archive, no trash — deletion is real deletion
-- with an undo window". The owner asked for this directly, and it is not the
-- thing that rule refuses: a trash is a place deleted tasks live on, quietly
-- accumulating into the wall of old work the brief was avoiding. This is a log
-- of actions. The tasks are still really deleted; what survives is the record
-- that they existed, and enough of one to put a row back if somebody asks.
--
-- Written by triggers rather than by the app. Every write path would otherwise
-- have to remember to log — the store, the server actions, the drag handlers,
-- anything added later — and the one that forgets is invisible until somebody
-- needs the entry that was never written.
--
-- The snapshot is the whole row as `jsonb`. It is the only way a restore can be
-- honest: putting back a title and a date while silently dropping the notes is
-- worse than not offering a restore at all.

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- deliberately not a foreign key: the whole point is that it outlives the task
  task_id uuid not null,

  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'completed', 'reopened', 'deleted')),

  -- denormalised so a deleted task still reads as something in the list
  title text not null,

  -- the full row at the moment of the action, for restoring a deletion
  snapshot jsonb,

  -- which columns an update touched, so the log says what changed
  changed text[],

  created_at timestamptz not null default now()
);

create index activity_workspace_time_idx
  on public.activity (workspace_id, created_at desc);

alter table public.activity enable row level security;

-- members read their workspace's history; nobody writes directly. The trigger
-- below is `security definer`, so it is the only thing that can add a row.
create policy activity_read on public.activity
  for select using (private.is_member(workspace_id));

create or replace function private.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  what text;
  touched text[];
  row_before jsonb;
  row_after jsonb;
begin
  if (tg_op = 'INSERT') then
    what := 'created';
    row_after := to_jsonb(new);

  elsif (tg_op = 'DELETE') then
    what := 'deleted';
    row_before := to_jsonb(old);

  else
    row_before := to_jsonb(old);
    row_after := to_jsonb(new);

    /*
      A status change to or from 'done' is the event people look for, so it gets
      its own name instead of being one more 'updated' among the dozen a modal
      produces while somebody types.
    */
    if (old.status is distinct from new.status and new.status = 'done') then
      what := 'completed';
    elsif (old.status is distinct from new.status and old.status = 'done') then
      what := 'reopened';
    else
      what := 'updated';
    end if;

    -- only the columns that actually differ, and never the ones a trigger owns
    select array_agg(key order by key) into touched
    from jsonb_each(row_after)
    where row_after -> key is distinct from row_before -> key
      and key not in ('updated_at');

    -- a write that changed nothing is not an event
    if (touched is null or array_length(touched, 1) is null) then
      return new;
    end if;
  end if;

  insert into public.activity (workspace_id, task_id, actor_id, action, title, snapshot, changed)
  values (
    coalesce(new.workspace_id, old.workspace_id),
    coalesce(new.id, old.id),
    (select auth.uid()),
    what,
    coalesce(new.title, old.title),
    case when tg_op = 'DELETE' then row_before else row_after end,
    touched
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.log_task_activity() from public;

create trigger tasks_activity_insert
  after insert on public.tasks
  for each row execute function private.log_task_activity();

create trigger tasks_activity_update
  after update on public.tasks
  for each row execute function private.log_task_activity();

create trigger tasks_activity_delete
  after delete on public.tasks
  for each row execute function private.log_task_activity();
