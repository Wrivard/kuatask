-- The revokes in 0005 were ineffective. Postgres grants EXECUTE to PUBLIC on new
-- functions by default, and anon and authenticated inherit it, so revoking from
-- those two roles left the grant that actually mattered in place.
--
-- These four are only ever invoked by triggers. A trigger checks permission when
-- it is created, not when it fires, so removing every direct grant does not stop
-- them running — confirmed by exercising signup, completion and the last-admin
-- guard after applying this.
revoke execute on function public.touch_updated_at() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.prevent_last_admin_removal() from public;
revoke execute on function public.prevent_last_admin_demotion() from public;

-- is_member and is_admin deliberately keep their grants. RLS policy expressions
-- run with the privileges of the querying role, so removing EXECUTE would turn
-- every policy that calls them into a permission error — including the anon
-- reads that are supposed to return an empty set rather than fail. They report
-- only on auth.uid(), so a caller learns nothing about anyone but themselves.
