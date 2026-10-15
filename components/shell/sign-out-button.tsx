"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resetSession } from "@/lib/session-reset";
import { clearOutbox } from "@/lib/outbox";
import { signingOutOnPurpose } from "@/lib/session";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    // SIGNED_OUT is the same event whether you asked for it or the refresh
    // token was refused, and only one of those is worth writing down
    signingOutOnPurpose();
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
    // unsent writes are this person's work, not the next person's inheritance
    clearOutbox();

    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void signOut()}
      className="h-10"
    >
      {copy.auth.signOut}
    </Button>
  );
}
