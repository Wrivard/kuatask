import { NextResponse } from "next/server";

/**
 * Configuration probe. Reports only whether each variable is PRESENT and, for
 * the two public ones, a short non-secret fingerprint — never a value, and
 * never anything about the service role key beyond its existence.
 *
 * This exists because a misconfigured deploy otherwise surfaces as an opaque
 * digest, and the server logs are not reachable from where the build is driven.
 */
export const dynamic = "force-dynamic";

function fingerprint(value: string | undefined) {
  if (!value) return null;
  return { length: value.length, head: value.slice(0, 8) };
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = process.env.NEXT_PUBLIC_SITE_URL;

  return NextResponse.json({
    ok: Boolean(url && anon),
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
  });
}
