"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/database.types";
import { copy } from "@/lib/copy";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The service role key lives here and nowhere else. This file is 'use server',
 * so it never enters a client import graph.
 */
function adminClient() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Resolves the caller and asserts they administer the workspace. Never trust the client. */
async function requireAdmin() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership || membership.role !== "admin") return null;

  return { supabase, userId: user.id, workspaceId: membership.workspace_id };
}

/** One @, something either side, a dot in the domain, no whitespace. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * How many invites a workspace may create in an hour.
 *
 * Nothing stopped an admin from putting a hundred addresses through this, each
 * one asking Supabase to send mail — which is somebody else's rate limit, and
 * hitting it takes out the magic-link login for everyone in the project, not
 * just invitations. This workspace is meant to hold two people.
 *
 * Counted in the database rather than in memory. Server actions run on
 * instances that come and go, so an in-memory counter would reset whenever one
 * did, which is exactly when it would matter.
 */
const INVITES_PER_HOUR = 10;

export async function inviteMember(email: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: copy.error.inviteFailed };

  const address = email.trim().toLowerCase();
  /*
    `includes("@")` accepted "@", "a@b", and a line with a space in it. Not a
    full RFC 5322 parse — nothing sensible is — but enough that a typo is caught
    here rather than becoming an invite row nobody can ever consume, since a
    pending invite is matched against the address a real signup arrives with.
  */
  if (!EMAIL.test(address) || address.length > 254) {
    return { ok: false, error: copy.error.inviteFailed };
  }

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: recentInvites } = await ctx.supabase
    .from("pending_invites")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .gte("created_at", hourAgo);

  if ((recentInvites ?? 0) >= INVITES_PER_HOUR) {
    return { ok: false, error: copy.error.tooManyInvites };
  }

  // already a member, or already invited
  const [{ data: existingProfile }, { data: existingInvite }] = await Promise.all([
    ctx.supabase.from("profiles").select("id").ilike("email", address).maybeSingle(),
    ctx.supabase
      .from("pending_invites")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .ilike("email", address)
      .maybeSingle(),
  ]);

  if (existingInvite) return { ok: false, error: copy.error.inviteExists };

  if (existingProfile) {
    const { data: alreadyMember } = await ctx.supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", existingProfile.id)
      .maybeSingle();
    if (alreadyMember) return { ok: false, error: copy.error.inviteExists };
  }

  const { data: invite, error: insertError } = await ctx.supabase
    .from("pending_invites")
    .insert({
      workspace_id: ctx.workspaceId,
      email: address,
      role: "member",
      invited_by: ctx.userId,
    })
    .select("id")
    .single();

  if (insertError) return { ok: false, error: copy.error.inviteFailed };

  const { error: sendError } = await adminClient().auth.admin.inviteUserByEmail(
    address,
    { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  );

  if (sendError) {
    /*
      Without this rollback a failed send leaves a pending invite nobody was
      told about, and the admin has no way to see the send failed.
    */
    await ctx.supabase.from("pending_invites").delete().eq("id", invite.id);
    return { ok: false, error: copy.error.inviteFailed };
  }

  revalidatePath("/settings/people");
  return { ok: true };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: copy.error.inviteFailed };

  const { error } = await ctx.supabase
    .from("pending_invites")
    .delete()
    .eq("id", inviteId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { ok: false, error: copy.error.inviteFailed };

  revalidatePath("/settings/people");
  return { ok: true };
}

/**
 * Sends an existing invitation again.
 *
 * A pending invite row and an invitation somebody actually received look
 * identical on the people page, and they are not the same thing. This
 * workspace's own first invite is the proof: it was written by the seed in
 * migration 0001, so the row has existed since before the workspace had a
 * single member — and no email was ever sent for it. The person it names has
 * been "invited" for days and has never heard anything.
 *
 * Nothing is created or deleted here. The row already carries the address and
 * the role, so this only asks Supabase to deliver a link for it, which makes
 * it safe to press twice.
 */
export async function resendInvite(inviteId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: copy.error.saveFailed };

  // RLS scopes this to the caller's workspace; the eq is belt and braces
  const { data: invite } = await ctx.supabase
    .from("pending_invites")
    .select("email")
    .eq("id", inviteId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!invite) return { ok: false, error: copy.error.saveFailed };

  /*
    The same ceiling as a new invitation. Resending is exactly as capable of
    exhausting somebody else's mailer, and a button that can be pressed
    repeatedly is more likely to be.
  */
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: recent } = await ctx.supabase
    .from("pending_invites")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .gte("created_at", hourAgo);

  if ((recent ?? 0) >= INVITES_PER_HOUR) {
    return { ok: false, error: copy.error.tooManyInvites };
  }

  const { error } = await adminClient().auth.admin.inviteUserByEmail(invite.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
  });

  if (error) return { ok: false, error: copy.error.inviteFailed };

  revalidatePath("/settings/people");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: copy.error.saveFailed };

  const { data: admins } = await ctx.supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("role", "admin");

  const isTargetAdmin = (admins ?? []).some((a) => a.user_id === userId);
  if (isTargetAdmin && (admins ?? []).length <= 1) {
    return { ok: false, error: copy.error.lastAdmin };
  }

  /*
    Their tasks stay. Deleting someone's work when they leave loses work, and
    that has been the rule since docs/03.

    What was missing is where the *open* ones go. They stayed assigned to an id
    that is no longer a member, which means: no dot on the row, a column on the
    board that no longer exists to drag them out of, and arrow keys that quietly
    do nothing on those cards. Unassigned is the honest state — somebody has to
    pick them up, and the app should say so rather than leave them pointing at a
    person who is gone.

    Finished tasks keep their assignee. Who did a thing is history and does not
    stop being true because they left.
  */
  await ctx.supabase
    .from("tasks")
    .update({ assignee_id: null })
    .eq("workspace_id", ctx.workspaceId)
    .eq("assignee_id", userId)
    .neq("status", "done");

  const { error } = await ctx.supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", userId);

  if (error) {
    /*
      The check above races: two admins can both be looking at a two-admin
      workspace and both press remove. The database trigger is what actually
      guarantees a workspace keeps an admin, so when it fires the person should
      be told what happened rather than shown a generic save failure.
    */
    return {
      ok: false,
      error: isLastAdminError(error) ? copy.error.lastAdmin : copy.error.saveFailed,
    };
  }

  revalidatePath("/settings/people");
  return { ok: true };
}

/** The guard in migration 0004 raises with this wording. */
function isLastAdminError(error: { message?: string }): boolean {
  const message = error.message ?? "";
  return message.includes("last admin");
}
