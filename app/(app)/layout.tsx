import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { StoreBoot } from "@/components/shell/store-boot";
import { AppChrome } from "@/components/shell/app-chrome";
import { BottomBar } from "@/components/shell/bottom-bar";
import { LiveRegion } from "@/components/shell/live-region";
import { SetupRequired } from "@/components/shell/setup-required";

// per-user by definition: never prerender
export const dynamic = "force-dynamic";

/**
 * The app shell. Store hydration, hotkeys and the command palette mount here
 * in later phases — right now it is the frame and nothing else.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // a misconfigured deploy should explain itself rather than emit a digest
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS means this returns the workspace only if the caller is a member
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .limit(1)
    .maybeSingle();

  if (!workspace) redirect("/no-access");

  return (
    <div className="flex min-h-dvh">
      <StoreBoot />
      <AppChrome />
      <LiveRegion />
      <Sidebar workspaceName={workspace.name} />
      {/* the pad clears the fixed mobile bar plus the home indicator */}
      <div className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        {children}
      </div>
      <BottomBar />
    </div>
  );
}
