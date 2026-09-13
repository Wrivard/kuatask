-- Renumbering a column, atomically.
--
-- `restack()` sent one UPDATE per row and called the result all-or-nothing. It
-- was, on the client: any refusal put every row back and raised a single toast.
-- The server got no such treatment. Five writes landing and fifteen failing
-- leaves the column half renumbered, and the local rollback hides that until
-- the next resync.
--
-- Which is worse than it sounds, because of *why* a restack happens. It runs
-- when the gap between two neighbours can no longer be halved, so the positions
-- going in are nearly equal:
--
--   before   A=1.0        B=1.0000001   C=1.0000002
--   target   A=1024       B=2048        C=3072
--   only B commits, and the client rolls its own copy back
--   server   A=1.0        B=2048        C=1.0000002   -> order is now A, C, B
--
-- The column silently reorders on the server while the browser shows the old
-- order. That is exactly the "partly renumbered" state the code's own comment
-- calls the one state worse than not renumbered.
--
-- A single `update ... from unnest(...)` is one statement, so it is one
-- transaction: every row moves or none does. It also turns twenty round trips
-- into one, which is the smaller reason to prefer it.
--
-- `security invoker`, so RLS decides which rows this can touch. The function
-- needs no privileges of its own and cannot be used to reorder a workspace the
-- caller is not in.

create or replace function public.restack_tasks(
  ids uuid[],
  positions double precision[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  moved integer;
begin
  /*
    Two arrays rather than one composite type, because that is what PostgREST
    passes cleanly from JSON. They are paired by index, so a length mismatch
    would silently drop or duplicate rows — refuse instead.
  */
  if coalesce(array_length(ids, 1), 0) is distinct from coalesce(array_length(positions, 1), 0) then
    raise exception 'restack_tasks: % ids for % positions',
      coalesce(array_length(ids, 1), 0), coalesce(array_length(positions, 1), 0);
  end if;

  update public.tasks t
     set position = v.position
    from unnest(ids, positions) as v(id, position)
   where t.id = v.id;

  get diagnostics moved = row_count;
  return moved;
end;
$$;

comment on function public.restack_tasks(uuid[], double precision[]) is
  'Renumber a column in one transaction. Paired by index. RLS-scoped.';

revoke all on function public.restack_tasks(uuid[], double precision[]) from public;
grant execute on function public.restack_tasks(uuid[], double precision[]) to authenticated;
