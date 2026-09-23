/**
 * The spreadsheet's arithmetic, as functions.
 *
 * Pure and dependency-free so `verify:logic` can hold it to the sheet: the one
 * thing a billing page may not do is disagree with the Excel file it replaces
 * about how much a client owes.
 */

export type BillingStatus = 'pending' | 'invoiced' | 'paid';

export const STATUSES: BillingStatus[] = ['pending', 'invoiced', 'paid'];

export type EntryMoney = {
  hours: number | null;
  rate: number | null;
  /** A fixed price. When present it wins, like typing over column F. */
  amount: number | null;
  status: BillingStatus;
};

/** The sheet's default, and the one a new client starts with. */
export const DEFAULT_RATE = 75;

/**
 * Montant: the fixed price if there is one, otherwise Heures × Taux, where Taux
 * falls back to the client's default rate. No hours and no price is zero —
 * a row still being written, not an error.
 *
 * Rounded to the cent, because 1.333 h × 75 is not a number anybody invoices.
 */
export function amountOf(entry: Pick<EntryMoney, 'hours' | 'rate' | 'amount'>, clientRate: number): number {
  if (entry.amount !== null) return round2(entry.amount);
  if (entry.hours === null) return 0;
  return round2(entry.hours * (entry.rate ?? clientRate));
}

/** Whether the Montant shown is computed rather than typed. */
export function isComputed(entry: Pick<EntryMoney, 'amount'>): boolean {
  return entry.amount === null;
}

export type Totals = Record<BillingStatus, number> & { outstanding: number; all: number };

/**
 * Sums by status. `outstanding` is everything not yet paid — à facturer plus
 * facturé — which is the number the dashboard leads with, because it is the
 * money that has been earned and is not in the bank.
 */
export function totals(entries: EntryMoney[], clientRate: number): Totals {
  const t = { pending: 0, invoiced: 0, paid: 0 };
  for (const e of entries) t[e.status] += amountOf(e, clientRate);
  return {
    pending: round2(t.pending),
    invoiced: round2(t.invoiced),
    paid: round2(t.paid),
    outstanding: round2(t.pending + t.invoiced),
    all: round2(t.pending + t.invoiced + t.paid),
  };
}

/**
 * Reads what somebody typed into a number cell.
 *
 * Accepts both decimal marks, because Quebec writes « 2,5 » and a keyboard
 * set to English writes « 2.5 », and both people will type whichever their
 * fingers do. Spaces, « $ » and « h » are ignored so a pasted « 2 500,00 $ »
 * reads as 2500. Empty is null — clearing a cell means "no value", which for
 * Montant means "go back to computing it".
 *
 * Returns undefined for something that is not a number, so the cell can refuse
 * it rather than save a zero nobody typed.
 */
export function parseAmount(input: string): number | null | undefined {
  const cleaned = input.replace(/[\s\u00a0\u202f$h]/gi, '');
  if (cleaned === '') return null;

  // « 2.500,00 » and « 2,500.00 »: the last mark is the decimal one
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimal = lastComma > lastDot ? ',' : '.';
  const thousands = decimal === ',' ? '.' : ',';
  const normal = cleaned.split(thousands).join('').replace(decimal, '.');

  if (!/^\d*\.?\d+$|^\d+\.$/.test(normal)) return undefined;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? round2(n) : undefined;
}

const money = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
const plain = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 2 });

/** « 2 500,00 $ » */
export function formatMoney(n: number): string {
  return money.format(n);
}

const cents = new Intl.NumberFormat('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** « 2 500,00 » — money in a column already headed « ($) », so without the sign. */
export function formatAmount(n: number | null): string {
  return n === null ? '' : cents.format(n);
}

/** « 2,5 » — for hours and rates, which are numbers before they are money. */
export function formatNumber(n: number | null): string {
  return n === null ? '' : plain.format(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ paste -- */

export type PastedRow = {
  entry_on: string;
  title: string;
  detail: string;
  hours: number | null;
  rate: number | null;
  amount: number | null;
  status: BillingStatus;
};

/**
 * Reads rows copied out of the spreadsheet.
 *
 * Excel and Google Sheets both put tab-separated values on the clipboard, one
 * row per line, and quote a cell that holds a line break (the Détail column
 * always does) with doubled quotes inside. Columns are the sheet's own order:
 * Date · Tâche · Détail · Heures · Taux · Montant · Statut.
 *
 * Moving to this page would otherwise mean retyping every row of every tab,
 * which is the kind of cost that keeps a spreadsheet alive next to the thing
 * meant to replace it.
 *
 * Forgiving where the sheet is: a header row is skipped, blank rows are
 * skipped, a missing date is today's, a blank status is « à facturer », and a
 * Montant that is exactly Heures × Taux is stored as computed rather than as a
 * fixed price — so changing the rate later still reprices it, as it would have
 * in the sheet. Returns null when the text is not a table at all, so an
 * ordinary paste into a cell stays an ordinary paste.
 */
export function parseSheetPaste(text: string, fallbackDay: string): PastedRow[] | null {
  const table = parseTsv(text);
  // one cell is a normal paste into a cell, not an import
  if (table.length === 0 || table.every((r) => r.length < 2)) return null;

  const rows: PastedRow[] = [];
  for (const cells of table) {
    if (cells.every((c) => c.trim() === '')) continue;

    const [date = '', title = '', detail = '', hours = '', rate = '', amount = '', status = ''] =
      cells.map((c) => c.trim());
    if (/^date$/i.test(date) && /^t[aâ]che$/i.test(title)) continue;

    const h = parseAmount(hours) ?? null;
    const r = parseAmount(rate) ?? null;
    let a = parseAmount(amount) ?? null;
    if (a !== null && h !== null && r !== null && Math.abs(h * r - a) < 0.005) a = null;

    rows.push({
      entry_on: parseDay(date) ?? fallbackDay,
      title: title.slice(0, 200),
      detail: detail.slice(0, 4000),
      hours: h,
      rate: r,
      amount: a,
      status: parseStatus(status),
    });
  }
  return rows.length > 0 ? rows : null;
}

/** « 24/07/2026 », « 2026-07-24 », « 24-07-26 ». Day first, as Quebec writes it. */
export function parseDay(input: string): string | null {
  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = input.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  let y: number;
  let m: number;
  let d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  if (y < 100) y += 2000;

  // round-trip through a UTC date so 31/02 is refused rather than rolled over
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseStatus(input: string): BillingStatus {
  const s = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
  if (s.startsWith('pay') || s === 'paid') return 'paid';
  if (s.startsWith('factur') || s === 'invoiced' || s === 'envoye') return 'invoiced';
  return 'pending';
}

/** Tab-separated values with spreadsheet quoting: "a ""b"" c", and line breaks inside quotes. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (src.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* ---------------------------------------------------------------- invoice -- */

export type InvoiceLine = EntryMoney & {
  entry_on: string;
  title: string;
  detail: string;
};

/**
 * The lines of an invoice, as text to paste into QuickBooks.
 *
 * The invoice itself is written in QuickBooks — the sheet says « prendre le
 * usual quickbook » more than once — so the useful thing here is not to make
 * one but to stop retyping what is already written: each line's title and
 * amount, its detail indented under it, hours shown when the amount came from
 * them, and the total. Oldest first, the order an invoice reads in.
 */
export function invoiceText(
  clientName: string,
  lines: InvoiceLine[],
  clientRate: number,
  heading: string,
  /** The words for the last four lines, so this file holds no French. */
  labels: { subtotal: string; gst: string; qst: string; total: string },
): string {
  const sorted = [...lines].sort((a, b) => a.entry_on.localeCompare(b.entry_on));
  const body = sorted.map((l) => {
    const amount = amountOf(l, clientRate);
    const how =
      l.amount === null && l.hours !== null
        ? `${formatNumber(l.hours)} h × ${formatNumber(l.rate ?? clientRate)} $ = `
        : '';
    const detail = l.detail
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => `    ${d}`);
    return [`${l.title || '—'} — ${how}${formatMoney(amount)}`, ...detail].join('\n');
  });
  /*
    The invoice's own arithmetic, so the taxes are not worked out again by
    hand in QuickBooks: the subtotal is what was earned, the two taxes ride
    on top of it, and the total is what the client pays.
  */
  const tax = taxesOn(sorted.reduce((n, l) => n + amountOf(l, clientRate), 0));
  return [
    `${clientName} — ${heading}`,
    '',
    ...body,
    '',
    `${labels.subtotal} : ${formatMoney(tax.subtotal)}`,
    `${labels.gst} ${formatRate(GST_RATE)} : ${formatMoney(tax.gst)}`,
    `${labels.qst} ${formatRate(QST_RATE)} : ${formatMoney(tax.qst)}`,
    `${labels.total} : ${formatMoney(tax.total)}`,
  ].join('\n');
}

/* ------------------------------------------------------------- sorting -- */

/** The columns of the client list, and what a click on each one sorts by. */
export type SortKey = 'name' | 'pending' | 'invoiced' | 'paid' | 'last' | 'status';
export type Sort = { key: SortKey; dir: 'asc' | 'desc' };

export type SortableClient = {
  name: string;
  archived: boolean;
  /** The day of its most recent line, or the day it was created. */
  activity: string;
  last: string | null;
  pending: number;
  invoiced: number;
  paid: number;
  outstanding: number;
};

/**
 * The client list's order.
 *
 * With no sort chosen it is the useful default: what is owed, largest first,
 * then whatever moved most recently, then the name. Clicking a column sorts by
 * that column and falls back to the name, so two clients with nothing in the
 * column are still in an order you can look a name up in.
 *
 * A client with no lines at all sorts last on the money columns whichever way
 * the arrow points — « nothing » is not the smallest amount, it is the absence
 * of one, and burying the clients you have worked for under the ones you have
 * not would be the wrong answer to both readings of the arrow.
 */
export function sortClients<T extends SortableClient>(rows: T[], sort: Sort | null): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'fr');
  const out = [...rows];

  if (!sort) {
    return out.sort(
      (a, b) =>
        b.outstanding - a.outstanding || b.activity.localeCompare(a.activity) || byName(a, b),
    );
  }

  const flip = sort.dir === 'asc' ? -1 : 1;
  return out.sort((a, b) => {
    if (sort.key === 'name') return flip * -byName(a, b);
    if (sort.key === 'status') {
      // the first click puts the active clients on top, which is the useful way
      return flip * (Number(a.archived) - Number(b.archived)) || byName(a, b);
    }
    if (sort.key === 'last') {
      // never billed sorts last either way, like an empty money column
      if (a.last === null || b.last === null) {
        if (a.last === b.last) return byName(a, b);
        return a.last === null ? 1 : -1;
      }
      return flip * b.last.localeCompare(a.last) || byName(a, b);
    }

    const av = a[sort.key];
    const bv = b[sort.key];
    if (av === 0 || bv === 0) {
      if (av === bv) return byName(a, b);
      return av === 0 ? 1 : -1;
    }
    return flip * (bv - av) || byName(a, b);
  });
}

/** What one more click on a column does: down, then up, then back to the default. */
export function nextSort(current: Sort | null, key: SortKey): Sort | null {
  if (current?.key !== key) return { key, dir: 'desc' };
  if (current.dir === 'desc') return { key, dir: 'asc' };
  return null;
}

/* ---------------------------------------------------------------- taxes -- */

/**
 * Quebec's two sales taxes, as of writing: GST 5 % and QST 9.975 %.
 *
 * Both are charged, and both are charged on the amount before tax — Quebec
 * stopped compounding the QST on the GST in 2013, so they are two percentages
 * of the same subtotal, not one on top of the other.
 */
export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export type Taxes = { subtotal: number; gst: number; qst: number; total: number };

/**
 * The taxes on a subtotal, each rounded to the cent on its own.
 *
 * Every amount stored in this app is before tax, and every total the app calls
 * income is too: tax collected is the government's money passing through, and
 * counting it as revenue would overstate a year by about 15 %. So this is a
 * presentation on top of the figures rather than a change to them — the
 * client's sheet shows what to put on the invoice, and « Payé » stays what was
 * actually earned.
 *
 * Each tax is rounded separately because that is how an invoice prints them,
 * and a total built from the rounded parts is the total the client pays.
 */
export function taxesOn(subtotal: number): Taxes {
  const base = round2(subtotal);
  const gst = round2(base * GST_RATE);
  const qst = round2(base * QST_RATE);
  return { subtotal: base, gst, qst, total: round2(base + gst + qst) };
}

// its own formatter: the money one stops at two decimals, and the QST has three
const percent = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 3 });

/** « 9,975 % » — the rate as it is printed beside the amount. */
export function formatRate(rate: number): string {
  return `${percent.format(Math.round(rate * 100 * 1000) / 1000)} %`;
}

/**
 * A line that holds nothing yet.
 *
 * « Ajouter une ligne » writes the row before you type into it — that is what
 * makes the cells editable — so a sheet can hold a row that says nothing at
 * all, and one abandoned or deleted a moment later should leave no trace. The
 * dashboard skips these: they are not work done, and a blank row must not be
 * what « dernière activité » is reporting, nor put a client in a period.
 */
export function isBlankEntry(
  e: Pick<EntryMoney, 'hours' | 'rate' | 'amount'> & { title: string; detail: string },
): boolean {
  return (
    e.title.trim() === '' &&
    e.detail.trim() === '' &&
    e.hours === null &&
    e.amount === null &&
    e.rate === null
  );
}
