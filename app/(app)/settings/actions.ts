"use server";

import { requestSession } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
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
  const { supabase, userId } = await requestSession();
  if (!userId) return { ok: false, error: copy.error.saveFailed };

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
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
      .eq("assignee_id", userId)
      .neq("status", "done");
  }

  /*
    The auth row is the root: `profiles` and `workspace_members` both reference
    it with `on delete cascade`, so this is the whole erasure in one statement.
    It needs the service role — a user cannot delete themselves through the
    anon key, which is the correct default and the reason this is a server
    action rather than a call from the browser.
  */
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: copy.error.saveFailed };

  /*
    The cookies now point at a user that does not exist, so clearing them is
    the whole of signing out here — and it is deliberately done by hand rather
    than with `auth.signOut()`.

    `signOut()` would need an auth client, and an auth client is the one thing
    on the server that can spend the browser's refresh token (see
    lib/request-auth.ts). It would also be asking the auth server to revoke
    tokens belonging to a user row that no longer exists: the refresh tokens
    went with it, so there is nothing left to revoke. The call could only fail,
    and a failure would tell the person their erasure did not work when it did.

    The chunk names are enumerated rather than guessed — @supabase/ssr splits a
    large session across `name.0`, `name.1` — so a session that needed two
    cookies does not leave one behind.
  */
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-") && name.includes("auth-token")) {
      cookieStore.delete(name);
    }
  }

  revalidatePath("/", "layout");

  return { ok: true };
}
