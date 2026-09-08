# Küa Tasks — agent instructions

You are building this app. Read this file first, then `docs/00-brief.md`, then work the phases in `docs/11-phases.md`.

## What this is

A two-person shared task manager for a small Quebec web agency. Two admins assign micro-tasks to each other with due dates. It replaces the failure mode where small tasks get agreed on verbally and then forgotten.

**The product only succeeds if completing a task feels good.** Correctness is table stakes. `docs/08-satisfaction.md` is the primary spec; everything else is the substrate that makes it possible. If you have to trade polish somewhere, never trade it there.

## Reading order

| Doc | Read when |
|---|---|
| `docs/00-brief.md` | First. Mission, users, non-goals. |
| `docs/01-stack-setup.md` | Phase 1. Stack, install, env, Supabase project. |
| `docs/02-data-model.md` | Phase 1. Schema, RLS, triggers, seeding. |
| `docs/03-auth-invitations.md` | Phase 1 and 3. Magic link, invites. |
| `docs/04-design-system.md` | Phase 1, then keep open. Tokens, type, motion. |
| `docs/05-architecture.md` | Phase 2. File tree, store, optimistic layer, realtime. |
| `docs/06-views.md` | Phase 2 and 4. List, calendar, modal, composer. |
| `docs/07-keyboard.md` | Phase 5. Shortcuts, focus model, palette. |
| `docs/08-satisfaction.md` | Read early, build in Phase 5. The point of the app. |
| `docs/09-copy-fr.md` | Phase 2 onward. Every user-facing string. |
| `docs/10-quality-bar.md` | Phase 6, but check continuously. |
| `docs/11-phases.md` | Your execution plan. |
| `docs/12-definition-of-done.md` | Before you claim done. |

Ready-to-use files, do not rewrite from scratch:

- `supabase/migrations/0001_init.sql` — apply as-is
- `reference/time.ts` — all Montreal date logic
- `reference/sound.ts` — Web Audio completion tones
- `reference/motion.ts` — animation tokens
- `reference/parse-fr.ts` — French natural-language date parsing for the composer
- `reference/store.ts` — optimistic store with undo and realtime reconciliation

Copy these into `lib/` and adapt imports. They are load-bearing and were written to spec.

## Rules of engagement

**Stack is locked.** No substitutions, no additional dependencies beyond what `docs/01-stack-setup.md` lists. If you think something is missing, say so and wait rather than installing it.

**Ship at every phase.** Each phase in `docs/11-phases.md` ends with something that runs. Do not build ahead into the next phase.

**No placeholder UI.** Do not stub screens for features in the non-goals list. An unbuilt feature has no button.

**Every string comes from `lib/copy.ts`.** The UI is French (Québec, casual register). Code, identifiers and comments stay English. Never hardcode French text in a component.

**Timezone is `America/Montreal`.** Every day-bucket calculation goes through `lib/time.ts`. Never use the browser timezone, never use UTC dates for "today". This is the single most common way this app breaks.

**Optimistic by default.** No `await` sits between a user click and a visual change. The app has exactly one loading state: the initial skeleton. If you are writing a spinner, you are doing something wrong.

**Never expose the service role key to the client.** It is used only in server actions and route handlers.

## Handling ambiguity

Ask only questions that would change the database schema or the auth model. Everything else: make the call, note it in a `DECISIONS.md` at the repo root with one line of reasoning, and keep moving. The owner prefers a running app with documented assumptions over a questionnaire.

Two things you must ask for and must not invent:
1. The two work email addresses for seeding the admin invites.
2. The Supabase project URL and keys.

## Definition of done

`docs/12-definition-of-done.md` has eight checks. Number 8 is the real one: clearing the day's last task has to feel good enough that you want to do it again tomorrow. Verify by using the app, not by reading the code.
