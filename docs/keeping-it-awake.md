# Keeping the project awake

Supabase pauses a free project after **seven days without activity**. For two
people that is a long weekend plus a quiet Monday, and it is not a warning — the
project stops answering until somebody restores it from the dashboard.

Before this, that Monday looked like a broken login: `getUser()` fails, the visit
lands on `/login`, sending a link fails, and the screen says « Vérifie l'adresse »
about an address that was correct. The login screen now asks `/api/health` and
names the real cause, which is a much better failure — but a failure that never
happens is better than a failure explained well.

## The cron

`vercel.json` schedules one request a day:

```json
{ "path": "/api/health", "schedule": "0 12 * * *" }
```

12:00 UTC, so roughly 07:00 or 08:00 in Montreal depending on the season —
before either of these two opens the app, which is the point. Vercel's cron
schedules are UTC and have no timezone option, and the exact hour does not
matter: what matters is that fewer than seven days ever pass between two of
them.

`/api/health` is the right endpoint because it already makes a real PostgREST
query — an anonymous count against a table behind RLS. That is genuine database
activity, which is what resets the clock. A route that only read environment
variables would keep Vercel busy and let Supabase fall asleep anyway.

It needs no `CRON_SECRET`. The endpoint is public by design (a configuration
probe has to answer when configuration is what is broken), it takes no input,
and it reveals nothing but whether things are up.

## What it does not do

It does not stop the project being paused **manually**, and it does not survive
the Vercel project being deleted or the cron being disabled. If the app ever
shows « la base de données ne répond pas », the fix is the dashboard: restore
the project, reload the page. Nothing is lost by a pause — it is a stop, not a
deletion.

It also does not replace backups. There are none on this plan; `npm run backup`
is the answer to that, and `supabase/README.md` is blunt about it.

## Checking it is working

```bash
curl -s https://kuatask.vercel.app/api/health | jq '.database'
```

`{"ok": true, "ms": 400}` means the database answered.

**The cron itself has not been confirmed from here.** Vercel registers crons from
`vercel.json` on a production build, and the build went out — but the API token
available while this was written could not read the project, so whether the job
is actually scheduled is unverified. It shows under the project's **Cron Jobs**
tab in the dashboard; if it is not listed, the plan may not allow it or the
config may not have been picked up.

On Hobby, crons run roughly once a day rather than at a guaranteed minute. That
is fine for this: the requirement is that fewer than seven days pass between two
runs, not that one lands at 07:00.

A run that returned 503 means the ping happened and the database did not answer,
which is the one case worth looking at.
