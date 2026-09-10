# Optimisation audit

A pass over every part of the app looking for things that could be better. Each
item is a real observation, not a placeholder. Priorities:

- **P1** — a defect, or something that will actively annoy two people using this daily
- **P2** — a real improvement worth doing
- **P3** — worth knowing about; may never be worth the code
- **NO** — deliberately not doing it, with the reason

Items are marked `[x]` as they land. `docs/00-brief.md` lists non-goals; several
obvious-sounding ideas are refused below on those grounds, and that is a feature
of this list rather than a gap in it.

---

## A. Store, data flow and reactivity

1. [x] **P1** `applyRemote` skips any row with a local write in flight — including a remote DELETE. If your partner deletes a task while you are editing it, it lingers until the next resync.
2. [x] **P1** The undo stack holds closures over task snapshots captured at push time; after a resync those snapshots can describe a row that no longer exists. Each entry now carries a precondition alongside its inverse: it fires only while the field it would reverse still holds the value your action put there. So ⌘Z will not overwrite the date your partner just changed, will not re-toggle a task they already reopened, and will not resurrect one they deleted. An entry that fails its precondition is dropped and the press continues to the next live one, because a ⌘Z that stops dead is worse than one that skips. Five new assertions in `verify:store`, each of which fails if the precondition is removed.
3. [x] **P1** Every completed task is fetched forever. The payload grows without bound while the UI shows only today's completions.
4. **P2** `resync` refetches the whole workspace; it could ask only for rows changed since a timestamp.
5. **P2** Components subscribe to the whole `tasks` array, so any write re-renders every view that is mounted.
6. [x] **P2** `updateTask` sends the full patch even when a field is unchanged. The patch is now narrowed to the fields that actually differ, and an all-no-op patch is not a write at all. The modal saves on every change, so most patches were partly redundant: a round trip, a realtime echo to the other session, and an undo entry that reversed nothing — an all-no-op patch used to consume a ⌘Z press outright.
7. [x] **P2** No retry or backoff on a transient network failure — one blip becomes a rollback and a toast. One retry after 400ms, and only when the error carries no `code`. A PostgREST error has one: that is the database refusing, and refusing twice as fast helps nobody. An error without one is the fetch failing, which on a phone changing cell towers is routine.
8. [x] **P2** `pending` entries are never cleared if a request never settles. Every write now takes a `claim` that returns an idempotent release, with a 30s timer behind it. This was worse than a leak: `pending` is what gives a local edit precedence over a realtime echo, so a stuck id meant a row frozen out of realtime for the rest of the session — your partner's changes to it would stop arriving, silently.
9. **P3** Two tabs both seed the store independently; harmless, but they do duplicate work.
10. **P3** `position` halving is finite in double precision; after ~50 reorders between the same pair the gap collapses.
11. **P3** The realtime channel is keyed on `workspaceId` but never torn down if that changes mid-session.
12. **P3** Member profile edits reach other sessions only on resync, not live.
13. **NO** Offline write queue. Changing rollback semantics in the optimistic store is not something to do untested; reasoning is in `DECISIONS.md`.
14. **NO** Undo surviving a reload. The spec says it does not, deliberately.

## B. The list view

15. **NO** Visually separating overdue within Aujourd'hui. On review this contradicts `docs/06-views.md`, which says overdue gets no section of its own precisely so it does not accumulate into a wall of failure people scroll past. The red date is the whole intended signal. Audit item withdrawn.
16. **P2** No count of overdue anywhere; you cannot tell at a glance whether you are behind.
17. **P2** Search covers open tasks only — a completed task is unfindable.
18. **P2** Search shows no result count, so an empty result and a slow filter look the same.
19. **P2** Dismissed composer chips cannot be restored without retyping.
20. **P2** A row does not show whether it has notes, so the modal is the only way to find out.
21. **P2** The label chip is not clickable; filtering by client means using the palette.
22. **P2** The assignee dot is not clickable either.
23. **P3** No drag-to-reorder in the list (the board has it; the list is date-ordered).
24. **P3** Multi-line paste creates one task with newlines rather than several tasks.
25. **P3** No bulk selection or bulk actions.
26. **P3** The completed footer shows a count but not a way to see yesterday's.
27. **NO** An archive view. "No archive, no trash" is an explicit scope decision.

## C. The board

28. [x] **P1** No empty state when every column is empty — the board looks broken rather than clear.
29. [x] **P1** The clear-out moment exists only on the list, so finishing your last task on the board is silent.
30. **P2** Columns cannot be collapsed; five date columns on a laptop is a lot of horizontal scrolling.
31. **P2** No per-column count of what is overdue or due today.
32. **P2** Dragging to a column that is scrolled out of view is impossible — no auto-scroll at the edges.
33. **P2** A card does not show notes presence, same as the row.
34. **P3** No WIP limit or "too much in En cours" signal.
35. **P3** Cards do not show the label colour, only the text.

## D. The calendar

36. [x] **P1** The day sheet has no drag; the calendar's own gesture stops at the cell. The sheet now carries a week strip: seven days that are both navigation — look at tomorrow without closing anything — and drop targets for its rows. Targets inside the sheet rather than on the grid behind it, because the overlay owns the pointer while the sheet is open and fighting that would cost more than it returns. `TaskRow` gained an optional `onGrab`, left off in the list where the order is the date's to decide and `touch-none` would cost the page its scroll.
37. [x] **P2** `+N` is not obviously clickable. It always was — the whole cell opens the day — it just looked inert. Now reads « +2 de plus », underlined, darkening on cell hover.
38. **P2** The week agenda has no time axis, so 9h and 17h look equally placed.
39. [x] **P2** No keyboard toggle between month and week. `M`, listed in the `?` sheet next to ← → and T.
40. [x] **P2** Month navigation has no transition, so paging feels like a jump cut. The grid is keyed on the month and arrives with a 160ms opacity and 3px rise. No exit animation and no `AnimatePresence`: two grids alive at once means two sets of drop targets under the pointer, and paging must stay readable within a keypress.
41. **P3** Cells cannot show more than three tasks even when the row is tall.
42. **P3** No week numbers.

## E. The task modal

43. [x] **P1** Opened by keyboard, focus does not return to the originating row on close — it returns to `body`.
44. **P2** The label field is a plain input with no autocomplete, unlike the composer.
45. **P2** No created/updated timestamps beyond "Créé par".
46. **P2** Deleting from the modal gives an undo toast, but the modal has already closed over the top of it on mobile.
47. **P3** No duplicate-task action.
48. **P3** The notes field has no markdown, by spec, but also no link detection.

## F. Composer and capture

49. [x] **P1** Autocomplete missing the cursor after a click — already handled when autocomplete landed; the input tracks selectionStart on click and keyup, verified.
50. **P2** No indication of what the parser understood until a chip appears — the title silently loses words.
51. **P2** `@` autocomplete matches on display name only, not on the email local part.
52. **P2** No recently-used labels ordering beyond raw frequency.
53. **P3** No support for `demain matin` / `cet après-midi` as time-of-day hints.
54. **P3** No undo for the composer itself (Ctrl+Z inside the input is browser-native).

## G. Keyboard

55. [x] **P1** The board has no keyboard equivalent for moving a card between columns.
56. [x] **P2** `?` sheet does not list the board or calendar drag gestures.
57. [x] **P2** No `Escape` handling to close the day sheet from the keyboard. Wrong on inspection — the sheet is a Radix dialog and has always closed on Escape. Nothing to change; recorded so it is not re-opened.
58. **P2** Row focus is lost when the list re-renders from a realtime event.
59. **P3** No `G` then `S` for settings.
60. **P3** No repeat-count prefixes (`3j` to move down three).

## H. Accessibility

61. [x] **P1** The progress ring has no accessible text — a screen reader gets nothing.
62. [x] **P1** The streak number has no label.
63. [x] **P1** Board columns have no accessible name tying cards to their column.
64. **P2** The live region announces completions only; deletions and reassignments are silent.
65. **P2** The task row is a `div` with `role="button"`, which is a real button in disguise.
66. **P2** No skip-to-content link.
67. **P2** Sections are not associated with their headings via `aria-labelledby`.
68. **P2** Under reduced motion a drag still moves the card, which is the one thing motion preference is about.
69. **P3** The command palette items have no supplementary description for a screen reader.
70. **P3** No `aria-live` on the filter, so changing the lens is silent.

## I. Performance

71. [x] **P1** `motion` and `cmdk` are in the shared bundle because the palette and animations mount in the shell — they load on `/login` too. Half right: measuring it showed `/login` at 216 kB both before and after, so the palette was never on the login path. What *was* true is that four dialogs nobody has opened yet — the palette, the shortcut sheet, the task modal, the day sheet — sat in the first load of every app route. They are now `next/dynamic` with `ssr: false` and mounted only while open: `/` went **319 kB to 295 kB** first load, `/board` the same, and `cmdk` is now alone in a 41 kB chunk that is fetched on the first `Cmd+K`. Total bytes across all chunks went *up* (1618 to 1719 KB raw) because splitting adds chunk overhead; the point is what the first paint downloads, not the sum of everything on the CDN.
72. **P2** The full task list ships in the RSC payload on every navigation between views.
73. **P2** Sidebar counts recompute on every store write.
74. **P2** The board rebuilds every column on any change, including one unrelated to the current grouping.
75. **P2** No virtualisation; a column with 500 cards renders 500 cards.
76. **P2** No bundle analyzer, so regressions are invisible.
77. **P3** `tw-animate-css` may be entirely unused.
78. **P3** Two variable font families load on every page including login.
79. **P3** Link prefetching is on by default for every nav item.
80. **P3** `useCompletionHold` allocates two Maps per tasks change.

## J. Security and robustness

81. [x] **P1** No security headers at all — no CSP, no `X-Content-Type-Options`, no `Referrer-Policy`.
82. **P2** No rate limiting on the invite action; an admin can hammer Supabase's mailer.
83. **P2** Invite email validation is `includes("@")`.
84. **P2** A failed session refresh is silent — the user simply finds themselves logged out.
85. **P3** No audit trail for member add/remove.
86. **P3** No account deletion path.
87. **NO** Client-side title length validation. The database check is the real one and the error surfaces.

## K. Correctness and edge cases

88. [x] **P1** A very long label or title with no spaces overflows its container.
89. **P2** `due_time` can survive a date being cleared through paths other than the modal's quick option.
90. **P2** Clock skew between client and server can make `completed_at` appear in the future.
91. **P3** Emoji in a title break `truncate` measurement subtly.
92. **P3** No handling for a task whose assignee was removed from the workspace.

## L. Copy and content

93. **P2** Error toasts show the raw Postgres message as a description, which is English and technical.
94. **P2** No copy for the board's empty state beyond "Rien ici."
95. **P3** The clear-out copy rotates by day-of-month, so the same day each month repeats.
96. **P3** No pluralisation helper; counts are bare numbers.

## M. Deployment and operations

97. [x] **P1** No `robots.txt`; a private task app should not invite indexing.
98. **P2** No `/api/health` check of the database, only of configuration.
99. **P2** No error reporting — a crash in production is invisible unless someone looks.
100. **P3** No preview-environment configuration for Vercel.
101. **P3** No database backup schedule documented.

## N. Testing

102. [x] **P1** Server actions (`inviteMember`, `revokeInvite`, `removeMember`) are untested.
103. **P2** No test for the middleware's routing decisions.
104. **P2** No test that the composer's parse-then-create path produces the right task.
105. **P2** The suites cannot run against a fresh database — they assume a seeded workspace.
106. **P3** No visual regression testing (no browser available here).

## O. Smaller UI details

107. **P2** The composer does not clear its dismissed-chip state when the view changes.
108. **P2** Toasts can cover the mobile bottom bar.
109. **P2** The settings tabs do not indicate which pane is loading on a slow navigation.
110. **P2** The people page shows no email for members, only display names.
111. **P2** No indication anywhere of who you are signed in as, except settings.
112. **P3** The sidebar workspace name is not a link to anything.
113. **P3** Bucket anchors scroll the section to the very top, hiding the header under the app header.
114. **P3** The board's group-by control loses its scroll position on re-render.
115. **P3** No focus styling difference between row focus and DOM focus.

## P. Things the brief forbids

116. **NO** Subtasks, dependencies, Gantt.
117. **NO** Recurring tasks.
118. **NO** File attachments.
119. **NO** Push notifications, email digests, Slack.
120. **NO** A native mobile app.
121. **NO** Any AI feature.
122. **NO** Onboarding tours or empty-state illustration sets.
123. **NO** Analytics dashboards, reporting, exports.

## Q. Further correctness review

124. **P2** `firstDayOfBucket("week")` can return a day that is also "tomorrow" late in the week.
125. **P2** Dropping onto "Plus tard" always picks the first day of next month, which may be a weekend.
126. **P2** The streak counts any completion, including one undone immediately after.
127. **P3** `computeStreak` walks day by day with no upper bound.
128. **P3** `instantToDay` parses every completion timestamp on every streak computation.

## R. State that should persist and does not

129. [x] **P2** The board's grouping persists; the calendar's month/week mode does not. Both go through a new `useLocalLens`, which also documents why these live in localStorage rather than the URL or the profile: a link to the board should not carry your grouping, and the two people here use a laptop and a phone very differently.
130. **P2** The completed-footer expanded state resets on every navigation.
131. **P3** The composer's in-progress text is lost when switching views.
132. **P3** Scroll memory covers the list but not the board's horizontal position.

## S. Visual and layout

133. **P2** The clear-out sweep is fixed height and does not cover a long list.
134. **P2** Board columns have a fixed 280px width regardless of viewport.
135. **P2** The modal is not scrollable when the notes field grows past the viewport.
136. **P3** No max width on the board, so on an ultrawide it stretches.
137. **P3** The calendar week header is not sticky while scrolling a tall month.

## T. Data lifecycle

138. **P2** Nothing ever prunes completed tasks, so the table grows for ever.
139. **P3** No soft-delete window; delete is immediate with a 5s client-side undo.
140. **P3** Removing a member leaves their tasks assigned to a non-member.

## U. Developer experience

141. **P2** No `.env.example` documenting the four variables.
142. **P2** `reference/` is stale relative to `lib/` and may mislead a future reader.
143. **P2** No CONTRIBUTING or architecture note beyond DECISIONS.
144. **P3** No pre-commit hook running typecheck.
145. **P3** Migrations have no down-migrations.

## V. Final sweep

146. [x] **P2** No favicon beyond the Next default.
147. [x] **P2** No `apple-touch-icon` or web manifest, so adding to a home screen looks generic.
148. [x] **P2** No `<meta name="description">` or Open Graph tags.
149. [x] **P3** `theme-color` not set, so mobile browser chrome does not match the app.
150. [x] **P3** No `viewport-fit=cover`, which is what makes safe-area insets meaningful.
