"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resetSession } from "@/lib/session-reset";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();

    /*
      The store and the draft map are module singletons, so the session's
      cookies going away does not empty them — and signing out is followed by a
      client navigation rather than a document load, so "still in memory" can
      mean "while the next person is standing there".

      Asked, not called. This button also renders on /no-access, and importing
      the store from here put seventeen kilobytes of task machinery on a page
      whose entire job is one line of copy and a way out.
    */
    resetSession();

    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void signOut()}
      className="h-10 rounded-sm text-[14px] font-medium"
    >
      {copy.auth.signOut}
    </Button>
  );
}
