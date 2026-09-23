/*
  Shapes and normalisers shared by the server pages and the client sheet. No
  server imports here: the sheet reads these too, and anything that pulls in
  next/headers cannot be bundled for the browser. The session lookup lives in
  context.ts.
*/
import type { BillingStatus } from "@/lib/billing";

export type Client = {
  id: string;
  name: string;
  default_rate: number;
  archived_at: string | null;
  created_at: string;
};

export type Entry = {
  id: string;
  client_id: string;
  entry_on: string;
  title: string;
  detail: string;
  hours: number | null;
  rate: number | null;
  amount: number | null;
  status: BillingStatus;
  created_at: string;
  /** Touched by the trigger on every change, so it is when we last did something. */
  updated_at: string;
};

export type Product = {
  id: string;
  name: string;
  detail: string;
  price: number;
  archived_at: string | null;
};

export const PRODUCT_COLUMNS = "id, name, detail, price, archived_at";
export const CLIENT_COLUMNS = "id, name, default_rate, archived_at, created_at";
export const ENTRY_COLUMNS =
  "id, client_id, entry_on, title, detail, hours, rate, amount, status, created_at, updated_at";

/*
  Postgres `numeric` is exact, and some paths hand it over as a string to keep
  it that way — "75.00" rather than 75. Summing strings concatenates them, which
  on a billing page is the worst possible silent failure, so every number is
  made a number once, here, before anything adds it up.
*/
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function toClient(row: Record<string, unknown>): Client {
  return { ...(row as Client), default_rate: num(row.default_rate) ?? 0 };
}

export function toEntry<T extends Partial<Entry>>(row: T): T {
  return { ...row, hours: num(row.hours), rate: num(row.rate), amount: num(row.amount) };
}

export function toProduct(row: Record<string, unknown>): Product {
  return { ...(row as Product), price: num(row.price) ?? 0 };
}
