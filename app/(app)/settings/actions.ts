"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/database.types";
import { copy } from "@/lib/copy";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The service role key lives in 'use server' files and nowhere else.
 */
function adminClient() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Deletes the caller's own account.
 *
 * Law 25 gives a person a right to have their personal information erased, and
 * that right does not stop applying because the person is one of two owners of
 * the business — a working email address, a display name and a record of what
 * they did each day is personal information whoever holds it. There was no way
 * to exercise it short of asking somebody with the service role key.
 *
 * What goes: the `auth.users` row, which cascades to the profile and the
 * membership. What stays: the tasks. Deleting somebody's work when they leave
 * loses work, which has been the rule since docs/03 — the open ones are
 * unassigned first, so they land in « Personne » for whoever is left rather
 * than pointing at an id that no longer exists.
 *
 * Refused for the last admin, by the same guard that refuses removing them:
 * a workspace with no admin cannot invite anybody, so deleting yourself out of
 * one is a door that locks behind you.
 *
 * Only ever the caller's own account. There is no id parameter on purpose —
 * an admin removing somebody else is `removeMember`, which leaves them their
 * login and their other workspaces.
 */
export async function deleteOwnAccount(): Promise<ActionResult> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: copy.error.saveFailed };

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership) {
    if (membership.role === "admin") {
      const { data: admins } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", membership.workspace_id)
        .eq("role", "admin");

      if ((admins ?? []).length <= 1) {
        return { ok: false, error: copy.error.lastAdmin };
      }
    }

    // their open work goes to nobody rather than to a ghost; finished work
    // keeps their name, because who did a thing does not stop being true
    await supabase
      .from("tasks")
      .update({ assignee_id: null })
      .eq("workspace_id", membership.workspace_id)
      .eq("assignee_id", user.id)
      .neq("status", "done");
  }

  /*
    The auth row is the root: `profiles` and `workspace_members` both reference
    it with `on delete cascade`, so this is the whole erasure in one statement.
    It needs the service role — a user cannot delete themselves through the
    anon key, which is the correct default and the reason this is a server
    action rather than a call from the browser.
  */
  const { error } = await adminClient().auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: copy.error.saveFailed };

  /*
    The cookies now point at a user that does not exist, so this is only
    housekeeping — and it is talking to an auth server about an account it just
    deleted. A refusal here is expected and means nothing: the erasure already
    happened, and throwing would tell the person it failed when it did not.

    The middleware would bounce them to /login on the next request regardless;
    clearing the cookies is what makes that immediate rather than confusing.
  */
  try {
    await supabase.auth.signOut();
  } catch {
    /* already gone */
  }

  revalidatePath("/", "layout");

  return { ok: true };
}
