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

## Where this ended up

**All 150 resolved.** 107 built, 4 partly, 39 refused with the reason written
down next to them.

The refusals are the more interesting half. Some were scope — an archive, bulk
actions, recurring tasks, week numbers — and the brief already answered those.
The ones worth reading are where the item turned out to be wrong on inspection:

- **#72** claimed the whole task list ships on every view switch. Measured: a
  switch is 9.9 KB and carries none of it. The shell layout sits above the page
  segment and is not re-rendered.
- **#77** claimed `tw-animate-css` was unused. Eight call sites carry every
  dialog and sheet transition in the app.
- **#11** claimed the realtime channel is never torn down. It is — the effect
  lists `workspaceId` and its cleanup removes the channel.
- **#113**, **#114**, **#137** each described a scroll problem that does not
  exist, because nothing above the list is `sticky` and the calendar grid does
  not scroll.

And three items turned out to be worse than reported, which is the other reason
to check rather than assume:

- **#46** said the undo toast was covered by the closing modal. There was no
  toast: both delete paths in the modal called the store directly.
- **#124** said one bucket could pick a day belonging to another. Run across a
  year rather than against today, it did so on **153 days**.
- **#86** asked for an account deletion path. Writing the test found deletion
  was not missing but *impossible* — three foreign keys refused the cascade, so
  nobody who had ever typed a task could be erased.

---

## A. Store, data flow and reactivity

1. [x] **P1** `applyRemote` skips any row with a local write in flight — including a remote DELETE. If your partner deletes a task while you are editing it, it lingers until the next resync.
2. [x] **P1** The undo stack holds closures over task snapshots captured at push time; after a resync those snapshots can describe a row that no longer exists. Each entry now carries a precondition alongside its inverse: it fires only while the field it would reverse still holds the value your action put there. So ⌘Z will not overwrite the date your partner just changed, will not re-toggle a task they already reopened, and will not resurrect one they deleted. An entry that fails its precondition is dropped and the press continues to the next live one, because a ⌘Z that stops dead is worse than one that skips. Five new assertions in `verify:store`, each of which fails if the precondition is removed.
3. [x] **P1** Every completed task is fetched forever. The payload grows without bound while the UI shows only today's completions.
4. [~] **P2** `resync` refetches the whole workspace; it could ask only for rows changed since a timestamp. Half done, and the half that mattered: it was refetching *every completed task ever*, silently giving back everything the bounded first load had saved. It now uses the same window. Asking only for rows changed since a timestamp is still open — it needs a server-side clock to compare against, since the client's cannot be trusted for this.
5. [x] **P2** Components subscribe to the whole `tasks` array, so any write re-renders every view that is mounted. Measured before assuming: the re-render was never the expensive part — the *derived work inside it* was, and it is now ~200x cheaper (see 73, 74, 128). At 2000 tasks the sidebar counts, the streak and the board's columns together went from ~40ms per write to ~0.23ms. `TaskRow` is already memoized on task identity, so what is left is reconciliation of unchanged rows, which no longer registers. Adding selector machinery on top of that would be code paying for a problem that has already been removed.
6. [x] **P2** `updateTask` sends the full patch even when a field is unchanged. The patch is now narrowed to the fields that actually differ, and an all-no-op patch is not a write at all. The modal saves on every change, so most patches were partly redundant: a round trip, a realtime echo to the other session, and an undo entry that reversed nothing — an all-no-op patch used to consume a ⌘Z press outright.
7. [x] **P2** No retry or backoff on a transient network failure — one blip becomes a rollback and a toast. One retry after 400ms, and only when the error carries no `code`. A PostgREST error has one: that is the database refusing, and refusing twice as fast helps nobody. An error without one is the fetch failing, which on a phone changing cell towers is routine.
8. [x] **P2** `pending` entries are never cleared if a request never settles. Every write now takes a `claim` that returns an idempotent release, with a 30s timer behind it. This was worse than a leak: `pending` is what gives a local edit precedence over a realtime echo, so a stuck id meant a row frozen out of realtime for the rest of the session — your partner's changes to it would stop arriving, silently.
9. **NO** Two tabs both seed the store independently; harmless, but they do duplicate work. Refused because the alternative is worse. Sharing a seed across tabs means `BroadcastChannel` or a `SharedWorker` and a story about which tab owns the socket — real machinery, and a new way for one tab to hold stale state for another. The duplicated work is one server-rendered query per tab, on a page that is already being rendered.
10. [x] **P3** `position` halving is finite in double precision; after ~50 reorders between the same pair the gap collapses. Measured at 20 halvings before the midpoint stops being distinguishable, not 50 — and the failure is silent and permanent: the card simply refuses to move with nothing on screen to say why. `positionForDrop` returns `null` when the gap is gone, the board spreads the column back out to 1024-wide steps and asks again. The restack pushes no undo entry, because there is nothing a person did that they could want back.
11. **NO** The realtime channel is keyed on `workspaceId` but never torn down if that changes mid-session. It is. The effect lists `workspaceId` in its dependencies and its cleanup calls `removeChannel`, so React tears the old one down before opening the new one. Not reproducible.
12. [x] **P3** Member profile edits reach other sessions only on resync, not live. Identity is the only shared state that is not a task, and it was the one thing a live session never heard about: the accent colour is how you tell whose card is whose on every surface, and the display name is what the board's columns are called — so for as long as the other tab stayed open it was labelled with a name that no longer existed. `profiles` joins the publication in migration 0008, and the subscription carries no filter because that table has no workspace column; RLS already decides what a member may read. `me` is deliberately not updated from an echo, for the same reason `applyRemote` defers to a local write in flight. Verified against the live database and added to `verify:db`, because nothing in the app would have failed loudly without it.
13. **NO** Offline write queue. Changing rollback semantics in the optimistic store is not something to do untested; reasoning is in `DECISIONS.md`.
14. **NO** Undo surviving a reload. The spec says it does not, deliberately.

## B. The list view

15. **NO** Visually separating overdue within Aujourd'hui. On review this contradicts `docs/06-views.md`, which says overdue gets no section of its own precisely so it does not accumulate into a wall of failure people scroll past. The red date is the whole intended signal. Audit item withdrawn.
16. [x] **P2** No count of overdue anywhere; you cannot tell at a glance whether you are behind. « 3 en retard », in danger, beside the Aujourd'hui heading. A count is not the section `docs/06` refuses: it says how far behind you are in one glance and then stops talking.
17. [x] **P2** Search covers open tasks only — a completed task is unfindable. Two separate causes. Bucketing the results hid completions, because the sections only ever show what is open plus what was finished today — so searching is now a mode, a flat list in date order with done shown as done. And the browser only holds a week of completions, so a task finished last month was not in memory at all: while a search is open, the store asks the server for what the window left out and merges it in. No loading state; the local matches are already on screen and the rest arrive as more of the same list. The `or` filter's grammar is comma-separated and `%`/`_` are wildcards, so anything that would change the filter's shape is dropped from the term rather than escaped.
18. [x] **P2** Search shows no result count, so an empty result and a slow filter look the same. « 7 résultats » beside the heading, singular when it is one.
19. [x] **P2** Dismissed composer chips cannot be restored without retyping. Dismissing one used to remove it, which made the decision one-way: get it wrong and the only way back was to delete the word and type it again. An off chip stays where it was, struck through, and clicking it turns the reading back on.
20. [x] **P2** A row does not show whether it has notes, so the modal is the only way to find out. A glyph, not a count — how many lines are in someone's notes is not information.
21. [x] **P2** The label chip is not clickable; filtering by client means using the palette. Clicking it searches `#client`, which reuses the search box rather than adding a second kind of filter to the app. The chip is a `span` where nothing can act on it and a `button` where something can — a control that does nothing is worse than no control.
22. [x] **P2** The assignee dot is not clickable either. It now switches the lens to that person. A 6px dot is not a target, so a negative margin gives it a 22px hit area without moving anything around it.
23. **NO** No drag-to-reorder in the list (the board has it; the list is date-ordered). The parenthetical is the answer. A list ordered by date cannot also be ordered by hand without one of the two silently losing — drag a task up past a date boundary and either the date changes under you or the order does not stick. The board is where manual order lives, and it has it.
24. [x] **P3** Multi-line paste creates one task with newlines rather than several tasks. The field is one line, so pasting six lines out of a meeting note produced one task with the newlines flattened out of it — six things to do collapsed into one unreadable title. Each line now goes through exactly the same path a typed one does, so « relancer Marie demain » and « envoyer le devis #acme » each keep their own date and label. A single-line paste still just goes into the field, where it can be edited before Enter.
25. **NO** No bulk selection or bulk actions. The case that actually comes up is bulk *creation* — six lines out of a meeting note — and that is 24. Selecting several existing tasks to act on at once is a shape for a backlog of hundreds; this is a workspace for two people whose whole design goal is that a single task takes one keystroke.
26. [x] **P3** The completed footer shows a count but not a way to see yesterday's. The browser already holds a week of them (3), so « what did we finish yesterday » meant reaching for the search box to find data that was in memory. The footer has three states now — shut, today, and the week — and the second step is offered only when there is actually more to see. Newest first, which is the opposite of the open list: a finished task is history, and what happened last is what you are looking for.
27. **NO** An archive view. "No archive, no trash" is an explicit scope decision.

## C. The board

28. [x] **P1** No empty state when every column is empty — the board looks broken rather than clear.
29. [x] **P1** The clear-out moment exists only on the list, so finishing your last task on the board is silent.
30. [x] **P2** Columns cannot be collapsed; five date columns on a laptop is a lot of horizontal scrolling. Clicking a column's title folds it to a 44px strip with its title running vertically and its count at the foot. A folded column stays a drop target — folding something away must not make it unreachable, or the fold becomes a way to lose work. Remembered per grouping, so folding « Plus tard » by date does not also fold a person.
31. [x] **P2** No per-column count of what is overdue or due today. The overdue count sits in the header in danger, and only when it is not zero.
32. [x] **P2** Dragging to a column that is scrolled out of view is impossible — no auto-scroll at the edges. Within 72px of a scrollable edge the container scrolls itself, at a speed that ramps with how far into the zone the pointer is, so a nudge creeps and a push moves. It finds the scrollable ancestor rather than assuming one, and prefers the horizontal axis — an off-screen column is a worse problem than a tall one.
33. [x] **P2** A card does not show notes presence, same as the row. Same glyph.
34. [x] **P3** No WIP limit or "too much in En cours" signal. Not a limit: nothing is blocked, nothing is refused, no warning appears. Past five, the count in the column header stops being quiet — that is the whole intervention. Two people cannot be working on nine things, and a status everything sits in has stopped sorting anything.
35. **NO** Cards do not show the label colour, only the text. There is no label colour to show, by design: `docs/04` reserves colour for the accent and for identity, which is what lets a dot at 6px mean « this is Guillaume's » across every surface. Giving labels their own palette would put two colour languages on the same card and make the one that matters ambiguous.

## D. The calendar

36. [x] **P1** The day sheet has no drag; the calendar's own gesture stops at the cell. The sheet now carries a week strip: seven days that are both navigation — look at tomorrow without closing anything — and drop targets for its rows. Targets inside the sheet rather than on the grid behind it, because the overlay owns the pointer while the sheet is open and fighting that would cost more than it returns. `TaskRow` gained an optional `onGrab`, left off in the list where the order is the date's to decide and `touch-none` would cost the page its scroll.
37. [x] **P2** `+N` is not obviously clickable. It always was — the whole cell opens the day — it just looked inert. Now reads « +2 de plus », underlined, darkening on cell hover.
38. [x] **P2** The week agenda has no time axis, so 9h and 17h look equally placed. Bands — Matin, Après-midi, Soir, Sans heure — rather than an hour grid. This is a task list, not a meeting calendar: most tasks here have no time at all, and a 24-row axis would be almost entirely empty lines drawn around three cards. A band appears only when it holds something, so a day with two afternoon tasks shows one heading rather than four.
39. [x] **P2** No keyboard toggle between month and week. `M`, listed in the `?` sheet next to ← → and T.
40. [x] **P2** Month navigation has no transition, so paging feels like a jump cut. The grid is keyed on the month and arrives with a 160ms opacity and 3px rise. No exit animation and no `AnimatePresence`: two grids alive at once means two sets of drop targets under the pointer, and paging must stay readable within a keypress.
41. [x] **P3** Cells cannot show more than three tasks even when the row is tall. Six rows of cells share whatever height the window gives the grid, so on a large display there was visible empty space under a « +4 de plus » — the information was there, the room was there, and a constant in the middle refused to put them together. A `ResizeObserver` on the grid divides the measured cell height by the card height. A media query could not answer this: it depends on the window, the browser chrome, and whether the preview banner is showing.
42. **NO** No week numbers. A planning device — you use them when scheduling is negotiated with people who are not looking at the same screen, which is a project manager's problem. These two share one board and say « jeudi ». Adding a column of numerals nobody reads to the one view that is already the densest would cost more than it says.

## E. The task modal

43. [x] **P1** Opened by keyboard, focus does not return to the originating row on close — it returns to `body`.
44. [x] **P2** The label field is a plain input with no autocomplete, unlike the composer. Which is how one client ends up spelled three ways. A native `datalist` rather than the composer's own list: there is no token to parse here, the whole field is the value, and the browser already knows how to offer a set of them.
45. [x] **P2** No created/updated timestamps beyond "Créé par". Which left no way to tell a task typed this morning from one that has been sitting there since March — exactly what you want to know before deciding whether it still matters.
46. [x] **P2** Deleting from the modal gives an undo toast, but the modal has already closed over the top of it on mobile. Worse than reported: it gave no toast at all. Both delete paths in the modal — the red button and ⌘⌫ — called the store directly instead of the hook with the feedback, so the one surface where deletion is a labelled button rather than a keystroke was the one surface with no way back. Fixed, and toasts now clear the mobile bar as well (108).
47. [x] **P3** No duplicate-task action. Not a back door to recurring tasks, which the brief rules out — this makes one copy, once, when asked. The same checklist for the next client is a real thing to want, and retyping six fields to get it is the kind of friction that stops people using the app for the small things it exists for.
48. [x] **P3** The notes field has no markdown, by spec, but also no link detection. A textarea cannot hold a link, so a staging URL or a Figma file pasted into notes was text to select and copy by hand every time — which in an agency is most of what ends up in there. Not markdown either: nothing is parsed, the text is untouched, the links are simply also listed under the field where they can be clicked. `http` and `https` only — a `javascript:` URL in somebody else's notes is a way to run something when a colleague clicks it. Fifteen assertions, four of them about exactly that.

## F. Composer and capture

49. [x] **P1** Autocomplete missing the cursor after a click — already handled when autocomplete landed; the input tracks selectionStart on click and keyup, verified.
50. [x] **P2** No indication of what the parser understood until a chip appears — the title silently loses words. The title the box is about to create is now shown next to the chips. Words vanishing from the line you are typing is alarming when nothing says where they went.
51. [x] **P2** `@` autocomplete matches on display name only, not on the email local part. `@gberther` is how one of these two is addressed all day and it matched nothing at all. Both the suggestion list and the submit path resolve on either key — they had to move together, or a completion would have produced a handle the parser could not turn back into a person.
52. [x] **P2** No recently-used labels ordering beyond raw frequency. Raw frequency ranks a client you billed forty hours to last spring above the one you are on this week, which is backwards for a field you are typing into right now. Each use is worth a point that halves every fortnight, so a finished client falls away on its own and nothing ever needs archiving.
53. [x] **P3** No support for `demain matin` / `cet après-midi` as time-of-day hints. « rappeler le client demain matin » is a normal French sentence, and the parser kept « matin » in the title and set no time — so the task sorted ahead of a 16h one on a day ordered by time, which is the wrong way round. Matin, midi, après-midi, soir, début de matinée and fin de journée now set the start of the part of the day meant. Not precise and not pretending to be; precise enough to order a list. A clock time still wins — « demain matin à 10h » is 10h — but the words leave the title either way, or the task ends up called « matin ». The day word in front is deliberately left for the date pass. Twelve assertions.
54. **NO** No undo for the composer itself (Ctrl+Z inside the input is browser-native). Which is to say it already works, and works better than anything written here would: the browser's own undo stack knows about selections, IME composition and autocorrect. The store's ⌘Z deliberately does not fire while a field has focus, precisely so it does not fight this.

## G. Keyboard

55. [x] **P1** The board has no keyboard equivalent for moving a card between columns.
56. [x] **P2** `?` sheet does not list the board or calendar drag gestures.
57. [x] **P2** No `Escape` handling to close the day sheet from the keyboard. Wrong on inspection — the sheet is a Radix dialog and has always closed on Escape. Nothing to change; recorded so it is not re-opened.
58. [~] **P2** Row focus is lost when the list re-renders from a realtime event. Read the path rather than assuming it. Row focus is an id, not a DOM reference, and it is only cleared when that id leaves the list — a realtime event that reorders or edits other rows does not touch it. DOM focus now lands on the row's title button, whose React key is the task id, so a re-render keeps it too. What remains true is the narrower case the item did not name: if your partner *deletes* the row you have focused, the focus goes with it and there is nothing under J/K until you press it again. That is arguably correct and definitely not worth machinery.
59. [x] **P3** No `G` then `S` for settings. `S` alone cycles a row's status; behind `G` there is no collision. Listed in the `?` sheet.
60. **NO** No repeat-count prefixes (`3j` to move down three). A vi idiom for files of thousands of lines. The longest list here is a day's tasks, `J` repeats on key-hold, and a prefix would mean swallowing every digit key — which `1` through `4` already use to jump to a section.

## H. Accessibility

61. [x] **P1** The progress ring has no accessible text — a screen reader gets nothing.
62. [x] **P1** The streak number has no label.
63. [x] **P1** Board columns have no accessible name tying cards to their column.
64. [x] **P2** The live region announces completions only; deletions and reassignments are silent. Reopening, reassigning, rescheduling, un-dating and deleting all announce now, and every announcement names the task. A toast is a glance, and a glance is what a screen reader does not get — « Reprogrammée » alone says nothing about which of eleven tasks moved.
65. [x] **P2** The task row is a `div` with `role="button"`, which is a real button in disguise. Worse than a disguise: the row contains a checkbox, and now a label chip and an assignee dot, and a button cannot contain controls — assistive technology was promised one thing and handed another. The *title* is the button now, in both the row and the board card: it is what Tab reaches, what Enter opens, and where the card's ←/→/X live. Clicking anywhere else still opens the modal, as a convenience on top of a correct structure rather than a substitute for one.
66. [x] **P2** No skip-to-content link. First in the tab order, invisible until focused, moving focus to a real `<main>`. Without it, reaching a task by keyboard meant tabbing the sidebar's nav, the filter and the streak on every page load.
67. [x] **P2** Sections are not associated with their headings via `aria-labelledby`.
68. [x] **P2** Under reduced motion a drag still moves the card, which is the one thing motion preference is about. The card itself was already gated; the wrapper around it in the board and both wrappers in the list section were not, and those are the ones that animate the *reflow* — which is the movement the preference exists to stop.
69. [x] **P3** The command palette items have no supplementary description for a screen reader. A row is a title and then two spans with no separator, which read aloud is « envoyer la facture Demain Guillaume ». An `aria-label` says it as a sentence; `value` is left alone, since that is what cmdk matches typing against.
70. [x] **P3** No `aria-live` on the filter, so changing the lens is silent. It is the largest change any single click in this app makes — the whole list is rewritten — and a screen reader was told nothing at all. It announces through the same live region completions use.

## I. Performance

71. [x] **P1** `motion` and `cmdk` are in the shared bundle because the palette and animations mount in the shell — they load on `/login` too. Half right: measuring it showed `/login` at 216 kB both before and after, so the palette was never on the login path. What *was* true is that four dialogs nobody has opened yet — the palette, the shortcut sheet, the task modal, the day sheet — sat in the first load of every app route. They are now `next/dynamic` with `ssr: false` and mounted only while open: `/` went **319 kB to 295 kB** first load, `/board` the same, and `cmdk` is now alone in a 41 kB chunk that is fetched on the first `Cmd+K`. Total bytes across all chunks went *up* (1618 to 1719 KB raw) because splitting adds chunk overhead; the point is what the first paint downloads, not the sum of everything on the CDN.
72. **NO** The full task list ships in the RSC payload on every navigation between views. Measured against a running server with a real session, and it does not. A client-side switch sends the router's tree and Next answers with only the segments that differ — the shell layout is above the page segment and is not re-rendered. A full load of `/board` is 54.9 KB and carries the task titles; `/` → `/board` is **9.9 KB and carries none of them**. The item was a guess and the guess was wrong.
73. [x] **P2** Sidebar counts recompute on every store write. They still do, and it no longer matters: 12.9ms at 2000 tasks became 0.03ms. `bucketOf` was computing four `parseISO` calls plus `endOfWeek` and `endOfMonth` *per task*, all of it depending only on today. The boundaries are now computed once per day and the per-task test is a string comparison — a 'yyyy-MM-dd' sorts lexically exactly as it sorts chronologically, which is the one good reason to store days as strings.
74. [x] **P2** The board rebuilds every column on any change, including one unrelated to the current grouping. It still does; the rebuild went from 19.0ms to 0.07ms at 2000 tasks, because grouping by due date was the same `bucketOf` in a loop. Grouping by person was already 0.006ms, which is how the cause was identified.
75. **NO** No virtualisation; a column with 500 cards renders 500 cards. Refused on arithmetic. This is a workspace for two people, and a column of 500 would mean 500 *open* tasks on one of them, which is a different problem than a rendering one. The cost that actually mattered at that scale was the derived work per store write, and that is now ~0.03ms at 2000 tasks (73, 74, 128). Virtualisation would also break the two things the board is for — Ctrl+F, and dragging to a column you can see — in exchange for a frame budget nothing is spending.
76. [x] **P2** No bundle analyzer, so regressions are invisible. `npm run size` reports chunk totals and, more usefully, which chunk each library lives in — a dependency landing in the shared bundle instead of the one chunk that uses it is the regression worth catching, and it does not show up in a total: the total barely moves while every page starts paying for it. `cmdk` in one chunk is the palette staying off the first load; `cmdk` in four is that having quietly come undone. No `@next/bundle-analyzer` — a dependency and a webpack plugin on a Turbopack build, to answer a question reading `.next` already answers. With `npm run bench` for the CPU side, that is the whole regression surface.
77. **NO** `tw-animate-css` may be entirely unused. It is not. Eight call sites in `dialog.tsx` and `sheet.tsx` — `animate-in`, `animate-out`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*` — which are the enter and exit transitions for the task modal, the shortcut sheet and the day sheet. Removing it would take those with it.
78. **NO** Two variable font families load on every page including login. Refused on the trade. Geist Mono carries every tabular numeral in the app — the counts, the dates, the streak — so taking it off preload would swap the numbers in after first paint on the surface used many times a day, to save a font file on a page its own comment says is seen roughly once a month. That is the wrong way round.
79. **NO** Link prefetching is on by default for every nav item. Measured before deciding: a prefetched view switch is 9.9 KB, so the four rail links cost about 40 KB once per page load. That is what buys « switching views costs zero requests », which is the design goal the whole one-array architecture exists to serve. Turning it off would trade the app's most-felt property for 40 KB.
80. **NO** `useCompletionHold` allocates two Maps per tasks change. Measured rather than assumed. It is one `Map.set` per task per store write — around 0.05ms at 2000 tasks, against a frame budget of 16ms, and the real cost at that scale was the derived date work, which is now 0.03ms (73, 74, 128). The second Map is only built when something was actually completed. Removing an allocation nothing is waiting on would trade the diff's clarity for nothing.

## J. Security and robustness

81. [x] **P1** No security headers at all — no CSP, no `X-Content-Type-Options`, no `Referrer-Policy`. The static three landed first; the CSP was deferred because a correct one needs a per-request nonce and half a policy is worse than none. It is in now, built in the middleware (`lib/csp.ts`) since a static header table cannot produce a fresh nonce. No `unsafe-inline` and no `unsafe-eval` in `script-src` on a production build — all 31 script tags Next injects carry the nonce, verified against a real production server by `npm run verify:headers`. Two deliberate holes, both narrow: `style-src-attr 'unsafe-inline'` because every animation and every identity dot writes to the `style` attribute (an injected `<style>` block is still refused), and `unsafe-eval` in development only, for Turbopack. `strict-dynamic` is left out on purpose — it would let anything a nonced script loads run unnonced, which is most of the value given away to save listing one origin.
82. [x] **P2** No rate limiting on the invite action; an admin can hammer Supabase's mailer. Ten an hour per workspace, which for a two-person board is generous. That is somebody else's rate limit being spent, and hitting it takes out the magic-link login for the whole project rather than just invitations. Counted in the database, not in memory: server actions run on instances that come and go, and an in-memory counter would reset at exactly the moment it mattered.
83. [x] **P2** Invite email validation is `includes("@")`. Which accepted `@`, `a@b`, and a line with a space in it. Not a full RFC 5322 parse — nothing sensible is — but enough that a typo is caught before it becomes an invite row nobody can ever consume, since a pending invite is matched against the address a real signup arrives with.
84. [x] **P2** A failed session refresh is silent — the user simply finds themselves logged out. It looked exactly like never having been signed in: you are somewhere else, with a login screen and no idea why. The middleware carries the reason, and only when a session cookie was actually present — otherwise the same message would greet a first-time visitor.
85. **NO** No audit trail for member add/remove. There are two people and the people page shows the current state; an audit trail answers « who removed whom, and when » for an organisation where that could be in dispute. Supabase's own logs already hold the auth events if it ever is. Building a second, weaker copy in the application is compliance theatre for a workspace whose entire membership fits on one screen.
86. [x] **P3** No account deletion path. Law 25 gives a person the right to have their personal information erased, and that does not stop applying because they are one of two owners — a working address, a name and a record of what they did each day is personal information whoever holds it. There was no way to exercise it short of asking somebody with the service role key.

    Writing the test for it found that it was not merely missing, it was **impossible**: `tasks.created_by`, `tasks.completed_by` and `pending_invites.invited_by` all referenced `profiles` with `no action`, so the cascade from `auth.users` was refused and anyone who had ever typed a task — that is, anyone — could not be deleted. Migration 0011 makes those three `set null` and `created_by` nullable; the insert policy still requires `created_by = auth.uid()`, so a task can never be *created* without an author and null means exactly one thing. The tasks survive, which is the rule from `docs/03`, and stop naming somebody who is gone. Five assertions in `verify:invites`, all of which failed before the migration.
87. **NO** Client-side title length validation. The database check is the real one and the error surfaces.

## K. Correctness and edge cases

88. [x] **P1** A very long label or title with no spaces overflows its container.
89. [x] **P2** `due_time` can survive a date being cleared through paths other than the modal's quick option. Enforced in `updateTask` rather than at each call site — a rule enforced in one place is a rule and a rule enforced in four is a coincidence. A time with no date has nowhere to render, since every surface reads `due_on` first, so it became a value that quietly survived and reappeared the next time the task was given a date.
90. [x] **P2** Clock skew between client and server can make `completed_at` appear in the future. The whole product is calendar days, so a device with a wrong clock does not degrade gracefully — it buckets tasks wrongly, breaks the streak, and makes a completion vanish from « Terminé aujourd'hui ». The shell already renders on the server, so it hands its instant down and the offset is fixed once, during render rather than in an effect: an offset applied after the first commit would not re-bucket what that commit already drew. Every `today()`, every optimistic `completed_at` and `position` now reads through it.
91. **NO** Emoji in a title break `truncate` measurement subtly. `truncate` is `text-overflow: ellipsis`, which the browser applies at a grapheme boundary — it does not split a surrogate pair or a ZWJ sequence into halves the way a JavaScript `slice` would. The width of an emoji does vary by font, so a truncated line lands in a slightly different place than a Latin one; that is a rendering difference, not a break, and nothing in the layout depends on the character count.
92. [x] **P3** No handling for a task whose assignee was removed from the workspace. `columnOf` returned the departed id, so `buildColumns` put the card in « Personne » while `columnOf` insisted it lived elsewhere — and the arrow keys on that card silently did nothing. It takes the member list now and agrees with the board. Mostly moot after 140 and 86, which stop the state arising, but a row can still be read from a session that was open when somebody left.

## L. Copy and content

93. [x] **P2** Error toasts show the raw Postgres message as a description, which is English and technical. A failed save read « La modification n'a pas été enregistrée » followed by `new row for relation "tasks" violates check constraint "tasks_title_check"` — English, jargon, naming an object nobody using this app has heard of, and putting the schema on screen besides. The handful of refusals this app can actually provoke now get a French sentence, keyed on the SQLSTATE; everything else gets none, because a second line that cannot be understood reads as though something is broken beyond what happened. The raw message goes to the console, where whoever is debugging will look for it.
94. [x] **P2** No copy for the board's empty state beyond "Rien ici." Deleted rather than written. Six columns each saying « Rien ici. » is noise — a column with nothing in it is already obviously empty. What was actually missing was a target while dragging, so a dashed « Déposer ici » appears then and only then.
95. [x] **P3** The clear-out copy rotates by day-of-month, so the same day each month repeats. Worse than a repeat: with a list shorter than 28 entries some lines were never reachable at all. Days since the epoch has no period, so the rotation drifts across the list instead of landing on the same spot.
96. [x] **P3** No pluralisation helper; counts are bare numbers. Four places had grown their own inline ternary and a fifth would have been written the same way. `plural(n, one)` handles the regular rule; anything irregular passes its own second form.

## M. Deployment and operations

97. [x] **P1** No `robots.txt`; a private task app should not invite indexing.
98. [x] **P2** No `/api/health` check of the database, only of configuration. Every variable being present says nothing about whether the project behind them is awake, reachable from this region, or still holding the keys it was given — a paused Supabase project and a rotated key both look like perfect configuration from here, and both take the app down. One anonymous count against an RLS-protected table answers it: the number comes back zero, which is the point; what matters is that it comes back. 503 rather than 200 when it does not, since a probe that answers 200 while the database is unreachable is a probe nothing can be wired to.
99. [x] **P2** No error reporting — a crash in production is invisible unless someone looks. It reached the browser console of the person it happened to and stopped there, which means « the app broke for Guillaume on Tuesday » could happen twice before anyone heard about it. Crashes now POST a thin report to `/api/report`, which writes one clipped line to stderr where the platform's runtime logs pick it up. Deliberately not a service: the stack is locked, and a vendor for two people means an account, an SDK in every bundle, and task titles leaving the country — which is the one thing `ca-central-1` was chosen to prevent. What is sent is a message, a digest, a path and a truncated stack: never a task, never a title, never a field's contents. A crash report should describe the code, not the work. Also added: `global-error.tsx`, for a crash in the root layout that `(app)/error.tsx` cannot catch because it lives inside the tree that just failed, and a handler for unhandled rejections — every write in the store is `void (async () => …)()`, so a bug in one lands there and nowhere else.
100. [~] **P3** No preview-environment configuration for Vercel. Half done, and the half that matters. There is one Supabase project, so a preview build writes to the same tables production does: ticking something off in a preview to see how the animation feels ticks it off for both of you, for real, on two screens that are otherwise identical. Previews now carry a banner saying so. Giving them their own database is the actual fix and it costs money the organisation is not spending — recorded in `supabase/README.md` rather than pretended away.
101. [x] **P3** No database backup schedule documented. There was nothing to document, which is the finding: the organisation is on Supabase's **free plan** — no automated backups, no point-in-time recovery, and the project pauses after a week of inactivity. A bad `delete` is currently permanent. `npm run backup` writes every row of all five tables to a timestamped JSON file; `supabase/README.md` says what it does and does not contain (not `auth.users`), why there is no restore script, and that upgrading to Pro is what actually replaces this.

## N. Testing

102. [x] **P1** Server actions (`inviteMember`, `revokeInvite`, `removeMember`) are untested.
103. [x] **P2** No test for the middleware's routing decisions. The middleware does two things wound together: refresh the cookie, which needs a real request and a round trip, and decide where the request goes, which needs neither. Only the first was hard to test, so the second moved to `lib/routing.ts` and the suite walks all thirteen states. Every branch there is a way to lock somebody out of their own task manager, and the failures are asymmetric — sending a signed-in person to `/login` is annoying, but a loop between `/login` and `/` leaves the app unusable with nothing on screen to explain it. There is an assertion for exactly that loop.
104. [x] **P2** No test that the composer's parse-then-create path produces the right task. It lived inside the component, which is why nothing could reach it — and it is the most consequential path in the app, since a mistake there loses words out of a task at the moment somebody is trying to write something down. Now `lib/compose.ts`, pure, taking `members` rather than reaching for the store. Seventeen assertions, including the one that matters: dismissing a date on « appeler Marie demain » puts the word back in the title.
105. [x] **P2** The suites cannot run against a fresh database — they assume a seeded workspace. Both opened with `.select("id").limit(1).single()`, which throws on an empty database, so they could only be pointed at a project somebody had already used by hand. That is the wrong way round: the run worth trusting most is the one against a database with nothing in it, because that is where a missing default or an unapplied migration shows up. A workspace is borrowed if one exists and created if none does — and a created one is torn down at the end, along with a seeded admin so the last-admin guard is exercised rather than skipped for want of an admin to try removing. Same rule as every other id in those files: nothing deletes what it did not create.
106. **NO** No visual regression testing (no browser available here). Still true, and the reason matters: this session has no browser, so any screenshot baseline would be generated by the same thing that would later compare against it — a test that can only ever agree with itself. `npm run verify:headers` covers what *can* be checked from outside a browser, against a real server.

## O. Smaller UI details

107. [x] **P2** The composer does not clear its dismissed-chip state when the view changes. Resolved together with 131, which wanted the opposite thing: the *text* now survives a view switch and the dismissals do not. Capture is the one thing this app must never lose, and "I typed it, then I looked at the calendar, then it was gone" is the worst way to lose it — while a dismissal is a judgement about a specific reading and has no business outliving the trip.
108. [x] **P2** Toasts can cover the mobile bottom bar. Lifted clear of it, and of the home indicator under that. An undo you cannot reach is not an undo.
109. [x] **P2** The settings tabs do not indicate which pane is loading on a slow navigation. These two pages fetch on the server, so a click on a cold connection does nothing visible for a moment and reads as a dead tab. This is the one place in the app that admits to waiting — everything on the task surfaces is optimistic and has nothing to wait for. A rule under the label rather than a spinner: the tab's own underline, arriving early.
110. [x] **P2** The people page shows no email for members, only display names. Two people can pick the same display name, and an invite is sent to an address rather than to a name — so the member list could not be checked against the invite that produced it.
111. [x] **P2** No indication anywhere of who you are signed in as, except settings — two clicks away, and the last place you would think to look after being bounced to a login screen and back. At the foot of the rail now, with the accent dot, because with two people on one board it is what decides what « Moi » means.
112. [x] **P3** The sidebar workspace name is not a link to anything. Settings is the only place it can be renamed, so that is where it goes.
113. **NO** Bucket anchors scroll the section to the very top, hiding the header under the app header. Checked rather than assumed: nothing in the shell is `sticky` or `fixed` above the list — the page header scrolls away with the content — so there is nothing for a section to hide under. The `scroll-mt-6` on each section is breathing room, not a fix for an overlap that does not exist.
114. **NO** The board's group-by control loses its scroll position on re-render. Not reproducible. The scrolling element is a stable `div` that React reuses across renders; only its children change, and a browser does not reset `scrollLeft` for that. The board's *horizontal* scroll position was the real one, and that is fixed under 132.
115. [x] **P3** No focus styling difference between row focus and DOM focus. Resolved by the `role="button"` correction (65). Row focus, which J and K move, is a 1px accent ring around the whole row; DOM focus now lands on the title button and draws an accent underline under the title alone. Two different things, two different marks.

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

124. [x] **P2** `firstDayOfBucket("week")` can return a day that is also "tomorrow" late in the week. Worse than reported, and the suite could not see it: the round-trip test only ever ran against the real today, so it passed by luck. Run across a full year it failed on every Sunday for « Ce mois-ci » as well. The function no longer reconstructs the boundaries — it asks `bucketOf` for the earliest day that is genuinely in the bucket, so the two cannot disagree by construction. Two buckets are legitimately empty on some days (a Saturday has no « cette semaine » left, the 30th has no « ce mois-ci »), and `undefined` says so, so the board declines the drop rather than putting the card somewhere else and reporting success. 104 and 49 such days a year.
125. **NO** Dropping onto "Plus tard" always picks the first day of next month, which may be a weekend. Not a defect: `docs/04` is explicit that these two work weekends, and the calendar deliberately gives Saturday and Sunday no special treatment. Skipping a weekend here would be the app having an opinion about their week that they do not share.
126. **NO** The streak counts any completion, including one undone immediately after. Checked rather than assumed: reopening clears `completed_at`, both optimistically and through the trigger, and the streak is derived from that column, so an undone completion stops counting the moment it is undone. There was nothing here.
127. [x] **P3** `computeStreak` walks day by day with no upper bound. It stops on its own in practice, but « in practice » is carrying a lot in a loop whose exit depends on a Set built from timestamps that arrived over a network. Ten years, which nobody reaches and a malformed history cannot outrun.
128. [x] **P3** `instantToDay` parses every completion timestamp on every streak computation. It went through `TZDate` and date-fns `format` — 5 to 10µs a call, 8.0ms across 2000 tasks. Now one `Intl.DateTimeFormat` built once, reading parts by name rather than trusting a locale's ordering, plus a bounded cache keyed on the timestamp string, which hits nearly always because `completed_at` is a stable value that recurs on every render. 0.07ms. The whole rewrite is cross-checked against the date-fns implementation it replaced, over 5840 day pairs spanning a year and both DST changeovers.

## R. State that should persist and does not

129. [x] **P2** The board's grouping persists; the calendar's month/week mode does not. Both go through a new `useLocalLens`, which also documents why these live in localStorage rather than the URL or the profile: a link to the board should not carry your grouping, and the two people here use a laptop and a phone very differently.
130. [x] **P2** The completed-footer expanded state resets on every navigation. Expanded is a preference, not a transient — closing it on every trip to the calendar means re-opening it every time you want yesterday's context.
131. [x] **P3** The composer's in-progress text is lost when switching views. Held in memory, not sessionStorage: a draft should survive a glance, not a reload — after a reload an empty box is the right thing to come back to.
132. [x] **P3** Scroll memory covers the list but not the board's horizontal position. It does now, per grouping. The board scrolls inside an element rather than in the window, which is why the existing hook could not see it, and it is the view where losing your place costs most — column five is a journey, not a flick.

## S. Visual and layout

133. [~] **P2** The clear-out sweep is fixed height and does not cover a long list. Half accepted. The real defect was geometry: a 6rem band travelling through a box its own content sized, so it arrived before it had moved and read as a flash rather than a sweep. It is 4rem through at least 10rem now. Making it cross the whole window is refused — § 8.5 asks for one narrow band and says restraint is what makes the moment land the twentieth time, and a full-window sweep is the confetti the same paragraph rules out.
134. [x] **P2** Board columns have a fixed 280px width regardless of viewport. `min(280px, calc(100vw - 4.5rem))`, so a phone shows one column and the edge of its neighbour instead of a column running off the screen.
135. [x] **P2** The modal is not scrollable when the notes field grows past the viewport. Three bands now — the task, its metadata, the actions — and only the middle one scrolls, so long notes cannot push Supprimer off the bottom of the window.
136. **NO** No max width on the board, so on an ultrawide it stretches. On review this is what a board is for: the columns are a fixed width and the row of them is as long as it is. Capping it would leave dead space beside a surface whose whole job is to be scrolled.
137. **NO** The calendar week header is not sticky while scrolling a tall month. A tall month does not scroll. The grid is `min-h-0 flex-1` over `grid-rows-6`, so it fits the height it is given and the individual cells scroll inside themselves — the weekday row is never anywhere but the top. Not reproducible.

## T. Data lifecycle

138. **NO** Nothing ever prunes completed tasks, so the table grows for ever. Refused twice over. « No archive, no trash » is an explicit scope decision, and a job that deletes old completed tasks *is* a trash — one that destroys history silently, on a schedule, with nothing to undo it. And the arithmetic does not support it: two people finishing twenty tasks a day would add about seven thousand rows a year, which is nothing to Postgres, and the browser already refuses to load more than a week of them (3).
139. **NO** No soft-delete window; delete is immediate with a 5s client-side undo. A soft-delete window is a trash, and « no archive, no trash » is explicit in the brief. The undo toast is the window, and after 46 it is on every path that can delete — including the modal, which had none at all.
140. [x] **P3** Removing a member leaves their tasks assigned to a non-member. Their *open* tasks are unassigned on the way out; finished ones keep their name, because who did a thing is history and does not stop being true. Unassigned is the honest state — somebody has to pick them up, and the app should say so rather than point at a person who is gone.

## U. Developer experience

141. [x] **P2** No `.env.example` documenting the four variables. With what each one is for, which are safe in a browser and why, and the two places `NEXT_PUBLIC_SITE_URL` has to agree — it is what the login page hands Supabase as `emailRedirectTo`, so getting it wrong is what makes a production email link point at localhost.
142. [x] **P2** `reference/` is stale relative to `lib/` and may mislead a future reader. Its README still said « copy into `lib/` », as though that had not already happened three phases ago. It now says these are the originals as delivered, that `lib/` is what runs, and tabulates what diverged and why — `store.ts` 238 lines to 653, `time.ts` 166 to 385. Kept rather than deleted, because the diff against them is often the fastest answer to why something in `lib/` looks the way it does.
143. [x] **P2** No CONTRIBUTING or architecture note beyond DECISIONS. `ARCHITECTURE.md`: one array and three views, the store's contract, the two different things called dates, what the server owns, and what is deliberately absent. `DECISIONS.md` records why individual calls were made; this is the shape, and specifically the parts that cannot be changed without breaking something that is not obviously connected.
144. [x] **P3** No pre-commit hook running typecheck. `.githooks/pre-commit`, installed with `npm run hooks` — deliberately not automatic. No husky and no postinstall: a package that silently rewrites your git configuration on install is a worse trade than one command run once. Typecheck only; lint and the suites stay in CI, because a hook that takes twenty seconds is a hook people turn off.
145. **NO** Migrations have no down-migrations. A reversal is only useful if it is correct, and a down-migration is the one piece of SQL never run until the worst possible moment — eight of them would be eight untested paths. The tempting one, the reverse of `0001`, is `drop schema public cascade`, which is not a rollback, it is the outage. The way back from a bad migration is the next migration; the way back from bad data is `npm run backup`. Both written down in `supabase/README.md`.

## V. Final sweep

146. [x] **P2** No favicon beyond the Next default.
147. [x] **P2** No `apple-touch-icon` or web manifest, so adding to a home screen looks generic.
148. [x] **P2** No `<meta name="description">` or Open Graph tags.
149. [x] **P3** `theme-color` not set, so mobile browser chrome does not match the app.
150. [x] **P3** No `viewport-fit=cover`, which is what makes safe-area insets meaningful.

---

## Second pass — reviewing what this session built

The 150 above are closed. What follows is the same treatment applied to the
code that closed them, because a fix written quickly is still code nobody has
reviewed. Numbering continues.

151. [x] **P1** The fix for 10 did not work. `placeIn` renumbered the column and
     then asked `positionForDrop` again — using the same `Column` object, which
     the component had captured from an earlier render and which therefore still
     held the pre-restack positions. The second question got the same answer as
     the first, so the card refused to move: the fix failed in exactly the shape
     of the bug it was written for, and both were silent. `placeInColumn` now
     answers both halves at once, against the spread positions, so no caller
     holds a stale object between two questions. Six assertions, one of which
     (« strictly between the restacked neighbours ») the old code could not pass.
152. [x] **P2** The footer's « Terminé cette semaine » (26) could say that about
     a task finished in March. It filtered on *whatever completions were in the
     store*, and search pulls matching tasks back from outside the window (17) —
     so the two features together produced a heading that lied. Bounded on the
     same cutoff the fetch uses.
153. [x] **P3** `deleteOwnAccount` awaited `signOut()` after deleting the
     account, so an auth server declining to sign out a user that no longer
     exists would have thrown — telling somebody their erasure failed when it
     had already succeeded. The sign-out is housekeeping and is now treated as
     such.
154. [x] **P2** The profile subscription (12) could recruit somebody into the
     member list. It carries no filter, because `profiles` has no workspace
     column — RLS decides what arrives, and its rule is « people you share a
     workspace with ». For one workspace that is the same set; for anybody in
     two it is not, and an unknown id appended to `members` would put a phantom
     person in the assignee lens and a phantom column on the board. It updates
     someone already present and never adds anyone; a genuinely new member
     arrives through `resync`, which knows which workspace it is asking about.
155. [x] **P3** The composer parsed every keystroke twice. `composeTask` ran
     `parseFr`, then the chips ran it again on the same string — not only twice
     the work but two answers that could in principle disagree, so the chips
     could offer to switch off a reading the submit path had never made.
     `composeTask` reports its `readings` alongside its decisions, which is what
     the chips actually needed: an off chip has to show what it would put back,
     and the decided value for a dismissed date is null. Six assertions pin the
     two together.
156. [x] **P2** `restack` (10) reported per row and rolled back nothing. A
     column of twenty and a dropped connection produced twenty identical red
     toasts, and left the board showing an order the server does not have —
     which is worse than not renumbering at all, because the next drop computes
     a position against numbers that exist only in this browser. A renumber is
     one action and now fails as one: any refusal puts every row back and says
     so once.
157. [x] **P2** Signing out left every task, name and address in the store, and
     every draft in the composer's map. Both are module singletons, and signing
     out is followed by a client navigation rather than a document load — so
     "still in memory" can mean "while the next person is standing there".
158. [x] **P3** `CARD_HEIGHT` carried a comment saying it had been measured from
     the rendered card. It had not; it was an estimate, and it would have
     drifted the moment anybody changed the card's padding — silently, because
     one card too many or too few looks like nothing at all. `useRowsThatFit`
     reads the real distance between two rendered cards, and the constant is
     demoted to what it always was: a guess for the first frame, before there is
     a card to measure.
159. [x] **P2** `withRetry` and `explain` each decided for itself whether a
     failure was the network or the database, both writing `!error.code`. They
     agreed by coincidence, not by construction — two copies of a rule are two
     chances to update one of them. The case that separates them is a refusal
     arriving with a blank code: `!""` is true, so it was retried *and then*
     described as a lost connection. One `isTransportFailure`, read by both.
160. [x] **P2** `resync` threw away whatever search had pulled in from outside
     the loaded window. It refetches the same bounded window as the first load,
     so a task finished two months ago is correctly absent from the answer — and
     was correctly discarded, which made results vanish the moment a sleeping tab
     woke up mid-search. Those ids are tracked and kept; a row that is neither in
     flight nor searched-for is still dropped, which is the point of the refetch.
161. [x] **P3** `report`'s dedupe set could grow without bound. Its key includes
     the message, and a message can carry a timestamp or an id — every crash
     would be "new", the set would never stop growing, and the deduplication it
     exists for would never fire.
162. [x] **P3** A dismissed chip outlived the text it was a judgement about. The
     day sheet's composer changes draft key as you browse the week strip, which
     swaps the line underneath it — so a chip switched off for Monday's draft
     stayed off for Tuesday's, hiding a reading of words it had never seen.
163. **NO** The CSP request-header plumbing is spoofable. Checked rather than
     assumed: the middleware uses `Headers.set` on a copy of the request's
     headers, not `append`, so a client sending its own `x-nonce` or
     `Content-Security-Policy` has it overwritten before Next reads either. The
     response only ever carries the policy; `x-nonce` is request-side and never
     leaves the server.
164. [x] **P1** 157's fix put the whole store on `/no-access`. The sign-out
     button called `useStore` and `clearDrafts` directly, and that button also
     renders on the page a stranger with no workspace sees — 215 kB became
     232 kB, seventeen kilobytes of task machinery downloaded to render one line
     of copy and a way out. Caught by `npm run build` printing a per-route number
     next to the one before it, which is exactly what 76 exists for.

     The dependency runs the other way now: whatever holds session state
     registers how to drop it, and the button asks without knowing who answered.
     `StoreBoot` mounts only inside the app, so `/no-access` registers nothing,
     imports nothing, and has nothing to clear. Back to 217 kB. Four assertions,
     including that one handler throwing does not leave the rest holding the
     previous person's data.
165. [x] **P1** `verify:headers` minted a magic link for a real member's
     address. Supabase invalidates any earlier link for an address when a new
     one is issued, so running the check while somebody was signing in broke
     their link — with nothing on either end to explain why. A verification
     script is not allowed to interfere with the thing it verifies. It invites,
     creates and signs in a throwaway member now, the same shape the other two
     live suites use, and never touches an account a person uses.
166. [x] **P2** The first version of that cleanup did not run. It was fired from
     `process.on("exit")`, which is synchronous — the delete was dispatched and
     the process was gone before it landed, so the throwaway member survived
     every run. Awaited in a `finally` now, and the script checks afterwards
     that nothing is left, which is how this was found: by looking rather than
     by trusting the code that had just been written to do it.
167. [x] **P1** The date picker (47) was forty-four tab stops. Every day was a
     tabbable button, so opening it put 42 stops between the chip above and the
     time field below — the keyboard path through the modal went from short to
     unusable, in a component added the same day to *improve* the modal. A grid
     is one control: Tab reaches it, arrows move within it, Tab leaves. Which day
     is tabbable follows the focus, so returning lands where you left rather than
     on the 1st. Plus `role="grid"`, `aria-selected`, `aria-current="date"` on
     today, and a full date as each cell's label instead of a bare numeral.
168. [x] **P2** That picker also computed `(getDay() + 6) % 7` inline — a magic
     expression, and a violation of this file's own rule that every calendar-day
     calculation goes through `lib/time.ts`, which is how the timezone bugs
     started in the first place. `stepInGrid` now lives there with fifteen
     assertions: Home and End are the two easy to get one day wrong, and one day
     wrong in a date picker is a task due on the wrong day.
169. [x] **P1** The calendar had no keyboard path at all. Not a missing
     shortcut — no way to reach a day, no way to open one, nothing under Tab.
     A whole view of the app was pointer-only, which the original audit's
     keyboard section (55–60) missed entirely because it went looking for
     shortcuts rather than for whether the view could be operated.

     The month grid is one tab stop, arrows move within it, Enter opens the day.
     Same `stepInGrid` the date picker uses, so "up is a week" has one
     definition. Each cell carries its date and its count as a label, because a
     screen reader handed « 12 » in a grid of numerals has been told nothing.
170. [x] **P2** …and wiring that up put two handlers on the same keys. The
     window-level listener that pages the month is a real listener, so the
     grid calling `preventDefault` does not stop it: one press moved the focus
     by a day *and* the month by one. Guarded on whether focus is inside the
     grid. Caught by reading the file the change landed in rather than by
     running it, which is the only way this one shows up before a user finds it.
171. [x] **P2** The week mode had the same hole the month did, and fixing only
     one would have been worse than fixing neither — a view where half the modes
     are operable is one nobody can predict, because there is nothing on screen
     saying which mode you are in as far as the keyboard is concerned. Both share
     `onGridKeyDown` now, so they cannot drift. Up and down are ignored in week
     mode rather than paging somewhere nobody asked to go: seven days in a row
     have no week above them.
172. [x] **P2** The day sheet cost eight tab presses before you could type — the
     close button and seven day buttons, in a panel whose entire purpose is the
     field at the end of them. It focuses the composer on open. Off in the list,
     where the composer sits above six sections somebody may have come to read.
173. [x] **P1** Nothing in the app said which build it was. Half an hour went
     into establishing that a deploy had gone out at all — the code was live,
     the person was looking at the login screen, and no evidence inside the app
     distinguished those two situations. A commit and a build date in settings
     answer it in one glance.
174. [x] **P1** A lapsed session and a first visit look identical. The
     middleware can only report the case where an invalid cookie is still
     present; one the browser has already discarded leaves no trace, so somebody
     returning after a week gets a stranger's screen and no reason to think
     anything is wrong. That is the whole of « I am looking at the app and
     nothing has changed » — what they were looking at was `/login`. This
     browser having used the app before is the only evidence left, and the login
     screen now says so.
175. [x] **P1** A sleeping database was reported as a wrong email address. This
     project is on the free plan, which pauses after a week without activity —
     a long weekend for two people. On the Monday, `getUser()` fails, the visit
     lands on `/login`, the sign-in fails, and the app says « Vérifie
     l'adresse ». The address is fine. Somebody would retype it, try again, and
     never learn that what they need is a click in a dashboard they were not
     thinking about. The login screen asks `/api/health` on the failure path —
     definitive rather than inferred from the shape of an auth error — and names
     the likely cause. Confirmed by pointing a build at a host that does not
     exist: the probe answers 503 with `database.ok: false` in four seconds.
176. [x] **P2** A failed task query rendered as an empty workspace. `tasks ?? []`
     meant a read that did not answer produced « Rien encore. Ajoute ta première
     tâche. » for somebody with forty — an empty state and a failed read look
     identical from the inside, mean opposite things, and the wrong one invites
     you to type your work in again. Only that query is guarded; a missing
     workspace name is a blank heading and missing profiles is a board without
     colours, which are honest degradations. Testing narrowed the claim: a fully
     paused project never reaches this, because auth fails first. What it covers
     is auth answering while PostgREST does not, which they can do
     independently.
177. [x] **P1** The project will pause, and a well-explained failure is still a
     failure. 175 made the Monday-morning message honest; this stops the Monday
     happening. A daily Vercel cron hits `/api/health`, which makes a real
     PostgREST query — anonymous, against a table behind RLS — and that is
     genuine activity, which is what resets Supabase's seven-day clock. A route
     that only read environment variables would keep Vercel busy and let the
     database fall asleep anyway. 12:00 UTC, before either of these two opens the
     app; the hour does not matter, only that seven days never pass between two
     runs. No `CRON_SECRET`: the endpoint is public by design, takes no input,
     and reveals only whether things are up. `docs/keeping-it-awake.md` records
     what it does not cover — a manual pause, a disabled cron, and backups,
     which it has nothing to do with.
178. [x] **P1** A pending invite said nothing about whether anybody was told.
     Found in this workspace's own data: the invite for the second person was
     created 2026-09-08, a day before the first account existed — it was written
     by the seed in migration 0001, so no email was ever sent for it, and from
     the people page it looked identical to one that had been. Somebody has been
     « invited » since before there was a workspace and has never heard anything.

     Invites now show when they were created, and an admin can send one again.
     Resending creates and deletes nothing — the row already carries the address
     and the role — so it is safe to press twice, and it is under the same hourly
     ceiling as a new invitation, since a button that can be pressed repeatedly
     is more likely to be.
179. [x] **P1** `docs/03` says an admin « can invite, remove, and change roles ».
     The third was never built. The policy allowed it and the trigger from 0004
     enforced the last-admin rule, but nothing in the app could ask — so a role
     was something you were given once, by a seed, permanently. An unimplemented
     line of the specification rather than a missing nicety, and it was invisible
     because the two people here were both seeded as admin and would never have
     had occasion to notice.
180. [x] **P2** A pending invite never said what it granted. `role` was fetched
     and not rendered, so an invitation carrying admin looked exactly like one
     carrying member — and this workspace's own seeded invite grants admin, which
     is a decision nobody in it made on purpose. Who can remove whom is worth
     knowing before somebody arrives rather than after.
181. [~] **P1** `docs/08` § 8.8 sets a number nothing had ever checked: « cold
     load to interactive under 1.2s on 4G ». Measured with the new `npm run
     cold`, against production: `/login` is 268 KB over the wire and floors at
     1672 ms, `/` is 351 KB and floors at 2095 ms — 75% over, before parse,
     hydration or fonts.

     It is not reachable with the locked stack, and that is the finding rather
     than an excuse. The budget allows roughly 180 KB after round trips; React,
     Next, `@supabase/supabase-js` and `motion` are 209 KB between them, and the
     two candidates for removal are realtime — the entire two-person premise —
     and the completion animation, which is the document that sets the budget
     forbidding the trade in the same breath. `DECISIONS.md` carries the
     arithmetic and what was deliberately not done about it. The script stays so
     the number moving is visible even though the absolute value will not pass.
182. [x] **P1** The uncheck tone was a completion note in disguise. § 8.2 asks
     for « a fifth below the root, never part of the run » — one sentence making
     two claims, and the implementation satisfied neither. A fifth below C5 is
     F4, seven semitones down; the code had -5, which is G4, a *fourth* below —
     and G is degree 7 of the very scale the run climbs, so the tone whose job
     is to sound unlike a completion was a completion note moved down an octave.

     Consonant either way, which is exactly why it never sounded wrong and never
     got noticed. F is the one degree major pentatonic leaves out, which is why
     the specification named it. Inherited from `reference/sound.ts`, which the
     brief said to copy as-is — so the reference carries the same defect, and
     its README now says so. Five assertions, including one that keeps the old
     value as a test so the mistake cannot come back quietly.
183. **NO** `docs/07-keyboard.md`, checked line by line against the code. All
     eighteen mapped keys exist, the focus model holds in full — including hover
     setting row focus, which is the easy one to forget — every palette group is
     present in the specified order, and the only `⌘` strings outside the
     shortcut sheet are in code comments rather than rendered text, which is
     what the mobile rule asks. Nothing to do. Recorded because a spec checked
     and found whole is a result, and the alternative is checking it again in
     three months.
184. [x] **P2** The progress ring's comment repeated § 8.3's « always visible »
     while the code beside it returned null at 0/0. The behaviour is defensible
     — a ring at zero out of zero reads as a bug rather than as calm — but a
     comment claiming what the code does not do is worse than either choice,
     and it is the second instance of that exact defect this session. Stated as
     a deviation, with the reasoning, in the file and in `DECISIONS.md`.
185. **NO** § 8.3 counts only tasks assigned to you, so a task nobody has picked
     up does not count toward anybody's ring even when it is due today — in a
     workspace for two, where plenty is captured before it is assigned, the ring
     can read 2/2 with a checkmark while three unassigned tasks are due. That is
     the specification's instrument rather than a fault in implementing it, and
     changing it would make the ring measure something else. Written down so the
     gap between what it says and what the day holds is a known one.
186. [x] **P1** `docs/10`'s contrast gate had been checked once, by hand, with a
     calculator — during Phase 6, when `--ink-faint` turned out to be at 2.74:1
     and both it and `--ink-muted` had to move to keep the three-step ramp. After
     that, nothing. The next person to nudge a hex gets no warning, and a
     contrast failure is invisible to everybody who does not have the deficiency
     it excludes. `npm run verify:contrast` computes all six tokens against both
     grounds from the same stylesheet the browser reads, and asserts the ramp
     still descends. Currently passing, `--ink-faint` at 4.94:1 dark and 4.95:1
     light — which is how close the thing docs/10 singled out still is.
187. [x] **P2** `docs/10` asks that every `new Date()` outside `lib/time.ts` be
     justified. Five sites, two justified. The other three — two rate-limit
     windows and a log timestamp — are all elapsed server time rather than a
     calendar day, which is exactly why they are correct and exactly what was
     not written down. The grep the gate describes is now self-documenting.
188. **NO** The service role key is absent from all sixteen production chunks
     and there is no `any` in committed code. Both re-checked against the
     deployed bundle rather than the local build, because the gate says « grep
     the production bundle to confirm — do not assume ».
189. [x] **P0** The avatar field shipped broken by my own hand. `lib/csp.ts` sets
     `img-src 'self' data: blob:`, added hours earlier; the avatar field takes a
     URL to somebody's photo, which lives on another host. Every external image
     was refused, the component's `onError` fallback caught it, and the app showed
     initials — correctly, silently, and identically to having typed nothing. The
     feature could not work and nothing said so. `img-src` now allows `https:`,
     with the privacy cost written down in the file: loading an image tells that
     host the viewer's IP, which is why the field says the image comes from
     wherever it already lives rather than pretending it is uploaded. `script-src`
     stays narrow. `verify:headers` now asserts the pair, because the reason this
     shipped is that nothing checked `img-src` at all.
190. [x] **P2** And when a URL genuinely does not load, the settings field now
     says so. Falling back to initials is right in a task row — a torn-page icon
     beside somebody's work helps nobody — but wrong where the URL was just
     typed, because there silence is the only feedback you get.
191. [x] **P1** Measured the activity trigger rather than assuming it: 0.42 ms
     per row warm (2.113 ms for five calls under `explain analyze`), against
     0.009 ms for `tasks_touch`. Forty-five times the other trigger and still
     invisible next to a Montreal→`ca-central-1` round trip, which the optimistic
     store does not make anybody wait for. No change; the number is recorded so
     the next person does not have to guess either.
192. [x] **P1** The log stored a full row snapshot on every action and reads one
     only for a deletion — `activity/actions.ts` refuses anything else, and the
     page's select does not fetch the column. Four fifths of what it wrote could
     not be reached by any code path, at ~500 bytes per write, growing forever.
     Migration 0013 keeps the snapshot only for deletions and nulls the rest.
     Noted there that if per-edit history is ever wanted this was never the
     column for it: 0012 stored `row_after`, and undoing an edit needs
     `row_before`. The snapshot kept was not the one that would have helped.
193. [x] **P1** Worse than the bytes: the modal debounces text at 400 ms, so
     writing a few sentences of notes flushed a write per typing pause and each
     became its own `updated` entry. Five to fifteen identical "modified the
     notes" rows for one note — in a page the owner asked for so they could see
     when something was deleted or created, which those rows bury. Consecutive
     edits by one person on one task now merge into a single entry carrying the
     union of the columns touched, inside a two-minute window: long enough to
     cover thinking pauses, short enough that picking a task back up after lunch
     is its own entry. Verified: four edits collapse to one, `{label,notes}`.
194. [x] **P0** Which is where the coalesce found a real ordering bug. It looked
     up "the newest entry for this task" by `created_at desc`, and `created_at`
     is `now()` — transaction start time, identical for every row one transaction
     writes. On a tie the pick is arbitrary, and testing caught an edit merging
     into an `updated` entry that *preceded* a `completed` one, moving a change
     to before the completion it actually followed. The page ordered by
     `created_at` too, and `restack()` rewrites every position in one statement,
     so those rows already rendered in whatever order the planner returned. `id`
     cannot break the tie — a random v4 uuid is noise. Migration 0014 adds a
     `bigserial seq`; the trigger, the coalesce and the page all order by it, and
     a merge claims a fresh `seq` so it rises with its new timestamp. Now:
     `created updated completed updated`, strictly increasing.
195. [x] **P1** None of that was tested, in a subsystem written entirely by a
     trigger where a failure shows up as a log that is quietly shorter than what
     happened. `verify-db` now covers all nine behaviours end to end: the insert,
     the collapse and its column union, a no-op write producing nothing, a
     completion interrupting a run instead of absorbing it, `seq` increasing, no
     snapshot where none can be restored, and a deletion keeping all sixteen
     columns so a restore can be honest.
196. [x] **P1** That suite was also polluting the thing it verifies. Every run
     left probe entries in the real activity log, because deleting a task logs
     the deletion — the feature working correctly. Nineteen had accumulated in
     the live table; the new check caught them. Cleaned by hand after confirming
     all nineteen were mine: both titles are literal strings in `verify-db.mjs`,
     none of their tasks still existed, all were written inside the hour I spent
     running it. The script now clears entries for ids it created and counts
     strays without deleting them — same rule as everywhere else in that file,
     which exists because a leftover row was once assumed to be residue and
     turned out to be a task somebody had just typed.
197. [x] **P2** And the first version of that cleanup silently did nothing for
     one of the three probes: the realtime section removes its id from
     `created.tasks` once it has deleted the task itself, so the log cleanup never
     saw it. Three rows survived every run. `taskIdsEver` never shrinks, because
     activity entries outlive the task they describe — that is the whole point of
     the table, and it is exactly what the cleanup had failed to account for.
198. [x] **P1** The composer had no path to notes. `docs/06` is emphatic that
     Enter clears and keeps focus — "the feature that decides whether two-minute
     tasks make it into the app at all" — so that stays untouched, and notes are
     deliberately not one of the composer's tokens. But that left exactly one way
     to add a note to something you had just captured: find it again in the list
     and open it, after the composer had already cleared and taken your handle on
     it away. Shift+Enter now creates the task and opens it, and lands the cursor
     in the notes rather than the title, because the title is the sentence you
     just typed. Documented in `docs/07`'s table and in the `?` sheet, which is
     where somebody would go to find out it exists.
199. [x] **P2** With a thumb-sized equivalent, because a phone has no Shift+Enter
     and the composer is where a phone captures too — so the keyboard-only version
     would have been missing from the half of the day it is most needed in. A
     small pen button inside the input, only while there is something to create.
200. [x] **P1** `createTask` now returns the id it was already generating. Every
     other mutation returns void deliberately — a caller that can read a result
     eventually awaits one, and nothing here may make somebody wait — but this id
     comes from `crypto.randomUUID()` on the calling frame, before anything is
     sent. Returning it costs no round trip and says nothing about whether the
     write landed, which is the property that matters.
201. [x] **P1** Which surfaced a bug nobody would have reported: `calendar-view`
     never called `useOpenTask`. On `/calendar`, the command palette's "open this
     task" set state in a component that was not mounted and silently did
     nothing. All three views now share one `useTaskModal` hook — they had the
     same open/close state three times and not identically, which is how one of
     them came to be missing half of it.
202. [x] **P2** Added `scripts/dev-login.mjs`, because `docs/12` ends with "verify
     by using the app, not by reading the code" and the app is behind a magic
     link — the one credential a script must never mint, since issuing one
     invalidates the link already sitting in somebody's inbox. It creates a
     throwaway member with a password and prints the session in the cookie shape
     `@supabase/ssr` reads, with a `--cleanup` that verifies rather than assumes.
203. [x] **P1** Used it to render every authenticated route against a real
     session: `/`, `/board`, `/calendar`, `/activity`, `/settings` all 200 with no
     runtime error, and the live response header now reads
     `img-src 'self' https: data: blob:` — item 189 confirmed in production shape
     rather than in the source. The three new strings were also confirmed present
     in the shipped chunks, since a string that never reaches the bundle is a
     feature that does not exist.
204. **NO** The interaction itself is still unverified in a browser: the Chrome
     extension is not connected in this environment, so Shift+Enter, the focus
     landing in notes, and the modal stacking over the calendar day sheet have
     been typechecked, linted, built and server-rendered but not pressed. Recorded
     as unverified rather than described as done.
205. [x] **P0** The modal lost what you typed. Both text effects cancel their
     timer in the cleanup — right while you are typing, wrong when the modal
     closes: type a note, press Esc inside the 400 ms window, and the cleanup
     cancelled the only write that was ever going to happen. Silent, every time.
     It was always reachable and item 198 made it the *main* path, since
     Shift+Enter exists precisely so you can open a task, type a note and leave.
     Closing now flushes. There is no Cancel in this modal by design, so leaving
     was never supposed to mean discarding.
206. [x] **P1** The label had a second version of the same hole: `defaultValue`
     plus `onBlur`. Esc unmounts the input, and removing a focused element does
     not dispatch `focusout`, so `onBlur` never ran and the label was dropped.
     It now debounces like the other two, which also means it saves as you type
     rather than only when you happen to click elsewhere.
207. [x] **P1** The three buffers became one object carrying the id of the task
     they belong to. Switching tasks renders the new `task.id` while the buffers
     still hold the old text, so anything pairing "current id" with "current
     text" sees one commit of new-id-old-text — and a flush on that commit writes
     one task's notes onto another. Keeping the owner inside the buffer makes
     that unrepresentable rather than merely unlikely.
208. [x] **P1** The flush lives in `lib/edit.ts` as `textPatch(buffer, current)`,
     a function of two plain objects, with eleven assertions in `verify:logic`.
     A component cannot be asserted about, and this is a failure nothing reports:
     no throw, no log, the note is just not there later. It returns null rather
     than an empty patch, because an empty patch still costs a round trip, an
     undo entry and a row in the activity log.
209. [x] **P2** Dupliquer copied from props while the text fields were still
     debounced, so duplicating within 400 ms of an edit produced a copy from
     before the edit while the original kept it — two tasks differing by a change
     you had just made. It flushes first, then copies what is actually saved.
210. [x] **P1** Clicking a row now completes it, and editing is a button that
     appears on hover. The reverse of `docs/06`'s original rule, asked for after
     using the app, and the reasoning holds: completing happens dozens of times a
     day and is what this app exists to make feel good, while editing is
     occasional. Stated in `docs/06` with its cost — a click meant as "let me
     look at this" now completes something, which is why completion stays the
     most undoable action here. Hover-revealed with a mouse, permanent under a
     finger: there is no hover on a touch screen, so a hover-only control there
     is not a subtle affordance, it is a missing one.
211. [x] **P0** The calendar's cards had no click handler at all. A press became
     a drag or it bubbled to the cell, which opened the whole day — so reaching a
     task you could already see took two clicks and an intermediate screen, and
     the cards added to make tasks distinguishable stopped short of letting you
     act on the one you found. They now open the same `TaskModal` the list and
     the day sheet use, which is the standardisation that was asked for: the
     modal was already shared, the calendar just had no way into it.
212. **NO** The calendar card opens rather than completes, unlike the list and
     the board. Deliberate inconsistency: a calendar card is a 4mm bar in a grid
     of forty-two, and a stray click there should not mark something done. The
     calendar is where you look at a month and decide; completing is what the day
     sheet is for, one click away, at full row size.
213. [x] **P1** Clicking a board column's empty space adds a task in that column.
     The board had one composer, at the bottom of the page, which could only
     guess at the column you meant — putting "this is Guillaume's, En cours" on
     the board meant typing it and then dragging it twice, while the empty space
     that obviously meant "add here" did nothing. The column's meaning arrives as
     fields the typed line cannot express, and anything the line *does* parse
     still wins, so typing « demain » into today's column is a correction rather
     than a conflict.
214. **NO** Grouped by date, only « aujourd'hui » and « demain » name a day.
     « cette semaine » and « plus tard » are ranges, and picking a Thursday out of
     one would be the app deciding something the person did not. Those columns
     create an undated task, which is what the composer would have done anyway.
215. [x] **P1** That position is the last card's plus one, computed directly
     rather than through `placeInColumn`. That function can hand back a restack to
     apply, and this runs during render, where applying one would be a write in
     the middle of a render. It does not need to: appending is the one case that
     can never exhaust a gap, because it adds instead of halving.
216. [x] **P2** The month grid was hairlines on the page background — every cell
     the same near-black, all its structure in 1px lines. At a month's size that
     reads as a void with scratches in it. A day in this month is now a surface
     and a day outside it is not, one step apart, so the month reads as a block
     without any cell shouting.
217. [x] **P2** Today is a filled accent chip instead of a coloured numeral.
     Accent-on-dark at 12px is a difference you have to go looking for, and today
     is the one cell in forty-two that should find you instead.
218. [x] **P2** Calendar cards carry their owner's colour across the card rather
     than on a 2px rule alone — a 10% wash, via `color-mix` rather than an alpha
     suffix, because the colour is only sometimes a hex: En cours and the unowned
     case are CSS variables and `var(--color-accent)1a` is not a colour.
     `color-mix` also follows the theme, which a baked hex would not.
219. [x] **P2** `CELL_CHROME` 40 → 44 for the taller date chip. Undercounting
     there does not fail loudly: the grid fits one card too many and clips the
     last one against the cell's bottom edge.
220. **NO** "At midnight all done tasks go to the archive" is already how this
     works, and it was worth proving rather than rebuilding. The board filters to
     `isOnDay(completed_at, day)` and the list footer has three states — shut,
     today, and the week the browser already holds. `useToday` moves the day on a
     timer re-armed daily so DST is picked up, with a `visibilitychange` check for
     a laptop that slept through midnight. Six assertions now pin it, written with
     UTC instants because `completed_at` is a timestamptz and an evening in
     Montreal is already tomorrow in UTC — the single most common way this app
     breaks. The rows are never deleted; they stop being today's work.
221. **NO** The number in a board column header is that column's task count, and
     it is faint until it is worth reading: grouped by status, an En cours column
     past `WIP_COMFORTABLE` (5) turns it to full strength with a tooltip. Nothing
     is blocked or refused — the count simply stops being quiet, which is the
     whole intervention. Two people cannot be working on nine things, and a status
     everything sits in has stopped sorting anything.
222. [x] **P0** Dropping a dragged card also clicked it. A mouse drag ends with
     `pointerup`, and the browser then dispatches a `click` on the nearest common
     ancestor of press and release — nothing about that click says it came from a
     drag. This was always true and always harmless, because a click opened the
     modal: drag a card to another column and the modal popped open. Item 210
     made a click *complete the task*, so the same trailing click now marked
     things done as you rearranged the board. Found by reviewing the change
     rather than by hitting it. `lib/drag.ts` now swallows exactly one click
     after a drag that actually began, in the capture phase so no card handler
     sees it, with a 300 ms window because the click is not guaranteed — a touch
     drag or a release over another element fires none, and a listener left armed
     would eat the next real click instead. It also fixes the older version of
     the same bug: dropping a card onto a calendar cell no longer opens that day.
223. [x] **P1** The board card's edit button was `absolute right-1.5 top-1.5`,
     floating over the title. Invisible until hover with a mouse, but permanently
     on top of the text under a finger, where it is always shown — the one place
     the affordance was most needed was the one place it broke the card. It is a
     flex sibling now. The reason for pinning it was to avoid reflow when it
     appears, and that reason was already covered: it hides with `opacity`, not
     `display`, so its 24px is reserved either way.
224. [x] **P1** Every board column's composer shared one draft. Drafts are keyed
     so a half-typed title survives a glance at another view, and the key was the
     due date or `"main"` — fine for two composers, wrong the moment item 213
     opened one per column. Typing into one column, clicking away, then opening
     another handed you the first column's sentence, primed to be created in the
     wrong place. Each box now carries its own scope.
225. [x] **P0** `lib/drag.ts` was found zeroed — 9587 bytes of NUL, the file's
     exact length, written at the moment the previous session ended. Not an edit;
     a truncated write. Restored from the last commit, and the whole tree scanned
     for the same signature to be sure it was the only one. Worth recording
     because it typechecks as a missing module rather than as corruption, and the
     obvious reading of `git status` is that somebody meant to change it.
226. [x] **P0** The checkmark stopped drawing before its animation ended.
     `stroke-dasharray` was a hand-written 13.2 next to a path that is 10.879
     long, so the dash was 21% longer than the stroke it dashed and the last
     17.6% of every draw had nothing left to draw. § 8.1 says "the checkmark
     DRAWS, it does not appear — that distinction is most of the effect", and
     this is that effect finishing early and then idling. Two plausible numbers
     side by side, one wrong, nothing in review to tell them apart.
227. [x] **P1** It had also been quietly eating my own tuning. Raising
     `checkDrawDuration` from 180 to 220 in the § 8.9 pass was meant to stop the
     tick reading as a pop; because 17.6% of the window was dead, the visible
     draw only went from ~148ms to ~181ms and the tail grew instead. The change
     I measured by feel was mostly not the change I made. With the length right,
     220ms is 220ms of drawing.
228. [x] **P1** Both are now derived from one array of points: the `d` string and
     the length come from the same source, so they cannot disagree again. Moved
     to `lib/motion.ts` rather than left in the component, because that is what
     lets `verify:logic` assert it — thirteen checks covering the derivation, the
     old wrong value as a regression guard, the points fitting the 14px viewBox,
     the draw and the ripple both finishing inside the hold, the hold sitting in
     the 700–1100 § 8.1 predicts, and every user-triggered timing under the 260ms
     `docs/04` ceiling.
229. **NO** The checkbox border is `--color-control`, not the `--color-border-strong`
     § 8.1 asks for. Already deviated deliberately and already written down: an
     18px control outlined at 1.46:1 was genuinely hard to find, and
     `--color-control` exists at 3:1 for exactly the boundaries WCAG 1.4.11 does
     not exempt. Re-checked rather than assumed, since the rest of this pass was
     about the spec's centrepiece.
230. [x] **P2** A stale comment on the checkbox said the rest of the row opens
     the modal. It completes the task now (210), which makes its
     `stopPropagation` load-bearing in a new way — without it a click would
     toggle twice and land back where it started.
231. [x] **P2** Two comments had drifted from the values they describe.
     `lib/sound.ts` still opened by saying completions climb « within 20s » when
     `RESET_MS` is 30s, and `lib/hold.ts` still called itself « the 900ms beat »
     when the hold is 1100. Both were my own § 8.9 changes, and a comment stating
     the old number is worse than no comment: it is the thing somebody reads
     instead of the code.
232. **NO** Reopening a task does not reset the climb, and now says so. § 8.2
     wants reopening to feel « neutral, not punitive », and sending the next
     completion back to the root is the punitive reading — you corrected
     something and the app took your run away. It matters more since 210: a click
     on the row completes it, so accidental completions are easier to make, and
     undoing one should cost nothing.
233. **NO** Past the tenth note the run holds at the top rather than wrapping.
     § 8.2 says « up ten notes » and the scale holds ten. Wrapping to the bottom
     would undo the one thing the mechanic exists for — a phrase that rises — and
     climbing on leaves the register where a sine at 0.09 still sits under a
     conversation. An eleventh completion in one run repeating the top note is
     the least bad of the three, and it is now written down as a choice rather
     than left looking like a `Math.min` nobody thought about.
234. [x] **P2** The day sheet printed its own heading on every row: « 8 septembre »
     against forty tasks inside a panel titled « 8 septembre ». The list already
     suppresses this for Aujourd'hui — the rule was just hardcoded to today
     rather than to "wherever the day is already known". `impliedDay` generalises
     it. The time survives, since that is the part the heading does not say, and
     an overdue task keeps its red even where the date drops out.
235. [x] **P1** Dragging wrote history. Every task write fires the log trigger
     and `position` is a column like any other, so rearranging the board produced
     entries reading « modifié · ordre » — one per drag, and one per card in the
     column when a drag exhausted a gap and called `restack()`, which rewrites
     every position in a single statement. One gesture, ten entries, none of them
     saying anything. The same failure the 0013 coalesce fixed for typing,
     arriving by a different route: an afternoon of tidying would bury the
     creations and deletions the page was asked for.
236. [x] **P1** `position` now joins `updated_at` as a column the log does not
     consider — both are bookkeeping, one owned by a trigger and the other
     recording where a task sits rather than what it is. A pure reorder writes
     nothing; a cross-column drag that also reassigns is logged as the
     reassignment and does not mention the ordering it touched on the way.
     Verified live in a rolled-back transaction and pinned with three assertions
     in `verify:db`.
237. **NO** Caught before it mattered: the live table had exactly one entry
     mentioning `position` and none that were position-only, because the two of
     them have barely dragged anything yet and the 2-minute coalesce had absorbed
     the rest. The cleanup in 0015 therefore deleted nothing and rewrote one row.
     Worth doing now precisely because there was nothing to clean up.
238. [x] **P1** The streak read every completion that had ever happened. The
     shell selected `completed_at` for every completed task in the workspace, on
     every page load, and reduced it to distinct Montreal days in JavaScript —
     an unbounded query to answer a question whose result is at most a few
     hundred dates. Two people at a handful a day reach four figures inside two
     years.
239. [x] **P0** And it had no `order by`. PostgREST caps result rows, so past
     that cap the query returns an arbitrary subset — which for a streak is an
     arbitrary answer, arriving silently, years from now, with nothing to say the
     number has stopped being true. Not yet reachable at three completions, which
     is exactly why it was worth fixing now.
240. [x] **P1** `completion_days()` does the DISTINCT and the timezone
     conversion in Postgres and returns dates, bounded to a 400-day window —
     longer than any streak these two will plausibly hold, and bounded rather
     than unbounded. `security invoker`, so RLS on `tasks` scopes it and the
     function holds no privileges of its own.
241. **NO** That is a day-bucket calculation outside `lib/time.ts`, which
     CLAUDE.md forbids in the strongest terms it uses anywhere: "the single most
     common way this app breaks". Taken deliberately, because computing distinct
     days in Postgres is the only way to answer the streak without reading every
     row. What makes it safe is `montreal_day_of()` and nine assertions holding
     the two conversions against each other on the instants where a timezone can
     actually disagree — either side of both DST boundaries, the evenings that
     are already tomorrow in UTC, and a New Year's Eve that is next year in UTC.
     All nine agree.
242. [x] **P2** `verify:db` was printing a `MODULE_TYPELESS_PACKAGE_JSON` warning
     over its own output once it imported `lib/time.ts`. A verification script
     whose result you have to read around is worse at the one thing it does.
243. [x] **P1** A realtime channel that fails and stays failed left the board
     silently stale. `subscribe` acted only on SUBSCRIBED and ignored
     CHANNEL_ERROR, TIMED_OUT and CLOSED. Every recovery path in the file ends in
     a resync, but all of them assume the interruption ends — and a channel can
     fail permanently: a token it cannot refresh, a network that answers HTTP but
     not websockets, a proxy that drops the upgrade. supabase-js retries, and if
     the retries never land there is no later SUBSCRIBED to hang a resync on.
     The failure looks like the worst version of itself: the app keeps working,
     keeps accepting writes, and quietly stops showing the other person's.
244. [x] **P1** So while the socket is down the app falls back to asking, once a
     minute, and stops the moment it comes back. Long enough that an ordinary
     reconnect wins the race and cancels it; skipped entirely while the tab is
     hidden, since a hidden tab is nobody's live view and visibility already
     resyncs on return. It converges within a minute instead of never — which is
     the honest answer to « can you confirm the changes are instant ».
245. [x] **P1** Reviewing that change caught 238 being only half done: `resync`
     carried its own copy of the same unbounded completions query, reading every
     `completed_at` in the workspace and mapping it through `instantToDay`. It
     matters more there than in the shell — resync runs on every reconnect, every
     wake from sleep, and now once a minute while degraded. Both call sites use
     the bounded RPC now, which is what fixing one of two identical queries
     should have prompted me to check the first time.
246. [x] **P1** An insert whose reply went missing was reported as a failure.
     This is the exact case `withRetry` exists for, seen from the far side: the
     first attempt reaches the database and commits, and only the response is
     lost. The retry sends the identical row — ids are generated on the client —
     so it lands on the primary key and returns 23505. Read as a refusal, that
     rolled the task off the screen and showed « déjà là » about a task sitting
     in the database, visible to the other person.
247. [x] **P1** Realtime could not repair it either, which is what made it stick.
     The INSERT echo arrived while the id was still claimed in `pending`, so
     `applyRemote` had already dropped it as a local echo — the one mechanism
     that would have put the row back had correctly refused to. It stayed missing
     until the next resync.
248. [x] **P1** `insertWithRetry` treats a unique violation *on the retry* as the
     write having already worked, for both insert paths — `createTask` and the
     undo that restores a deleted task. Only on the retry: a first attempt
     returning 23505 is a genuine id collision, which for a v4 uuid does not
     happen, and swallowing it would hide a real one. Four assertions in
     `verify:store`, which needed a stub that can script a different answer per
     attempt, since the retry is the interesting one here rather than the repeat.
249. [x] **P2** The store stub had no `rpc`, which `resync` began calling in 245.
     It was not reached by any existing test, so it would have failed as a
     confusing undefined rather than as a missing stub the first time somebody
     wrote one.
250. [x] **P0** `restack()` called itself all-or-nothing and was not. It sent one
     UPDATE per row; a refusal put every row back *locally* and raised one toast,
     which is right — but the writes that had already landed stayed landed. Five
     of twenty succeeding leaves the column half renumbered on the server, and
     the local rollback hides that until the next resync.
251. **NO** Worse than it sounds, because of why a restack runs at all: the gap
     between two neighbours can no longer be halved, so the positions going in
     are nearly equal. Modelled it rather than reasoned about it —
     A=1.0, B=1.0000001, C=1.0000002, move only B to 2048, and the server's order
     is A, C, B while the browser still shows A, B, C. Somebody's board silently
     reorders. That is precisely the "partly renumbered" state the function's own
     comment calls the one state worse than not renumbered; the old code avoided
     creating it on this side of the wire and created it on the far side.
252. [x] **P1** `restack_tasks(ids, positions)` does it in one
     `update ... from unnest(...)` — one statement, one transaction, every row or
     none. `security invoker`, so RLS decides what it may touch and it holds no
     privileges of its own. Twenty round trips become one, which is the smaller
     reason to prefer it. A length mismatch raises rather than silently pairing
     short, since the arrays are matched by index.
253. [x] **P1** Verified in both places it can be wrong: three assertions in
     `verify:store` that the whole column moves in exactly one call and that no
     per-row update is sent, and a live rolled-back transaction confirming the
     positions land together and that a mismatched pair is refused.
254. [x] **P2** Two gaps in the store stub found by using it. Its `rpc` returned
     success unconditionally, so `restack` became untestable the moment it
     stopped going through `from()` — the existing restack failure tests passed
     for the wrong reason until it could fail. It now answers to the same script
     as everything else, except `completion_days`, which is read during resync
     and would otherwise catch errors scripted for a mutation.
255. [x] **P2** Sidebar icons were 16px. `docs/04` is specific: "16px in rows and
     buttons, 18px in the sidebar". The one place the size is called out
     separately was the one place following the other number.
256. [x] **P1** The edit buttons I added in 210 were 14px icons in 24px targets.
     `docs/04` says 16px in rows and buttons, and 24px is the floor WCAG 2.5.8
     sets rather than a size to aim at — on touch this is the only way to open a
     task, so it grows to 36px there. Their `focus-visible:outline` classes also
     came out: `globals.css` already gives every focusable element the 1px accent
     ring at 2px offset that `docs/04` § Focus asks for, so those were restating
     the default and would have drifted from it.
257. [x] **P1** An empty board column showed nothing at all. The button added in
     213 is transparent until hovered, which is right under a full column and
     wrong under an empty one — the invitation was invisible in the only column
     that needed it. `docs/06` removed the old « Rien ici. » because a column
     with nothing in it is already obviously empty and six copies of that
     sentence are noise; this is a different thing in the same place, a control
     rather than a label. Visible when the column is empty, quiet when it is not.
258. [x] **P1** Three "pick one of N" selectors, two different shapes. The
     modal's chips were `rounded-md px-2.5 py-1.5` with an accent border and a
     wash; the board's « Grouper par » and the calendar's month/week were
     `rounded-sm px-2 py-1` and marked the selection by moving the label one step
     up the text ramp and nothing else — barely legible, on a control whose whole
     job is to show the current state. One `Chip` now, one look.
259. [x] **P2** And it is `rounded-sm`, 6px, which `docs/04` assigns to inputs
     and buttons. The modal's 8px was the task-row radius on a button — precisely
     the "one radius for everything" that having a radius per role exists to
     prevent.
260. [x] **P1** The modal had no shadow. `docs/04` bans drop shadows and carves
     out exactly one exception in the same breath — "the task modal gets a single
     soft shadow so it reads as floating above the page" — and the base dialog
     separates itself with a 1px ring instead, the same hairline treatment every
     flat surface in the app uses. The one element meant to read as lifted read
     as another panel. Wide, soft and downward: on the light theme that is the
     whole separation; on the dark one it deepens the ground rather than drawing
     a second edge beside the ring already there.
261. **NO** The modal puts status first in the metadata band, ahead of the date,
     where `docs/06` lists title, notes, due date, time, assignee, label,
     important. That list predates `doing` existing, so the spec had nothing to
     say about where a status field goes, and asking "what state is this in"
     before "when is it due" is the order those questions come in. Left as it is
     and written down, because the rest of the order follows the spec exactly and
     a reader would fairly assume this part did too.
262. [x] **P1** The calendar's cards were below the app's own floor: 11px titles
     and 10px times, where 12px is the smallest size `docs/04` defines. That floor
     exists because it is where text stops being comfortable, and the month grid
     is the surface you scan longest — part of what made the calendar « hard on
     the eyes ». Now 12px in the month and 13px in the week. It costs cell
     density, but `useRowsThatFit` measures real rendered height rather than
     trusting a constant, so the grid adapts and the « +N » absorbs the rest.
263. [x] **P2** `CARD_PITCH_GUESS` 20 → 22 to match. It is the first-paint
     estimate before measurement lands, so being wrong costs one frame — but a
     low guess overfills that frame and then reflows, which is the more visible
     of the two directions.
264. [x] **P1** The sidebar could not say which item you were on. A nav link and
     a bucket both used `bg-surface-hover` for the current item *and* for hover,
     so pointing at anything made it look selected — for the buckets identically,
     since they had no weight change either; the nav links differed by a font
     weight alone. `FilterItem`, in the same file, had it right: hover moves the
     text, the background is reserved for the selection.
265. [x] **P1** One ramp for all three now. Hover moves one step up the surface
     scale, the current item two — `bg-bg` → `bg-surface` → `bg-surface-hover`,
     #0a0a0a → #111111 → #161616 in the dark theme. Small per step, unmistakable
     across two, and the affordance survives: a nav rail should still feel like
     it can be clicked. Extracted as three shared class constants, because the
     rule being written three different ways is what let them drift apart.
266. [x] **P2** Every list section ended with a hairline under its last row.
     `docs/04` asks for a divider *between* rows; each row carries its own
     `border-b`, so six sections meant six rules that divided nothing, each one
     a line the eye stops at for no reason. The section strips the trailing one
     rather than the row knowing where it sits — the row appears in three
     different stacks and none of them is its business. Same in the completed
     footer and the day sheet, where `last-of-type` is needed because a
     « voir la semaine » button can follow the rows. Confirmed the arbitrary
     variant actually compiled rather than trusting it to.
267. [x] **P1** A row's metadata was seven items at the row's own `gap-3`, so a
     label, a date, an identity dot and a notes glyph sat exactly as far apart as
     the checkbox is from the title — eight things of equal weight, with nothing
     saying which belong together. Grouped at 6px they read as one cluster
     hanging off the title, which is what they are. The board card already did
     this; the list is the busier of the two and had the looser spacing. The edit
     button stays outside it: an action, not metadata.
268. **NO** Measured before optimising, and found nothing worth optimising. All
     four per-write derives total 0.16 ms at 2000 tasks — a tenth of a frame. The
     bundle is already split as far as the locked stack allows: `cmdk` and the
     shortcut sheet are dynamic and absent from the shared chunk, and what
     remains is React, Next, Supabase and motion. Cold load against § 8.8's
     1.2 s was already measured at 2095 ms and documented as unreachable. Written
     down as a non-finding, because "I looked and there is nothing here" is worth
     recording — otherwise the next pass measures it again.
269. [x] **P1** The benchmark was measuring code that no longer runs. It mapped
     `instantToDay` over every `completed_at` in the store and then counted the
     run — exactly the work migration 0016 moved into Postgres. A number for a
     path nobody takes is worse than no number: it looks reassuring and tells you
     nothing about the app. Pointed at the live shape, it also *shows* the effect
     of that migration rather than hiding it — 0.027 ms → 0.0066 ms, and now flat
     from 500 tasks to 2000, because the streak works on distinct days instead of
     scaling with the task list.
270. [x] **P2** `npm run bench` printed a Node module-type warning over its own
     output, the same one `verify:db` had. Its column padding was also one label
     too narrow to hold the corrected name.
271. [x] **P1** Escape closed the wrong thing. With the modal's date grid open it
     closed the whole modal — you meant to stop picking a date and lost the task
     you were looking at. Radix's `onEscapeKeyDown` fires before it decides to
     close, and `preventDefault` there keeps the dialog open; a React handler on
     the content cannot do it, because the dismissal listener is on the document
     and never sees the stopped propagation.
272. [x] **P1** And the composer I opened inside board columns in 213 had no way
     out at all. Escape was handled for search and for the suggestion list, but
     nothing closed the composer itself, so opening one and changing your mind
     left it open until you created something — a trap rather than a shortcut.
     `onCancel` is passed only by surfaces that can be dismissed: the list's
     composer is permanent and passes nothing, so Escape there behaves as before.
273. **NO** Checked the rest of the stack for the same shape. Escape order inside
     the composer is already innermost-first — the suggestion list takes it, then
     search, and only then the composer. Stacked Radix layers (a task modal over
     the day sheet, the palette, the shortcut sheet) are handled by
     DismissableLayer, which gives it to the topmost.
274. [x] **P1** Every input in the app was fighting shadcn's design system
     instead of using this one. The base `Input` shipped `rounded-lg` — 10px, the
     *modal's* radius, on an input the doc gives 6px — plus `dark:bg-input/30`, a
     translucent grey that is not one of the three surfaces this app's ramp
     defines, and a second focus ring on top of the specified one.
275. [x] **P1** That last one meant inputs were the only control in the app with
     *two* focus indicators: a 3px ring sat on top of the 1px accent outline
     `globals.css` gives every focusable element, because a ring and an outline
     are different properties and neither replaced the other. `docs/04` § Focus
     asks for exactly one.

     Corrected after checking rather than assuming: the ring was **not** a
     foreign colour. `--ring` maps to `--green` and `--input` to `--control`, so
     shadcn's tokens are wired to this app's palette and that ring was the accent
     at 50%. The extra indicator is the defect; the 1px outline underneath was
     already exactly what the spec asks for. Downgraded from P0 — an accent glow
     around a focused field is off-system, not wrong.
276. [x] **P1** Six call sites each patched a different subset of it, which is
     why two fields in the same settings form did not match — 36px/14px/6px next
     to 32px/13px/8px, one on shadcn's translucent grey and one on the app's
     ground. Fixed at the base so they cannot drift again; call sites now set
     only height and width, which is the part that legitimately varies.
277. **NO** The base keeps `bg-bg` rather than the composer's `bg-surface`. One
     value cannot be right for both grounds: inside the modal, which is
     `bg-surface`, a `bg-bg` field reads as a recessed well; on a settings page,
     which is `bg-bg`, it reads as an outline and the 3:1 `--color-control`
     border carries it. Most editing happens in the modal, and recessed is the
     stronger affordance of the two, so that is the one to optimise for.
278. [x] **P2** The command palette was the last surface on a colour that exists
     nowhere else. Its search field used `bg-input/30` — `--control` at 30%, a
     translucent grey that is not one of the three surfaces the ramp defines —
     and both it and the palette's shell were `rounded-xl`, 14px, which is not
     one of the three radii `docs/04` names. It is a modal, so it is 10px, and
     its field is now the same 6px `--color-control` field as everywhere else.
279. **NO** The shadcn tokens are wired to this app's palette — `--popover` to
     `--surface`, `--input` to `--control`, `--ring` to `--green`, `--border` to
     `--hairline`. Checked rather than assumed, and it corrected item 275: the
     extra focus ring inputs carried was the *accent* at 50%, not a foreign
     colour. Two indicators where the spec asks for one is still the defect; the
     colour was never wrong.
280. [x] **P2** `DialogContent`'s base radius was 14px. Every one of the three
     dialogs already overrode it to 10px, so nothing on screen changed — but the
     next dialog would have inherited the wrong one, which is the exact drift
     this pass keeps finding. Fixed at the base rather than in a fourth override.
281. **NO** `DialogFooter` is dead — defined in `components/ui/dialog.tsx` and
     used nowhere. Left alone: it came with shadcn and removing it is not this
     pass's business, but a reader should know it is unreferenced before
     assuming the styling on it matters.
282. [x] **P0** The error screen asserted a cause it had never checked. It said
     the project is « probablement en pause » for *any* failed first load, and
     the owner hit it while the project was `ACTIVE_HEALTHY` and production's own
     health probe answered in 222 ms. It sent them to a dashboard to wake
     something that was already running, where there was nothing to do and
     nothing explaining what they were actually looking at.
283. [x] **P1** It can tell the two apart, using the predicate the store already
     has. No SQLSTATE means the fetch never got an answer — a paused project, a
     dropped connection — and on this plan that usually *is* the pause, so it
     still says so. A code means the database answered and refused, so the screen
     says that instead and shows the code, which is the only part that makes a
     next step possible. Not the driver's message: English jargon naming a
     constraint nobody here has heard of.
284. [x] **P0** And the first load was the one request in the app with no retry.
     Every write goes through `withRetry` because a phone changing cell towers is
     routine and one blip should not become a rollback — but a single dropped
     fetch on boot took the whole app to a full-page error. It retries once now,
     transport failures only, which is most likely what this screen actually was.
285. [x] **P0** Caught while verifying rather than assuming: the retry recovered
     the rows and the shell still seeded `StoreBoot` from the *first* attempt's
     `tasks`, which is null. A recovered load would have rendered « Rien encore.
     Ajoute ta première tâche. » to somebody with forty — the precise failure the
     comment ten lines above it exists to prevent, reintroduced by the fix for it.
286. [x] **P1** A task said who it belonged to with a 6px dot. That is enough to
     tell two people apart and not enough to recognise one — the owner asked for
     the picture on the card, and the reason an avatar went into this app at all
     still holds: two people dividing work should not be two shades of a small
     circle. Rows and board cards now carry a 20px face.
287. **NO** The colour is not lost, which is what makes this a superset rather
     than a swap. `Avatar` falls back to initials on the person's accent, so
     somebody who has set no picture still reads as their colour and nothing
     regresses for them. `docs/04` specified the dot by name and now says this
     instead, with the reasoning — the same treatment `docs/06` got when clicking
     a row stopped opening it.
288. **NO** The dot survives where it is a legend rather than an owner: the
     assignee lens in the sidebar and the actor beside an activity entry, where
     the colour *is* the information and faces would be a rail of stacked
     avatars. Calendar cards keep the coloured left rule for the reason already
     recorded — a month-grid card is a 4mm bar.
289. [x] **P2** Unassigned now renders nothing where the dot left a 6px spacer.
     `Avatar`'s dashed placeholder is right in the modal, where you are choosing
     an assignee, and wrong on a row, where every unowned task would grow an
     empty circle asking to be filled — and unassigned is the normal state of
     something just captured.
290. [x] **P2** `AssigneeDot` is `AssigneeFace`. The component was never really
     about the shape — it is identity, the § 8.7 pulse when the other person
     completes something on your screen, and the optional tap that narrows the
     list to one person — and a name describing the one thing that changed would
     have been the next comment to go stale. Two call sites; `accentColor` and
     `ACCENTS` stay where six other files already import them from.
291. [x] **P1** The rail was missing two of the six buckets. `docs/06` gives the
     list six sections; the sidebar carried the first four, so a task with no
     date had no entry, no count and no way to jump to it. Visible in the owner's
     own screenshot: a board showing three tasks beside a rail totalling two.
     « Sans date » is where a quick capture lands, which makes it the bucket
     holding exactly the tasks this app exists to stop people forgetting.
292. **NO** The counts were already right — `bucketOf` covers all six and the map
     had been computing `later` and `undated` all along. Nothing was being
     calculated wrongly; two entries were simply never rendered. Costs nothing
     when empty, since an empty bucket is already disabled and faint.
293. [x] **P1** « Ajouter ici » floated halfway down an empty column. A button
     centres its own content, and that one fills the column so it can be clicked
     anywhere — so the label detached from the cards it belongs under and sat in
     the middle of nothing. Seen in the screenshot rather than in the code, which
     is the argument for looking at the app. `items-start` puts the words where
     the next card would go; the target still fills the column.
294. [x] **P1** Searching by tag did not filter by tag. Search was one substring
     test over `title + "#" + label + notes` joined into a single string, so
     `#facture` and `facture` asked the same question and neither asked « tasks
     tagged facture ». Clicking a label chip fills the box with `#facture` and
     reads as "show me this tag" — and returned every task that merely mentioned
     the word in its notes. With four tasks that passes for working; with a
     client's name used in both a title and a label it stops being a filter.
295. [x] **P1** `lib/search.ts` now owns what a query means: a `#token` filters
     by tag, anything else is free text, and the two are ANDed, so
     `#facture client` is tagged-facture-and-mentioning-client. Tags match by
     prefix because the query is being typed — results narrowing on the way to
     `#facture` is what tells you the tag exists. Text still searches the label
     too, so the `#` narrows rather than unlocks. Eighteen assertions.
296. [x] **P1** The archive lookup asked a different question from the list.
     `searchArchive` stripped a leading `#` and ran one substring over three
     columns, so a tagged task from outside the loaded window came back only if
     the word also appeared in its title or notes. Both call `parseQuery` now,
     and the tag becomes a real `label ilike 'tag%'` filter ANDed with the text.
     Verified against the live database rather than reasoned about: tag alone,
     prefix, text alone, tag+text ANDed, and a tag nobody uses.
297. [x] **P2** Search mode says what `#` does. The syntax is not guessable from
     an empty box, and the only other way to find it is clicking a label chip —
     which only helps for a tag some task already carries. The owner reported not
     being able to search properly, and discoverability was half of that.
298. [x] **P2** `normalize` existed twice — once in `list-view.tsx` and once
     privately in `parse-fr.ts`. The search copy moved into `lib/search.ts` where
     it belongs with the rule it serves. `parse-fr`'s stays private to date
     parsing; coupling search to the French date parser to save two lines would
     be the worse trade.

### Deep UI audit — accessibility, type roles, naming

299. **NO** Swept first rather than fixing what was in front of me. Clean: every
     `<img>` carries an alt, the polite live region exists and is used, headings
     are present on every screen, and all three icon-only buttons a crude regex
     flagged turned out to render their label through `{children}`. Recorded so
     the next sweep does not re-run the same four checks.
300. [x] **P1** Every labelled field in the app was nameless to a screen reader.
     `Field` rendered its label as a bare `<span>` above the control, connected
     to it by nothing — visible to anybody looking at the screen and absent for
     anybody not. A screen reader reached « Statut » as loose text, then three
     unnamed buttons. It is `role="group"` with `aria-labelledby` now, not a
     `<label>`, because half of these hold a *set* of controls — the status
     chips, the quick dates, the six accent swatches — and a `<label>` may name
     exactly one.
301. [x] **P1** The login email and the invite address had only a placeholder,
     which is not a label: it disappears the moment you type, which is precisely
     when you might want to check what the field was. Both carry an `aria-label`
     now, as does the modal's own label input, so single-control fields are named
     twice over rather than only by the group they sit in.
302. [x] **P2** A sixth type role existed without being written down. The
     uppercase, letter-spaced micro-label sat at 11px over a modal field and 10px
     over a calendar band, with an untracked 11px third spelling in the date
     picker — one role, three renderings, none of them in `docs/04`. It is one
     string in `lib/type.ts` now and a named row in the scale, so a fourth cannot
     appear quietly.
303. **NO** French copy is punctuated consistently: 34 straight apostrophes and
     zero curly, 8 proper ellipsis characters and zero `...`. Nothing to fix.
     Recorded so the next sweep does not re-derive it.
304. [x] **P2** Two animation timings were bare numbers in components while every
     other one is a named token. § 8.9 is a tuning pass, and tuning means
     changing a value to see how it feels — a number only grep can find is a
     number nobody tunes. The checkbox's 260ms scale is the more interesting of
     the two: it sits exactly on the ceiling `docs/04` sets for anything a user
     triggered, which is worth naming so a later nudge upward is a decision
     rather than a digit.
305. [x] **P1** The skeleton was not shaped like the thing it stands for. Rows
     were 20px on a 32px pitch against real rows of 44px sitting flush, the
     section header was missing, and the composer's outline used `border-border`
     where the real one uses `border-control`. So the one screen in the app
     guaranteed to be followed by a layout shift was the loading state — and
     § 8.8 asks for no layout shift. Every measurement now comes from the
     component it imitates.
306. [x] **P1** The board's strikethrough had been striking through nothing. A
     card's title wraps — 280px column, 13px text — and the drawn strikethrough
     is one absolutely-positioned line across the middle of the block: on a
     one-line title that is the text, on a two-line title it is the gap between
     them. Real `text-decoration` is drawn by the browser through every line at
     any number of them.
307. **NO** Which costs the left-to-right draw § 8.1 asks for, because
     `text-decoration` cannot sweep. It fades over the same 200ms instead. The
     list row keeps the drawn version and always will: `truncate` makes that
     title one line by construction, so the effect is always correct there. On
     the board, correct beats faithful.
308. [x] **P2** Board titles clamp to two lines, with the full text on hover. An
     untruncated title in a 280px column can run to a dozen lines on a 500-char
     title the length check allows, and a column you have to scroll past one card
     to read is not a board.
