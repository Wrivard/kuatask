# Küa Tasks

A shared task manager for two people. Next.js 15, Supabase, deployed on Vercel.

Live at **https://kuatask.vercel.app**

The point of the app is in `docs/08-satisfaction.md`: capture has to be nearly
free, and completing a task has to pay out. Everything else is the substrate
that makes that possible.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local` needs four values. It is gitignored and never committed.

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`NEXT_PUBLIC_SITE_URL` is the one people get wrong. It is what `signInWithOtp`
sends as `emailRedirectTo`, so on Vercel it must be the production domain —
leave it as localhost and every production login redirects to somebody's laptop.
The two `NEXT_PUBLIC_` values are compiled into the bundle, so they have to
exist *before* a build, not merely before a deploy.

`/api/health` reports which variables the running server can actually see. It is
the fastest way to tell a misconfigured deploy from a broken one.

## Three views over one dataset

The whole workspace is fetched once and every view is a `useMemo` over that
array, so switching costs no requests and shows no loading state.

| View | What it is | Drag does |
|---|---|---|
| **Liste** | six date buckets, overdue folded into Aujourd'hui | — |
| **Tableau** | one board, grouped by Personne, Statut or Échéance | writes the field it is grouped by |
| **Calendrier** | hand-built month grid and week agenda | changes `due_on` |

Dragging within any column reorders it. A mouse drag only starts after 4px so a
click stays a click; a touch drag needs a long press so lists still scroll.

`?` in the app lists every keyboard shortcut.

## Layout

```
app/            routes; (app) is the authenticated shell
components/     task/, views/, shell/, ui/ (owned shadcn primitives)
lib/            store, time, sound, parsing, drag, copy — the load-bearing parts
supabase/       migrations, applied in order
scripts/        verify-logic.mjs, verify-store.mjs, verify-db.mjs, verify-invites.mjs
docs/           the original specification, still the source of truth
reference/      the spec's reference implementations, copied into lib/
DECISIONS.md    why anything non-obvious is the way it is
```

Two rules the code holds to everywhere: every user-facing string comes from
`lib/copy.ts`, and every calendar-day calculation goes through `lib/time.ts`.
Both have been broken in the past and both broke quietly.

## Verifying

```bash
npm run typecheck
npm run lint
npm run build
npm run verify          # both suites below
```

`npm run verify:logic` runs 62 assertions with no network: date buckets,
Montreal instants across both DST offsets, streaks, the French parser, composer
autocomplete, board grouping and fractional ordering. The invariant worth
knowing about is the round trip — dropping a card on a date column has to land
it in that same column, and if `firstDayOfBucket` and `bucketOf` ever disagree
the card visibly jumps the moment you let go.

`npm run verify:store` runs the real optimistic store against a stubbed network:
optimism, rollback on failure, local precedence over realtime echoes, and undo.
It is the file everything else depends on and the only one the other two suites
cannot reach.

`npm run verify:db` exercises what the app depends on but cannot assert about
itself: RLS, the signup and completion triggers, the last-admin guard, and
realtime delivery of all three event types. It creates throwaway users, deletes
them, and then verifies the cleanup rather than assuming it. Point it at a
project you are willing to write to.

`npm run verify:invites` covers the membership rules the server actions enforce:
who may invite, revoke and remove, that a duplicate invite is refused, that the
last admin cannot be removed or demoted, and that removing someone leaves their
tasks alone — a decision from `docs/03` that is easy to break later and
invisible when broken.

Two of the bugs it now covers — realtime never delivering deletions, and
completions disappearing after 8pm Montreal — survived typecheck, lint and a
clean build. Static checks were green the entire time they were broken.

## Migrations

Applied in order against the Supabase project.

| | |
|---|---|
| `0001_init` | schema, RLS, triggers, realtime publication |
| `0002_doing_status` | `En cours`, plus the trigger rewrite a third status needed |
| `0003_tasks_replica_identity_full` | makes realtime DELETE reach the other person |
| `0004_last_admin_guard` | the last admin cannot be removed or demoted |
| `0005` / `0006` | pin the final `search_path`, close the trigger-function RPCs |
| `0007_rls_policy_tuning` | hoist `auth.uid()`, narrow the admin write policy |

## Still open

- The four values in `docs/08-satisfaction.md` § 8.9 are at their defaults. They
  cannot be set correctly in advance; use the app for a day and tune by feel.
- Supabase's built-in mailer is test-grade and rate-limited. Point it at real
  SMTP before relying on invitations.
- A write that fails while offline reverts rather than queueing. Deliberate —
  the reasoning is in `DECISIONS.md`.
