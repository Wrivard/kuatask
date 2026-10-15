import { combineChunks, stringFromBase64URL } from "@supabase/ssr";

/**
 * Reading the session cookie without being able to spend it.
 *
 * `requestSession()` normally gets the identity from the middleware, on the
 * request headers. This is the tier below that: the cookie itself, decoded by
 * hand, so a render that somehow arrives without the headers still has one more
 * way to know who you are *before* the way that costs a refresh token.
 *
 * The decoding uses `@supabase/ssr`'s own exported primitives — `combineChunks`
 * for the `name`, `name.0`, `name.1` split and `stringFromBase64URL` for the
 * `base64-` payload — rather than a second implementation of the same format.
 * A format this module got subtly wrong would read as "no session", which is a
 * silent downgrade to the tier that can rotate a token, so it is worth using
 * the library's version of it.
 *
 * Nothing here is trusted. The access token is handed straight to
 * `auth.getUser(jwt)`, which validates it against the auth server, and to
 * PostgREST, which enforces RLS on it. A forged cookie buys nothing.
 */

/** What `@supabase/ssr` prefixes a JSON payload with when it base64url-encodes it. */
const BASE64_PREFIX = "base64-";

/**
 * The cookie name `@supabase/ssr` stores the session under, derived the same
 * way the library derives it: the project ref is the first label of the
 * Supabase hostname.
 */
export function storageKeyFor(supabaseUrl: string): string | null {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** The parts of a stored session this app needs. Everything else is ignored. */
export type CookieSession = {
  accessToken: string;
  /** Seconds since the epoch, as auth-js writes it. Absent on old payloads. */
  expiresAt: number | null;
};

/**
 * The session in the request cookies, or null.
 *
 * `get` is the caller's cookie reader — `cookieStore.get(name)?.value` in a
 * Server Component, `request.cookies.get(name)?.value` in middleware — so this
 * module needs neither `next/headers` nor a request object and stays testable
 * from a plain script.
 */
export async function readCookieSession(
  get: (name: string) => string | undefined,
  storageKey: string,
): Promise<CookieSession | null> {
  const raw = await combineChunks(storageKey, (name) => get(name));
  if (!raw) return null;

  let json = raw;
  if (raw.startsWith(BASE64_PREFIX)) {
    try {
      json = stringFromBase64URL(raw.slice(BASE64_PREFIX.length));
    } catch {
      // chunks from two different writes, combined. Treated as absent, which
      // is what @supabase/ssr itself does with the same failure.
      return null;
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const session = parsed as { access_token?: unknown; expires_at?: unknown };
  if (typeof session.access_token !== "string" || !session.access_token) return null;

  return {
    accessToken: session.access_token,
    expiresAt: typeof session.expires_at === "number" ? session.expires_at : null,
  };
}

/**
 * Whether this access token is still good, with a margin.
 *
 * The margin is the point of the function. A token that expires in two seconds
 * is useless to a render that is about to make three queries with it, and
 * treating it as valid would trade a rotated refresh token for a page of 401s.
 * Thirty seconds is comfortably longer than a render and comfortably shorter
 * than auth-js's own ninety-second refresh margin, so a token this says yes to
 * is one the middleware would not have bothered renewing either.
 */
export const USABLE_MARGIN_MS = 30_000;

export function stillUsable(session: CookieSession, now = Date.now()): boolean {
  if (session.expiresAt === null) return false;
  return session.expiresAt * 1000 - now > USABLE_MARGIN_MS;
}
