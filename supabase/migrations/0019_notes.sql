-- A place to dump things before they are tasks.
--
-- Asked for as "daily quick notes, a brain dump — it doesn't save or anything
-- and gets deleted after a week". Those two halves pull apart, so this reads
-- the first as *low ceremony* rather than *no persistence*: a note survives a
-- reload and follows you from a phone to a laptop, which is the whole point of
-- dumping on one and reorganising on the other. What it does not get is any of
-- the machinery a task has — no due date, no assignee, no status, no undo
-- stack, no activity log.
--
-- **Author-scoped, not workspace-scoped.** Everything else in this app is
-- shared on purpose; this is the exception. A brain dump is unfinished thinking,
-- and knowing somebody else can read it changes what gets written down — which
-- would cost exactly the thing it is for. The workspace is still recorded so a
-- note can be turned into a task in the right place.
--
-- They expire on their own. A dump that accumulates becomes a second list to
-- maintain, and the second list is always the one that rots.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- the author, and the only person who can see it
  user_id uuid not null references public.profiles(id) on delete cascade,

  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- what the page reads: one person's notes, newest first
create index notes_user_time_idx on public.notes (user_id, created_at desc);

alter table public.notes enable row level security;

/*
  Four policies rather than one `for all`, so the rules are readable one verb at
  a time — and so an update can never move a note to another person: the `with
  check` is what stops `user_id` being rewritten, which `using` alone does not.

  Membership is checked as well as authorship. Without it, a note would survive
  its author leaving the workspace and still be readable by them.
*/
create policy notes_read on public.notes
  for select using (user_id = (select auth.uid()) and private.is_member(workspace_id));

create policy notes_insert on public.notes
  for insert with check (user_id = (select auth.uid()) and private.is_member(workspace_id));

create policy notes_update on public.notes
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notes_delete on public.notes
  for delete using (user_id = (select auth.uid()));

/*
  The week.

  `security invoker`, so it can only ever reach the caller's own notes — the
  same RLS that hides them from everybody else limits what this can delete. A
  `security definer` version would have been a function that empties anybody's
  dump if the argument were ever wrong.

  Called when the page loads rather than on a schedule: the free plan has no
  pg_cron, and a note nobody has come back to look at is doing no harm sitting
  there. It returns the count so the page can say so.
*/
create or replace function public.purge_old_notes(days_back integer default 7)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  gone integer;
begin
  delete from public.notes
  where created_at < now() - make_interval(days => greatest(days_back, 1));

  get diagnostics gone = row_count;
  return gone;
end;
$$;

comment on function public.purge_old_notes(integer) is
  'Deletes the caller''s notes older than the window. RLS-scoped, so it reaches only their own.';

revoke all on function public.purge_old_notes(integer) from public;
grant execute on function public.purge_old_notes(integer) to authenticated;
