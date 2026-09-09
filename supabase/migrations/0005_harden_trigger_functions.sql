-- touch_updated_at was the only function without a pinned search_path. It had
-- been that way since 0001 and was flagged in DECISIONS.md at the time; it is
-- SECURITY INVOKER so the exposure is small, but every other function in this
-- schema pins it and the inconsistency was the actual bug.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at = now();
    new.completed_by = auth.uid();
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at = null;
    new.completed_by = null;
  end if;

  return new;
end $$;

-- Superseded by 0006: revoking from anon and authenticated alone does nothing,
-- because both inherit EXECUTE from PUBLIC. Kept for an accurate history.
revoke execute on function public.touch_updated_at() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.prevent_last_admin_removal() from anon, authenticated;
revoke execute on function public.prevent_last_admin_demotion() from anon, authenticated;
