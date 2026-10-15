import { createServerClient } from "@supabase/ssr";
import { createClient as createDataOnlyClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/database.types";
import { readRequestAuth } from "@/lib/request-auth";

/** Server client, bound to the request cookies. Server components and route handlers. */
export class SupabaseConfigError extends Error {
  constructor() {
    super(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY on the server runtime.",
    );
    this.name = "SupabaseConfigError";
  }
}

/** True when both public Supabase variables are readable on this runtime. */
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export async function createClient() {
  /*
    cookies() is awaited FIRST, before the config check, and the order is
    load-bearing. Reading it marks the caller dynamic; throwing before it left
    routes looking static, so `next build` tried to prerender /no-access, hit
    the throw, and failed the whole build rather than the request. A missing
    variable must break a request, never a build.
  */
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new SupabaseConfigError();

  return createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /*
              Called from a Server Component, where cookies are read-only.

              This is not as harmless as it reads, and it was the second half of
              the rollback bug: what gets swallowed here is a *rotated refresh
              token*, and losing it leaves the browser holding one the server
              has already spent. Renders go through `requestSession()` below
              precisely so they never reach this line — see lib/request-auth.ts.
            */
          }
        },
      },
    },
  );
}

/**
 * A client that can read and write data as the signed-in person, and cannot
 * touch the session.
 *
 * `accessToken` replaces the auth machinery outright: supabase-js takes the
 * token from here for every request and `client.auth` becomes a proxy that
 * throws if anything touches it. So this client cannot renew a token, cannot
 * rotate one, and cannot sign anybody out — which is the guarantee, rather
 * than a promise to be careful.
 */
function dataClient(url: string, anonKey: string, accessToken: string) {
  return createDataOnlyClient<Database>(url, anonKey, {
    accessToken: async () => accessToken,
  });
}

/**
 * The signed-in person and a client to query as them, for this one request.
 *
 * The middleware has already done the work: it verified the user, renewed the
 * token if it needed renewing, stored the result in a context that can
 * actually write cookies, and handed both inward on the request headers. A
 * render asking the auth server again is a round trip for an answer it already
 * has — and, worse, a renewal it cannot keep.
 *
 * Falls back to asking, when the headers are not there. Nothing in the app
 * should reach this: the matcher covers every path that renders. But a request
 * that somehow does must still work, so the old behaviour is the floor rather
 * than an error.
 */
export async function requestSession(): Promise<{
  supabase: SupabaseClient<Database>;
  userId: string | null;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    const identity = readRequestAuth(await headers());
    if (identity) {
      return {
        supabase: dataClient(url, anonKey, identity.accessToken),
        userId: identity.userId,
      };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}
