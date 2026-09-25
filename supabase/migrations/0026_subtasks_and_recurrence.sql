-- Subtasks, and tasks that come back.
--
-- **Subtasks are a checklist, not tasks.** A task is the unit this whole app is
-- built on: it sits in a day bucket, owns a person, a status, a colour, a
-- position, and it counts towards the streak and the day's progress. A subtask
-- is none of those — « appeler le fournisseur » inside « préparer la rencontre »
-- is a step, and making it a task would put it in the list, on the board, in
-- the calendar and in the counts, which is exactly what one asked for it to not
-- be. So: a title, a checkbox, an order, and nothing else.
--
-- Scoped through their task. No workspace column: a checklist item belongs to
-- its task, and the task already knows its workspace — two columns that can
-- disagree is one more thing to keep honest.
create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create index subtasks_task_idx on public.subtasks (task_id, position);

alter table public.subtasks enable row level security;

/*
  Whoever can see the task can see its steps. The check goes through tasks so
  there is one rule about who may touch what, written once, in the table that
  holds the workspace.
*/
create policy subtasks_read on public.subtasks
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id and private.is_member(t.workspace_id))
  );
create policy subtasks_insert on public.subtasks
  for insert with check (
    exists (select 1 from public.tasks t where t.id = task_id and private.is_member(t.workspace_id))
  );
create policy subtasks_update on public.subtasks
  for update using (
    exists (select 1 from public.tasks t where t.id = task_id and private.is_member(t.workspace_id))
  ) with check (
    exists (select 1 from public.tasks t where t.id = task_id and private.is_member(t.workspace_id))
  );
create policy subtasks_delete on public.subtasks
  for delete using (
    exists (select 1 from public.tasks t where t.id = task_id and private.is_member(t.workspace_id))
  );

alter table public.subtasks replica identity full;
alter publication supabase_realtime add table public.subtasks;

-- A task that comes back.
--
-- Stored as the rule, not as a schedule: the next occurrence is written when
-- this one is ticked off, by the app, on the spot. No cron, nothing to wait
-- for, and nothing that can fire while the free plan's project is asleep — and
-- a weekly task you finish three days late moves on from the day it was due,
-- not from the day you got to it.
alter table public.tasks
  add column recur text check (recur is null or recur in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly'));

comment on column public.tasks.recur is
  'Repeat rule. The next occurrence is created by the client when this one is completed.';
