-- A task can belong to both people.
--
-- Asked for directly: « assigner les deux personnes à une tâche ». The
-- workspace is two people, so "both" is one more value rather than a list:
-- a flag beside assignee_id, not an array replacing it. Everything that reads
-- assignee_id keeps working unchanged — a shared task simply has none — and
-- only the places that should know about « nous deux » learn to.
--
-- One truth at a time: a shared task has no individual assignee. Without the
-- check, a row could say "shared" and "William's" at once, and every surface
-- would have to decide which it believed.
alter table public.tasks
  add column shared boolean not null default false;

alter table public.tasks
  add constraint tasks_shared_has_no_single_assignee
  check (not shared or assignee_id is null);

comment on column public.tasks.shared is
  'Assigned to both members. Mutually exclusive with assignee_id.';
