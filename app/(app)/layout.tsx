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
 * The app shell: the store's initial data, the keyboard layer, and the frame.
 *
 * The workspace query has to happen here anyway to decide between the app and
 * /no-access, so the tasks and profiles come back in the same round trip and are
 * handed to the store before first paint. That removes the cold-load sequence of
 * JS, hydrate, auth, query — and with it the skeleton.
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

  // RLS means membership decides all three of these, not the query
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/no-access");

  const [{ data: workspace }, { data: tasks }, { data: members }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspace_id)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", membership.workspace_id)
      .order("position"),
    supabase.from("profiles").select("*"),
  ]);

  if (!workspace) redirect("/no-access");

  return (
    <div className="flex min-h-dvh">
      <StoreBoot
        initial={{
          tasks: tasks ?? [],
          members: members ?? [],
          me: members?.find((m) => m.id === user.id) ?? null,
          workspaceId: membership.workspace_id,
        }}
      />
      <AppChrome />
      <LiveRegion />
      <Sidebar workspaceName={workspace.name} />
      {/* the pad clears the fixed mobile bar plus the home indicator */}
      <div className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {children}
      </div>
      <BottomBar />
    </div>
  );
}
