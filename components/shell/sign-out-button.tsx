"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { clearDrafts } from "@/lib/draft";
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
    */
    useStore.getState().clear();
    clearDrafts();

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
