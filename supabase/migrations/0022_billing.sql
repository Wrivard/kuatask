-- Time and billing, per client.
--
-- Replaces the spreadsheet: one tab per client, rows of Date · Tâche · Détail ·
-- Heures · Taux · Montant · Statut, a default rate of 75 $/h, and a Montant that
-- is Heures × Taux unless someone typed a fixed price over it.
--
-- Kept to exactly what the sheet holds. No invoices, no taxes, no line items
-- within a row: those are what the sheet does not do today, and a billing tool
-- that asks for more than the sheet did is one nobody moves to.
--
-- **Workspace-shared**, like tasks. Both people bill the same clients.
--
-- `amount` is stored only when it is a fixed price. When it is null the page
-- computes hours × (rate ?? client.default_rate), the same rule as the sheet's
-- column F — so changing a client's default rate reprices every row that did not
-- set its own, which is what the sheet did too.

create type public.billing_status as enum ('pending', 'invoiced', 'paid');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  default_rate numeric(10, 2) not null default 75 check (default_rate >= 0),
  -- a finished client leaves the dashboard without losing its history
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_workspace_idx on public.clients (workspace_id, name);

create table public.billing_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  entry_on date not null,
  title text not null default '' check (length(title) <= 200),
  detail text not null default '' check (length(detail) <= 4000),
  hours numeric(8, 2) check (hours is null or hours >= 0),
  rate numeric(10, 2) check (rate is null or rate >= 0),
  -- a fixed price; null means hours × rate
  amount numeric(12, 2) check (amount is null or amount >= 0),
  status public.billing_status not null default 'pending',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- what the client page reads: one client's rows, newest first
create index billing_entries_client_idx on public.billing_entries (client_id, entry_on desc);
create index billing_entries_workspace_idx on public.billing_entries (workspace_id);

create or replace function public.billing_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger clients_touch before update on public.clients
  for each row execute function public.billing_touch();
create trigger billing_entries_touch before update on public.billing_entries
  for each row execute function public.billing_touch();

/*
  An entry must belong to a client in its own workspace. The foreign key only
  says the client exists; without this, a row could be written into one
  workspace pointing at another's client.
*/
create or replace function public.billing_entry_client_matches()
returns trigger language plpgsql
security invoker set search_path = public as $$
begin
  if not exists (
    select 1 from public.clients c
    where c.id = new.client_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'client % is not in workspace %', new.client_id, new.workspace_id;
  end if;
  return new;
end $$;

create trigger billing_entries_client_matches
  before insert or update of client_id, workspace_id on public.billing_entries
  for each row execute function public.billing_entry_client_matches();

alter table public.clients enable row level security;
alter table public.billing_entries enable row level security;

create policy clients_read on public.clients
  for select using (private.is_member(workspace_id));
create policy clients_insert on public.clients
  for insert with check (private.is_member(workspace_id));
create policy clients_update on public.clients
  for update using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy clients_delete on public.clients
  for delete using (private.is_member(workspace_id));

create policy billing_read on public.billing_entries
  for select using (private.is_member(workspace_id));
create policy billing_insert on public.billing_entries
  for insert with check (private.is_member(workspace_id));
create policy billing_update on public.billing_entries
  for update using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy billing_delete on public.billing_entries
  for delete using (private.is_member(workspace_id));
