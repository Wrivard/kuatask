import { parseFr } from '@/lib/parse-fr';
import type { Profile } from '@/lib/store';

/**
 * What a line typed into the composer becomes.
 *
 * Pulled out of the component because it is the most consequential path in the
 * app and it was the one path nothing could test: parse a line, honour whatever
 * the person overrode, resolve a handle to a real person, and decide the title.
 * A mistake anywhere in there loses words out of a task, silently, at the exact
 * moment somebody is trying to write something down.
 *
 * Pure, and it takes `members` rather than reaching for the store, so
 * `verify:logic` can put a line in and check what comes out.
 */
export type Composed = {
  title: string;
  due_on: string | null;
  due_time: string | null;
  label: string | null;
  important: boolean;
  assignee_id: string | null;
  /** Which readings the parser made, so the chips know what to offer. */
  matched: Set<string>;
};

export function composeTask({
  value,
  dismissed,
  members,
  defaultDueOn = null,
  defaultAssigneeId = null,
}: {
  value: string;
  /** Readings the person switched off. */
  dismissed: ReadonlySet<string>;
  members: Pick<Profile, 'id' | 'display_name' | 'email'>[];
  defaultDueOn?: string | null;
  defaultAssigneeId?: string | null;
}): Composed {
  const parsed = parseFr(value);
  const matched = new Set(parsed.matched.map((m) => m.kind));

  const on = (kind: string) => matched.has(kind) && !dismissed.has(kind);

  const dueOn = on('date') ? parsed.dueOn : null;
  const dueTime = on('time') ? parsed.dueTime : null;
  const label = on('label') ? parsed.label : null;
  const handle = on('assignee') ? parsed.assigneeHandle : null;
  const important = parsed.important && !dismissed.has('important');

  /*
    A person is found by display name or by the local part of their address.
    Both, and in that order, because that is exactly what the autocomplete
    offers — if these two ever disagree, completing `@gberther` produces a
    handle this function cannot turn back into anybody.
  */
  const assigneeId = handle
    ? (members.find(
        (m) =>
          m.display_name.toLowerCase().startsWith(handle.toLowerCase()) ||
          (m.email ?? '').split('@')[0].toLowerCase().startsWith(handle.toLowerCase()),
      )?.id ?? null)
    : null;

  /*
    Dismissing a date or time means the parser was wrong and the words belong to
    the title — "Appeler Marie demain matin" must not silently lose "demain".
    They are re-appended rather than slotted back in place; word order suffers
    slightly, losing the word does not. #label, @handle and ! are notation
    rather than prose, so they stay stripped either way.
  */
  const restored = parsed.matched
    .filter((m) => dismissed.has(m.kind) && (m.kind === 'date' || m.kind === 'time'))
    .map((m) => m.text);

  return {
    title: [parsed.title.trim(), ...restored].join(' ').trim(),
    due_on: dueOn ?? defaultDueOn,
    due_time: dueTime,
    label,
    important,
    assignee_id: assigneeId ?? defaultAssigneeId,
    matched,
  };
}
