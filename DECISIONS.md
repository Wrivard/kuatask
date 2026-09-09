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

**All four are still at their starting values, and that is not a decision — it
is an unfinished step.** § 8.9 says these cannot be specified correctly in
advance and must be set by feel after a full working day of real use. Nobody has
used this app yet, so tuning them now would be inventing numbers.

| Value | Current | Symptom if wrong |
|---|---|---|
| Row hold before collapse | 900ms (`COMPLETION.holdBeforeCollapse`) | Too short reads as deletion; too long feels stuck |
| Tone gain | 0.09 (`GAIN` in `lib/sound.ts`) | Too loud is embarrassing in public; too quiet is pointless |
| Scale reset window | 20s (`RESET_MS` in `lib/sound.ts`) | Too short never builds a run; too long climbs during unrelated work |
| Checkmark draw duration | 180ms (`COMPLETION.checkDrawDuration`) | Too fast is a pop; too slow is sluggish |

Replace this table with the tuned numbers and a sentence each on why.

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

---

## Phase 2 — core loop

### Three corrections to the reference code

The reference files are load-bearing and were copied rather than rewritten, but
three things did not survive contact with the app.

**`pending` is ref-counted, not a `Set`.** The modal saves on every change, so a
row routinely has two or three overlapping writes. With a `Set`, the first
response to land cleared the flag while the others were still open, and the next
realtime echo overwrote newer local state — the exact flicker local precedence
exists to prevent. Now a `Map<string, number>`.

**`toggleTask` sets `completed_by` optimistically.** It is server-owned and the
trigger overwrites it milliseconds later, but "Terminé aujourd'hui", the streak
and the partner dot all read it, and none of them may wait for a round trip.

**`parse-fr` numeric dates now roll to next year.** `"faire le suivi 15/03"`
resolved to 2026-03-15 — six months in the past on the day it was tested — while
`"15 mars"` correctly rolled to 2027. A task that reads as overdue the instant it
is captured is worse than one with no date. The two branches now agree.

`deleteTask`'s undo also had an unchecked insert. The insert policy requires
`created_by = auth.uid()`, so undoing a delete of the other person's task fails
silently and leaves a row on screen the server does not have. It now rolls back
and surfaces the error.

### Composer chip dismissal restores date words

Dismissing a date or time chip re-appends the matched text to the title, because
the parser being wrong means the words belonged to the title — "Appeler Marie
demain matin" must not silently lose "demain". They are appended rather than
slotted back in place; word order suffers slightly, losing the word does not.
`#label`, `@handle` and `!` are notation rather than prose, so they stay
stripped.

### Modal text fields debounce at 400ms

The store pushes an undo entry per mutation. A write per keystroke would bury the
20-entry stack under a single sentence of typing, so title and notes debounce
while every other field still writes immediately on change.

### parse-fr has no automated test coverage

`reference/README.md` asks for it and the seven required strings were verified by
running the parser directly, all seven passing. A committed test needs a test
runner, which is not in the locked stack — flagging rather than adding one.

---

## Phase 3 — shared

**The assignee filter is `string | null`, not a three-way enum.** `null` is Tout
and anything else is a user id, so "Moi" and the partner are the same code path
and adding a third person changes nothing. Persisted to `localStorage`, and a
saved filter pointing at someone no longer in the workspace is dropped on
hydrate rather than silently hiding every task.

**The completion hold watches store transitions rather than taking a callback
from the checkbox.** That is what gives a task the other person completes the
same 900ms beat on your screen, which § 8.7 asks for. The partner's dot pulses
when `completed_by` is not you; no tone, because sound is reserved for your own
actions.

**Removing a member touches `workspace_members` only.** Their tasks stay and show
no assignee. Deleting someone's tasks when they leave loses work.

**The invite rolls back its own row on send failure.** Without it a failed send
leaves a pending invite nobody was told about and no way to see the send failed.

**Service role key is used in exactly one file**, `settings/people/actions.ts`,
which is `'use server'`. Verified absent from `.next/static` after the build.

### Still owner-only — cannot be done through MCP

- The **French invite email template** (`docs/03-auth-invitations.md`) has to be
  set in the dashboard under Authentication → Email Templates → Invite user.
  Untested against a real address so far.
- Email auth settings and redirect URLs, as flagged at the end of Phase 1.

---

## Phase 4 — calendar

**Pointer events rather than HTML5 drag-and-drop.** One code path covers mouse
and touch, and touch gets no native dragging at all. Cells carry `data-day` and
the drop target is whatever `elementFromPoint` finds under the pointer. Touch
drags need a 350ms long-press first so the grid still scrolls.

**`reschedule` is a wrapper over `updateTask`,** not a second mutation path, so
undo, rollback and local precedence behave identically to every other write. A
drop onto the day a task already occupies is not treated as a mutation and does
not push an undo entry.

**Week mode snaps to the Monday of the anchor's week** rather than showing seven
days starting from the anchor, which would have drifted as you paged by month.

---

## Phase 5 — satisfaction

**The completion tone fires in the click handler, not in an effect.** § 8.1 puts
it at 0ms. An effect watching the store would land it a frame late and would
also fire for the other person's completions, which § 8.7 explicitly rules out.
`lib/completion.ts` holds tone, haptics and the toast so the checkbox and the
`X` shortcut behave identically.

**Rapid completions collapse into one toast** keyed by a fixed sonner id, and
undo replays the whole batch rather than only the last one. The batch resets
after the 5s toast window.

**The clear-out triggers by mounting.** `ClearOut` renders only while your
today-assigned open count is zero and something was completed today, so the
sweep plays once on the transition and never again on a reload of an already
clear day. The hold set is checked too, so the sweep waits for the 900ms beat
instead of racing it.

**`A` and `D` cycle instead of opening a picker.** The keyboard map names them
"reassign" and "set due date" without saying how. For two people, cycling
`Personne → moi → partenaire` and `Aujourd'hui → Demain → Lundi → pas de date`
is the fast path, and `D` reuses the modal's own quick options so the two agree.

**Row focus is one flat sequence across all six sections.** `J`/`K` cross
section boundaries because the list reads as one list, not six. Focus is set on
hover as well, so a mouse user can hover a row and press `X`. A focused row that
leaves the list takes the focus with it rather than stranding it.

**The palette talks to the views over two custom DOM events**, not the store.
It needs to focus the composer and open a task, both of which belong to the
view. Putting them in the store would have moved view state into the data layer;
a context would have threaded a provider through every route for two messages.

**Theme toggling writes the same `kua-theme` key the inline boot script reads,**
so the palette and the no-flash script cannot disagree.

### Measured

Route JS at ~66 KB gzipped for `/` and `/calendar` against a 200 KB budget
(309 KB raw × the 0.215 compression ratio measured across the built chunks).

### Not verifiable without a browser session

The tone, the haptics, the 900ms hold, the sweep and the drag all build and
typecheck, but none of them have been seen or heard. § 8.9 tuning stays at its
starting values until Phase 6, which is explicitly a by-feel pass.

---

## Phase 6 — polish, and what is still open

### Contrast: a genuine conflict between two spec documents

`docs/04-design-system.md` fixes the palette by hex. `docs/10-quality-bar.md`
sets contrast gates that several of those values fail. The quality bar names
`--color-fg-faint` as "the one to verify", which reads as the author expecting it
to be checked and fixed, and calls its section non-negotiable — so it was treated
as binding and the tokens moved. Measured against all three surfaces of each
theme (bg, surface, surface-hover):

| Token | Was | Worst ratio | Now | Worst ratio |
|---|---|---|---|---|
| dark `fg-faint` | `#5A5A5A` | 2.74 | `#7F7F7F` | 4.52 |
| dark `fg-muted` | `#8F8F8F` | 5.60 | `#ABABAB` | 7.88 |
| light `fg-faint` | `#999999` | 2.73 | `#707070` | 4.50 |
| light `fg-muted` | `#666666` | 5.22 | `#545454` | 6.89 |
| light `accent` | `#1F9D63` | 3.32 | `#197F50` | 4.55 |
| light `danger` | `#D93636` | 4.44 | `#D03434` | 4.52 |

`fg-muted` moved along with `fg-faint` on purpose: lifting only the faint level
would have collapsed it into muted and destroyed the three-step ramp the design
depends on. The two are now 1.7:1 apart in dark and 1.5:1 in light, which stays
legible as a hierarchy.

**New token `--color-control`** (`#636363` dark, `#8D8D8D` light, both 3:1) for
the boundary of an interactive control — the checkbox at rest, the composer, the
inputs. `--color-border` stays a true hairline for decorative dividers, which
WCAG 1.4.11 exempts. The distinction matters: an 18px checkbox outlined at 1.46:1
was genuinely hard to find on screen, while a row divider at 1.26:1 is exactly
the restraint the Vercel/Supabase direction asks for. Hairlines were left alone.

The progress ring's track also moved to `--color-control`, because the unfilled
part of the ring is what carries "how much is left" and it was invisible.

### Reduced motion

The global CSS media query only reaches CSS transitions; `motion/react` animates
in JavaScript and ignores it. Three components were animating through it and now
read `useReducedMotion` explicitly: the progress ring (arc lands instantly), the
assignee dot (the partner pulse becomes an opacity blink so the signal survives),
and the list section (collapse becomes a plain crossfade). The checkbox, row and
clear-out already honoured it.

### All day-derived dates now go through lib/time.ts

Added `nowDate()` and `dayOfMonth()` so components never construct a `Date`. The
three remaining `new Date()` calls are in `lib/store.ts` on `created_at`,
`updated_at` and `completed_at` — `timestamptz` columns are absolute instants, so
UTC is correct there, and the code says so.

### Mobile

Bottom bar with four items, `env(safe-area-inset-bottom)` padding so it cannot
sit under the home indicator, 44px minimum targets, 52px touch rows, and content
padded to clear the fixed bar. No keyboard hints render on touch. The composer
sits at the top of the content column, so the software keyboard opens below it.

### Security, re-verified on a clean production build

- Service role key absent from the **entire** `.next` output, not just
  `.next/static` — it is read from `process.env` at runtime and never inlined
- `NEXT_PUBLIC_*` is exactly the URL, the anon key and the site URL
- Anonymous REST reads return `[]` on all five tables

### Measured

- App route JS ~66 KB gzipped against a 200 KB budget
- Typecheck, lint and production build clean; no `any`, no `@ts-ignore`
- Every route gates correctly without a session

### NOT done — these need hardware or a human

Listed plainly because Phase 6 is where they belong and they are not finished:

- **The four § 8.9 values are untuned.** See the table above.
- **No real-device pass.** The bottom bar, safe areas, long-press drag and the
  software keyboard are written to spec and have never run on a phone. The spec
  says to test long-press drag on a real device, not a simulator.
- **Cold load on 4G and CLS are unmeasured.** Both need a browser profile against
  a deployed URL.
- **Nothing has been seen or heard.** The tone, the 900ms hold, the sweep, the
  ring, the partner pulse — all typecheck and build, none have been observed.
- **`docs/12-definition-of-done.md` items 1–8 are unverified.** Every one says
  "verify by doing it". Item 5 in particular wants the system clock moved into
  both DST offsets, and item 8 is the actual acceptance test.
- **Not deployed.** The owner said they would push to Vercel themselves.

---

## Post-Phase-6 — a real timezone bug, caught by verification

Running the data layer against the live project as a genuinely authenticated
throwaway user (20 assertions, all passing, project restored to the seeded state
afterwards) surfaced the exact bug class `CLAUDE.md` warns is the most common way
this app breaks.

The completion trigger returned `completed_at = 2026-09-09T00:13:14Z`. That
instant is **20:13 on 8 September in Montreal**. Three call sites were deriving
the day with `completed_at.slice(0, 10)`, which reads the **UTC** date:

- `list-view.tsx` — the `Terminé aujourd'hui` footer
- `list-view.tsx` — the clear-out's completed count
- `progress-ring.tsx` — today's done count

**Symptom:** from 20:00 Montreal in summer (19:00 in winter), every task you
completed would drop out of `Terminé aujourd'hui`, stop counting toward the
progress ring, and — worst — set the clear-out's `done` count to zero, so the
one orchestrated moment in the app could never fire. The brief says these two
check the list in the evening on a phone, so this broke exactly when they use it.

Fixed with `instantToDay()` and `isTodayInstant()` in `lib/time.ts`, which
convert through `TZDate` the way `computeStreak` already did. `computeStreak` was
refactored onto the same helper so there is one conversion, not two.

Verified against seven instants spanning both DST offsets: the old string slice
was wrong in five of them, every one an evening completion. The new helper is
correct in all seven.

Two lessons worth keeping:

1. `due_on` comparisons are safe because both sides are bare Montreal days.
   `completed_at` comparisons are not, because it is an instant. The distinction
   is invisible at the call site — hence the named helpers.
2. This was unreachable by typecheck, lint or build. It needed a real row from
   the real trigger.

---

## Post-deploy — two auth bugs found by actually using it

### The callback only understood one of three link shapes

GoTrue's auth logs showed two successful `Login` events with no session ever
reaching the app. The cause: `/auth/callback` read only `?code=`, the PKCE shape
our own `/login` form produces because `createBrowserClient` sends a
`code_challenge`.

Links that did **not** start with a PKCE challenge — the dashboard's "Send magic
link", `admin/generate_link`, and password recovery — come back through GoTrue's
`/verify`, which redirects with the tokens in the **URL fragment**. A fragment is
never transmitted to the server, so a route handler cannot read it no matter how
it is written. The handler saw no `code`, fell through, and sent the user to
`/login?error=expired` — an expired-link message for a link that had just
succeeded.

Now handled in all three shapes:

| Shape | Where it comes from | Handled by |
|---|---|---|
| `?code=` | our `/login` form (PKCE) | `exchangeCodeForSession` |
| `?token_hash=&type=` | templates using `{{ .TokenHash }}` | `verifyOtp` |
| `#access_token=…` | dashboard, `generate_link`, recovery | `/auth/confirm`, client-side |

`/auth/confirm` is a client page because that is the only place the fragment
exists. The fragment survives the redirect from `/auth/callback` because the
target URL carries none of its own. It is a public path in middleware.

### Missing env vars took down every route, including /login

The Vercel deploy returned `MIDDLEWARE_INVOCATION_FAILED` on `/`, `/login` and
`/auth/confirm` alike. `createServerClient(undefined!, undefined!)` throws, and
because the matcher covers every path, one missing environment variable blacked
out the entire site — including the one screen that needs no session.

Middleware now checks for the URL and anon key first and, if either is missing,
logs a named error and passes the request through untouched. Degrading is safe
here: the security boundary is RLS, and this doc already describes the
middleware check as a UX convenience rather than the guard. A misconfigured
deploy should be diagnosable, not a wall.

---

## Views, drag, and the production blocker

### Three views, not five

`Liste · Tableau · Calendrier`. The request was for kanban, list, calendar,
"etc." while staying minimalist, with three different drag behaviours. Five
screens would have delivered the features and lost the minimalism.

**The board is one component with a grouping switch**, because each grouping
answers a different question with the same gesture, and the column you drop into
is always the field you are editing:

| Grouping | Drop writes | What it is |
|---|---|---|
| Personne | `assignee_id` | the "one column each" view, with drag-to-reassign |
| Statut | `status` | the kanban |
| Échéance | `due_on` | the list's buckets laid sideways |

That covers "drag in the list to change assignee" without a fourth screen: the
board grouped by Personne *is* the two-lists-side-by-side view. Grouping by
person ignores the Tout/Moi lens on purpose — the columns already separate the
two of you, so the filter could only blank one out.

**A dragged completion routes through `useToggleWithFeedback`**, the same path
the checkbox uses, so it plays the tone and the full 8.1 sequence. A completion
must feel identical however it is triggered.

### One drag implementation, two thresholds

The calendar's inline pointer logic moved to `lib/drag.ts` and both views use it.
Targets declare themselves with `data-drop-target`, so the drop is whatever sits
under the pointer.

Two thresholds exist because a card has three jobs and one pointer:

- **mouse drags begin only after 4px of movement**, so a click stays a click and
  a card can still be opened by clicking it. The previous calendar code started
  a drag on pointerdown, which made click and drag fight each other.
- **touch drags still need a 350ms long press**, so lists keep scrolling.
- `Escape` cancels a drag in flight and drops nothing.

### Open question — a real kanban needs a third status

`status` is `todo | done`, so the Statut board is two columns. Adding `doing`
would give À faire · En cours · Terminé. Not done unasked: it changes the
database, and Postgres enum values are painful to remove once added. One
migration and roughly ten lines of UI whenever the owner says yes.

### Performance

`TaskRow` and `BoardCard` are `React.memo`. Every store write replaces the tasks
array, so without it each keystroke in the modal and each realtime event
re-rendered every row. Task identity changes only when that task changes and the
callbacks are stable setters, so the memo actually holds.

---

## The production outage, in order

Three separate faults stacked, each hiding the next.

1. **`MIDDLEWARE_INVOCATION_FAILED` on every route.** `createServerClient` threw
   on undefined env vars and the matcher covers every path, so one missing
   variable blacked out even `/login`. Fixed by checking config first and passing
   through with a named error. RLS is the security boundary; this check is
   documented as a UX convenience, so degrading beats a wall.

2. **The build then started failing, silently.** The config guard added with
   `/api/health` threw *before* `await cookies()`, so Next never saw a dynamic
   API, tried to prerender `/no-access`, and failed the whole build. Two
   deployments failed while the app kept serving an older bundle — which is why
   fixes appeared not to take. Reproduced locally by building with `.env.local`
   removed. `cookies()` is now awaited first; that ordering is load-bearing.

3. **The env vars were never set.** `/api/health` on the live deployment reports
   `null` for all four. Nothing else can be verified in production until they
   exist, and because `NEXT_PUBLIC_*` values are compiled in, they must be
   present *before* a build, not merely before a redeploy.

The lesson worth keeping: a missing configuration value should break a request,
never a build, and never every route at once.

---

## The third status — approved and shipped

`task_status` gained `doing`, so the Statut board is À faire · En cours ·
Terminé. Migration `0002_doing_status.sql`.

**The trigger was the dangerous part.** It was written for a two-value enum and
fired only on the exact pairs `todo->done` and `done->todo`. A third value broke
it in both directions: `doing->done` would have left `completed_at` null, so a
completed task would never appear in Terminé aujourd'hui, never count toward the
ring and never break a streak; `done->doing` would have left a stale completion
stamp on an open task. Both now key off `'done'` itself.

**Every count that meant "not finished" was written as `status === 'todo'`** and
would have silently dropped in-progress work: the sidebar buckets, the progress
ring, the clear-out's open count, the palette's task list, and the list's own
bucketing. All now test against `'done'`. `toggleTask` keys off `'done'` too, so
a task that is `doing` completes rather than falling back to `todo`.

**Only crossing the done boundary makes a sound.** `useSetStatusWithFeedback`
plays the completion tone into `done`, the lower tone out of it, and nothing at
all between À faire and En cours. Sliding along the workflow is bookkeeping, not
an achievement, and a tone there would cheapen the one that matters.

**Enum order is not workflow order.** `doing` was appended, so it sorts last.
Every consumer orders columns explicitly rather than trusting the enum.

Reachable three ways — dragging on the board, the modal's status field, and `S`
on the focused row — and shown in the list and calendar as an accent-outlined
chip. A task in progress is still unchecked; only `done` changes the checkbox.

Verified against the live database with a throwaway invited user: all eight
transitions behave, an unknown status is rejected by the enum, and the project
was restored to its seeded state afterwards.

---

## Composer autocomplete

`docs/06-views.md` specifies that `#label` completes from existing labels and
`@person` from members. Neither existed. Both now do, in `lib/suggest.ts`.

Labels rank by frequency, which is the point: thirty client tags otherwise
become thirty-five spellings of the same five clients.

**Suggestions borrow Enter only while the list is open.** Capture speed is the
composer's whole reason to exist, so a picker that permanently swallowed Enter
would cost more than it saves. Escape closes the list without touching the text,
and the mouse path fires on `mousedown` so the input never loses focus first.

Only the token under the cursor counts, and only while it is still being typed —
a finished tag followed by a space is left alone, and a `#` inside a word is not
a sigil. Completing mid-line reuses the existing space instead of leaving a gap.

## Board cards were pointer-only

They had a click handler, no role, no tab stop and no Enter. Now operable from
the keyboard. Dragging keeps its keyboard equivalents in the list — `S` for
status, `A` for people, `D` for dates — so no mutation is mouse-only.

---

## Production, configured

The four environment variables were never in the Vercel project at all —
`vercel env ls production` returned "No Environment Variables found". Added via
the CLI to Production scope, then deployed with `--force` so the build could not
reuse a cached bundle compiled without them.

`NEXT_PUBLIC_SITE_URL` is set to `https://kuatask.vercel.app`, not localhost.
That value is what `signInWithOtp` sends as `emailRedirectTo`, so a localhost
value here would have sent every production login to the developer's machine.

**Verified on the live deployment**, not locally:

- `/api/health` reports `ok: true` with all four present
- `/`, `/board` and `/calendar` redirect to `/login`; `/login` serves 200
- the service role key is absent from all 14 client chunks; the anon key is
  inlined, which is correct — it is public by design

### One dashboard setting still outstanding

Supabase does not honour `https://kuatask.vercel.app/auth/callback` yet. Asking
GoTrue for a link with that `redirect_to` returns one pointing at
`http://localhost:3000` instead — it silently falls back to Site URL when a
redirect target is not allowlisted, so production logins would land on the
developer's machine and no session would ever reach the deployed app.

Fix, in Authentication → URL Configuration:

- Site URL → `https://kuatask.vercel.app`
- Redirect URLs → add `https://kuatask.vercel.app/**`, keeping
  `http://localhost:3000/**` so local development still works

There is no API for this in the Supabase MCP server and the Management API needs
a personal access token, so it cannot be done from here.

---

## Realtime, actually tested

Phase 3's central claim — "a task completed in one browser animates in the
other" — had never been exercised. Testing it with the real client library, a
real member session and the same channel shape as `lib/realtime.ts` found one
genuine bug and one false alarm.

**DELETE never reached the other person.** The app subscribes with
`filter: workspace_id=eq.<id>`. Under the default replica identity a DELETE's
old record carries only the primary key, so there is no `workspace_id` for that
filter to match and Supabase drops the event. Proven by subscribing twice at
once — DELETE arrived on an unfiltered control channel and not on the filtered
one the app uses. INSERT and UPDATE were never affected, because their new
record carries every column.

Symptom: one of them deletes a task and it stays on the other's screen until a
reload. Fixed by `alter table public.tasks replica identity full`
(migration 0003). The cost is a fuller WAL record on update and delete; at two
people and hundreds of rows that is nothing. Re-verified afterwards: INSERT,
UPDATE and DELETE all arrive on the app's own filtered channel.

**The INSERT failure in the first run was a test artifact, not a bug.** Writing
immediately after the channel reported `SUBSCRIBED` raced the replication
starting up. With a short settle first, INSERT arrives every time. Worth
recording so nobody "fixes" a bug that is not there — the app subscribes once on
mount and stays subscribed, so it never sits in that window.

Also confirmed in passing: the UPDATE payload carries the trigger's
`completed_at`, which is what lets the partner's row animate with the right
completion time rather than waiting for a refetch.
