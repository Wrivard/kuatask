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
  parseISO,
  startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';

export const TZ = 'America/Montreal';

/**
 * How far back completed tasks are held in the browser.
 *
 * The UI shows today's completions and holds a row for 900ms after it is
 * ticked; a few days of slack covers a tab left open over a weekend. Older
 * completions still exist and still count toward the streak — they simply do
 * not need to be rows here. The shell's first query and the store's resync use
 * the same window, so a refetch cannot quietly undo the bounded first load.
 *
 * It lives here because both a server component and the browser store need it,
 * and this is the only module they share that pulls in nothing from either side.
 */
export const RECENT_COMPLETION_DAYS = 7;

/** The instant that window starts at. */
export function recentCompletionCutoff(): string {
  return new Date(Date.now() - RECENT_COMPLETION_DAYS * 86_400_000).toISOString();
}

/** A calendar day, 'yyyy-MM-dd'. The app's only date type. */
export type DayString = string;

/*
  Every "today" in the app is read through this.

  The whole product is calendar days, so a device whose clock is wrong does not
  degrade gracefully — it puts tasks in the wrong bucket, breaks the streak, and
  makes a completion vanish from "Terminé aujourd'hui". Phones do drift, and a
  laptop resumed from sleep can be minutes out before NTP catches up.

  The shell already renders on the server, so it hands down the server's instant
  and the offset is fixed once at boot. Elapsed time comes from the device,
  which is fine — a wrong clock is an offset error, not a rate error.
*/
let clockOffset = 0;

export function setClockOffset(serverNow: string) {
  const parsed = Date.parse(serverNow);
  if (!Number.isNaN(parsed)) clockOffset = parsed - Date.now();
}

/** Milliseconds, with the server's correction applied. */
export function now(): number {
  return Date.now() + clockOffset;
}

/** Now, in Montreal. */
export function nowTz(): TZDate {
  return TZDate.tz(TZ, new Date(now()));
}

/*
  Instant -> Montreal day, the hot path.

  Every task row asks what day something is due or was completed, and the
  sidebar, the ring, the streak and the board all re-derive on every store
  write. Going through TZDate and date-fns `format` for that is between five
  and ten microseconds a call, which is invisible once and 40ms at two thousand
  tasks — a dropped frame per keystroke, on a desktop, before anyone opens this
  on a phone.

  Intl.DateTimeFormat does the same zone arithmetic in the engine, and one
  formatter built once is the whole optimisation. `en-CA` is not relied on to
  produce ISO order; the parts are read by name and reassembled.
*/
const dayParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dayOf(d: Date): DayString {
  const parts = dayParts.formatToParts(d);
  let y = '';
  let m = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'year') y = part.value;
    else if (part.type === 'month') m = part.value;
    else if (part.type === 'day') day = part.value;
  }
  return `${y}-${m}-${day}`;
}

/** Today's Montreal calendar day. */
export function today(): DayString {
  return dayOf(new Date(now()));
}

/**
 * Montreal wall-clock as a plain Date, for the calendar's month anchor.
 * Components must not construct dates themselves — see docs/10-quality-bar.md.
 */
export function nowDate(): Date {
  return new Date(nowTz());
}

/**
 * A number that advances by one each Montreal day and never repeats.
 *
 * The clear-out copy used the day of the month, which meant a fixed cycle: the
 * 3rd always got the same line, and with a list shorter than 28 entries some
 * lines were never seen at all. Days since the epoch has no period, so the
 * rotation drifts across the list instead of landing on it.
 */
export function dayNumber(): number {
  return Math.floor(toDate(today()).getTime() / 86_400_000);
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

/**
 * The Montreal calendar day an instant fell on.
 *
 * `completed_at` is a `timestamptz` — an absolute instant, serialized as UTC.
 * Its first ten characters are the UTC date, which is ALREADY TOMORROW from
 * 20:00 Montreal in summer and 19:00 in winter. Slicing that string is the
 * single most common way this app breaks, and these two use it in the evening:
 * a task cleared at 21:00 would drop out of "Terminé aujourd'hui", stop counting
 * toward the ring, and silently prevent the clear-out from ever firing.
 */
export function instantToDay(ts: string): DayString {
  const hit = instantCache.get(ts);
  if (hit !== undefined) return hit;

  const day = dayOf(new Date(ts));
  // completion timestamps are stable strings that recur on every render, so the
  // cache hits nearly always; the bound is only there so it cannot grow for ever
  if (instantCache.size > 4096) instantCache.clear();
  instantCache.set(ts, day);
  return day;
}

const instantCache = new Map<string, DayString>();

/** Did this instant fall on today's Montreal day? */
export function isTodayInstant(ts: string | null): boolean {
  return ts !== null && instantToDay(ts) === today();
}

/**
 * Milliseconds until the next Montreal midnight.
 *
 * A tab left open across midnight keeps rendering yesterday: every bucket is
 * computed from today() during render, so at 00:00 the list quietly becomes
 * wrong and stays wrong until someone reloads. These two check the list in the
 * evening, which is the worst possible time for that.
 */
export function msUntilNextDay(): number {
  const now = nowTz();
  const midnight = parseISO(`${format(addDays(now, 1), 'yyyy-MM-dd')}T00:00:00`);
  const wallClockNow = parseISO(format(now, "yyyy-MM-dd'T'HH:mm:ss"));
  // +1s so the timer fires just after the boundary, never a hair before it
  return Math.max(1000, midnight.getTime() - wallClockNow.getTime() + 1000);
}

/** Signed day distance from today. Negative = overdue. */
export function daysFromToday(day: DayString): number {
  return differenceInCalendarDays(toDate(day), toDate(today()));
}

export function isOverdue(day: DayString | null, status: string): boolean {
  if (!day || status === 'done') return false;
  return daysFromToday(day) < 0;
}

/**
 * Did this instant fall on the given Montreal day?
 *
 * The day is a parameter rather than read from the clock so the function is
 * deterministic — a caller inside a useMemo can depend on it honestly, and the
 * test suite can pin it.
 */
export function isOnDay(ts: string | null, day: DayString): boolean {
  return ts !== null && instantToDay(ts) === day;
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
export function bucketOf(dueOn: DayString | null, todayDay: DayString = today()): Bucket {
  if (!dueOn) return 'undated';

  /*
    Every boundary here depends only on `todayDay`, which is the same for every
    task in the loop, so they are computed once per day rather than four times
    per task. What is left is string comparison: a 'yyyy-MM-dd' sorts
    lexically exactly as it sorts chronologically, which is the one good reason
    this app stores days as strings at all.
  */
  const f = frameFor(todayDay);

  if (dueOn <= todayDay) return 'today';        // overdue folds into today
  if (dueOn === f.tomorrow) return 'tomorrow';
  if (dueOn <= f.weekEnd) return 'week';
  if (dueOn <= f.monthEnd) return 'month';
  return 'later';
}

type Frame = { tomorrow: DayString; weekEnd: DayString; monthEnd: DayString };
let frameKey: DayString | null = null;
let frameValue: Frame | null = null;

/** The three day boundaries around a given today, computed once per day. */
function frameFor(todayDay: DayString): Frame {
  if (frameKey === todayDay && frameValue) return frameValue;
  const base = toDate(todayDay);
  frameValue = {
    tomorrow: toDayString(addDays(base, 1)),
    weekEnd: toDayString(endOfWeek(base, { weekStartsOn: 1 })),   // Monday weeks
    monthEnd: toDayString(endOfMonth(base)),
  };
  frameKey = todayDay;
  return frameValue;
}

/**
 * The earliest day that lands in a bucket, for dropping a card onto a date
 * column. Dropping on "Cette semaine" should mean "soon, this week" rather than
 * an arbitrary day, so each bucket resolves to its first available day and is
 * clamped so it cannot spill into the next bucket.
 */
export function firstDayOfBucket(
  bucket: Bucket,
  todayDay: DayString = today(),
): DayString | null | undefined {
  if (bucket === 'undated') return null;
  if (bucket === 'today') return todayDay;

  /*
    The earliest day that is actually in the bucket, found by asking bucketOf
    rather than by reconstructing its boundaries.

    Reconstructing them is what went wrong. Dropping a card on "Cette semaine"
    on a Saturday clamped to the end of the week, which is Sunday, which is
    tomorrow — the card jumped a column and the toast said it had been
    rescheduled. "Ce mois-ci" had the same fault on a Sunday. Both were
    invisible in the test suite because it only ever ran against the real today.

    Two buckets can be genuinely empty: on a Saturday every day left in the week
    is already tomorrow, and on the 30th the same is true of the month.
    `undefined` says so, and the caller declines the drop rather than doing
    something else and claiming success.
  */
  const base = toDate(todayDay);
  for (let offset = 1; offset <= SEARCH_DAYS; offset += 1) {
    const day = toDayString(addDays(base, offset));
    if (bucketOf(day, todayDay) === bucket) return day;
  }
  return undefined;
}

/** Far enough to cross a month boundary from any day in it. */
const SEARCH_DAYS = 62;


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

export function isToday(day: DayString, todayDay: DayString = today()): boolean {
  return day === todayDay;
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
export function computeStreak(
  completedAt: string[],
  todayDay: DayString = today(),
): number {
  return streakFromDays(completedAt.map(instantToDay), todayDay);
}

/**
 * Consecutive Montreal days ending today, or yesterday — a streak survives
 * until the current day is over.
 *
 * Takes days rather than instants because the history comes from the server
 * already reduced to one entry per day. Whole rows are not needed to know that
 * something was finished on a Tuesday.
 */
export function streakFromDays(
  dayList: DayString[],
  todayDay: DayString = today(),
): number {
  if (dayList.length === 0) return 0;

  const days = new Set(dayList);

  let streak = 0;
  let cursor = toDate(todayDay);

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
