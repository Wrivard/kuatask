import { addDays, addMonths, addWeeks, getDay } from 'date-fns';
import { toDate, toDayString, type DayString } from '@/lib/time';

/**
 * A task that comes back.
 *
 * The rule is stored on the task; the next occurrence is written when this one
 * is completed, by the app, on the spot. That is deliberate: a scheduler would
 * need something running while nobody is — and on the free plan the database
 * itself goes to sleep — and it would keep making occurrences of a routine
 * nobody is doing any more.
 */
export const RECURRENCES = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export function isRecurrence(value: string | null): value is Recurrence {
  return value !== null && (RECURRENCES as readonly string[]).includes(value);
}

/**
 * The day the next occurrence is due, counted from the day this one was due.
 *
 * From the due day, not from today: a weekly task finished three days late is
 * still weekly, and dating the next one a week from the day you got to it
 * would let a routine drift a little later every time until it means nothing.
 *
 * « Jours de semaine » skips the weekend: Friday's next is Monday, and so is
 * Saturday's, because nobody means "Sunday" by « chaque jour de semaine ».
 */
export function nextOccurrence(rule: Recurrence, dueOn: DayString): DayString {
  const from = toDate(dueOn);

  if (rule === 'daily') return toDayString(addDays(from, 1));
  if (rule === 'weekly') return toDayString(addWeeks(from, 1));
  if (rule === 'biweekly') return toDayString(addWeeks(from, 2));
  if (rule === 'monthly') return toDayString(addMonths(from, 1));

  // weekdays: Mon–Fri. getDay is 0 for Sunday.
  let next = addDays(from, 1);
  while (getDay(next) === 0 || getDay(next) === 6) next = addDays(next, 1);
  return toDayString(next);
}

/**
 * The day a completed occurrence hands to the next one.
 *
 * A recurring task with no date at all repeats from the day it was ticked —
 * there is nothing else to count from — which turns « chaque semaine » into
 * "a week after I last did it", the only honest reading of a rule with no
 * anchor.
 */
export function nextFrom(rule: Recurrence, dueOn: DayString | null, completedDay: DayString): DayString {
  return nextOccurrence(rule, dueOn ?? completedDay);
}
