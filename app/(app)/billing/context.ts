import { redirect } from "next/navigation";
import { requestSession } from "@/lib/supabase/server";

/**
 * The signed-in person and their workspace, or a redirect.
 *
 * Both billing pages need exactly this and nothing else from the session, so it
 * is written once here rather than twice inline.
 */
export async function billingContext() {
  const { supabase, userId } = await requestSession();
  if (!userId) redirect("/login");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/no-access");

  return { supabase, workspaceId: membership.workspace_id as string };
}
