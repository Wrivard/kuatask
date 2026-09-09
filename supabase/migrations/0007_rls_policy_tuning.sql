-- Two performance findings worth acting on. The rest are not: the unindexed
-- foreign keys and the unused tasks_ws_status_due index are exactly what
-- docs/02-data-model.md calls "close to decorative at this scale", and adding
-- five more indexes would cost write time to speed up reads nobody makes.

-- 1. auth.uid() was re-evaluated per row instead of once per statement.
--    Wrapping it in a scalar subquery lets the planner hoist it into an
--    InitPlan. Same semantics, evaluated once.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (
    exists (
      select 1 from workspace_members m1
      join workspace_members m2 on m1.workspace_id = m2.workspace_id
      where m1.user_id = (select auth.uid()) and m2.user_id = profiles.id
    )
  );

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (
    public.is_member(workspace_id) and created_by = (select auth.uid())
  );

-- 2. members_admin_write was FOR ALL, so it also applied to SELECT and every
--    read of workspace_members evaluated two permissive policies. Admins are
--    members, so members_read already covers their reads; the admin policy only
--    ever needed to grant writes. Narrowing it says what was actually meant.
drop policy if exists members_admin_write on public.workspace_members;

create policy members_admin_insert on public.workspace_members
  for insert with check (public.is_admin(workspace_id));

create policy members_admin_update on public.workspace_members
  for update using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

create policy members_admin_delete on public.workspace_members
  for delete using (public.is_admin(workspace_id));
