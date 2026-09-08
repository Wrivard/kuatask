# Decisions

Assumptions and choices made during the build. One line of reasoning each, so they are not silently reverted later.

Format:

```
## <date> — <decision>
<one or two sentences on why>
```

---

## Pre-build — from the spec

**Magic link instead of passwords.** For two users, passwords mean building reset, change, and strength validation to protect an account that already receives its own reset emails.

**Single fetch, client-side filtering.** Two people and hundreds of rows is kilobytes. Per-view queries would cost the instant view switching that the app's feel depends on.

**`due_on` is a `date`, not a `timestamptz`.** A due date is a Montreal calendar day, not an instant. Storing an instant makes "today" flip at 8pm in summer.

**One `important` boolean instead of priority levels.** Four-level priority is bookkeeping that gets ignored; a binary flag gets used.

**Free-text `label` instead of a projects table.** Typing `#client` beats picking from a dropdown of thirty. The data migrates cleanly if projects need real structure later.

**Overdue folds into Aujourd'hui.** A separate overdue section accumulates into a wall of failure that people learn to scroll past.

**No save button in the task modal.** Save-on-change matches Linear and Notion. A Save/Cancel pair makes the user responsible for a transaction they did not ask to open.

---

## Phase 6 — tuning values

Record the final numbers from § 8.9 here:

- Row hold before collapse: ___ms (started at 900)
- Tone gain: ___ (started at 0.09)
- Scale reset window: ___s (started at 20)
- Checkmark draw duration: ___ms (started at 180)

---

## Phase 0 — assumptions logged at plan time

These were decided rather than asked, per CLAUDE.md ("ask only questions that
would change the schema or the auth model"). Each is reversible; each is here so
it is not silently reverted later.

### Repository layout

**The build root is `kua-tasks-docs/kua-tasks-docs/`.** That folder already holds
the complete bundle — `CLAUDE.md`, `docs/`, `reference/`, `supabase/` — so it is
the repo root the specs describe. The outer `Kua Task Manager/` folder holds three
byte-identical strays (`CLAUDE.md`, `08-satisfaction.md`, `store.ts`), which look
like a partial copy from an interrupted `cp -r`.

**Not yet a git repo.** No `git init` run — waiting on confirmation of the root
before creating history in the wrong directory.

### Spec vs. reference mismatches — reference wins

`docs/05-architecture.md` publishes a store surface that differs from the working
code in `reference/store.ts`. CLAUDE.md says the reference files are load-bearing
and must not be rewritten, so the reference is treated as authoritative:

- **`hydrate()` takes no argument.** The doc shows `hydrate(wsId: string)`; the
  reference resolves the workspace itself from `workspace_members`. Keeping the
  reference version — it means the shell does not need to know the workspace id
  before mounting.
- **`reschedule(id, dueOn)` does not exist in the reference.** It will be added as
  a thin wrapper over `updateTask(id, { due_on })` when Phase 4 needs it, not
  invented as a separate mutation path. One optimistic code path, not two.
- **`applyRemote(type, row)` is two arguments,** not the single `RealtimeEvent`
  object in the doc.

### Data-layer assumptions

**`toggleTask` sets `completed_at` optimistically even though the column is
trigger-owned.** The optimistic value drives the UI for the few hundred ms before
the server value reconciles back. The reference already does this and comments it.

**Undo does not survive reload.** Stated in the architecture doc; recorded here
because it will look like a bug to someone who did not read it.

**Any member can edit or delete any task,** including tasks assigned to the other
person. Correct for two co-founders per the data-model doc. Revisit if a third
person joins as `member` rather than `admin`.

### Satisfaction-layer assumptions

**The § 8.9 values ship at their starting numbers** — 900ms hold, 0.09 gain, 20s
scale reset, 180ms checkmark draw — and are only tuned in Phase 6 after a full
day of real use, then recorded above.

**Sound stays enabled under `prefers-reduced-motion`.** Explicit in § 8.2 and
counterintuitive enough to be worth restating: they are unrelated preferences, and
sound is the accessible channel for someone who turned animation off.

### Deferred until their phase

Per "do not build ahead": no `reschedule`, no realtime wiring, no palette, no
sound, no streak until Phases 3–5 call for them. Phase 1 ships an empty shell that
runs.

---

## Phase 0 — Supabase provisioning

**Project `kua-tasks` (`ngececyvzuuixizilusy`), `ca-central-1`, org `Kua free`.**
Region is mandated by `docs/01-stack-setup.md` for Law 25 residency.

**`pokelister` was paused to make room.** The free tier caps active projects at
two *per user account across every org they own* — not per org — so creating a
second org would not have lifted it. Owner chose pokelister over kua-locale.
Reversible: restore from the dashboard when a slot frees up.

**Workspace `Küa` = `cb258476-fd4e-47b2-8be0-93165e3b6229`,** seeded with two
`admin` pending invites: `wrivard@kua.quebec`, `gberther@kua.quebec`. `invited_by`
left null, per the data-model doc's second option.

**`0001_init.sql` applied verbatim.** RLS confirmed on all five tables.

### Known advisory warnings — flagged, not fixed

Applying the migration as-is leaves three lint warnings. Recorded so a later
session does not "discover" and silently rewrite the schema:

- **`touch_updated_at` has a mutable `search_path`.** A real gap — `is_member`
  and `is_admin` both pin `search_path = public` and this one does not. Lower
  severity because it is `SECURITY INVOKER`, not `DEFINER`. Worth a `0002`
  migration; not fixed here because the spec says apply `0001` as-is.
- **`handle_new_user` exposed via RPC.** Effectively a false positive: it returns
  `trigger`, and PostgREST cannot invoke trigger-returning functions.
- **`is_member` / `is_admin` callable by `anon` and `authenticated`.** Both derive
  from `auth.uid()`, so anon always gets false and a signed-in user can only learn
  their own membership, which they already know. Inherent to the spec's design.

### Not doable through MCP — owner action required

- **Service role key.** No MCP tool exposes it. Placeholder left blank in
  `.env.local`.
- **Auth configuration:** enable email auth, disable signup email confirmations
  (invites carry their own token), set Site URL and redirect URLs for
  `http://localhost:3000` and later the production domain. All dashboard-only.

---

## Phase 1 — foundation

**Build root flattened to the repo root.** The bundle arrived nested two levels
deep (`kua-tasks-docs/kua-tasks-docs/`). Contents were moved up and the three
byte-identical strays in the outer folder (`CLAUDE.md`, `08-satisfaction.md`,
`store.ts`) deleted after diffing them against their bundle copies.

**Next pinned to 15 via `create-next-app@15`.** `latest` now resolves to 16.3.4;
the stack is locked to 15, so the pin is deliberate. Result: Next 15.5.25,
React 19.1.0, Tailwind v4.

**`reference/` excluded from `tsconfig.json`.** Those files import `@/lib/store`
and are written to be copied into `lib/` and adapted per phase. Compiling them
in place produced four errors for code that is not in the app yet.

### shadcn deviations from the spec command

The CLI has changed shape since the spec was written. `--base-color` no longer
exists; init now requires a base (`radix`) and a preset. Used `-b radix -p nova`
— nova is the Lucide + Geist preset, which is what the stack doc asks for.

**shadcn's `accent` role was remapped to `hover`.** The design system reserves
accent green for exactly three things (completed state, focus ring, calendar
today). shadcn uses `accent` for menu hover backgrounds, which would have turned
every dropdown hover green. Renamed those 18 utility usages across
`dropdown-menu.tsx` and `select.tsx` to `bg-hover` / `text-hover-foreground`,
wired to `--color-hover`. Components are owned, not imported — this is the kind
of edit that implies.

**Transitive dependencies came in with shadcn** that are not in the stack table:
`cn` (shadcn's own clsx+tailwind-merge replacement, from the shadcn-ui org),
`radix-ui`, `cmdk`, `class-variance-authority`, `react-day-picker`,
`tw-animate-css`, `next-themes`. All pulled by the spec's own `shadcn add`
command, so they are in scope rather than additions.

**`next-themes` is installed but unused.** shadcn's `sonner.tsx` imported it for
theme detection. Replaced with a reader for the class the inline script puts on
`<html>`, so there is one source of truth for the theme and no provider.

### Theme

**Dark on `:root` and `.dark`, light on `.light`.** `<html>` always carries
exactly one. shadcn's `dark:` variant expects a `.dark` class, and the spec
writes light as a `.light` override, so both are satisfied.

**No flash on load** comes from a blocking inline script in `<head>` that reads
`localStorage['kua-theme']` before first paint and defaults to dark.

**`--radius: 10px`.** shadcn derives `sm`/`md`/`lg` at 0.6/0.8/1.0, which lands
exactly on the spec's 6px input, 8px task row, 10px modal.

### Copy

**`lib/copy.ts` was written in full now** rather than in Phase 2 where the plan
puts it. The login and no-access screens are Phase 1 and need strings, and the
no-hardcoded-French rule applies from the first screen. It is inert data, so
writing it once beat writing half of it twice.

### Phase 1 shell is deliberately bare

Sidebar renders the workspace name only. The bucket links with live counts, the
assignee filter and the streak all need the store, and `/calendar` and
`/settings/people` do not exist until Phases 4 and 3. Linking to them now would
be the dead-control placeholder the brief bans. Phase 1 verifies as "an empty
shell", which is what it is.

### Verified

- `npm run typecheck`, `next lint`, `npm run build` all clean
- Service role key absent from `.next/static`
- Anonymous REST reads return `[]` on all five tables, `pending_invites`
  included — that is the one that would leak the two seeded addresses
- `/` and `/no-access` redirect to `/login` without a session
