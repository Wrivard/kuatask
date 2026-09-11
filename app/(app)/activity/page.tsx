import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/shell/header";
import { ActivityClient, type ActivityAction } from "./activity-client";
import { copy } from "@/lib/copy";

// per-user by definition: never prerender
export const dynamic = "force-dynamic";

/** How far back the page reaches in one go. */
const PAGE_SIZE = 200;

/**
 * What has happened, newest first, with a way back from a deletion.
 *
 * `docs/00` rules out an archive and a trash, and this is neither — a trash is
 * somewhere deleted tasks live on, accumulating into exactly the wall of old
 * work that rule exists to prevent. The tasks really are deleted. What survives
 * is the record that they existed, and enough of one to put a row back when
 * somebody asks for it.
 */
export default async function ActivityPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes both of these to the caller's workspace
  const [{ data: entries }, { data: profiles }] = await Promise.all([
    supabase
      .from("activity")
      .select("id, task_id, actor_id, action, title, changed, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    supabase.from("profiles").select("id, display_name, accent"),
  ]);

  /*
    Which deletions can still be taken back: the ones whose task is not already
    there. Computed here rather than in the browser so the button is absent
    instead of present-and-refused — a control that fails when pressed is worse
    than one that was never offered.
  */
  const deletedIds = (entries ?? [])
    .filter((e) => e.action === "deleted")
    .map((e) => e.task_id);

  const { data: alive } = deletedIds.length
    ? await supabase.from("tasks").select("id").in("id", deletedIds)
    : { data: [] };

  const back = new Set((alive ?? []).map((t) => t.id));

  return (
    <>
      <Header title={copy.nav.activity} />
      <ActivityClient
        entries={(entries ?? []).map((e) => ({
          ...e,
          // the column is a text check constraint, so the database knows the
          // five values and the generated type does not
          action: e.action as ActivityAction,
          restorable: e.action === "deleted" && !back.has(e.task_id),
        }))}
        people={profiles ?? []}
      />
    </>
  );
}
