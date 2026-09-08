import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

/** Routes reachable without a session. */
const PUBLIC_PATHS = ["/login", "/auth/callback"];

/**
 * Refreshes the session cookie and gates routes.
 *
 * The membership check here is a UX convenience so a stranger lands somewhere
 * sensible. The security boundary is RLS — an uninvited user's queries return
 * empty sets whether or not this runs. Do not treat it as the guard.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

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
