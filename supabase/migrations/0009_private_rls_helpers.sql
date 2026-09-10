-- The RLS helpers leave the public API.
--
-- `is_admin(uuid)` and `is_member(uuid)` are `security definer`, which means
-- they bypass RLS by design — that is the whole point of them, since a policy
-- on `workspace_members` cannot read `workspace_members` to decide itself.
-- Living in `public`, they were also reachable as `/rest/v1/rpc/is_admin` by
-- anyone, signed in or not.
--
-- Nothing leaked. Both read `auth.uid()`, so an anonymous caller gets `false`
-- and a signed-in one learns whether they are a member of a workspace they
-- already had to name — which they knew. But a `security definer` function on
-- the public API surface is a standing offer, and the next person to add one
-- will copy the shape of these.
--
-- Revoking `execute` is not the fix: the policies below are evaluated with the
-- caller's privileges, so taking `execute` away from `authenticated` would
-- break every one of them. Moving the functions to a schema PostgREST does not
-- expose is: policies can still call them, `/rest/v1/rpc/` cannot find them.
--
-- `search_path` stays pinned (migration 0005) — a `security definer` function
-- without one is resolvable against a caller-controlled path.

create schema if not exists private;

-- explicitly NOT granted to anon or authenticated; only the policy evaluator,
-- which runs as the table owner, needs to resolve names in here
revoke all on schema private from public;
grant usage on schema private to postgres;

create or replace function private.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = (select auth.uid())
  );
$$;

create or replace function private.is_admin(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- a policy expression is evaluated as the querying role, so it needs execute
grant execute on function private.is_member(uuid) to anon, authenticated;
grant execute on function private.is_admin(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- policies
-- Same rules, same shape, pointing at the private schema. Recreated rather
-- than altered because a policy's expression cannot be changed in place.

drop policy if exists ws_read on public.workspaces;
create policy ws_read on public.workspaces
  for select using (private.is_member(id));

drop policy if exists members_read on public.workspace_members;
create policy members_read on public.workspace_members
  for select using (private.is_member(workspace_id));

drop policy if exists members_admin_insert on public.workspace_members;
create policy members_admin_insert on public.workspace_members
  for insert with check (private.is_admin(workspace_id));

drop policy if exists members_admin_update on public.workspace_members;
create policy members_admin_update on public.workspace_members
  for update using (private.is_admin(workspace_id))
  with check (private.is_admin(workspace_id));

drop policy if exists members_admin_delete on public.workspace_members;
create policy members_admin_delete on public.workspace_members
  for delete using (private.is_admin(workspace_id));

drop policy if exists invites_admin on public.pending_invites;
create policy invites_admin on public.pending_invites
  for all using (private.is_admin(workspace_id))
  with check (private.is_admin(workspace_id));

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks
  for select using (private.is_member(workspace_id));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (
    private.is_member(workspace_id) and created_by = (select auth.uid())
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (private.is_member(workspace_id))
  with check (private.is_member(workspace_id));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (private.is_member(workspace_id));

-- nothing references the public ones any more
drop function if exists public.is_admin(uuid);
drop function if exists public.is_member(uuid);
