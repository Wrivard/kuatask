import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/shell/header";
import { PeopleClient } from "./people-client";
import { copy } from "@/lib/copy";

export default async function PeoplePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/no-access");

  // RLS already scopes both of these to the caller's workspace
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("workspace_members").select("user_id, role"),
    supabase.from("pending_invites").select("id, email, role"),
  ]);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, accent");

  const rows = (members ?? []).map((m) => {
    const profile = profiles?.find((p) => p.id === m.user_id);
    return {
      userId: m.user_id,
      role: m.role,
      displayName: profile?.display_name ?? profile?.email ?? "—",
      email: profile?.email ?? "",
      accent: profile?.accent ?? "green",
    };
  });

  return (
    <>
      <Header title={copy.people.title} />
      <PeopleClient
        members={rows}
        invites={invites ?? []}
        meId={user.id}
        isAdmin={membership.role === "admin"}
      />
    </>
  );
}
