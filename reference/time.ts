/**
 * ALL date logic goes through this file.
 *
 * A due date in this app is a Montreal calendar day, not an instant. Stored as
 * a bare `date` in Postgres and handled as a 'yyyy-MM-dd' string everywhere in
 * the client. The only conversion is deciding what "today" is in Montreal.
 *
 * Never use the browser timezone. Never use UTC for day buckets. A task due
 * today must still say "Aujourd'hui" at 11pm Montreal, in both DST offsets.
 */

import { TZDate } from '@date-fns/tz';
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';

export const TZ = 'America/Montreal';

/** A calendar day, 'yyyy-MM-dd'. The app's only date type. */
export type DayString = string;

/** Now, in Montreal. */
export function nowTz(): TZDate {
  return TZDate.tz(TZ);
}

/** Today's Montreal calendar day. */
export function today(): DayString {
  return format(nowTz(), 'yyyy-MM-dd');
}

export function tomorrow(): DayString {
  return format(addDays(nowTz(), 1), 'yyyy-MM-dd');
}

/** Parse a DayString into a Date safe for comparison (noon avoids DST edges). */
export function toDate(day: DayString): Date {
  return parseISO(`${day}T12:00:00`);
}

export function toDayString(d: Date): DayString {
  return format(d, 'yyyy-MM-dd');
}

/** Signed day distance from today. Negative = overdue. */
export function daysFromToday(day: DayString): number {
  return differenceInCalendarDays(toDate(day), toDate(today()));
}

export function isOverdue(day: DayString | null, status: string): boolean {
  if (!day || status === 'done') return false;
  return daysFromToday(day) < 0;
}

// ---------------------------------------------------------------------------
// buckets
// ---------------------------------------------------------------------------

export type Bucket = 'today' | 'tomorrow' | 'week' | 'month' | 'later' | 'undated';

/**
 * Which list section a task belongs to. First match wins — a task is never in
 * two sections. Overdue returns 'today': see docs/06-views.md for why overdue
 * is folded into today rather than given its own section.
 */
export function bucketOf(dueOn: DayString | null): Bucket {
  if (!dueOn) return 'undated';

  const delta = daysFromToday(dueOn);
  if (delta < 0) return 'today';   // overdue folds into today
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';

  const d = toDate(dueOn);
  const weekEnd = endOfWeek(toDate(today()), { weekStartsOn: 1 });   // Monday weeks
  if (!isBefore(weekEnd, d)) return 'week';

  const monthEnd = endOfMonth(toDate(today()));
  if (!isBefore(monthEnd, d)) return 'month';

  return 'later';
}

// ---------------------------------------------------------------------------
// calendar grid
// ---------------------------------------------------------------------------

/** Six weeks of days covering the given month, Monday-first. Always 42 cells. */
export function monthGrid(anchor: Date): DayString[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first, { weekStartsOn: 1 });
  return Array.from({ length: 42 }, (_, i) => toDayString(addDays(start, i)));
}

export function isSameMonth(day: DayString, anchor: Date): boolean {
  return toDate(day).getMonth() === anchor.getMonth();
}

export function isToday(day: DayString): boolean {
  return day === today();
}

// ---------------------------------------------------------------------------
// formatting — see docs/09-copy-fr.md
// ---------------------------------------------------------------------------

/** Row date label. Day name inside a week, day + month beyond it. */
export function formatDueLabel(day: DayString): string {
  const delta = daysFromToday(day);
  if (delta === 0) return "aujourd'hui";
  if (delta === 1) return 'demain';
  if (delta === -1) return 'hier';
  if (delta > 0 && delta < 7) return format(toDate(day), 'EEEE', { locale: fr });
  return format(toDate(day), 'd MMMM', { locale: fr });
}

/** 24-hour with an h separator: 14h, 14h30. Never 2:00 PM, never 14:00. */
export function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  return m && m !== '00' ? `${parseInt(h, 10)}h${m}` : `${parseInt(h, 10)}h`;
}

/** Calendar header: lowercase month and year, per French convention. */
export function formatMonthYear(d: Date): string {
  return format(d, 'MMMM yyyy', { locale: fr });
}

// ---------------------------------------------------------------------------
// streak
// ---------------------------------------------------------------------------

/**
 * Consecutive Montreal days ending today (or yesterday — a streak survives
 * until the current day is over) with at least one completion.
 */
export function computeStreak(completedAt: string[]): number {
  if (completedAt.length === 0) return 0;

  const days = new Set(
    completedAt.map((ts) => format(TZDate.tz(TZ, new Date(ts)), 'yyyy-MM-dd')),
  );

  let streak = 0;
  let cursor = toDate(today());

  if (!days.has(toDayString(cursor))) {
    cursor = addDays(cursor, -1);
    if (!days.has(toDayString(cursor))) return 0;
  }

  while (days.has(toDayString(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}
