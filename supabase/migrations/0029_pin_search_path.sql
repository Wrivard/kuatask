-- A constant with a mutable search_path.
--
-- `private.activity_coalesce_window()` returns `interval '2 minutes'` and is
-- not security definer, so nothing could be hijacked through it — but the
-- database linter flags every unpinned function, and a warning you have decided
-- to ignore makes the next real one easy to ignore too.
alter function private.activity_coalesce_window() set search_path = pg_catalog, pg_temp;
