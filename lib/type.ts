/**
 * Type roles that more than one component needs to agree on.
 *
 * `docs/04` names five: task title, section header, metadata, page title,
 * button. A sixth had grown up between them without being written down — the
 * uppercase, letter-spaced micro-label over a field or a band — and because it
 * was never named it existed at two sizes and three spellings: 11px in the
 * modal's fields, 10px over the calendar's time bands, and an untracked 11px
 * for the date picker's weekday initials.
 *
 * One string, so the next one cannot be a fourth.
 */
export const MICRO_LABEL =
  "text-[11px] font-medium uppercase tracking-[0.06em] text-fg-faint";
