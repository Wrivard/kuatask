import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BillingStatus } from "@/lib/billing";

export type Client = {
  id: string;
  name: string;
  default_rate: number;
  archived_at: string | null;
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
};

export const CLIENT_COLUMNS = "id, name, default_rate, archived_at";
export const ENTRY_COLUMNS =
  "id, client_id, entry_on, title, detail, hours, rate, amount, status, created_at";

/**
 * The signed-in person and their workspace, or a redirect.
 *
 * Both billing pages need exactly this and nothing else from the session, so it
 * is written once here rather than twice inline.
 */
export async function billingContext() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/no-access");

  return { supabase, workspaceId: membership.workspace_id as string };
}

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
