import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * A daily copy of everything, written into the database beside it.
 *
 * The free plan has no automated backups and no point-in-time recovery, and
 * `npm run backup` only runs when somebody remembers: the last file on disk was
 * a month old. A bad delete — a click on the wrong X, a cascade from a client
 * removed by mistake — is otherwise permanent.
 *
 * So: one row per run, holding every table as JSON, keeping two weeks. At this
 * size a snapshot is well under a megabyte, and the pruning keeps it that way.
 *
 * Unlike /api/health this is **not** public. It reads with the service role, so
 * it sees past RLS, and what it returns would be every task and invoice line
 * both of them have written. Vercel's scheduler sends a bearer token built from
 * CRON_SECRET; without the variable set the route refuses to run at all rather
 * than quietly leaving the data reachable.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Everything worth keeping. Order is for reading the file, not for restoring. */
const TABLES = [
  "workspaces",
  "profiles",
  "workspace_members",
  "tasks",
  "subtasks",
  "notes",
  "clients",
  "billing_products",
  "billing_entries",
  "activity",
] as const;

/** How long a snapshot is kept. Two weeks is long enough to notice a loss. */
const KEEP_DAYS = 14;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || !url || !serviceRole) {
    // a missing secret is a refusal, never a free pass
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  const payload: Record<string, unknown[]> = {};
  let rows = 0;

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      // a partial snapshot is worse than none: it would look like a backup
      return NextResponse.json({ ok: false, table, error: error.message }, { status: 500 });
    }
    payload[table] = data ?? [];
    rows += data?.length ?? 0;
  }

  const { error: writeError } = await supabase
    .from("snapshots")
    .insert({ payload, rows });
  if (writeError) {
    return NextResponse.json({ ok: false, error: writeError.message }, { status: 500 });
  }

  // yesterday's copy of the same data is not worth two weeks of space twice
  await supabase
    .from("snapshots")
    .delete()
    .lt("taken_at", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString());

  // the counts, never the contents — this answer goes into a cron log
  return NextResponse.json({
    ok: true,
    rows,
    tables: Object.fromEntries(Object.entries(payload).map(([t, r]) => [t, r.length])),
  });
}
