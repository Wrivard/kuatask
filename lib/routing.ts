/**
 * Where a request should end up, as a pure decision.
 *
 * The middleware's job is two things wound together: refresh the session cookie
 * (which needs a real request, real cookies and a network round trip) and
 * decide where the request goes (which needs none of that). Only the first is
 * hard to test, so the second is here on its own.
 *
 * This matters more than it looks. Every one of these branches is a way to lock
 * someone out of their own task manager, and the failures are asymmetric: send
 * a signed-in person to /login and they are merely annoyed, but send them in a
 * loop between /login and / and the app is unusable with nothing on screen to
 * explain it. There are only eight interesting combinations and the suite walks
 * all of them.
 *
 * NOT the security boundary. RLS is — an uninvited caller's queries return
 * empty sets whether or not any of this runs. This exists so a stranger lands
 * somewhere that makes sense.
 */

/** Routes reachable without a session. */
export const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/auth/confirm',
  // the config probe has to answer even when auth cannot be configured
  '/api/health',
];

export type RouteDecision =
  | { action: 'pass' }
  | { action: 'redirect'; to: string; search?: string };

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function routeFor({
  pathname,
  hasUser,
  hasWorkspace,
  hadSessionCookie,
}: {
  pathname: string;
  hasUser: boolean;
  /** Only meaningful when `hasUser`. */
  hasWorkspace: boolean;
  /**
   * Whether the request arrived carrying an auth cookie. A refresh that stops
   * working looks exactly like never having been signed in, so this is the only
   * thing that separates "your session expired" from "hello".
   */
  hadSessionCookie: boolean;
}): RouteDecision {
  if (!hasUser) {
    if (isPublicPath(pathname)) return { action: 'pass' };
    return hadSessionCookie
      ? { action: 'redirect', to: '/login', search: 'expired=1' }
      : { action: 'redirect', to: '/login' };
  }

  if (!hasWorkspace) {
    // /no-access is the destination, so it must not redirect to itself
    return pathname === '/no-access'
      ? { action: 'pass' }
      : { action: 'redirect', to: '/no-access' };
  }

  // signed in with a workspace: the login and no-access screens are behind them
  if (pathname === '/login' || pathname === '/no-access') {
    return { action: 'redirect', to: '/' };
  }

  return { action: 'pass' };
}
