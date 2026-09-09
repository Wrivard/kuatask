"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
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
