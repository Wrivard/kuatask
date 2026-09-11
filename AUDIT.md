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
