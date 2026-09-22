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

/** « 2,5 » — for hours and rates, which are numbers before they are money. */
export function formatNumber(n: number | null): string {
  return n === null ? '' : plain.format(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
