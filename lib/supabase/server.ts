import { createServerClient } from "@supabase/ssr";
import { createClient as createDataOnlyClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/database.types";
import { readRequestAuth } from "@/lib/request-auth";
import {
  readCookieSession,
  stillUsable,
  storageKeyFor,
} from "@/lib/supabase/cookie-session";

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
 * Verifies a token without owning a session.
 *
 * `auth.getUser(jwt)` with an explicit token goes straight to the auth server
 * (`_getUser(jwt)` in auth-js) — it never loads the stored session, so it
 * cannot renew one and cannot rotate anything. `persistSession: false` and
 * `autoRefreshToken: false` make that structural rather than incidental: this
 * client has no storage to write a rotated token into and no ticker to start
 * one.
 */
function verifierClient(url: string, anonKey: string) {
  return createDataOnlyClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * The signed-in person and a client to query as them, for this one request.
 *
 * Three tiers, and the order is the whole design. Only the last one is capable
 * of spending a refresh token, and it exists because locking somebody out of
 * their own task manager is worse than the bug this file is about.
 *
 *   1. **The middleware's headers.** It verified the user, renewed the token if
 *      it needed renewing, stored the result somewhere that can actually write
 *      cookies, and handed both inward. Nothing to ask anybody. This is what
 *      every page in the app takes.
 *
 *   2. **The session cookie, if its access token is still good.** For a request
 *      the matcher missed. One call to validate the token, no session loaded,
 *      so still nothing that can rotate. See lib/supabase/cookie-session.ts.
 *
 *   3. **A full auth client.** Reached only when there are no headers *and* the
 *      cookie's token is past its margin, which means the token has to be
 *      renewed for the request to work at all. In a Server Component the
 *      rotated token cannot be stored — that is the rollback bug — so this logs
 *      loudly instead of happening quietly. If it ever appears in the Vercel
 *      logs, the fix is the matcher, not this function.
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

    const storageKey = storageKeyFor(url);
    if (storageKey) {
      const cookieStore = await cookies();
      const session = await readCookieSession(
        (name) => cookieStore.get(name)?.value,
        storageKey,
      );
      if (session && stillUsable(session)) {
        const {
          data: { user },
        } = await verifierClient(url, anonKey).auth.getUser(session.accessToken);
        if (user) {
          return {
            supabase: dataClient(url, anonKey, session.accessToken),
            userId: user.id,
          };
        }
      }
    }
  }

  console.warn(
    "[kua] requestSession: no stamped identity and no usable cookie token — " +
      "falling back to a client that can renew, which a Server Component cannot store. " +
      "Check the middleware matcher.",
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}
