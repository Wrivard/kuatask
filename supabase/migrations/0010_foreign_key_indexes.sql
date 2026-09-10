-- Covering indexes for the foreign keys.
--
-- Postgres does not index a foreign key's own column, only the one it points
-- at. Every `on delete cascade` therefore scans the referring table to find
-- what to remove — and so does every `delete` on `auth.users`, which is what
-- `verify:db` and `verify:invites` do dozens of times per run.
--
-- Honest about the scale: this database holds nine rows, the planner will
-- sequential-scan all of it regardless, and nothing here fixes a slowness
-- anybody has felt. It is the shape being right rather than a measurement —
-- the cost is a few kilobytes and a write amplification too small to name, and
-- the alternative is a table that gets slower to delete from as it fills, which
-- is exactly the kind of thing nobody notices until it is a year of tasks.
--
-- `tasks_ws_status_due` from 0001 is reported unused and is staying. At nine
-- rows an index is *supposed* to go unused; that report says the table is
-- small, not that the index is wrong. It covers the shell's opening query —
-- workspace, status, due date, in that order — which is the one query every
-- single page load makes.

create index if not exists tasks_assignee_idx
  on public.tasks (assignee_id);

create index if not exists tasks_created_by_idx
  on public.tasks (created_by);

create index if not exists tasks_completed_by_idx
  on public.tasks (completed_by);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

create index if not exists pending_invites_invited_by_idx
  on public.pending_invites (invited_by);
