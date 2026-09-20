-- A colour on a task, for finding it in the calendar.
--
-- Asked for as "like Google Calendar" — a colour you set so a task is
-- recognisable at a glance in the month grid, and **only** there. A row in the
-- list and a card on the board stay as they are: those views are already sorted
-- by the thing you are looking for, and colour there would be decoration
-- competing with the identity dot and the status chip.
--
-- Stored as a key, not a hex. The six values are the app's own palette and the
-- theme decides what each one renders as — a hex in this column would be a
-- colour picked on one theme and shipped to the other, which is the bug the
-- Terminé strip had until it was made a token.
--
-- The check constraint is here rather than only in the UI because a column that
-- accepts anything is a column that will eventually hold something, and the
-- renderer has to look up every value it is given.

alter table public.tasks
  add column color text
  check (color is null or color in ('green', 'blue', 'purple', 'amber', 'pink', 'cyan'));

comment on column public.tasks.color is
  'Optional palette key, shown only in the calendar. Null means "no colour", which is most tasks.';
