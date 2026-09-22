-- Billing, live between the two people.
--
-- Two people bill the same clients, and the sheet is edited in place. Without
-- this, a row one of them added was invisible to the other until a reload, and
-- a status changed to Payé on one screen stayed À facturer on the other — which
-- on a billing page is how an invoice gets sent twice.
--
-- `replica identity full` on billing_entries for the same reason as tasks in
-- 0003: the sheet subscribes filtered by client_id, and a DELETE's old record
-- only carries columns in the replica identity. With the default, deletes would
-- never reach a filtered channel. `clients` is subscribed per workspace and only
-- for renames, rates and archiving, so its deletes do not need the full row.
alter table public.billing_entries replica identity full;

alter publication supabase_realtime add table public.billing_entries;
alter publication supabase_realtime add table public.clients;
