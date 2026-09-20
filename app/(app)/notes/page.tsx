import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/shell/header";
import { Unreachable } from "@/components/shell/unreachable";
import { NotesClient, type Note } from "./notes-client";
import { copy } from "@/lib/copy";

// a dump changes every time you look at it
export const dynamic = "force-dynamic";

/**
 * Somewhere to put things before deciding what they are.
 *
 * Deliberately not a task list. No due date, no assignee, no status, no undo
 * stack, no activity log — the machinery that makes a task worth keeping is the
 * same machinery that makes writing one feel like a decision, and this page
 * exists for the moment before the decision. A note becomes a task by being
 * pushed into one, which is the reorganising step, and it disappears from here
 * when it does.
 *
 * Private to its author. Everything else in this app is shared on purpose; this
 * is the exception, because unfinished thinking that somebody else can read is
 * thinking you edit as you write it.
 */
export default async function NotesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/no-access");

  /*
    Sweep first, then read, so the page never shows a note it is about to
    delete. The purge is RLS-scoped to the caller, and runs here rather than on
    a schedule because the free plan has no pg_cron — a note nobody has come
    back to look at is doing no harm in the meantime.
  */
  await supabase.rpc("purge_old_notes");

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, body, created_at")
    .order("created_at", { ascending: false });

  // an empty dump and a failed read look identical and mean opposite things
  if (error) return <Unreachable code={error.code ?? null} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title={copy.nav.notes} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NotesClient
          initial={(notes ?? []) as Note[]}
          workspaceId={membership.workspace_id}
          userId={user.id}
        />
      </div>
    </div>
  );
}
