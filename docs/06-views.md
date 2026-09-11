# 06 — Views

## Shell

```
┌──────────┬──────────────────────────────────────────┐
│          │  Aujourd'hui                    ◔  4     │
│  Küa     │  ────────────────────────────────────────│
│          │  ┌────────────────────────────────────┐  │
│  ◦ Auj 4 │  │ Ajouter une tâche…                 │  │
│  ◦ Dem 2 │  └────────────────────────────────────┘  │
│  ◦ Sem 7 │                                          │
│  ◦ Mois  │  ☐  Rappeler le fournisseur    #acme  ● │
│          │  ☐  Renouveler le domaine       14h   ● │
│  ▤ Cal   │                                          │
│          │  Demain                              2   │
│  ────    │  ☐  Envoyer les maquettes      #beta  ● │
│  Tout    │                                          │
│  Moi     │  ▸ Terminé aujourd'hui               3   │
│  G.      │                                          │
│  ────    │                                          │
│  ▲ 12 j  │                                          │
└──────────┴──────────────────────────────────────────┘
```

### Sidebar

Fixed 220px. Collapses to an icon rail under 1024px. Becomes a bottom bar on mobile with four items: Liste, Calendrier, Ajouter, Réglages.

Contents, top to bottom: workspace name, the four list buckets with live counts, Calendar, a divider, the assignee filter (`Tout` / `Moi` / partner's first name), a divider, the streak.

Counts update optimistically with everything else. A count that lags behind the list it describes is the kind of small wrongness that erodes trust in the whole app.

### Header

Page title on the left. On the right, the progress ring and the remaining count (see `docs/08-satisfaction.md`). Nothing else — no search field (that is `⌘K`), no avatar menu (that is in settings), no "+ New" button (that is the composer, always visible).

## List view — the default route

### Sections, in fixed order

`Aujourd'hui` · `Demain` · `Cette semaine` · `Ce mois-ci` · `Plus tard` · `Sans date`

Each has a header with a count. **Empty sections collapse away entirely** — no "nothing here" placeholder per section.

"Cette semaine" means the rest of the current Montreal week after tomorrow, ending Sunday. "Ce mois-ci" means the rest of the calendar month after that. A task never appears in two sections; the first matching bucket wins.

### Overdue

An overdue task appears **at the top of `Aujourd'hui`**, with its date shown in `--color-danger`. It does not get its own section.

This is deliberate. A separate "En retard" section accumulates and becomes a wall of failure that people learn to scroll past. Folding overdue into today frames it as work to do now, which is what it is.

### Completed

Completed tasks move into a collapsed `Terminé aujourd'hui` footer showing a count. Expanding lists them, struck through and dimmed, still clickable to reopen. Only today's completions appear — yesterday's are gone from the UI, not from the database.

### Task row anatomy

```
☐   Rappeler le fournisseur          #acme   !   14h   ●
│   │                                │       │   │     │
│   title                            label   imp time  assignee
checkbox
```

Left to right: checkbox, title, label chip if set, importance dot if set, due time if set, assignee dot.

**Clicking a row completes it. Editing is one button, revealed on hover.**

This reverses the original rule, which was "no hover-revealed action buttons — the checkbox completes, anywhere else opens the modal". The owner asked for the swap after using the app, and the reasoning holds: completing happens dozens of times a day and is the thing this app exists to make feel good; editing is occasional. The common action gets the whole row, the rare one gets a deliberate target.

The cost is real and worth stating: a click meant as "let me look at this" now completes something. That is why completion is the most undoable action in the app — an undo toast every time, `⌘Z`, and a tone that tells you it happened before you have looked away.

The edit button is revealed on hover with a mouse and **permanently visible under a finger**. There is no hover on a touch screen, so a hover-only control there is not a subtle affordance, it is a missing one.

The calendar is the exception. Its cards are 4mm bars in a month grid, and a stray click there should not mark something done — so a calendar card *opens* the task. Completing from the calendar is what the day sheet is for, one click away, at full row size.

Row height 44px desktop, 52px touch. Long titles truncate with an ellipsis at one line — the modal is where the full text lives.

### Composer

A persistent single-line input pinned above the first section. Placeholder `Ajouter une tâche…`.

Enter creates the task and **instantly clears for the next one**, keeping focus. Rapid-fire capture without leaving the keyboard is the whole point — this is the feature that decides whether two-minute tasks make it into the app at all.

Inline parsing, live as you type, using `reference/parse-fr.ts`:

| Token | Effect |
|---|---|
| `@guillaume` | Assigns; autocompletes from members |
| `#acme` | Sets label; autocompletes from existing labels |
| `demain`, `lundi`, `15 mars`, `dans 3 jours` | Sets `due_on` |
| `14h`, `14h30` | Sets `due_time` |
| `!` | Sets important |

Parsed tokens are **removed from the title** and shown as chips below the input before submit. The chips are individually dismissible, which is how you escape a false positive — a task genuinely titled "Appeler Marie demain matin" should be fixable in one click.

Parse French only. Do not attempt English.

The composer is context-aware: opened from a calendar day sheet, it pre-fills that date. Opened while the assignee filter is set to a person, it pre-assigns them.

### Empty states

- No tasks at all, first run: one line, `Rien encore. Ajoute ta première tâche.`
- Today is clear but other days have tasks: the clear-out state, `docs/08-satisfaction.md`
- A filter yields nothing: `Rien pour {nom}.`

No illustrations. No hero graphics. One line of copy each.

## Calendar view

Custom-built with `date-fns`. **No calendar library.** A library brings a payload and an opinion about styling, and this grid is 150 lines.

### Month grid

Seven columns, rows sized to fill the viewport height. Each cell:

- The day numeral in Geist Mono, tabular figures
- Up to three tasks, each a truncated title with an assignee dot
- `+N` if more

Today's numeral gets the accent. Days outside the current month drop to `--color-fg-faint`. Weekend columns get no special treatment — these people work weekends.

Month navigation is instant because the data is already local. Arrow keys move by month; `T` returns to today.

### Day sheet

Clicking a day opens a side sheet (`sheet` from shadcn) with that day's tasks in full rows plus a composer pre-dated to that day. Same row component, same interactions, same completion animation as the list.

### Drag to reschedule

Dragging a task from one cell to another updates `due_on` optimistically. The row lifts slightly on grab, the target cell highlights with a 1px accent border, and it lands with the standard spring.

Touch: long-press initiates the drag. Test this on a real phone — the default browser behaviour will fight you and you will need `touch-action: none` on the draggable.

### Week toggle

A toggle switches to a seven-column day-agenda: each column is one day, tasks listed vertically with times. Tighter, better for a busy week. Same data, different projection.

## Task modal

Opens from a row with a spring scale from `0.96` and a backdrop blur. Fields in order:

1. **Title** — autofocused, textarea that grows with content
2. **Notes** — plain text, grows, placeholder `Notes…`
3. **Due date** — popover with the shadcn calendar, plus quick options: `Aujourd'hui`, `Demain`, `Lundi`, `Retirer la date`
4. **Time** — appears only once a date is set
5. **Assignee** — the two members plus `Personne`
6. **Label** — combobox over existing labels, free text allowed
7. **Important** — a switch

**Every field saves on change, optimistically. There is no save button and there is no cancel.** `Esc` closes. This is the same model as Linear and Notion and it is correct: a modal with Save/Cancel makes the user responsible for a transaction they did not ask to open.

Footer: `Supprimer` on the left, `Créé par {nom}` in faint metadata on the right. Deleting closes the modal immediately and shows an undo toast.

Keyboard: `Esc` closes, `⌘Enter` closes, `⌘Backspace` deletes.
