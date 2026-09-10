import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
      Everything except static assets. Auth cookies have to be refreshed on
      real navigations, not on every asset request — and a crawler asking for
      robots.txt should get robots.txt, not a redirect to the login screen.
    */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest|woff2?)$).*)",
  ],
};
