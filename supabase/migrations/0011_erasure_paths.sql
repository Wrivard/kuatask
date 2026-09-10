-- An account can actually be deleted.
--
-- Law 25 gives a person the right to have their personal information erased.
-- `profiles.id` already cascades from `auth.users`, so on paper deleting the
-- account took the profile and the membership with it. In practice it could not
-- happen at all: `tasks.created_by`, `tasks.completed_by` and
-- `pending_invites.invited_by` all referenced `profiles` with `no action`, so
-- the cascade hit those and the whole delete was refused.
--
-- Which means anyone who had ever typed a task — that is, anyone — could not be
-- erased. Found by writing the test for it: the profile survived, the
-- membership survived, and the task still named a user id in three columns.
--
-- `set null` rather than `cascade`. Deleting somebody's work when they leave
-- loses work, and that has been the rule since docs/03; the tasks stay and stop
-- naming a person who is gone. `created_by` has to become nullable to allow it
-- — the insert policy still requires `created_by = auth.uid()`, so a task can
-- never be *created* without an author, and null here means exactly one thing:
-- the author's account no longer exists.
--
-- `assignee_id` was already `set null` and needed nothing.

alter table public.tasks
  alter column created_by drop not null;

alter table public.tasks
  drop constraint tasks_created_by_fkey,
  add constraint tasks_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.tasks
  drop constraint tasks_completed_by_fkey,
  add constraint tasks_completed_by_fkey
    foreign key (completed_by) references public.profiles(id) on delete set null;

alter table public.pending_invites
  drop constraint pending_invites_invited_by_fkey,
  add constraint pending_invites_invited_by_fkey
    foreign key (invited_by) references public.profiles(id) on delete set null;
