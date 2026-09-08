# 00 — Brief

## The product

A shared task manager for two people who run a web agency together. They assign each other small tasks, with due dates, and see the same list.

## The users

Two co-founders of a Quebec web agency, both technical, both heavy keyboard users, both on desktop most of the day and phone in the evening. They work in French. A third person may be invited later, so the model is a workspace with members and roles, not a hardcoded pair.

## The problem being solved

Micro-tasks get agreed on in conversation — "call the supplier back", "send the client the revised mockup", "renew the domain" — and then disappear. There is no shared surface, so each person holds their own half in their head and both halves leak. The volume is the issue, not the complexity. Individually every one of these is two minutes of work.

That shapes the product: **capture has to be nearly free, and completion has to be rewarding.** A tool that takes twenty seconds to add a task will not be used for a two-minute task.

## The bet

The tool succeeds or fails on habit, not features. Two people will only keep a shared list alive if opening it is pleasant and clearing it is satisfying. So the build priority is inverted from a normal CRUD app:

1. How completion feels (`docs/08-satisfaction.md`)
2. How fast capture is (the composer, `docs/06-views.md`)
3. How instant everything is (the data layer, `docs/05-architecture.md`)
4. Everything else

## Non-goals for v1

Do not build these. Do not stub UI for them. Do not leave a disabled button.

- Subtasks, dependencies, Gantt charts, time tracking, comment threads
- Recurring tasks
- File attachments
- Push notifications, email digests, Slack integration
- A native mobile app — but the web app must be excellent in a mobile browser
- Any AI feature
- Onboarding tours, empty-state illustration sets, marketing pages
- Analytics dashboards, reporting, exports

Some of these are good ideas later. None of them are what makes two people open an app tomorrow morning.

## Deliberate scope decisions

**One "important" flag instead of priority levels.** Four-level priority is a bookkeeping tax that gets ignored. A binary flag is used.

**A free-text `label` field instead of a projects table.** The agency has around thirty clients. Typing `#client-name` in the composer is faster than picking from a dropdown, and autocomplete from existing labels handles the consistency. If projects need real structure later, the label data migrates cleanly.

**No archive, no trash.** Completed tasks stay in the table and collapse out of view. Deletion is real deletion with an undo window.

**Assignment is a single person, nullable.** Not a list. Two people do not need multi-assign.

## The acceptance test

Everything in `docs/12-definition-of-done.md` is verifiable. Item 8 is the actual bar:

> Clearing the day's last task feels good enough that you want to do it again tomorrow.

If that fails, the build is not done, regardless of the other seven.
