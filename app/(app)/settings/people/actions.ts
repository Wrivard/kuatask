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

export async function inviteMember(email: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: copy.error.inviteFailed };

  const address = email.trim().toLowerCase();
  if (!address.includes("@")) return { ok: false, error: copy.error.inviteFailed };

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
    Removing a member touches workspace_members only. Their tasks stay and
    simply show no assignee — deleting someone's tasks when they leave loses
    work. This is a decision, not an oversight.
  */
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
