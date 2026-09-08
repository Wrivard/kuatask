import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { StoreBoot } from "@/components/shell/store-boot";
import { AppChrome } from "@/components/shell/app-chrome";

/**
 * The app shell. Store hydration, hotkeys and the command palette mount here
 * in later phases — right now it is the frame and nothing else.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      <Sidebar workspaceName={workspace.name} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
