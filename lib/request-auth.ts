/**
 * The identity the middleware hands to the render of the same request.
 *
 * Why this exists, which is the whole of the rollback bug:
 *
 * Every Supabase client renews the access token whenever it is within ninety
 * seconds of expiry — and not only on `auth.getUser()`. Every `from(...)`
 * fetches the token through `getSession()` first, so a page that reads three
 * tables can start three renewals. Renewal *rotates* the refresh token: the
 * old one is accepted for about ten seconds afterwards and then refused.
 *
 * In a Server Component cookies are read-only, so `cookieStore.set` throws and
 * the rotated token is thrown away with it. The browser is left holding a
 * refresh token that the server has already spent. It works for ten seconds.
 * An hour later the browser tries to renew with it, gets a 400, and supabase-js
 * concludes the session is dead and clears it — which is the magic link in the
 * production logs on 12 October at 14:37:51, five seconds after the 400.
 *
 * The edge logs for 15 October 02:36:45–46 show it plainly: eight renewals in
 * 1.1 seconds, six of them from `createServerClient` on Vercel, each one
 * rotating a token nobody could store.
 *
 * So the middleware — the one place on the server that can actually write a
 * cookie — renews once, and passes the result inward on the request headers.
 * The render reads those instead of asking the auth server anything, and its
 * data client has no auth machinery at all (see lib/supabase/server.ts), which
 * is what makes a discarded rotation impossible rather than unlikely.
 *
 * These headers are internal. Next sets them on the request it hands to the
 * render; they never reach the browser. But a browser can *send* them, so they
 * are deleted on the way in, unconditionally, before anything is stamped.
 */

export const USER_HEADER = 'x-kua-user';
export const TOKEN_HEADER = 'x-kua-token';

/** A v4 uuid, which is what a Supabase user id is. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Three base64url segments. Not verification — PostgREST does that. */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Remove anything the caller sent under our names.
 *
 * Called before the identity is known, so a request that arrives carrying
 * `x-kua-user` cannot have it survive into the render. The middleware matcher
 * covers every path that renders, so there is no way in that skips this.
 */
export function clearRequestAuth(headers: Headers) {
  headers.delete(USER_HEADER);
  headers.delete(TOKEN_HEADER);
}

/** Stamp the identity the middleware just verified. */
export function stampRequestAuth(headers: Headers, userId: string, accessToken: string) {
  clearRequestAuth(headers);
  headers.set(USER_HEADER, userId);
  headers.set(TOKEN_HEADER, accessToken);
}

export type RequestAuth = { userId: string; accessToken: string };

/**
 * Read it back, or null.
 *
 * Both or neither: a user without a token cannot query, and a token without a
 * user is an identity we have not been told. Null means "ask the auth server
 * yourself" — the path the app took before this existed — so a request that
 * somehow arrives unstamped still works.
 *
 * The shapes are checked because a wrong value here would be used as `user_id`
 * in queries. RLS is still the boundary — the token decides what comes back,
 * and a forged id with a real token returns the real token's rows — but a
 * query built from « admin » or an empty string is a bug worth refusing.
 */
export function readRequestAuth(headers: {
  get(name: string): string | null;
}): RequestAuth | null {
  const userId = headers.get(USER_HEADER);
  const accessToken = headers.get(TOKEN_HEADER);
  if (!userId || !accessToken) return null;
  if (!UUID.test(userId) || !JWT.test(accessToken)) return null;
  return { userId, accessToken };
}
