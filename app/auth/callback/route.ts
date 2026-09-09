import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Turns a magic link into a session. Supabase hands the credential back in one
 * of three shapes and the app has to accept all of them:
 *
 *  1. `?code=`                 PKCE. What our own /login form produces, because
 *                              createBrowserClient sends a code_challenge.
 *  2. `?token_hash=&type=`     Server-side OTP, used by email templates written
 *                              with {{ .TokenHash }}.
 *  3. `#access_token=...`      Implicit. What GoTrue's /verify redirects with
 *                              when the link was NOT started with a PKCE
 *                              challenge — dashboard "Send magic link" and
 *                              admin generate_link both land here.
 *
 * A URL fragment is never transmitted to the server, so case 3 is unreachable
 * from a route handler by construction. It is handed to /auth/confirm, which
 * reads location.hash in the browser; the fragment survives the redirect
 * because the target carries none of its own.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get("next") ?? "/";

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const errorDescription = searchParams.get("error_description");

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // no query credential — it may be sitting in a fragment we cannot see
  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/auth/confirm`);
  }

  // expired or already-used link — send them back to ask for a fresh one
  return NextResponse.redirect(`${origin}/login?error=expired`);
}
