# 07 — Keyboard and command palette

The app is fully operable without a mouse. This is not an accessibility checkbox — it is a Linear-class expectation from the two people using it, and it is a large part of why power users bond with a tool.

## Shortcut map

| Key | Action | Scope |
|---|---|---|
| `⌘K` / `Ctrl+K` | Command palette | Global |
| `C` | Focus the composer | Global |
| `Enter` | Create and clear for the next one | Composer |
| `Shift+Enter` | Create, and open it to add notes | Composer |
| `/` | Focus the search box in the header | Global |
| `J` / `↓` | Move row focus down | List |
| `K` / `↑` | Move row focus up | List |
| `X` or `Enter` | Toggle the focused task | List |
| `E` | Open the focused task | List |
| `A` | Reassign the focused task | List |
| `D` | Set due date on the focused task | List |
| `!` | Toggle important on the focused task | List |
| `⌫` | Delete the focused task | List |
| `1` `2` `3` `4` | Aujourd'hui / Demain / Semaine / Mois | Global |
| `G` then `D` | Go to braindump | Global |
| `G` then `L` | Go to list | Global |
| `G` then `B` | Go to the board | Global |
| `G` then `C` | Go to calendar | Global |
| `G` then `A` | Go to activity | Global |
| `G` then `P` | Go to the leaderboard | Global |
| `G` then `S` | Go to settings | Global |
| `T` | Jump to today | Calendar |
| `⌘Z` | Undo | Global |
| `Esc` | Close modal / palette / clear focus | Contextual |
| `?` | Shortcut sheet | Global |

The `G` rows above are not written anywhere in the UI. They come from
`lib/routes.ts`, which the rail, the command palette and the shortcut sheet all
read; adding a route there gives it a shortcut, a palette entry and a printed
row at once. `verify:logic` asserts no two routes claim the same letter — a
collision costs one of them its keyboard path silently, since the sequence just
lands on whichever entry was enumerated last.

## Focus model

Row focus is separate from DOM focus and separate from selection. Exactly one row is focused at a time.

- Visible as a 1px accent ring around the row
- Always scrolled into view, with `scroll-margin` so it never lands flush against the header
- `J`/`K` cross section boundaries — the list behaves as one sequence, not six
- Set on hover as well as keyboard, so a mouse user can hover a row and hit `X`
- Cleared by `Esc`

Shortcuts do not fire while an input, textarea, or contenteditable has focus, with two exceptions: `Esc` and `⌘K` always work. Guard with a check on `document.activeElement`.

Single-key shortcuts fire on `keydown` without modifiers. Ignore them when `metaKey`, `ctrlKey`, or `altKey` is held so browser shortcuts pass through untouched.

## Command palette

One `cmdk` dialog, fuzzy-matched, arrow-key driven. Groups in this order:

**Tâches** — fuzzy search over all task titles, showing section and assignee. Enter opens the task. This doubles as the app's only search.

**Créer** — `Nouvelle tâche` plus, when the query does not match an existing task, `Créer « {query} »` which runs the same French parsing as the composer.

**Aller à** — every route in `lib/routes.ts`, generated, plus settings. It was
hand-listed and fell three routes behind.

**Filtrer** — `Tout` / `Moi` / partner's name.

**Réglages** — `Thème clair` / `Thème sombre`, `Son activé` / `Son désactivé`.

Search is client-side over the in-memory store, so results appear as you type with no debounce and no loading state.

## Shortcut sheet

`?` opens a plain dialog listing the map above, grouped by scope, with keys rendered in a `kbd` style. No animation beyond the standard dialog spring. It is a reference, not a feature.

## Mobile

None of this applies on touch. The mobile layout gets a bottom bar and larger targets instead. Do not render keyboard hints on touch devices — detect with a pointer media query, not a user-agent string.
