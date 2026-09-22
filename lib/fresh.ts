/**
 * How long a task wears « Nouveau » after it is created.
 *
 * Three hours: long enough to survive a meeting or lunch, so the other person
 * still sees it when they come back to the list, and short enough that it has
 * gone by the next morning rather than turning into a second kind of noise.
 */
export const FRESH_FOR_MS = 3 * 60 * 60 * 1000;

/**
 * Whether a task is new enough to be flagged.
 *
 * `created_at` is an instant, so this is plain arithmetic on milliseconds —
 * no day bucketing, so none of the Montreal rules apply. A timestamp from a
 * clock slightly ahead of this one reads as "just now" rather than as never
 * having been new.
 */
export function isFresh(createdAt: string | null | undefined, nowMs: number): boolean {
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return false;
  return nowMs - at < FRESH_FOR_MS;
}
