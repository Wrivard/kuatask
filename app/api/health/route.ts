import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Configuration and reachability probe.
 *
 * Reports only whether each variable is PRESENT and, for the two public ones, a
 * short non-secret fingerprint — never a value, and never anything about the
 * service role key beyond its existence.
 *
 * This exists because a misconfigured deploy otherwise surfaces as an opaque
 * digest, and the server logs are not reachable from where the build is driven.
 *
 * It also asks the database a question now. Every variable being present says
 * nothing about whether the project behind them is awake, reachable from this
 * region, or still holding the keys it was given — a paused Supabase project
 * and a rotated key both look like perfect configuration from here, and both
 * take the app down. One anonymous count against a table protected by RLS
 * answers it: the number comes back zero for an unauthenticated caller, which
 * is the point. What matters is that it comes back at all.
 */
export const dynamic = "force-dynamic";

/** Long enough for a cold region, short enough to fail rather than hang. */
const DB_TIMEOUT_MS = 4000;

function fingerprint(value: string | undefined) {
  if (!value) return null;
  return { length: value.length, head: value.slice(0, 8) };
}

async function reachDatabase(url: string, anon: string) {
  const started = Date.now();
  try {
    const supabase = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await Promise.race([
      supabase.from("workspaces").select("id", { head: true, count: "exact" }),
      new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(
          () => resolve({ error: { message: `timed out after ${DB_TIMEOUT_MS}ms` } }),
          DB_TIMEOUT_MS,
        ),
      ),
    ]);

    return error
      ? { ok: false as const, ms: Date.now() - started, error: error.message }
      : { ok: true as const, ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false as const,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = process.env.NEXT_PUBLIC_SITE_URL;

  const configured = Boolean(url && anon);
  const database = configured ? await reachDatabase(url!, anon!) : null;

  return NextResponse.json(
    {
      ok: configured && (database?.ok ?? false),
      configured,
      database,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: fingerprint(url),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anon ? { length: anon.length } : null,
        SUPABASE_SERVICE_ROLE_KEY: serviceRole ? { present: true } : null,
        NEXT_PUBLIC_SITE_URL: site ?? null,
      },
      vercel: {
        env: process.env.VERCEL_ENV ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      },
    },
    // a probe that answers 200 while the database is unreachable is a probe
    // nothing can be wired to
    { status: configured && database?.ok ? 200 : 503 },
  );
}
