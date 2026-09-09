import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { copy } from "@/lib/copy";
import { SignOutButton } from "./sign-out-button";
import { SetupRequired } from "@/components/shell/setup-required";

// per-user by definition: never prerender
export const dynamic = "force-dynamic";

/**
 * A signed-in user with no memberships. Also what an uninvited stranger sees.
 * One line of copy and a way out — no nav, no shell, nothing else.
 */
export default async function NoAccessPage() {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[320px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
          {copy.noAccess.title}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
          {copy.noAccess.body}
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
