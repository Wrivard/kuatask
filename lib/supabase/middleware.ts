import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

/** Routes reachable without a session. */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/confirm"];

/**
 * Refreshes the session cookie and gates routes.
 *
 * The membership check here is a UX convenience so a stranger lands somewhere
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
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const response = NextResponse.redirect(url);
    // carry the refreshed auth cookies onto the redirect
    supabaseResponse.cookies.getAll().forEach((c) => response.cookies.set(c));
    return response;
  };

  if (!user) {
    return isPublic ? supabaseResponse : redirect("/login");
  }

  const { count } = await supabase
    .from("workspace_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const hasWorkspace = (count ?? 0) > 0;

  if (!hasWorkspace) {
    return pathname === "/no-access" ? supabaseResponse : redirect("/no-access");
  }

  // signed in, has a workspace — the login and no-access screens are behind them
  if (pathname === "/login" || pathname === "/no-access") {
    return redirect("/");
  }

  return supabaseResponse;
}
