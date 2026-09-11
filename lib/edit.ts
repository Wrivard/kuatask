/**
 * What an open editor still owes the task it is editing.
 *
 * The modal's three text fields are buffered and debounced, which means at any
 * instant there may be typing that has not been written yet. Closing must save
 * it — there is no Cancel in that modal by design, so leaving is not discarding.
 * Getting that wrong lost a note whenever somebody typed one and pressed Esc
 * inside the debounce window, which is the fastest and most natural way to use
 * the thing.
 *
 * It lives here, as a function of two plain objects, because the failure it
 * guards against is invisible: nothing throws, nothing logs, the note is simply
 * not there later. A component cannot be asserted about; this can.
 */

/** Only the fields an editor buffers. */
export type TextBuffer = {
  /**
   * The task these buffers belong to.
   *
   * Carried with the text rather than beside it. Switching tasks re-renders with
   * the new id before the buffers have been replaced, so anything that pairs
   * "current id" with "current text" sees one render of new-id-old-text — and a
   * save on that render writes one task's notes onto another.
   */
  id: string;
  title: string;
  notes: string;
  label: string;
};

/** The saved state, as far as this cares. */
export type TextState = {
  title: string;
  notes: string | null;
  label: string | null;
};

/**
 * The patch that would bring `current` up to date with `buffer`, or null when
 * there is nothing owed.
 *
 * Returns null rather than an empty object so a caller cannot accidentally write
 * a no-op — an empty patch still costs a round trip, an undo entry and a row in
 * the activity log.
 */
export function textPatch(
  buffer: TextBuffer,
  current: TextState | undefined,
): Partial<TextState> | null {
  // the task was deleted while it was open; there is nothing to save it to
  if (!buffer.id || !current) return null;

  const patch: Partial<TextState> = {};

  /*
    An empty title box means "unchanged", not "delete the title".

    A task with no title is not a task, and the box is emptied all the time on
    the way to retyping — select-all then type. Treating that intermediate state
    as an instruction would blank the row in the list behind the modal on every
    rewrite.
  */
  const title = buffer.title.trim();
  if (title !== "" && title !== current.title) patch.title = title;

  // notes and label are genuinely optional, so empty means empty
  const notes = buffer.notes.trim() === "" ? null : buffer.notes;
  if (notes !== current.notes) patch.notes = notes;

  const label = buffer.label.trim() === "" ? null : buffer.label.trim();
  if (label !== current.label) patch.label = label;

  return Object.keys(patch).length > 0 ? patch : null;
}
