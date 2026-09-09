-- A third status so the Statut board is a real kanban: À faire · En cours · Terminé.
-- Additive: every existing row stays 'todo' or 'done'.
--
-- Note the enum's declaration order is todo, done, doing — 'doing' was appended,
-- so sort order does not match workflow order. The UI orders columns explicitly
-- and never relies on the enum's ordering.
alter type task_status add value if not exists 'doing';

-- The completion trigger was written for a two-value enum and only fired on the
-- exact pairs todo->done and done->todo. With a third value, moving doing->done
-- would have left completed_at null, and done->doing would have left a stale
-- completion stamp on an open task. Both now key off 'done' itself.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at = now();
    new.completed_by = auth.uid();
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at = null;
    new.completed_by = null;
  end if;

  return new;
end $$;
