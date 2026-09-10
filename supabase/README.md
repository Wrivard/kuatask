# Database

Project `kua-tasks`, region `ca-central-1` — chosen so task content stays in
Canada, per Law 25.

## Migrations

Applied in order. Each one is written to be run once, against a database that
has had every earlier one applied.

| | |
|---|---|
| `0001_init` | Tables, RLS, the signup and completion triggers, seed |
| `0002_doing_status` | The third status |
| `0003_tasks_replica_identity_full` | Realtime `DELETE` carries enough of the old row for the client's `workspace_id` filter to match it. Without this, deletions from the other person never arrive |
| `0004_last_admin_guard` | The last admin cannot be removed or demoted |
| `0005_harden_trigger_functions` | `search_path` pinned on `security definer` functions |
| `0006_revoke_trigger_functions_from_public` | 0005 revoked from `anon` and `authenticated`, both of which inherit from `PUBLIC`, so it did nothing. Both are kept so the history shows what was true |
| `0007_rls_policy_tuning` | `(select auth.uid())` so the planner evaluates it once per query rather than once per row |
| `0008_profiles_realtime` | A rename or a colour change reaches an open session |
| `0009_private_rls_helpers` | `is_admin`/`is_member` move to a schema PostgREST does not expose, so they stop being `/rest/v1/rpc/` endpoints. Revoking `execute` was not an option — policies are evaluated as the caller |
| `0010_foreign_key_indexes` | Covering indexes so a cascade delete does not scan. Shape, not a measured problem |

### There are no down-migrations, deliberately

A reversal is only useful if it is correct, and a down-migration is the one
piece of SQL that is never run until the worst possible moment. Writing eight of
them here would mean eight untested paths, and the tempting one — the reverse of
`0001` — is `drop schema public cascade`, which is not a rollback, it is the
outage.

The way back from a bad migration on this project is to write the next
migration. If the data itself is wrong, see restoring below.

## Backups — read this one

The organisation is on Supabase's **free plan**, which means:

- **No automated backups.** None. Not daily, not nightly.
- **No point-in-time recovery.** A bad `delete` is permanent.
- **The project pauses after a week without activity** and has to be restored
  from the dashboard before the app works again.

That is a reasonable trade for what this costs, and an unreasonable thing not to
know. So:

```bash
npm run backup          # backups/kua-<timestamp>.json
```

Five tables, every row, read with the service role key so it sees past RLS. At
this size JSON is a perfectly good archive and needs nothing installed. `backups/`
is gitignored — the file is every task both of you have ever written, so treat it
the way you would treat the key that produced it.

**What it does not contain:** the `auth.users` rows. Accounts live in Supabase's
own schema and are not reachable through PostgREST. Losing those means signing in
again by magic link, and the signup trigger re-creates a profile — but a task's
`created_by` and `assignee_id` point at user ids that would no longer exist.

**Restoring** means inserting the tables back in the order they are written in
the dump: `workspaces`, `profiles`, `workspace_members`, `pending_invites`,
`tasks`. There is no restore script, on purpose. Restoring is rare, it is
destructive, and it should be done by someone reading the file and deciding what
they want back — not by a command that seemed easy to run at the time.

Upgrading the organisation to Pro is what replaces all of this with daily
backups and PITR, and is the right answer if these two ever depend on it.

## Known advisor findings

`npm run verify:db` covers the invariants; Supabase's own linter covers the
posture. One finding is left standing on purpose:

**Leaked password protection is disabled.** It checks new passwords against
HaveIBeenPwned. This app signs people in with magic links and has no password
field anywhere — the only passworded accounts that have ever existed here are
the throwaway users the verification scripts create and delete. Turning it on
would change nothing about anybody real. It is a dashboard setting under
Authentication if that ever stops being true.

Two performance findings are also left standing, both INFO. `tasks_ws_status_due`
is reported unused: at nine rows an index is *supposed* to go unused, and it
covers the query every page load makes. The unindexed foreign keys were the
other one, and 0010 answers it.

## Checking it

```bash
npm run verify:db        # RLS, triggers, realtime — creates and removes its own rows
npm run verify:invites   # membership rules
```

Both create throwaway rows and delete them afterwards, then verify the cleanup.
Neither ever deletes a row it did not create: during the build a leftover row was
assumed to be test residue and removed, and it turned out to be a real task
somebody had just typed.
