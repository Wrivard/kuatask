-- The last-admin rule lived only in the invite server action.
--
-- docs/02-data-model.md is explicit that the security property comes from the
-- database and not from application code, and members_admin_write lets any
-- admin delete any workspace_members row. So an admin could remove the final
-- admin — including themselves — with one direct PostgREST call, leaving a
-- workspace nobody can ever administer again. There is no UI for that, which is
-- exactly why it needed a guard that does not depend on the UI.
create or replace function public.prevent_last_admin_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role <> 'admin' then
    return old;
  end if;

  -- a cascade from deleting the workspace itself is not an admin removal
  if not exists (select 1 from workspaces where id = old.workspace_id) then
    return old;
  end if;

  if (
    select count(*) from workspace_members
    where workspace_id = old.workspace_id and role = 'admin'
  ) <= 1 then
    raise exception 'cannot remove the last admin of a workspace'
      using errcode = 'check_violation';
  end if;

  return old;
end $$;

drop trigger if exists members_last_admin_guard on public.workspace_members;

create trigger members_last_admin_guard
  before delete on public.workspace_members
  for each row execute function public.prevent_last_admin_removal();

-- demoting the last admin leaves the same workspace in the same state, so the
-- same rule has to cover an UPDATE that changes the role away from admin
create or replace function public.prevent_last_admin_demotion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and new.role <> 'admin' then
    if (
      select count(*) from workspace_members
      where workspace_id = old.workspace_id and role = 'admin'
    ) <= 1 then
      raise exception 'cannot demote the last admin of a workspace'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists members_last_admin_demotion_guard on public.workspace_members;

create trigger members_last_admin_demotion_guard
  before update on public.workspace_members
  for each row execute function public.prevent_last_admin_demotion();
