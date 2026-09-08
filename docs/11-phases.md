# 11 — Build phases

Ship something that runs at every phase. Do not build ahead into the next one.

---

## Phase 0 — Plan

No code.

Restate in your own words: the data model, the completion interaction, and the optimistic data flow. List every assumption you are making, in a `DECISIONS.md` at the repo root.

Ask **only** the questions that would change the schema or the auth model. Two things you must ask for and must not invent:

1. The two work email addresses for seeding the admin invites
2. The Supabase project URL, anon key, and service role key

Then proceed without waiting on anything else.

**Done when:** `DECISIONS.md` exists and the two blocking questions are asked.

---

## Phase 1 — Foundation

- Next.js 15 + Tailwind v4 + shadcn initialized
- Design tokens from `docs/04-design-system.md` in `globals.css`, both themes, no flash on load
- Geist wired
- Supabase clients (browser, server, middleware)
- `0001_init.sql` applied, workspace and admin invites seeded
- Database types generated
- Magic link login, `/auth/callback`, session refresh in middleware
- `/no-access` screen
- App shell: sidebar, header, empty content area

**Verify:** Both work emails can request a link, click it, and land in an empty shell. A third address lands on `/no-access` and can read nothing from the database.

---

## Phase 2 — Core loop

The phase where it becomes usable.

- `lib/time.ts` in place, all Montreal logic centralized
- Zustand store with hydration and optimistic `create` / `update` / `toggle` / `delete`
- List view with the six sections, correct bucketing, overdue folded into today
- Task row: checkbox, title, label chip, importance dot, time, assignee dot
- **The full 8.1 completion sequence**, including the 900ms hold and the collapse
- Composer with French parsing (`reference/parse-fr.ts`), chips, instant clear on Enter
- Task modal, save-on-change, no save button
- `lib/copy.ts` with everything from `docs/09-copy-fr.md`

**Verify:** You can capture ten tasks in under a minute, without the mouse, and completing one feels right. Nothing shows a spinner. A task due today still says "Aujourd'hui" at 11pm Montreal.

---

## Phase 3 — Shared

- Realtime subscription on `tasks`, filtered by workspace
- Reconciliation with local precedence — no flicker on your own writes
- Assignee filter (`Tout` / `Moi` / partner), persisted
- Identity dots per user
- Cross-user completion animation with the partner dot pulse
- `/settings/people`: member list, roles, remove (with last-admin guard), invite form, pending invites, revoke
- Invite server action + French Supabase email template, tested against a real address

**Verify:** Two browsers, two accounts. A task completed in one animates in the other within a second, with no flicker on either side. A fresh address receives an invite email and lands directly in the workspace.

---

## Phase 4 — Calendar

- Month grid, hand-built, mono numerals, today accent, three tasks per cell plus `+N`
- Day side sheet with full rows and a pre-dated composer
- Drag to reschedule, optimistic, with target-cell highlight
- Week agenda toggle
- Keyboard: arrows for months, `T` for today

**Verify:** Month navigation is instant with no network request. Drag-reschedule works with a mouse on desktop and with long-press on a real phone.

---

## Phase 5 — Satisfaction

The phase that decides whether the app gets used. Do not compress it.

- `reference/sound.ts` wired: rising pentatonic run, 20s reset, lower tone on uncheck, persisted toggle
- Progress ring in the header, spring-animated both directions
- Undo stack, `⌘Z`, undo toast, collapsing multi-completion toast
- The clear-out moment: single light sweep, ring fill, settled state, rotating copy
- Streak in the sidebar footer and the clear-out state
- Full keyboard map and row focus model
- Command palette with all five groups
- `?` shortcut sheet

**Verify:** Completing five tasks quickly plays a rising phrase and never shows a spinner. The whole flow — create, assign, date, complete, undo — runs without the mouse.

---

## Phase 6 — Polish and tuning

- Mobile pass on a real device: bottom bar, tap targets, safe areas, software keyboard, long-press drag
- `prefers-reduced-motion` everywhere
- Light theme finished
- Accessibility sweep: focus rings, live region, checkbox semantics, contrast in both themes
- Performance against the budgets in `docs/10-quality-bar.md`
- Grep the production bundle for the service role key
- Deploy to Vercel with production env vars and redirect URLs

**Then use the app for a full working day and fix what annoys you.** Tune the four values in section 8.9 by feel and record the final numbers in `DECISIONS.md`.

**Verify:** `docs/12-definition-of-done.md`, all eight.
