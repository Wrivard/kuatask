# 02 — Data model

The full migration is in `supabase/migrations/0001_init.sql`. Apply it as-is. This document explains the shape and the decisions, so you can extend it correctly later.

## Tables

**`workspaces`** — one row in practice. Exists so that adding a third person, or a second workspace, is not a rewrite.

**`profiles`** — mirrors `auth.users`, created by trigger on signup. Holds `display_name`, `accent` (the user's identity dot colour), and `sound_enabled`. Per-user settings live here, not in localStorage, so they follow the user across devices.

**`workspace_members`** — the join table with `role` (`admin` | `member`). Membership in this table is what RLS checks. A user with no row here can read nothing.

**`pending_invites`** — email, workspace, role, who invited. Consumed by the signup trigger.

**`tasks`** — the only table that matters day to day.

## The tasks table

| Column | Notes |
|---|---|
| `title` | 1–500 chars, checked at the DB level |
| `notes` | Nullable, plain text, no markdown rendering in v1 |
| `label` | Free-text client/project tag, nullable |
| `status` | `todo` \| `done` |
| `important` | Boolean, replaces priority levels |
| `due_on` | **`date`, not `timestamptz`** — see below |
| `due_time` | Optional `time`, only meaningful with `due_on` |
| `assignee_id` | Nullable, `on delete set null` |
| `created_by` | Not null — used for the "Créé par X" line in the modal |
| `completed_at` / `completed_by` | Set by trigger, never by the client |
| `position` | `double precision`, fractional indexing for manual reorder |

### Why `due_on` is a `date`

A due date in this app is a Montreal calendar day, not an instant. If it were `timestamptz`, a task due "today" would flip to "tomorrow" at 8pm Montreal in the summer, because UTC has already rolled over. Storing a bare `date` means the day is the day, and the only conversion is deciding what today's date is in Montreal — which `lib/time.ts` does in one place.

`due_time` is separate and optional. A task can be due Thursday, or due Thursday at 2pm. Most are the former.

### Why `completed_at` is trigger-set

The client sends `status: 'done'` and nothing else. The trigger stamps `completed_at` and `completed_by` from `auth.uid()`. Streaks and the "Terminé aujourd'hui" section are computed from `completed_at`, so it has to be trustworthy — a client-supplied timestamp is not.

Reopening a task nulls both fields. That means a task completed, reopened, and completed again counts once, on the second date. Correct behaviour.

## Row-level security

RLS is on for every table. There are no exceptions and no service-role reads in the app path.

Two `security definer` helpers do the work:

```sql
public.is_member(ws uuid) -> boolean
public.is_admin(ws uuid)  -> boolean
```

They exist to avoid recursive policy evaluation — a policy on `workspace_members` that queries `workspace_members` will either recurse or silently fail. `security definer` with a pinned `search_path` sidesteps it.

Policy summary:

| Table | Read | Write |
|---|---|---|
| `workspaces` | members | nobody (seeded manually) |
| `profiles` | anyone sharing a workspace with you | yourself only |
| `workspace_members` | members | admins |
| `pending_invites` | admins | admins |
| `tasks` | members | members (insert requires `created_by = auth.uid()`) |

Note that any member can edit or delete any task, including one assigned to the other person. That is correct for two co-founders and would be wrong for a larger team. If a third person joins as `member` rather than `admin`, revisit this.

## Invite-only, enforced by construction

There is no allowlist check in application code. The mechanism:

1. An admin inserts a row into `pending_invites` and Supabase emails the invite.
2. The recipient signs up. The `on_auth_user_created` trigger creates their profile, then looks for pending invites matching their email, creates the `workspace_members` rows, and deletes the invites.
3. Anyone who signs up without a pending invite gets a profile and zero memberships. Every RLS policy returns nothing. They land on `/no-access`.

The security property comes from RLS, not from a route guard. Even if the UI were bypassed entirely, an uninvited user's queries return empty sets.

## Seeding

Ask the owner for the two work email addresses. Do not invent them. Then, once, in the SQL editor:

```sql
with ws as (
  insert into public.workspaces (name) values ('Küa') returning id
)
insert into public.pending_invites (workspace_id, email, role, invited_by)
select ws.id, e.email, 'admin', '00000000-0000-0000-0000-000000000000'
from ws, (values ('EMAIL_1'), ('EMAIL_2')) as e(email);
```

`invited_by` is a foreign key to `profiles`, which is empty at seed time. Two options: drop the FK constraint for the seed and re-add it, or make the column nullable and only require it for invites created through the app. **Take the second option** — the migration already has it nullable for exactly this reason.

Both users then request a magic link at `/login`. First login wires the memberships.

## Indexes

```sql
tasks_ws_status_due  on (workspace_id, status, due_on)
tasks_ws_assignee    on (workspace_id, assignee_id)
```

At this scale the indexes are close to decorative — the app fetches everything in one query anyway. They cost nothing and stop the app degrading if it grows.

## Realtime

`tasks` is added to the `supabase_realtime` publication. Nothing else is. Profile and membership changes are rare enough to pick up on reload.
