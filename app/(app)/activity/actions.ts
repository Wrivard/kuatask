"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { copy } from "@/lib/copy";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Puts a deleted task back from the snapshot the log kept.
 *
 * The whole row, not a reconstruction. Restoring a title and a date while
 * silently dropping the notes is worse than not offering a restore at all —
 * somebody would take the task back, believe it whole, and find out later.
 *
 * Deliberately not an undelete of the original row: that row is gone, really
 * gone, which is what `docs/00` means by "deletion is real deletion". This
 * inserts a new task carrying the old one's contents. It gets a new id, and the
 * log records the insert as a creation, because that is what it is.
 */
export async function restoreTask(activityId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: copy.error.saveFailed };

  // RLS scopes the read to the caller's workspace
  const { data: entry } = await supabase
    .from("activity")
    .select("action, snapshot, task_id")
    .eq("id", activityId)
    .maybeSingle();

  if (!entry || entry.action !== "deleted" || !entry.snapshot) {
    return { ok: false, error: copy.error.cannotRestore };
  }

  const snapshot = entry.snapshot as Record<string, unknown>;

  /*
    Already back. Two people looking at the same log can both press restore, and
    a second copy of somebody's task is a worse outcome than a message saying it
    is already there.
  */
  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", entry.task_id)
    .maybeSingle();

  if (existing) return { ok: false, error: copy.error.alreadyRestored };

  /*
    The id comes back with it. Nothing references a task, so reusing it is safe,
    and it means a second press finds the row above rather than making a
    duplicate — the check and the insert agree on what "already back" means.

    `created_by` is whoever made it originally, unless that account is gone, in
    which case the column is already null in the snapshot and stays that way.
    The insert policy requires created_by = auth.uid(), so a task restored on
    somebody else's behalf has to be attributed to the person doing it.
  */
  const { error } = await supabase.from("tasks").insert({
    id: entry.task_id,
    workspace_id: snapshot.workspace_id as string,
    title: snapshot.title as string,
    notes: (snapshot.notes as string | null) ?? null,
    label: (snapshot.label as string | null) ?? null,
    status: (snapshot.status as "todo" | "doing" | "done") ?? "todo",
    important: (snapshot.important as boolean) ?? false,
    due_on: (snapshot.due_on as string | null) ?? null,
    due_time: (snapshot.due_time as string | null) ?? null,
    assignee_id: (snapshot.assignee_id as string | null) ?? null,
    position: (snapshot.position as number) ?? Date.now() / 1000,
    created_by: user.id,
  });

  if (error) return { ok: false, error: copy.error.cannotRestore };

  revalidatePath("/activity");
  revalidatePath("/");
  return { ok: true };
}
