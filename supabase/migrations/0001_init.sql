-- Küa Tasks — initial schema
-- Apply once. See docs/02-data-model.md for the reasoning behind each decision.

-- ============================================================
-- tables
-- ============================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  accent text not null default 'green',
  sound_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create type member_role as enum ('admin', 'member');

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- invited_by is nullable so the initial seed can run before any profile exists
create table public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role member_role not null default 'member',
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create type task_status as enum ('todo', 'done');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  notes text,
  label text,
  status task_status not null default 'todo',
  important boolean not null default false,
  due_on date,                          -- Montreal calendar day, not an instant
  due_time time,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  position double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_ws_status_due on public.tasks (workspace_id, status, due_on);
create index tasks_ws_assignee   on public.tasks (workspace_id, assignee_id);

-- ============================================================
-- helpers
-- security definer avoids recursive policy evaluation on workspace_members
-- ============================================================

create or replace function public.is_member(ws uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

create or replace function public.is_admin(ws uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- row level security
-- ============================================================

alter table public.workspaces        enable row level security;
alter table public.profiles          enable row level security;
alter table public.workspace_members enable row level security;
alter table public.pending_invites   enable row level security;
alter table public.tasks             enable row level security;

create policy ws_read on public.workspaces
  for select using (public.is_member(id));

create policy profiles_read on public.profiles
  for select using (
    exists (
      select 1 from workspace_members m1
      join workspace_members m2 on m1.workspace_id = m2.workspace_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy members_read on public.workspace_members
  for select using (public.is_member(workspace_id));

create policy members_admin_write on public.workspace_members
  for all using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

create policy invites_admin on public.pending_invites
  for all using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

create policy tasks_read on public.tasks
  for select using (public.is_member(workspace_id));

create policy tasks_insert on public.tasks
  for insert with check (public.is_member(workspace_id) and created_by = auth.uid());

create policy tasks_update on public.tasks
  for update using (public.is_member(workspace_id))
  with check (public.is_member(workspace_id));

create policy tasks_delete on public.tasks
  for delete using (public.is_member(workspace_id));

-- ============================================================
-- triggers
-- ============================================================

-- completed_at / completed_by are server-owned; the client only sends status
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();

  if new.status = 'done' and old.status = 'todo' then
    new.completed_at = now();
    new.completed_by = auth.uid();
  elsif new.status = 'todo' and old.status = 'done' then
    new.completed_at = null;
    new.completed_by = null;
  end if;

  return new;
end $$;

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- on signup: create the profile, then consume any pending invite.
-- a user with no pending invite gets zero memberships and RLS returns nothing.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  for inv in select * from public.pending_invites where lower(email) = lower(new.email) loop
    insert into public.workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, new.id, inv.role)
    on conflict do nothing;
    delete from public.pending_invites where id = inv.id;
  end loop;

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- realtime
-- ============================================================

alter publication supabase_realtime add table public.tasks;

-- ============================================================
-- seed — replace the two addresses, then run once
-- ============================================================

-- with ws as (
--   insert into public.workspaces (name) values ('Küa') returning id
-- )
-- insert into public.pending_invites (workspace_id, email, role)
-- select ws.id, e.email, 'admin'
-- from ws, (values ('EMAIL_1'), ('EMAIL_2')) as e(email);
