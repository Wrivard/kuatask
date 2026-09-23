-- The things we sell often, so a line is picked rather than retyped.
--
-- « Frais de Création / stratégie », « Forfait Vitrine », « Forfait
-- Croissance » — the same handful of services, at the same prices, typed out
-- again on every client's sheet. A product is a name, an optional detail and a
-- price; adding one to a sheet copies those three into a new line and then
-- forgets where they came from. Editing a product later does not touch the
-- lines already written from it, which is the point: a line is what was
-- agreed that day, not a link to today's price list.
--
-- Prices are before tax, like every amount in this app — see 0026's comment
-- on taxes, and lib/billing.ts.

create table public.billing_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  detail text not null default '' check (length(detail) <= 4000),
  price numeric(12, 2) not null default 0 check (price >= 0),
  -- retired from the picker without rewriting history
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_products_workspace_idx on public.billing_products (workspace_id, name);

create trigger billing_products_touch before update on public.billing_products
  for each row execute function public.billing_touch();

alter table public.billing_products enable row level security;

create policy billing_products_read on public.billing_products
  for select using (private.is_member(workspace_id));
create policy billing_products_insert on public.billing_products
  for insert with check (private.is_member(workspace_id));
create policy billing_products_update on public.billing_products
  for update using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy billing_products_delete on public.billing_products
  for delete using (private.is_member(workspace_id));

alter publication supabase_realtime add table public.billing_products;
