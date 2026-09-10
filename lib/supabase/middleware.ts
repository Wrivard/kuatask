import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { routeFor } from "@/lib/routing";

/**
 * Refreshes the session cookie and gates routes.
 *
 * Two jobs wound together: refreshing the cookie needs a real request, real
 * cookies and a round trip, and deciding where the request goes needs none of
 * that. Only the first is hard to test, so the decision lives on its own in
 * `lib/routing.ts`, where `verify:logic` walks every combination of it. Every
 * branch there is a way to lock somebody out of their own task manager.
 *
 * The membership check is a UX convenience so a stranger lands somewhere
 * sensible. The security boundary is RLS — an uninvited user's queries return
 * empty sets whether or not this runs. Do not treat it as the guard.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /*
    Without this guard a missing env var throws inside createServerClient, and
    because the matcher covers every path that failure blacks out the whole
    site — even /login, which needs no session at all. Degrading here is safe:
    the security boundary is RLS, and this check is documented as a UX
    convenience. A misconfigured deploy should be diagnosable, not a wall.
  */
  if (!url || !anonKey) {
    console.error(
      "[kua] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Session refresh and route gating are disabled until they are set.",
    );
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not put logic between createServerClient and getUser — a stale token
  // here logs the user out at random.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const redirect = (to: string, search?: string) => {
    const target = request.nextUrl.clone();
    target.pathname = to;
    target.search = search ? `?${search}` : "";
    const response = NextResponse.redirect(target);
    // carry the refreshed auth cookies onto the redirect
    supabaseResponse.cookies.getAll().forEach((c) => response.cookies.set(c));
    return response;
  };

  /*
    A refresh that stops working looks exactly like never having been signed in:
    you are simply somewhere else, with a login screen and no idea why. Whether
    a session cookie arrived is the only thing that separates the two, so it is
    read before the decision rather than inferred after it.
  */
  const hadSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  /*
    Asked only when there is somebody to ask it about. A signed-in person on a
    public path still needs it, because that is what decides whether /login
    sends them into the app or to /no-access.
  */
  let hasWorkspace = false;
  if (user) {
    const { count } = await supabase
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    hasWorkspace = (count ?? 0) > 0;
  }

  const decision = routeFor({
    pathname,
    hasUser: Boolean(user),
    hasWorkspace,
    hadSessionCookie,
  });

  return decision.action === "pass"
    ? supabaseResponse
    : redirect(decision.to, decision.search);
}
