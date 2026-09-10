-- Identity changes reach an open session.
--
-- `profiles` was never in the publication, so a rename or a colour change
-- reached the other person only when their tab happened to resync. For as long
-- as it stayed open, the board's columns were labelled with a name that no
-- longer existed and cards were dotted in a colour nobody had chosen.
--
-- Only the tasks table was published, which was right when profiles were
-- written once at signup and never touched. They are editable in settings now,
-- so this follows.
--
-- No `replica identity full` here, unlike 0003 for tasks. That was needed
-- because a DELETE has to carry enough of the old row for the client's
-- workspace filter to match it. This subscription has no filter — RLS decides
-- what a member may see — and it ignores DELETE outright, since a profile is
-- only removed when the account is, and that is not a live-update situation.

alter publication supabase_realtime add table public.profiles;
