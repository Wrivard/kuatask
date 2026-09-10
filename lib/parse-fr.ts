/**
 * French natural-language parsing for the composer.
 *
 * Extracts assignee, label, due date, time and importance from a typed line,
 * strips them from the title, and reports what it found so the UI can render
 * dismissible chips. See docs/06-views.md § Composer.
 *
 * French only. Do not add English patterns — a bilingual parser produces more
 * false positives than it saves keystrokes.
 */

import { addDays, nextDay, setMonth, setDate, type Day } from 'date-fns';
import { nowTz, toDayString } from '@/lib/time';

export type Parsed = {
  title: string;
  assigneeHandle: string | null;   // text after @, resolve against members
  label: string | null;
  dueOn: string | null;            // 'yyyy-MM-dd'
  dueTime: string | null;          // 'HH:mm'
  important: boolean;
  /** Substrings removed from the title, for chip rendering and undo. */
  matched: { kind: string; text: string }[];
};

const WEEKDAYS: Record<string, Day> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3,
  jeudi: 4, vendredi: 5, samedi: 6,
};

const MONTHS: Record<string, number> = {
  janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11,
};

const deaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function parseFr(input: string): Parsed {
  let text = ` ${input} `;
  const matched: Parsed['matched'] = [];
  const out: Parsed = {
    title: input,
    assigneeHandle: null,
    label: null,
    dueOn: null,
    dueTime: null,
    important: false,
    matched,
  };

  const eat = (re: RegExp, kind: string, take: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (!m) return false;
    take(m);
    matched.push({ kind, text: m[0].trim() });
    text = text.replace(m[0], ' ');
    return true;
  };

  // @assignee
  eat(/\s@([\p{L}-]+)/u, 'assignee', (m) => { out.assigneeHandle = m[1]; });

  // #label
  eat(/\s#([\p{L}\d-]+)/u, 'label', (m) => { out.label = m[1]; });

  // importance
  eat(/\s!(?=\s)/, 'important', () => { out.important = true; });

  // time — 14h, 14h30, à 9h
  const gotClockTime = eat(
    /\s(?:a |à )?(\d{1,2})\s?h\s?(\d{2})?(?=\s)/,
    'time',
    (m) => {
      const h = String(Math.min(23, parseInt(m[1], 10))).padStart(2, '0');
      out.dueTime = `${h}:${m[2] ?? '00'}`;
    },
  );

  /*
    Time of day, which is how people actually say it.

    "rappeler le client demain matin" is a normal sentence and the parser used
    to keep "matin" in the title and set no time at all — so the task landed
    ahead of a 16h one on a day sorted by time, which is the wrong way round.

    These are not precise and are not pretending to be: they are the start of
    the part of the day meant, which is enough to order a list. A clock time
    always wins — "demain matin à 10h" means 10h, not 8h — so this only runs
    when none was found.
  */
  {
    /*
      Each pattern captures the whole phrase to remove, determiners included,
      but deliberately not a day word in front of it: "demain matin" has to
      leave "demain" behind for the date pass below. That is why "demain" and
      the weekday names appear in none of these alternations.

      Order matters. "après-midi" has to be tried before "midi", and "fin de
      journée" before "soir", or the shorter one eats half the phrase and the
      rest is left in the title.
    */
    const partsOfDay: [RegExp, string][] = [
      [/\s((?:en |de |le )?d[ée]but de matin[ée]e)(?=\s)/i, '07:00'],
      [/\s((?:cet |cette |en |dans l'|dans l’|l'|l’)?apr[eè]s[- ]midi)(?=\s)/i, '13:00'],
      [/\s((?:en |la )?fin de journ[ée]e)(?=\s)/i, '16:00'],
      [/\s((?:ce |le |du )?matin)(?=\s)/i, '08:00'],
      [/\s((?:[àa] |ce |le |sur l'heure du )?midi)(?=\s)/i, '12:00'],
      [/\s((?:ce |le |en )?soir(?:[ée]e)?)(?=\s)/i, '18:00'],
    ];

    /*
      This runs whether or not a clock time was found. A clock time wins —
      "demain matin à 10h" means 10h, not 8h — but the words still have to come
      out of the title, or the task ends up called "matin".
    */
    for (const [re, at] of partsOfDay) {
      const m = text.match(re);
      if (!m) continue;
      if (!gotClockTime) {
        out.dueTime = at;
        matched.push({ kind: 'time', text: m[1] });
      }
      text = text.replace(m[1], ' ');
      break;
    }
  }

  const base = nowTz();

  // relative days
  const relatives: [RegExp, number][] = [
    [/\s(aujourd'?hui|auj)(?=\s)/i, 0],
    [/\sdemain(?=\s)/i, 1],
    [/\sapres[- ]demain(?=\s)/i, 2],
  ];
  for (const [re, offset] of relatives) {
    const probe = new RegExp(re.source, re.flags);
    if (probe.test(deaccent(text))) {
      eat(probe, 'date', () => { out.dueOn = toDayString(addDays(base, offset)); });
      break;
    }
  }

  // dans N jours / semaines
  if (!out.dueOn) {
    eat(/\sdans (\d{1,2}) (jours?|semaines?)(?=\s)/i, 'date', (m) => {
      const n = parseInt(m[1], 10);
      const mult = /semaine/i.test(m[2]) ? 7 : 1;
      out.dueOn = toDayString(addDays(base, n * mult));
    });
  }

  // weekday, optionally "prochain"
  if (!out.dueOn) {
    const flat = deaccent(text);
    for (const [name, dow] of Object.entries(WEEKDAYS)) {
      const re = new RegExp(`\\s${name}( prochain)?(?=\\s)`, 'i');
      if (re.test(flat)) {
        const start = re.exec(flat)!.index;
        const raw = text.slice(start, start + re.exec(flat)![0].length);
        out.dueOn = toDayString(nextDay(base, dow));
        matched.push({ kind: 'date', text: raw.trim() });
        text = text.replace(raw, ' ');
        break;
      }
    }
  }

  // "15 mars" / "le 15 mars"
  if (!out.dueOn) {
    const flat = deaccent(text);
    const m = flat.match(/\s(?:le )?(\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?=\s)/);
    if (m) {
      const day = parseInt(m[1], 10);
      let d = setDate(setMonth(base, MONTHS[m[2]]), day);
      if (d < base) d = setMonth(d, MONTHS[m[2]] + 12); // roll to next year
      out.dueOn = toDayString(d);
      const raw = text.substr(m.index!, m[0].length);
      matched.push({ kind: 'date', text: raw.trim() });
      text = text.replace(raw, ' ');
    }
  }

  // numeric — 15/03 or 2026-03-15
  if (!out.dueOn) {
    const iso = eat(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/, 'date', (m) => {
      out.dueOn = `${m[1]}-${m[2]}-${m[3]}`;
    });
    if (!iso) {
      eat(/\s(\d{1,2})\/(\d{1,2})(?=\s)/, 'date', (m) => {
        // day/month, French order
        const month = parseInt(m[2], 10) - 1;
        let d = setDate(setMonth(base, month), parseInt(m[1], 10));
        // roll to next year, same as the "15 mars" branch above. Without this a
        // date already past this year lands in the past and reads as overdue
        // the moment it is captured.
        if (d < base) d = setMonth(d, month + 12);
        out.dueOn = toDayString(d);
      });
    }
  }

  // a time with no date means today
  if (out.dueTime && !out.dueOn) out.dueOn = toDayString(base);

  out.title = text.replace(/\s+/g, ' ').trim();

  // never strip the whole line — a task titled only "demain" keeps its title
  if (!out.title) {
    out.title = input.trim();
    out.matched = [];
    out.dueOn = null;
    out.dueTime = null;
    out.label = null;
    out.assigneeHandle = null;
    out.important = false;
  }

  return out;
}
