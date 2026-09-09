"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The browser half of /auth/callback.
 *
 * GoTrue's implicit flow returns the session in the URL fragment, which is
 * never sent to a server — so no route handler can read it, no matter how it is
 * written. This page reads location.hash, installs the session through the
 * browser client (which writes the same cookies middleware refreshes), and then
 * gets out of the way.
 *
 * Reached only when /auth/callback found no credential in the query string.
 */
export default function ConfirmPage() {
  const router = useRouter();

  React.useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/login?error=expired");
      return;
    }

    void (async () => {
      const { error } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      // drop the credential out of the address bar either way
      window.history.replaceState(null, "", window.location.pathname);

      if (error) {
        router.replace("/login?error=expired");
        return;
      }

      router.replace("/");
      router.refresh();
    })();
  }, [router]);

  // deliberately blank: this is a redirect stop, not a screen
  return null;
}
